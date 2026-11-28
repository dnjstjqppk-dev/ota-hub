/**
 * Edge guard for the ota-user worker (CPU incident + country-subdomain routing).
 *
 * nuxt.config.ts emits a wrapper index.mjs that imports this module and the
 * real Nitro entry (entry.orig.mjs). Everything here runs BEFORE Nuxt, so it
 * must stay dependency-free and cheap.
 *
 *  1. Scanner paths (/.env, /wp-*, *.php …) → plain 404 without a render.
 *  2. Legacy /en, /ja, /zh path-prefix URLs → 301 to the subdomain + ?locale=&curr= scheme.
 *  3. Geo-IP 302 on apex (getfortrip.com) and unpinned www.getfortrip.com →
 *     country subdomain (kr, jp, uk, hk, tw, www) with pref_sub / pref_locale / pref_curr
 *     cookies on Domain=.getfortrip.com.
 *  4. Edge cache for public, request-independent pages via the Workers Cache API
 *     with subdomain host + locale + curr in the cache key (preserving the
 *     2026-11-27 CPU fix).
 *  5. Rewrite initial `<html lang="ko">` on HTML responses (including ssr:false
 *     login/register shells) to the resolved BCP-47 lang tag on first paint.
 */
import {
  COOKIE_DOMAIN,
  DEFAULT_SUBDOMAIN,
  I18N_BUNDLES,
  LEGACY_PREFIX_MAP,
  PREF_COOKIES,
  SITE_DOMAIN,
  SUBDOMAIN_BY_KEY,
  buildLocalizedUrl,
  buildPrefCookieHeaders,
  configForCountry,
  configForLocale,
  configForSubdomain,
  isSiteHost,
  normalizeCurrency,
  normalizeLocale,
  resolveLocaleContext,
  subdomainFromHost,
} from './locale-map.mjs'

export const LOCALES = I18N_BUNDLES
export const LOCALE_COOKIE = 'getfortrip_locale'
/** Edge TTL. Short on purpose: catalog prices/availability live in these pages. */
export const EDGE_TTL_SECONDS = 300
const STASHED_COOKIE = 'x-edge-set-cookie'

const ALLOWED_STORED_COOKIES = [
  `${LOCALE_COOKIE}=`,
  `${PREF_COOKIES.sub}=`,
  `${PREF_COOKIES.locale}=`,
  `${PREF_COOKIES.curr}=`,
]

const SCANNER_PATH = /^\/(?:\.(?:env|git|svn|hg|aws|ssh|DS_Store|htaccess|htpasswd|vscode|idea)|wp-|wordpress\/|xmlrpc|phpmyadmin|pma\/|cgi-bin\/|vendor\/|telescope\/|_ignition\/|actuator\/|server-status|boaform\/)|\.(?:php\d?|asp|aspx|jsp|cgi|env|ini|bak|old|sql|sqlite|yml|yaml|log|swp)$/i

/** Probe paths no page of ours serves. */
export function isScannerPath(pathname) {
  return SCANNER_PATH.test(pathname)
}

/** Static/system/API paths that must never trigger Geo-IP or locale redirects. */
const BYPASS_REDIRECT_RE = /^\/(?:_nuxt\/|_i18n\/|api\/|out\/|\.well-known\/|robots\.txt$|sitemap[^/]*$|llms[^/]*$|rss\.xml$|favicon[^/]*$|logo[^/]*\.svg$|symbol\.svg$)/i

export function isBypassRedirectPath(pathname) {
  return BYPASS_REDIRECT_RE.test(pathname)
}

/** Known search / AI crawlers: never Geo-IP redirect off www, and send apex bots to www (x-default). */
const BOT_UA_RE = /googlebot|bingbot|yeti|daumoa|applebot|duckassistbot|gptbot|oai-searchbot|chatgpt-user|claudebot|claude-user|claude-searchbot|perplexitybot|perplexity-user|amazonbot|meta-externalagent|google-extended|facebookexternalhit|twitterbot|slackbot|linkedinbot|kakaotalk-scrap|yandexbot|baiduspider/i

