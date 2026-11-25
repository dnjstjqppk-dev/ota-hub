/** One SEO head per public page: dynamic title/meta + canonical + hreflang + OG/Twitter. SSR-safe (pure builder). */

export interface SeoPageInput {
  site: string
  path: string
  title: string
  description: string
  city?: string
  country?: string
  image?: string
  type?: 'website' | 'article'
  /** Locale URL prefix of the rendering page ('' for ko, '/en', ...). */
  localePrefix?: string
  /**
   * Korean-only content (legal text, help/FAQ prose). Canonical + OG URL point
   * to the ko page and only ko/x-default alternates are emitted, so crawlers
   * never mistake the translated chrome for translated content.
   */
  koOnly?: boolean
}

export const SEO_LOCALES = [
  { code: 'ko', prefix: '' },
  { code: 'en', prefix: '/en' },
  { code: 'ja', prefix: '/ja' },
  { code: 'zh', prefix: '/zh' },
] as const

const OG_LOCALE_TAG: Record<string, string> = { ko: 'ko_KR', en: 'en_US', ja: 'ja_JP', zh: 'zh_CN' }

/** S9: Open Graph locale for a locale code (unknown codes fall back to ko_KR). */
export function ogLocaleTag(locale: string) {
  return OG_LOCALE_TAG[locale] || 'ko_KR'
}

/**
 * S9: minimal social-card meta for pages with bespoke heads (details, lists).
 * Title/description stay in the page's own tags; this fills image/locale/card.
 */
export function ogMeta(site: string, path: string, image: string | null | undefined, locale: string) {
  const url = `${site}${path}`
  const img = image || `${site}/symbol.svg`
  const current = ogLocaleTag(locale)
  return [
    { property: 'og:url', content: url },
    { property: 'og:image', content: img },
    { property: 'og:locale', content: current },
    ...Object.values(OG_LOCALE_TAG).filter((t) => t !== current).map((t) => ({ property: 'og:locale:alternate', content: t })),
    { name: 'twitter:card', content: 'summary_large_image' },
    { name: 'twitter:image', content: img },
  ]
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

export function seoHead(i: SeoPageInput) {
  const title = seoTitle(i.title, i.city, i.country)
  const desc = seoTitle(i.description, i.city, i.country)
  const prefix = i.koOnly ? '' : (i.localePrefix || '')
  const canonical = `${i.site}${prefix}${i.path}`
  const image = i.image || `${i.site}/symbol.svg`
  const ogLocale = i.koOnly ? 'ko_KR' : ogLocaleTag((i.localePrefix || '').replace(/^\//, '') || 'ko')
  const alternates = i.koOnly
    ? [
        { rel: 'alternate', hreflang: 'ko', href: `${i.site}${i.path}` },
        { rel: 'alternate', hreflang: 'x-default', href: `${i.site}${i.path}` },
      ]
    : [
        ...SEO_LOCALES.map((l) => ({ rel: 'alternate', hreflang: l.code, href: `${i.site}${l.prefix}${i.path}` })),
        { rel: 'alternate', hreflang: 'x-default', href: `${i.site}${i.path}` },
      ]
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
      ...Object.values(OG_LOCALE_TAG).filter((t) => t !== ogLocale).map((t) => ({ property: 'og:locale:alternate', content: t })),
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

/** Thin Nuxt wrapper — pages call this in <script setup> (SSR head). */
export function useSeoPage(i: SeoPageInput) {
  const { locale } = useI18n()
  const prefix = locale.value === 'ko' ? '' : `/${locale.value}`
  useHead(seoHead({ ...i, localePrefix: prefix }) as any)
}
