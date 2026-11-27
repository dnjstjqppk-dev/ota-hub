/**
 * Single source of truth for country-subdomain + locale/currency routing in Nuxt.
 * Mirrored in dependency-free ESM at frontend-user/edge/locale-map.mjs (verified
 * 1:1 by frontend-user/tests/edge-guard.test.mjs). Self-contained TypeScript so
 * Vite/Nitro prerender bundles it cleanly without external .mjs resolution.
 */

export type SubdomainKey = 'kr' | 'jp' | 'uk' | 'hk' | 'tw' | 'www'
export type LocaleCode = 'ko-kr' | 'ja-jp' | 'en-gb' | 'zh-hk' | 'zh-tw' | 'en-us'
export type I18nBundle = 'ko' | 'en' | 'ja' | 'zh'
export type CurrencyCode = 'KRW' | 'USD' | 'JPY' | 'GBP' | 'HKD' | 'TWD' | 'EUR' | 'CNY'

export interface SubdomainConfig {
  readonly sub: SubdomainKey
  readonly host: string
  readonly locale: LocaleCode
  readonly hreflang: string
  readonly ogLocale: string
  readonly i18n: I18nBundle
  readonly curr: CurrencyCode
  readonly countries: readonly string[]
  readonly label: string
}

export interface ResolvedLocaleContext {
  sub: SubdomainKey
  host: string
  locale: LocaleCode
  i18n: I18nBundle
  hreflang: string
  ogLocale: string
  curr: CurrencyCode
  hasExplicitQuery: boolean
}

export interface BuildLocalizedUrlOptions {
  sub?: SubdomainKey | string
  locale?: LocaleCode | string
  curr?: CurrencyCode | string
  includeCurr?: boolean
  query?: URLSearchParams | Record<string, unknown>
  origin?: string
}

export type HreflangLink = {
  rel: 'alternate'
  hreflang: string
  href: string
  type: 'text/html'
}

export const SITE_DOMAIN = 'getfortrip.com'
export const COOKIE_DOMAIN = `.${SITE_DOMAIN}`

export const PREF_COOKIES = Object.freeze({
  sub: 'pref_sub',
  locale: 'pref_locale',
  curr: 'pref_curr',
})

export const SUBDOMAINS: readonly SubdomainConfig[] = Object.freeze([
  Object.freeze({ sub: 'kr', host: `kr.${SITE_DOMAIN}`, locale: 'ko-kr', hreflang: 'ko-KR', ogLocale: 'ko_KR', i18n: 'ko', curr: 'KRW', countries: Object.freeze(['KR']), label: '한국어 (KR)' }),
  Object.freeze({ sub: 'jp', host: `jp.${SITE_DOMAIN}`, locale: 'ja-jp', hreflang: 'ja-JP', ogLocale: 'ja_JP', i18n: 'ja', curr: 'JPY', countries: Object.freeze(['JP']), label: '日本語 (JP)' }),
  Object.freeze({ sub: 'uk', host: `uk.${SITE_DOMAIN}`, locale: 'en-gb', hreflang: 'en-GB', ogLocale: 'en_GB', i18n: 'en', curr: 'GBP', countries: Object.freeze(['GB', 'UK']), label: 'English (UK)' }),
  Object.freeze({ sub: 'hk', host: `hk.${SITE_DOMAIN}`, locale: 'zh-hk', hreflang: 'zh-HK', ogLocale: 'zh_HK', i18n: 'zh', curr: 'HKD', countries: Object.freeze(['HK', 'MO']), label: '繁體中文 (HK)' }),
  Object.freeze({ sub: 'tw', host: `tw.${SITE_DOMAIN}`, locale: 'zh-tw', hreflang: 'zh-TW', ogLocale: 'zh_TW', i18n: 'zh', curr: 'TWD', countries: Object.freeze(['TW']), label: '繁體中文 (TW)' }),
  Object.freeze({ sub: 'www', host: `www.${SITE_DOMAIN}`, locale: 'en-us', hreflang: 'en-US', ogLocale: 'en_US', i18n: 'en', curr: 'USD', countries: Object.freeze([]), label: 'English (Global)' }),
])