export function isBotUserAgent(ua) {
  return BOT_UA_RE.test(String(ua || ''))
}

// Public pages whose HTML depends only on host + path + query/locale/curr
// (mirrors the `isr` entries of PAGE_RULES in nuxt.config.ts).
export const CACHE_SECTIONS = ['hotels', 'flights', 'trains', 'cars', 'transfers', 'things-to-do', 'packages']
export const CACHE_PAGES = ['deals', 'trip-best', 'esim', 'insurance', 'faq', 'help']
// ssr:false shells: the HTML ignores arbitrary queries (?redirect=… is read client-side),
// so every /login?redirect=<page> variant for a given (host, locale) shares one cache entry.
export const SHELL_PAGES = ['login', 'register']
const alt = (list) => list.join('|')
const SECTION_RE = new RegExp('^/(?:' + alt(CACHE_SECTIONS) + ')(?:/.*)?$')
const PAGE_RE = new RegExp('^/(?:' + alt(CACHE_PAGES) + ')/?$')
const SHELL_RE = new RegExp('^/(?:' + alt(SHELL_PAGES) + ')/?$')
const LEGACY_PREFIX_RE = /^\/(en|ja|zh)(?=\/|$)/
const PAYLOAD_SUFFIX = '/_payload.json'

/**
 * Classify a pathname: null = never cache, 'root' = "/", 'page' = always cacheable,
 * 'shell' = cacheable with non-locale query params dropped from the key.
 */
export function edgeCacheClass(pathname) {
  let p = pathname
  const payload = p.endsWith(PAYLOAD_SUFFIX)
  if (payload) p = p.slice(0, -PAYLOAD_SUFFIX.length) || '/'
  if (p === '/') return 'root'
  if (SHELL_RE.test(p)) return payload ? null : 'shell'
  if (SECTION_RE.test(p) || PAGE_RE.test(p)) return 'page'
  return null
}

export function parseCookies(header) {
  const out = {}
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=')
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim()
  }
  return out
}

/**
 * Pick a subdomain from Accept-Language when cf.country is unavailable.
 */
export function subdomainFromAcceptLanguage(header) {
  const tags = String(header || '')
    .split(',')
    .map((tag) => tag.split(';')[0].trim().toLowerCase())
    .filter((tag) => tag && tag !== '*')
  for (const tag of tags) {
    if (tag === 'ko' || tag.startsWith('ko-')) return 'kr'
    if (tag === 'ja' || tag.startsWith('ja-')) return 'jp'
    if (tag === 'en-gb') return 'uk'
    if (tag === 'zh-hk' || tag === 'zh-mo') return 'hk'
    if (tag === 'zh-tw' || tag === 'zh-hant') return 'tw'
    if (tag === 'zh' || tag.startsWith('zh-')) return 'hk'
    if (tag === 'en' || tag.startsWith('en-')) return 'www'
  }
  return DEFAULT_SUBDOMAIN
}

/**
 * Legacy /en, /ja, /zh path-prefix → 301 redirect target URL, or null.
 */
export function legacyPrefixRedirectUrl(url) {
  const m = LEGACY_PREFIX_RE.exec(url.pathname)
  if (!m) return null
  const cfg = LEGACY_PREFIX_MAP[m[1]]
  if (!cfg) return null
  const rest = url.pathname.slice(m[0].length) || '/'
  const host = url.hostname.toLowerCase()
  const locale = normalizeLocale(url.searchParams.get('locale')) || cfg.locale
  const curr = normalizeCurrency(url.searchParams.get('curr')) || cfg.curr
  return buildLocalizedUrl(rest, {
    sub: cfg.sub,
    locale,
    curr,
    query: url.searchParams,
    origin: isSiteHost(host) ? undefined : url.origin,
  })
}

