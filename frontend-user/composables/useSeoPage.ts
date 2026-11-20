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
}

export const SEO_LOCALES = [
  { code: 'ko', prefix: '' },
  { code: 'en', prefix: '/en' },
  { code: 'ja', prefix: '/ja' },
  { code: 'zh', prefix: '/zh' },
] as const

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
  const canonical = `${i.site}${i.path}`
  const image = i.image || `${i.site}/symbol.svg`
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
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: title },
      { name: 'twitter:description', content: desc },
      { name: 'twitter:image', content: image },
    ],
    link: [
      { rel: 'canonical', href: canonical },
      ...SEO_LOCALES.map((l) => ({ rel: 'alternate', hreflang: l.code, href: `${i.site}${l.prefix}${i.path}` })),
      { rel: 'alternate', hreflang: 'x-default', href: canonical },
    ],
  }
}

/** Thin Nuxt wrapper — pages call this in <script setup> (SSR head). */
export function useSeoPage(i: SeoPageInput) {
  useHead(seoHead(i) as any)
}