export const DEFAULT_SUBDOMAIN: SubdomainKey = 'www'
export const SUPPORTED_CURRENCIES: readonly CurrencyCode[] = Object.freeze(['KRW', 'USD', 'JPY', 'GBP', 'HKD', 'TWD', 'EUR', 'CNY'])
export const I18N_BUNDLES: readonly I18nBundle[] = Object.freeze(['ko', 'en', 'ja', 'zh'])

export const SUBDOMAIN_MAP: Record<SubdomainKey, SubdomainConfig> = Object.freeze(
  Object.fromEntries(SUBDOMAINS.map((e) => [e.sub, e])) as Record<SubdomainKey, SubdomainConfig>
)

export const LOCALE_MAP: Record<LocaleCode, SubdomainConfig> = Object.freeze(
  Object.fromEntries(SUBDOMAINS.map((e) => [e.locale, e])) as Record<LocaleCode, SubdomainConfig>
)

export const COUNTRY_TO_SUBDOMAIN: Record<string, SubdomainKey> = Object.freeze(
  Object.fromEntries(SUBDOMAINS.flatMap((e) => e.countries.map((cc) => [cc, e.sub])))
)

export const LEGACY_PREFIX_MAP: Record<'en' | 'ja' | 'zh', SubdomainConfig> = Object.freeze({
  en: SUBDOMAIN_MAP.www,
  ja: SUBDOMAIN_MAP.jp,
  zh: SUBDOMAIN_MAP.hk,
})

export function normalizeLocale(input: unknown): LocaleCode | null {
  const raw = String(input || '').trim().toLowerCase().replace('_', '-')
  if (!raw) return null
  if (raw in LOCALE_MAP) return raw as LocaleCode
  if (raw === 'ko') return 'ko-kr'
  if (raw === 'ja') return 'ja-jp'
  if (raw === 'en') return 'en-us'
  if (raw === 'en-uk') return 'en-gb'
  if (raw === 'zh' || raw === 'zh-cn' || raw === 'zh-hans') return 'zh-hk'
  if (raw === 'zh-hant') return 'zh-tw'
  return null
}

export function normalizeCurrency(input: unknown): CurrencyCode | null {
  const c = String(input || '').trim().toUpperCase()
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(c) ? (c as CurrencyCode) : null
}

export function subdomainFromHost(hostname: string): SubdomainKey | null {
  const h = String(hostname || '').toLowerCase().split(':')[0] || ''
  if (!h || h === SITE_DOMAIN) return null
  const suffix = `.${SITE_DOMAIN}`
  if (!h.endsWith(suffix)) return null
  const label = h.slice(0, -suffix.length)
  return label in SUBDOMAIN_MAP ? (label as SubdomainKey) : null
}

export function isSiteHost(hostname: string): boolean {
  const h = String(hostname || '').toLowerCase().split(':')[0] || ''
  return h === SITE_DOMAIN || h.endsWith(`.${SITE_DOMAIN}`)
}

export function getCountryConfig(countryCode?: string): SubdomainConfig {
  const cc = String(countryCode || '').trim().toUpperCase()
  const sub = COUNTRY_TO_SUBDOMAIN[cc] || DEFAULT_SUBDOMAIN
  return SUBDOMAIN_MAP[sub]
}

export function getLocaleConfig(locale?: string): SubdomainConfig {
  const norm = normalizeLocale(locale)
  return (norm && LOCALE_MAP[norm]) || SUBDOMAIN_MAP[DEFAULT_SUBDOMAIN]
}

export function getSubdomainConfig(sub?: string): SubdomainConfig {
  const k = String(sub || '').trim().toLowerCase()
  return (k in SUBDOMAIN_MAP ? SUBDOMAIN_MAP[k as SubdomainKey] : SUBDOMAIN_MAP[DEFAULT_SUBDOMAIN])
}

export function i18nBundleForLocale(locale?: string): I18nBundle {
  const norm = normalizeLocale(locale)
  return norm ? LOCALE_MAP[norm].i18n : 'ko'
}