/**
 * Decide whether an apex (getfortrip.com) or unpinned www.getfortrip.com request
 * should receive a Geo-IP 302 redirect. Returns { location, cookies } or null.
 */
export function geoRedirectDecision(request, url, cookies) {
  const host = url.hostname.toLowerCase()
  if (!isSiteHost(host)) return null
  if (isBypassRedirectPath(url.pathname)) return null
  if (url.pathname.endsWith(PAYLOAD_SUFFIX)) return null
  if (request.method !== 'GET' && request.method !== 'HEAD') return null

  const isApex = host === SITE_DOMAIN
  const isWww = host === `www.${SITE_DOMAIN}`
  if (!isApex && !isWww) return null

  const bot = isBotUserAgent(request.headers.get('user-agent'))
  const queryLocale = normalizeLocale(url.searchParams.get('locale'))
  const queryCurr = normalizeCurrency(url.searchParams.get('curr'))
  const cookieSub = cookies[PREF_COOKIES.sub] && SUBDOMAIN_BY_KEY[cookies[PREF_COOKIES.sub]] ? cookies[PREF_COOKIES.sub] : null
  const cookieLocale = normalizeLocale(cookies[PREF_COOKIES.locale])
  const cookieCurr = normalizeCurrency(cookies[PREF_COOKIES.curr])
  const cfCountry = (request.cf && request.cf.country) || request.headers.get('cf-ipcountry') || ''

  // On www.getfortrip.com: never redirect bots, users who already have pref_sub,
  // or links that explicitly specify ?locale=.
  if (isWww) {
    if (bot || cookieSub || queryLocale) return null
    const geoCfg = cfCountry ? configForCountry(cfCountry) : configForSubdomain(DEFAULT_SUBDOMAIN)
    if (geoCfg.sub === DEFAULT_SUBDOMAIN) return null
    const targetCurr = queryCurr || cookieCurr || geoCfg.curr
    const location = buildLocalizedUrl(url.pathname, {
      sub: geoCfg.sub,
      locale: geoCfg.locale,
      curr: targetCurr,
      query: url.searchParams,
    })
    return {
      location,
      cookies: buildPrefCookieHeaders({ sub: geoCfg.sub, locale: geoCfg.locale, curr: targetCurr }, { hostname: host, secure: url.protocol === 'https:' }),
    }
  }

  // On apex getfortrip.com: always 302 to the resolved country subdomain.
  // Bots get sent deterministically to www (x-default) with no cookies.
  if (bot) {
    const locCfg = queryLocale ? configForLocale(queryLocale) : configForSubdomain(DEFAULT_SUBDOMAIN)
    const location = buildLocalizedUrl(url.pathname, {
      sub: locCfg.sub,
      locale: queryLocale || locCfg.locale,
      curr: queryCurr || locCfg.curr,
      query: url.searchParams,
    })
    return { location, cookies: [] }
  }

  let targetCfg
  if (queryLocale) {
    targetCfg = configForLocale(queryLocale)
  } else if (cookieSub) {
    targetCfg = configForSubdomain(cookieSub)
  } else if (cfCountry) {
    targetCfg = configForCountry(cfCountry)
  } else {
    targetCfg = configForSubdomain(subdomainFromAcceptLanguage(request.headers.get('accept-language')))
  }

  const targetLocale = queryLocale || (cookieSub ? (cookieLocale || targetCfg.locale) : targetCfg.locale)
  const targetCurr = queryCurr || cookieCurr || targetCfg.curr
  const location = buildLocalizedUrl(url.pathname, {
    sub: targetCfg.sub,
    locale: targetLocale,
    curr: targetCurr,
    query: url.searchParams,
  })
  return {
    location,
    cookies: buildPrefCookieHeaders({ sub: targetCfg.sub, locale: targetLocale, curr: targetCurr }, { hostname: host, secure: url.protocol === 'https:' }),
  }
}

