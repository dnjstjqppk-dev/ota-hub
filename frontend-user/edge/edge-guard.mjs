/**
 * Edge guard for the ota-user worker (2026-11-27 CPU incident).
 *
 * nuxt.config.ts emits a wrapper index.mjs that imports this module and the
 * real Nitro entry (entry.orig.mjs). Everything here runs BEFORE Nuxt, so it
 * must stay dependency-free and cheap.
 *
 *  1. www.* → apex 301 (M5, moved here from the inline wrapper).
 *  2. Scanner paths (/.env, /wp-*, *.php …) → plain 404 without a render.
 *  3. Edge cache for public, request-independent pages via the Workers Cache
 *     API. Zone Cache Rules do not apply here: a Worker's own response never
 *     passes through the zone cache, and `isr` on the cloudflare-module preset
 *     caches nothing — every hit used to be a full SSR (18–20 ms CPU on a 10 ms
 *     plan → exceededResources/503).
 *
 * Why caching these pages is safe: SSR never reads auth (the session restores
 * client-side in app.vue onMounted via /auth/me) and no page reads request
 * cookies/headers. The one exception is the i18n root redirect on "/"
 * (redirectOn: 'root' — cookie / Accept-Language), handled by rootLocale().
 * The only cookie SSR sets is the getfortrip_locale preference; it is stored
 * aside and replayed on hits so behaviour is unchanged.
 */

export const LOCALES = ['ko', 'en', 'ja', 'zh']
const PREFIXED = LOCALES.filter((l) => l !== 'ko')
export const LOCALE_COOKIE = 'getfortrip_locale'
/** Edge TTL. Short on purpose: catalog prices/availability live in these pages. */
export const EDGE_TTL_SECONDS = 300
const STASHED_COOKIE = 'x-edge-set-cookie'

const SCANNER_PATH = /^\/(?:\.(?:env|git|svn|hg|aws|ssh|DS_Store|htaccess|htpasswd|vscode|idea)|wp-|wordpress\/|xmlrpc|phpmyadmin|pma\/|cgi-bin\/|vendor\/|telescope\/|_ignition\/|actuator\/|server-status|boaform\/)|\.(?:php\d?|asp|aspx|jsp|cgi|env|ini|bak|old|sql|sqlite|yml|yaml|log|swp)$/i

/** Probe paths no page of ours serves. */
export function isScannerPath(pathname) {
  return SCANNER_PATH.test(pathname)
}

// Public pages whose HTML depends only on path + query (mirrors the `isr`
// entries of PAGE_RULES in nuxt.config.ts).
const CACHE_SECTIONS = ['hotels', 'flights', 'trains', 'cars', 'transfers', 'things-to-do', 'packages']
const CACHE_PAGES = ['deals', 'trip-best', 'esim', 'insurance', 'faq', 'help']
// ssr:false shells: the HTML ignores the query (?redirect=… is read client-side),
// so every /xx/login?redirect=<page> variant shares one cache entry.
const SHELL_PAGES = ['login', 'register']
const alt = (list) => list.join('|')
const SECTION_RE = new RegExp('^/(?:' + alt(CACHE_SECTIONS) + ')(?:/.*)?$')
const PAGE_RE = new RegExp('^/(?:' + alt(CACHE_PAGES) + ')/?$')
const SHELL_RE = new RegExp('^/(?:' + alt(SHELL_PAGES) + ')/?$')
const PREFIX_RE = new RegExp('^/(' + alt(PREFIXED) + ')(?=/|$)')
const PAYLOAD_SUFFIX = '/_payload.json'

/**
 * Classify a pathname: null = never cache, 'root' = the ko root "/" (cache
 * only for visitors i18n would not redirect), 'page' = always cacheable,
 * 'shell' = cacheable with the query dropped from the key.
 */
export function edgeCacheClass(pathname) {
  let p = pathname
  const payload = p.endsWith(PAYLOAD_SUFFIX)
  if (payload) p = p.slice(0, -PAYLOAD_SUFFIX.length) || '/'
  const m = PREFIX_RE.exec(p)
  const rest = m ? p.slice(m[0].length) || '/' : p
  if (rest === '/') return m ? 'page' : 'root'
  if (SHELL_RE.test(rest)) return payload ? null : 'shell'
  if (SECTION_RE.test(rest) || PAGE_RE.test(rest)) return 'page'
  return null
}

function readCookie(header, name) {
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=')
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim()
  }
  return ''
}

