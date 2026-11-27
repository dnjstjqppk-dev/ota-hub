/**
 * Single source of truth for country-subdomain + locale/currency routing.
 *
 * Shared directly by:
 *   - frontend-user/edge/edge-guard.mjs (Cloudflare Worker edge redirects & cache)
 *   - frontend-user/config/locale.config.ts (Nuxt SSR/client, router, SEO, header)
 *
 * Zero runtime dependencies so the edge wrapper stays tiny and fast.
 */

export const SITE_DOMAIN = 'getfortrip.com'
export const COOKIE_DOMAIN = `.${SITE_DOMAIN}`

export const PREF_COOKIES = Object.freeze({
  sub: 'pref_sub',
  locale: 'pref_locale',
  curr: 'pref_curr',
})

/**
 * Canonical country-subdomain registry.
 *  - `sub`: DNS label under getfortrip.com
 *  - `locale`: canonical BCP-47 query param value (lowercase, e.g. ko-kr)
 *  - `hreflang`: RFC 5646 tag for <link rel="alternate" hreflang="..."> and <html lang="...">
 *  - `ogLocale`: Open Graph locale tag
 *  - `i18n`: Nuxt i18n message bundle code ('ko' | 'en' | 'ja' | 'zh')
 *  - `curr`: default ISO-4217 currency code
 *  - `countries`: ISO-3166-1 alpha-2 country codes routed here by Geo-IP
 *  - `label`: user-facing region/language label
 */
export const SUBDOMAIN_LIST = Object.freeze([
  Object.freeze({
    sub: 'kr',
    host: `kr.${SITE_DOMAIN}`,
    locale: 'ko-kr',
    hreflang: 'ko-KR',
    ogLocale: 'ko_KR',
    i18n: 'ko',
    curr: 'KRW',
    countries: Object.freeze(['KR']),
    label: '한국어 (KR)',
  }),
  Object.freeze({
    sub: 'jp',
    host: `jp.${SITE_DOMAIN}`,
    locale: 'ja-jp',
    hreflang: 'ja-JP',
    ogLocale: 'ja_JP',
    i18n: 'ja',
    curr: 'JPY',
    countries: Object.freeze(['JP']),
    label: '日本語 (JP)',
  }),
  Object.freeze({
    sub: 'uk',
    host: `uk.${SITE_DOMAIN}`,
    locale: 'en-gb',
    hreflang: 'en-GB',
    ogLocale: 'en_GB',
    i18n: 'en',
    curr: 'GBP',
    countries: Object.freeze(['GB', 'UK']),
    label: 'English (UK)',
  }),
  Object.freeze({
    sub: 'hk',
    host: `hk.${SITE_DOMAIN}`,
    locale: 'zh-hk',
    hreflang: 'zh-HK',
    ogLocale: 'zh_HK',
    i18n: 'zh-hant',
    curr: 'HKD',
    countries: Object.freeze(['HK', 'MO']),
    label: '繁體中文 (HK)',
  }),
  Object.freeze({
    sub: 'tw',
    host: `tw.${SITE_DOMAIN}`,
    locale: 'zh-tw',
    hreflang: 'zh-TW',
    ogLocale: 'zh_TW',
    i18n: 'zh-hant',
    curr: 'TWD',
    countries: Object.freeze(['TW']),
    label: '繁體中文 (TW)',
  }),
  Object.freeze({
    sub: 'www',
    host: `www.${SITE_DOMAIN}`,
    locale: 'en-us',
    hreflang: 'en-US',
    ogLocale: 'en_US',
    i18n: 'en',
    curr: 'USD',
    countries: Object.freeze([]),
    label: 'English (Global)',
  }),
])

export const DEFAULT_SUBDOMAIN = 'www'
export const SUPPORTED_CURRENCIES = Object.freeze(['KRW', 'USD', 'JPY', 'GBP', 'HKD', 'TWD', 'EUR', 'CNY'])
export const I18N_BUNDLES = Object.freeze(['ko', 'en', 'ja', 'zh', 'zh-hant'])

export const SUBDOMAIN_BY_KEY = Object.freeze(
  Object.fromEntries(SUBDOMAIN_LIST.map((entry) => [entry.sub, entry]))
)

export const SUBDOMAIN_BY_LOCALE = Object.freeze(
  Object.fromEntries(SUBDOMAIN_LIST.map((entry) => [entry.locale, entry]))
)

export const COUNTRY_TO_SUBDOMAIN = Object.freeze(
  Object.fromEntries(
    SUBDOMAIN_LIST.flatMap((entry) => entry.countries.map((cc) => [cc, entry.sub]))
  )
)

/** Legacy /en, /ja, /zh path-prefix redirects (301 permanent). */
export const LEGACY_PREFIX_MAP = Object.freeze({
  en: SUBDOMAIN_BY_KEY.www,
  ja: SUBDOMAIN_BY_KEY.jp,
  zh: SUBDOMAIN_BY_KEY.hk,
})