/**
 * Cache key: the request URL under a build-version PATH prefix (old HTML
 * points at deleted /_nuxt assets), including resolved `locale` and `curr`
 * so currency/locale variants never collide even when inherited from cookies.
 */
export function cacheKeyFor(url, version, dropQuery = false, ctx = null) {
  const u = new URL(url)
  u.hash = ''
  if (dropQuery) {
    u.search = ''
  }
  if (ctx) {
    u.searchParams.set('__ec_loc', ctx.locale)
    if (!dropQuery) u.searchParams.set('__ec_curr', ctx.curr)
  }
  u.pathname = `/__edge/${version}${u.pathname}`
  return u.toString()
}

function setCookiesOf(headers) {
  if (typeof headers.getSetCookie === 'function') return headers.getSetCookie()
  const one = headers.get('set-cookie')
  return one ? [one] : []
}

/** True when a response may be stored (checked on headers, before any clone). */
export function isStorable(response) {
  if (response.status !== 200) return false
  const type = response.headers.get('content-type') || ''
  if (!/^(text\/html|application\/json)/i.test(type)) return false
  const cc = (response.headers.get('cache-control') || '').toLowerCase()
  if (/no-store|no-cache|private/.test(cc)) return false
  // Anything other than locale/currency preference cookies means per-user state.
  return !setCookiesOf(response.headers).some((c) => {
    const trimmed = c.trim()
    return !ALLOWED_STORED_COOKIES.some((prefix) => trimmed.startsWith(prefix))
  })
}

/** The copy to put in the cache (headers rewritten), or null when not storable. */
export function storableCopy(response) {
  if (!isStorable(response)) return null
  const cookies = setCookiesOf(response.headers)
  const headers = new Headers(response.headers)
  headers.delete('set-cookie')
  if (cookies.length) headers.set(STASHED_COOKIE, cookies[0])
  headers.set('cache-control', `public, max-age=${EDGE_TTL_SECONDS}`)
  return new Response(response.body, { status: 200, headers })
}

/** Rebuild a client response from a cache hit, optionally appending pref cookies. */
export function fromCacheHit(hit, extraCookies = []) {
  const headers = new Headers(hit.headers)
  const cookie = headers.get(STASHED_COOKIE)
  headers.delete(STASHED_COOKIE)
  headers.delete('cache-control')
  headers.delete('age')
  if (cookie) headers.append('set-cookie', cookie)
  for (const c of extraCookies) headers.append('set-cookie', c)
  headers.set('x-edge-cache', 'HIT')
  return new Response(hit.body, { status: hit.status, headers })
}

/**
 * Fix item 7 (open-items-2026-11-27): ssr:false shells (login/register/my/checkout)
 * ship with static `<html lang="ko">` from nuxt.config.ts. Rewrite the opening
 * `<html ... lang="...">` attribute to the resolved BCP-47 tag on first paint.
 */
export async function rewriteHtmlLang(response, hreflang) {
  if (!hreflang || response.status !== 200) return response
  const ct = response.headers.get('content-type') || ''
  if (!/^text\/html/i.test(ct)) return response
  // Workers: stream through the native HTMLRewriter — no full-body buffer or
  // string copy on every SSR miss (CPU budget, see the 2026-11-27 incident).
  if (typeof HTMLRewriter === 'function') {
    let done = false
    return new HTMLRewriter()
      .on('html', {
        element(el) {
          if (done) return
          done = true
          if (el.getAttribute('lang') !== hreflang) el.setAttribute('lang', hreflang)
        },
      })
      .transform(response)
  }
  const html = await response.text()
  const updated = html.replace(/<html\b([^>]*?)\blang="[^"]*"/i, `<html$1lang="${hreflang}"`)
  return new Response(updated, { status: response.status, statusText: response.statusText, headers: response.headers })
}

