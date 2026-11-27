/** One SEO head per public page: dynamic title/meta + subdomain canonical (no curr) + hreflang + OG/Twitter. SSR-safe (pure builder). */
import {
  SUBDOMAINS,
  buildCanonical,
  buildHreflang,
  getLocaleConfig,
  getSubdomainConfig,
  resolveLocale,
  type HreflangLink,
  type SubdomainConfig,
  type SubdomainKey,
} from '../config/locale.config.ts'

export interface SeoPageInput {
  site: string
  path: string
  title: string
  description: string
  city?: string
  country?: string
  image?: string
  type?: 'website' | 'article'
  /** Legacy prefix ('', '/en', '/ja', '/zh') or BCP-47 locale ('ko-kr', 'en-us', ...). */
  localePrefix?: string
  /** Target country subdomain ('kr' | 'jp' | 'uk' | 'hk' | 'tw' | 'www'). */
  subdomain?: SubdomainKey | string
  /** Target BCP-47 locale ('ko-kr' | 'ja-jp' | 'en-gb' | 'zh-hk' | 'zh-tw' | 'en-us'). */
  locale?: string
  /**
   * Korean-only content (legal text, help/FAQ prose). Canonical + OG URL point
   * to the kr.getfortrip.com page and only ko-KR/x-default alternates are emitted,
   * so crawlers never mistake the translated chrome for translated content.
   */
  koOnly?: boolean
}

export const SEO_LOCALES = SUBDOMAINS

const OG_LOCALE_TAG: Record<string, string> = {
  ko: 'ko_KR',
  'ko-kr': 'ko_KR',
  en: 'en_US',
  'en-us': 'en_US',
  'en-gb': 'en_GB',
  ja: 'ja_JP',
  'ja-jp': 'ja_JP',
  zh: 'zh_HK',
  'zh-cn': 'zh_HK',
  'zh-hk': 'zh_HK',
  'zh-tw': 'zh_TW',
}

const ALL_OG_LOCALES = ['ko_KR', 'ja_JP', 'en_GB', 'zh_HK', 'zh_TW', 'en_US'] as const

/** S9: Open Graph locale for a locale code (unknown codes fall back to ko_KR). */
export function ogLocaleTag(locale: string) {
  const key = String(locale || '').trim().toLowerCase().replace('_', '-')
  return OG_LOCALE_TAG[key] || 'ko_KR'
}

/**
 * S9: minimal social-card meta for pages with bespoke heads (details, lists).
 * Title/description stay in the page's own tags; this fills image/locale/card.
 */
export function ogMeta(site: string, path: string, image: string | null | undefined, locale: string, subdomain?: string) {
  const canonical = subdomain || locale
    ? buildCanonical(path, subdomain ? { sub: subdomain, locale: locale || undefined } : { locale })
    : `${site}${path}`
  const img = image || `${site}/symbol.svg`
  const current = ogLocaleTag(locale)
  return [
    { property: 'og:url', content: canonical },
    { property: 'og:image', content: img },
    { property: 'og:locale', content: current },
    ...ALL_OG_LOCALES.filter((t) => t !== current).map((t) => ({ property: 'og:locale:alternate', content: t })),
    { name: 'twitter:card', content: 'summary_large_image' },
    { name: 'twitter:image', content: img },
  ]
}

/**
 * Canonical URL for a page (without `curr`, with subdomain + `?locale=`).
 * Used by both seoHead() and bespoke detail/list heads.
 */
export function canonicalHref(path: string, opts?: { sub?: string; locale?: string; koOnly?: boolean }): string {
  if (opts?.koOnly) return buildCanonical(path, { sub: 'kr' })
  return buildCanonical(path, { sub: opts?.sub, locale: opts?.locale })
}

/**
 * S10: hreflang alternates for pages with bespoke heads (details, lists).
 * Emits one canonical (curr-free) URL per country subdomain plus x-default on www.
 */
export function hreflangLinks(_site: string, path: string, opts?: { koOnly?: boolean }): HreflangLink[] {
  return buildHreflang(path, opts)
}

/** S9: search-console ownership metas — only the configured engines render. */
export function siteVerificationMetas(input: { naver?: string | null; google?: string | null }) {
  const out: { name: string; content: string }[] = []
  const naver = (input.naver || '').trim()
  const google = (input.google || '').trim()
  if (naver) out.push({ name: 'naver-site-verification', content: naver })
  if (google) out.push({ name: 'google-site-verification', content: google })
  return out
}

/** "도쿄 호텔·숙소 예약" — city/country prefix the base phrase for list/landing pages. */
export function seoTitle(base: string, city?: string, country?: string) {
  return [city, country, base].filter(Boolean).join(' ')
}

/** H1 mirrors the title's place-first phrasing so crawlers and readers agree. */
export function seoH1(base: string, city?: string, country?: string) {
  return seoTitle(base, city, country)
}

function resolveTargetConfig(i: SeoPageInput): SubdomainConfig {
  if (i.koOnly) return getSubdomainConfig('kr')
  if (i.subdomain) return getSubdomainConfig(i.subdomain)
  if (i.locale) return getLocaleConfig(i.locale)
  const legacyCode = (i.localePrefix || '').replace(/^\//, '').trim().toLowerCase()
  if (legacyCode) return getLocaleConfig(legacyCode)
  return getSubdomainConfig('kr')
}

export function seoHead(i: SeoPageInput) {
  const title = seoTitle(i.title, i.city, i.country)
  const desc = seoTitle(i.description, i.city, i.country)
  const cfg = resolveTargetConfig(i)
  const locale = i.koOnly ? 'ko-kr' : (i.locale || cfg.locale)
  // Canonical URL always uses the country subdomain + ?locale= and strips `curr`.
  const canonical = buildCanonical(i.path, { sub: cfg.sub, locale })
  const image = i.image || `${i.site}/symbol.svg`
  const ogLocale = i.koOnly ? 'ko_KR' : ogLocaleTag(locale)
  const alternates = buildHreflang(i.path, { koOnly: i.koOnly })
  return {
    title,
    meta: [
      { name: 'description', content: desc },
      { property: 'og:type', content: i.type || 'website' },
      { property: 'og:site_name', content: 'getfortrip' },
      { property: 'og:title', content: title },
      { property: 'og:description', content: desc },
      { property: 'og:url', content: canonical },
      { property: 'og:image', content: image },
      { property: 'og:locale', content: ogLocale },
      ...ALL_OG_LOCALES.filter((t) => t !== ogLocale).map((t) => ({ property: 'og:locale:alternate', content: t })),
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: title },
      { name: 'twitter:description', content: desc },
      { name: 'twitter:image', content: image },
    ],
    link: [
      { rel: 'canonical', href: canonical },
      ...alternates,
    ],
  }
}

/** Resolve active { sub, locale, curr, hreflang } inside a Vue setup context. */
export function useActiveLocaleContext() {
  const route = useRoute()
  const { locale } = useI18n()
  let hostname = ''
  if (import.meta.server) {
    try { hostname = useRequestURL().hostname } catch {}
  } else if (typeof window !== 'undefined') {
    hostname = window.location.hostname
  }
  return computed(() =>
    resolveLocale({
      hostname,
      searchParams: route.query as Record<string, unknown>,
      cookies: { pref_locale: locale.value },
    })
  )
}

/** Thin Nuxt wrapper — pages call this in <script setup> (SSR head). */
export function useSeoPage(i: SeoPageInput) {
  const ctx = useActiveLocaleContext()
  useHead(() => seoHead({ ...i, subdomain: ctx.value.sub, locale: ctx.value.locale }) as any)
}