/** Normalize any locale string ('ko', 'ko-KR', 'zh_TW', etc.) to a known locale code, or null. */
export function normalizeLocale(input) {
  const raw = String(input || '').trim().toLowerCase().replace('_', '-')
  if (!raw) return null
  if (SUBDOMAIN_BY_LOCALE[raw]) return raw
  if (raw === 'ko') return 'ko-kr'
  if (raw === 'ja') return 'ja-jp'
  if (raw === 'en') return 'en-us'
  if (raw === 'en-uk') return 'en-gb'
  if (raw === 'zh' || raw === 'zh-cn' || raw === 'zh-hans') return 'zh-hk'
  if (raw === 'zh-hant') return 'zh-tw'
  return null
}

/** Normalize currency string to a supported ISO-4217 code, or null. */
export function normalizeCurrency(input) {
  const c = String(input || '').trim().toUpperCase()
  return SUPPORTED_CURRENCIES.includes(c) ? c : null
}

/** Extract the country subdomain from a hostname, or null for apex / workers.dev / localhost. */
export function subdomainFromHost(hostname) {
  const h = String(hostname || '').toLowerCase().split(':')[0]
  if (!h || h === SITE_DOMAIN) return null
  const suffix = `.${SITE_DOMAIN}`
  if (!h.endsWith(suffix)) return null
  const label = h.slice(0, -suffix.length)
  return SUBDOMAIN_BY_KEY[label] ? label : null
}

/** True when hostname is apex getfortrip.com or any *.getfortrip.com host. */
export function isSiteHost(hostname) {
  const h = String(hostname || '').toLowerCase().split(':')[0]
  return h === SITE_DOMAIN || h.endsWith(`.${SITE_DOMAIN}`)
}

/** Resolve subdomain config from an ISO country code (Cloudflare cf.country). */
export function configForCountry(countryCode) {
  const cc = String(countryCode || '').trim().toUpperCase()
  const sub = COUNTRY_TO_SUBDOMAIN[cc] || DEFAULT_SUBDOMAIN
  return SUBDOMAIN_BY_KEY[sub]
}

/** Resolve subdomain config from a locale string (e.g. 'ko-kr', 'ja', 'en-gb'). */
export function configForLocale(locale) {
  const norm = normalizeLocale(locale)
  return (norm && SUBDOMAIN_BY_LOCALE[norm]) || SUBDOMAIN_BY_KEY[DEFAULT_SUBDOMAIN]
}

/** Resolve subdomain config from a subdomain key ('kr', 'jp', 'uk', 'hk', 'tw', 'www'). */
export function configForSubdomain(sub) {
  const k = String(sub || '').trim().toLowerCase()
  return SUBDOMAIN_BY_KEY[k] || SUBDOMAIN_BY_KEY[DEFAULT_SUBDOMAIN]
}

/** Map a locale ('ko-kr', 'zh-tw', 'en-gb', etc.) to the 4-bundle i18n code ('ko'|'en'|'ja'|'zh'). */
export function i18nBundleForLocale(locale) {
  const norm = normalizeLocale(locale)
  if (!norm) return 'ko'
  return SUBDOMAIN_BY_LOCALE[norm].i18n
}

/** Map a locale ('ko-kr', 'zh-tw', etc.) to RFC 5646 hreflang / <html lang> tag ('ko-KR', 'zh-TW'). */
export function htmlLangForLocale(locale) {
  const norm = normalizeLocale(locale)
  if (!norm) return 'ko-KR'
  return SUBDOMAIN_BY_LOCALE[norm].hreflang
}

/**
 * Resolve effective { sub, locale, i18n, hreflang, ogLocale, curr } from:
 *   1. Host subdomain (if on *.getfortrip.com)
 *   2. Explicit query params (?locale=, ?curr=)
 *   3. Cookies (pref_sub, pref_locale, pref_curr)
 *   4. Subdomain default (or kr fallback on non-site hosts like localhost/workers.dev)
 */
export function resolveLocaleContext({ hostname = '', searchParams = null, cookies = {} } = {}) {
  const hostSub = subdomainFromHost(hostname)
  const fallbackSub = hostSub || (cookies[PREF_COOKIES.sub] && SUBDOMAIN_BY_KEY[cookies[PREF_COOKIES.sub]] ? cookies[PREF_COOKIES.sub] : 'kr')
  const baseCfg = SUBDOMAIN_BY_KEY[fallbackSub] || SUBDOMAIN_BY_KEY[DEFAULT_SUBDOMAIN]

  const getParam = (k) => {
    if (!searchParams) return ''
    if (typeof searchParams.get === 'function') return searchParams.get(k) || ''
    const v = searchParams[k]
    return Array.isArray(v) ? String(v[0] || '') : String(v || '')
  }

  const queryLocale = normalizeLocale(getParam('locale'))
  const cookieLocale = normalizeLocale(cookies[PREF_COOKIES.locale])
  // On a regional subdomain (e.g. jp.getfortrip.com), its default locale beats
  // a stale cookie from another subdomain unless ?locale= was explicitly passed.
  const locale = queryLocale || (hostSub ? baseCfg.locale : (cookieLocale || baseCfg.locale))
  const localeCfg = SUBDOMAIN_BY_LOCALE[locale] || baseCfg

  const queryCurr = normalizeCurrency(getParam('curr'))
  const cookieCurr = normalizeCurrency(cookies[PREF_COOKIES.curr])
  const curr = queryCurr || cookieCurr || baseCfg.curr

  return {
    sub: baseCfg.sub,
    host: baseCfg.host,
    locale,
    i18n: localeCfg.i18n,
    hreflang: localeCfg.hreflang,
    ogLocale: localeCfg.ogLocale,
    curr,
    hasExplicitQuery: Boolean(queryLocale || queryCurr),
  }
}