/**
 * Which locale @nuxtjs/i18n would pick on "/" (cookie first, then the
 * best-q Accept-Language match, else ko). Only 'ko' may get the cached root;
 * anyone else goes to Nuxt, which answers with the 302 to /en, /ja or /zh.
 */
export function rootLocale(headers) {
  const fromCookie = readCookie(headers.get('cookie'), LOCALE_COOKIE)
  if (LOCALES.includes(fromCookie)) return fromCookie
  const langs = String(headers.get('accept-language') || '')
    .split(',')
    .map((part, idx) => {
      const [tag, ...params] = part.trim().split(';')
      const qp = params.find((x) => x.trim().startsWith('q='))
      const q = qp ? Number(qp.trim().slice(2)) : 1
      return { lang: tag.trim().toLowerCase().split('-')[0], q: Number.isFinite(q) ? q : 0, idx }
    })
    .filter((x) => x.lang && x.q > 0)
    .sort((a, b) => b.q - a.q || a.idx - b.idx)
  for (const { lang } of langs) if (LOCALES.includes(lang)) return lang
  return 'ko'
}

/** Cache key: the request URL tagged with the build version (old HTML points at deleted /_nuxt assets). */
export function cacheKeyFor(url, version, dropQuery = false) {
  const u = new URL(url)
  u.hash = ''
  if (dropQuery) u.search = ''
  u.searchParams.set('__ecv', version)
  return u.toString()
}

function setCookiesOf(headers) {
  if (typeof headers.getSetCookie === 'function') return headers.getSetCookie()
  const one = headers.get('set-cookie')
  return one ? [one] : []
}

/**
 * Decide whether a response may be stored. Returns the response to put in the
 * cache (headers rewritten) or null.
 */
export function storableCopy(response) {
  if (response.status !== 200) return null
  const type = response.headers.get('content-type') || ''
  if (!/^(text\/html|application\/json)/i.test(type)) return null
  const cc = (response.headers.get('cache-control') || '').toLowerCase()
  if (/no-store|no-cache|private/.test(cc)) return null
  const cookies = setCookiesOf(response.headers)
  // Anything but the locale preference cookie means the response is per-user.
  if (cookies.some((c) => !c.trim().startsWith(`${LOCALE_COOKIE}=`))) return null
  const headers = new Headers(response.headers)
  headers.delete('set-cookie')
  if (cookies.length) headers.set(STASHED_COOKIE, cookies[0])
  headers.set('cache-control', `public, max-age=${EDGE_TTL_SECONDS}`)
  return new Response(response.body, { status: 200, headers })
}

/** Rebuild a client response from a cache hit. */
export function fromCacheHit(hit) {
  const headers = new Headers(hit.headers)
  const cookie = headers.get(STASHED_COOKIE)
  headers.delete(STASHED_COOKIE)
  headers.delete('cache-control')
  headers.delete('age')
  if (cookie) headers.set('set-cookie', cookie)
  headers.set('x-edge-cache', 'HIT')
  return new Response(hit.body, { status: hit.status, headers })
}

/** Wrap a Nitro worker `fetch` with the guard. */
export function createEdgeFetch(target, version, cacheProvider = () => globalThis.caches && globalThis.caches.default) {
  return async function fetch(request, env, ctx) {
    const url = new URL(request.url)
    const host = url.hostname.toLowerCase()
    if (host.startsWith('www.')) {
      return Response.redirect(`https://${host.slice(4)}${url.pathname}${url.search}`, 301)
    }
    if (isScannerPath(url.pathname)) {
      return new Response('Not Found', {
        status: 404,
        headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=86400' }
      })
    }

    const cls = request.method === 'GET' && !request.headers.has('authorization') ? edgeCacheClass(url.pathname) : null
    const cacheable = cls === 'page' || cls === 'shell' || (cls === 'root' && rootLocale(request.headers) === 'ko')
    const cache = cacheable ? cacheProvider() : null
    if (!cache) return target.fetch(request, env, ctx)

    const key = cacheKeyFor(request.url, version, cls === 'shell')
    try {
      const hit = await cache.match(key)
      if (hit) return fromCacheHit(hit)
    } catch {
      // Cache API trouble must never take the page down.
    }

    const response = await target.fetch(request, env, ctx)
    const copy = storableCopy(response.clone())
    if (!copy) return response
    const put = cache.put(key, copy).catch(() => {})
    if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(put)
    const headers = new Headers(response.headers)
    headers.set('x-edge-cache', 'MISS')
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
  }
}