/** Build Set-Cookie headers when a visitor explicitly passes ?locale= or ?curr= on a regional subdomain. */
function explicitPrefCookies(url, ctx) {
  if (!ctx.hasExplicitQuery) return []
  const host = url.hostname.toLowerCase()
  const sub = subdomainFromHost(host) || ctx.sub
  return buildPrefCookieHeaders(
    { sub, locale: ctx.locale, curr: ctx.curr },
    { hostname: host, secure: url.protocol === 'https:' }
  )
}

/** Wrap a Nitro worker `fetch` with the guard. */
export function createEdgeFetch(target, version, cacheProvider = () => globalThis.caches && globalThis.caches.default) {
  return async function fetch(request, env, ctx) {
    const url = new URL(request.url)

    // 1. Scanner paths → immediate 404 without invoking Nuxt.
    if (isScannerPath(url.pathname)) {
      return new Response('Not Found', {
        status: 404,
        headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=86400' },
      })
    }

    // 2. Legacy /en, /ja, /zh path-prefix URLs → 301 permanent redirect to new scheme.
    if (request.method === 'GET' || request.method === 'HEAD') {
      const legacyTarget = legacyPrefixRedirectUrl(url)
      if (legacyTarget) {
        return new Response(null, {
          status: 301,
          headers: {
            location: legacyTarget,
            'cache-control': 'public, max-age=86400',
          },
        })
      }
    }

    const cookies = parseCookies(request.headers.get('cookie'))

    // 3. Geo-IP 302 on apex (getfortrip.com) and unpinned www.getfortrip.com.
    const geo = geoRedirectDecision(request, url, cookies)
    if (geo) {
      const headers = new Headers({
        location: geo.location,
        'cache-control': 'no-store',
        vary: 'CF-IPCountry, Cookie',
      })
      for (const c of geo.cookies) headers.append('set-cookie', c)
      return new Response(null, { status: 302, headers })
    }

    const localeCtx = resolveLocaleContext({
      hostname: url.hostname,
      searchParams: url.searchParams,
      cookies,
    })
    const prefCookies = explicitPrefCookies(url, localeCtx)

    // 4. Edge cache via Workers Cache API (host + locale + curr keyed).
    const cls = request.method === 'GET' && !request.headers.has('authorization') ? edgeCacheClass(url.pathname) : null
    const cacheable = cls === 'page' || cls === 'shell' || cls === 'root'
    const cache = cacheable ? cacheProvider() : null
    if (!cache) {
      let res = await target.fetch(request, env, ctx)
      if (request.method === 'GET') res = await rewriteHtmlLang(res, localeCtx.hreflang)
      if (prefCookies.length) {
        const h = new Headers(res.headers)
        for (const c of prefCookies) h.append('set-cookie', c)
        res = new Response(res.body, { status: res.status, statusText: res.statusText, headers: h })
      }
      return res
    }

    const key = cacheKeyFor(request.url, version, cls === 'shell', localeCtx)
    try {
      const hit = await cache.match(key)
      if (hit) return fromCacheHit(hit, prefCookies)
    } catch {
      // Cache API trouble must never take the page down.
    }

    let response = await target.fetch(request, env, ctx)
    // Rewrite `<html lang="...">` before caching so cached ssr:false shells carry the right lang.
    response = await rewriteHtmlLang(response, localeCtx.hreflang)

    if (!isStorable(response)) {
      if (prefCookies.length) {
        const h = new Headers(response.headers)
        for (const c of prefCookies) h.append('set-cookie', c)
        return new Response(response.body, { status: response.status, statusText: response.statusText, headers: h })
      }
      return response
    }
    const copy = storableCopy(response.clone())
    const put = cache.put(key, copy).catch(() => {})
    if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(put)
    const headers = new Headers(response.headers)
    for (const c of prefCookies) headers.append('set-cookie', c)
    headers.set('x-edge-cache', 'MISS')
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
  }
}

export { COOKIE_DOMAIN, PREF_COOKIES, SITE_DOMAIN, SUBDOMAIN_BY_KEY }