/**
 * Build a localized URL for a given path, subdomain/locale, currency, and extra query params.
 *
 * Options:
 *  - `sub`: target subdomain ('kr' | 'jp' | 'uk' | 'hk' | 'tw' | 'www')
 *  - `locale`: override locale (defaults to sub's default locale)
 *  - `curr`: override currency (defaults to sub's default curr)
 *  - `includeCurr`: include `curr` query param (default true; set false for canonical/hreflang)
 *  - `query`: additional query params (URLSearchParams or plain object) to preserve
 *  - `origin`: override origin (e.g. for localhost / workers.dev preview; default https://<sub>.getfortrip.com)
 */
export function buildLocalizedUrl(path = '/', options = {}) {
  const subCfg = options.sub
    ? configForSubdomain(options.sub)
    : options.locale
      ? configForLocale(options.locale)
      : SUBDOMAIN_BY_KEY[DEFAULT_SUBDOMAIN]

  const locale = normalizeLocale(options.locale) || subCfg.locale
  const includeCurr = options.includeCurr !== false
  const curr = includeCurr ? (normalizeCurrency(options.curr) || subCfg.curr) : null

  const cleanPath = String(path || '/').startsWith('/') ? String(path || '/') : `/${path}`
  const origin = options.origin ? String(options.origin).replace(/\/+$/, '') : `https://${subCfg.host}`

  const params = new URLSearchParams()
  if (options.query) {
    const entries = typeof options.query.entries === 'function'
      ? [...options.query.entries()]
      : Object.entries(options.query)
    for (const [k, v] of entries) {
      if (k === 'locale' || k === 'curr') continue
      if (v === undefined || v === null || v === '') continue
      if (Array.isArray(v)) {
        for (const item of v) if (item !== undefined && item !== null && item !== '') params.append(k, String(item))
      } else {
        params.set(k, String(v))
      }
    }
  }
  params.set('locale', locale)
  if (curr) params.set('curr', curr)

  const qs = params.toString()
  return `${origin}${cleanPath}${qs ? `?${qs}` : ''}`
}

/**
 * Canonical URL for a page: always on the target subdomain with ?locale= and WITHOUT curr.
 */
export function buildCanonicalUrl(path = '/', options = {}) {
  return buildLocalizedUrl(path, { ...options, includeCurr: false, query: undefined })
}

/**
 * Full hreflang alternate link set across all 6 country subdomains + x-default (www).
 * Canonical-aligned (no `curr` parameter).
 */
export function buildHreflangAlternates(path = '/', { koOnly = false } = {}) {
  const link = (hreflang, href) => ({ rel: 'alternate', hreflang, href, type: 'text/html' })
  if (koOnly) {
    const krHref = buildCanonicalUrl(path, { sub: 'kr' })
    return [
      link('ko-KR', krHref),
      link('x-default', krHref),
    ]
  }
  const wwwHref = buildCanonicalUrl(path, { sub: DEFAULT_SUBDOMAIN })
  return [
    ...SUBDOMAIN_LIST.map((entry) => link(entry.hreflang, buildCanonicalUrl(path, { sub: entry.sub }))),
    link('x-default', wwwHref),
  ]
}

/**
 * Build Set-Cookie header strings for pref_sub, pref_locale, pref_curr.
 * Uses Domain=.getfortrip.com on production site hosts, host-only on dev/preview.
 */
export function buildPrefCookieHeaders({ sub, locale, curr }, { hostname = '', secure = true, maxAgeSec = 31536000 } = {}) {
  const domainAttr = isSiteHost(hostname) ? `; Domain=${COOKIE_DOMAIN}` : ''
  const secureAttr = secure ? '; Secure' : ''
  const tail = `; Path=/${domainAttr}; Max-Age=${maxAgeSec}; SameSite=Lax${secureAttr}`
  const out = []
  if (sub && SUBDOMAIN_BY_KEY[sub]) out.push(`${PREF_COOKIES.sub}=${sub}${tail}`)
  const normLoc = normalizeLocale(locale)
  if (normLoc) out.push(`${PREF_COOKIES.locale}=${normLoc}${tail}`)
  const normCurr = normalizeCurrency(curr)
  if (normCurr) out.push(`${PREF_COOKIES.curr}=${normCurr}${tail}`)
  return out
}