export function htmlLangForLocale(locale?: string): string {
  const norm = normalizeLocale(locale)
  return norm ? LOCALE_MAP[norm].hreflang : 'ko-KR'
}

export function resolveLocale(input?: {
  hostname?: string
  searchParams?: URLSearchParams | Record<string, unknown> | null
  cookies?: Record<string, string>
}): ResolvedLocaleContext {
  const hostname = input?.hostname || ''
  const searchParams = input?.searchParams || null
  const cookies = input?.cookies || {}

  const hostSub = subdomainFromHost(hostname)
  const cookieSubRaw = cookies[PREF_COOKIES.sub]
  const fallbackSub: SubdomainKey = hostSub || (cookieSubRaw && cookieSubRaw in SUBDOMAIN_MAP ? (cookieSubRaw as SubdomainKey) : 'kr')
  const baseCfg = SUBDOMAIN_MAP[fallbackSub] || SUBDOMAIN_MAP[DEFAULT_SUBDOMAIN]

  const getParam = (k: string): string => {
    if (!searchParams) return ''
    if (typeof (searchParams as URLSearchParams).get === 'function') return (searchParams as URLSearchParams).get(k) || ''
    const v = (searchParams as Record<string, unknown>)[k]
    return Array.isArray(v) ? String(v[0] || '') : String(v || '')
  }

  const queryLocale = normalizeLocale(getParam('locale'))
  const cookieLocale = normalizeLocale(cookies[PREF_COOKIES.locale])
  const locale: LocaleCode = queryLocale || (hostSub ? baseCfg.locale : (cookieLocale || baseCfg.locale))
  const localeCfg = LOCALE_MAP[locale] || baseCfg

  const queryCurr = normalizeCurrency(getParam('curr'))
  const cookieCurr = normalizeCurrency(cookies[PREF_COOKIES.curr])
  const curr: CurrencyCode = queryCurr || cookieCurr || baseCfg.curr

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

export function buildLocalizedUrl(path = '/', options: BuildLocalizedUrlOptions = {}): string {
  const subCfg = options.sub
    ? getSubdomainConfig(options.sub)
    : options.locale
      ? getLocaleConfig(options.locale)
      : SUBDOMAIN_MAP[DEFAULT_SUBDOMAIN]

  const locale = normalizeLocale(options.locale) || subCfg.locale
  const includeCurr = options.includeCurr !== false
  const curr = includeCurr ? (normalizeCurrency(options.curr) || subCfg.curr) : null

  const cleanPath = String(path || '/').startsWith('/') ? String(path || '/') : `/${path}`
  const origin = options.origin ? String(options.origin).replace(/\/+$/, '') : `https://${subCfg.host}`

  const params = new URLSearchParams()
  if (options.query) {
    const entries = typeof (options.query as URLSearchParams).entries === 'function'
      ? [...(options.query as URLSearchParams).entries()]
      : Object.entries(options.query as Record<string, unknown>)
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

export function buildCanonical(path = '/', options: BuildLocalizedUrlOptions = {}): string {
  return buildLocalizedUrl(path, { ...options, includeCurr: false, query: undefined })
}

export function buildHreflang(path = '/', opts?: { koOnly?: boolean }): HreflangLink[] {
  const link = (hreflang: string, href: string): HreflangLink => ({ rel: 'alternate', hreflang, href, type: 'text/html' })
  if (opts?.koOnly) {
    const krHref = buildCanonical(path, { sub: 'kr' })
    return [link('ko-KR', krHref), link('x-default', krHref)]
  }
  const wwwHref = buildCanonical(path, { sub: DEFAULT_SUBDOMAIN })
  return [
    ...SUBDOMAINS.map((entry) => link(entry.hreflang, buildCanonical(path, { sub: entry.sub }))),
    link('x-default', wwwHref),
  ]
}

export const buildLocalized = buildLocalizedUrl
export const buildCanonicalUrl = buildCanonical
export const buildHreflangAlternates = buildHreflang
export const resolveLocaleContext = resolveLocale
export const configForCountry = getCountryConfig
export const configForLocale = getLocaleConfig
export const configForSubdomain = getSubdomainConfig
