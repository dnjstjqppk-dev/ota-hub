/** Shared JSON-LD builders (pure, SSR-safe). Pages pass catalogue facts only — never invented amenities. */

export interface FaqItem { q: string; a: string }
export interface Crumb { name: string; path: string }
export interface ProductInput { site: string; path: string; name: string; image?: string; priceKrw?: number | null; currency?: string; availability?: string }

/** Script entry with "<" escaped so catalogue text can never close the tag. */
export function jsonLdScript(data: Record<string, unknown>) {
  return { type: 'application/ld+json' as const, innerHTML: JSON.stringify(data).replace(/</g, '\\u003c') }
}

export function orgWebsiteLd(site: string, opts: { contactPhone?: string | null; sameAs?: string[] } = {}) {
  const phone = (opts.contactPhone || '').trim()
  const sameAs = [...new Set((opts.sameAs || []).map((s) => s.trim()).filter((s) => /^https:\/\/.+\..+/.test(s)))]
  return {
    '@context': 'https://schema.org', '@graph': [
      {
        '@type': 'Organization', '@id': `${site}/#org`, name: 'getfortrip', url: site, logo: `${site}/logo.svg`,
        ...(sameAs.length ? { sameAs } : {}),
        ...(phone ? { contactPoint: { '@type': 'ContactPoint', telephone: phone, contactType: 'customer service' } } : {}),
      },
      { '@type': 'WebSite', '@id': `${site}/#site`, url: site, name: 'getfortrip', publisher: { '@id': `${site}/#org` }, potentialAction: { '@type': 'SearchAction', target: { '@type': 'EntryPoint', urlTemplate: `${site}/hotels/list?city={search_term_string}` }, 'query-input': 'required name=search_term_string' } },
    ],
  }
}

export function breadcrumbLd(site: string, crumbs: Crumb[]) {
  return { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: `${site}${c.path}` })) }
}

export function faqLd(items: FaqItem[]) {
  return { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: items.slice(0, 20).map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) }
}

/** S3: WebPage with a speakable pointer at the on-screen answer summary. */
export function speakableLd(site: string, path: string, selectors: string[] = ['#answer-summary']) {
  return { '@context': 'https://schema.org', '@type': 'WebPage', url: `${site}${path}`, speakable: { '@type': 'SpeakableSpecification', cssSelector: selectors } }
}

function offerOf(p: ProductInput) {
  return { '@type': 'Offer', url: `${p.site}${p.path}`, priceCurrency: p.currency || 'KRW', ...(p.priceKrw ? { price: p.priceKrw } : {}), ...(p.availability ? { availability: `https://schema.org/${p.availability}` } : {}) }
}

export function productLd(p: ProductInput) {
  return { '@context': 'https://schema.org', '@type': 'Product', name: p.name, url: `${p.site}${p.path}`, ...(p.image ? { image: p.image } : {}), offers: offerOf(p) }
}

export function lodgingLd(p: ProductInput & { address?: string; city?: string; starRating?: number | null }) {
  return {
    '@context': 'https://schema.org', '@type': 'LodgingBusiness', name: p.name, url: `${p.site}${p.path}`,
    ...(p.image ? { image: p.image } : {}),
    ...(p.address || p.city ? { address: { '@type': 'PostalAddress', ...(p.address ? { streetAddress: p.address } : {}), ...(p.city ? { addressLocality: p.city } : {}) } } : {}),
    ...(p.starRating ? { starRating: { '@type': 'Rating', ratingValue: p.starRating } } : {}),
    ...(p.priceKrw ? { offers: offerOf(p) } : {}),
  }
}

export function attractionLd(p: ProductInput & { city?: string }) {
  return { '@context': 'https://schema.org', '@type': 'TouristAttraction', name: p.name, url: `${p.site}${p.path}`, ...(p.image ? { image: p.image } : {}), ...(p.city ? { address: { '@type': 'PostalAddress', addressLocality: p.city } } : {}), ...(p.priceKrw ? { offers: offerOf(p) } : {}) }
}

export function itemListLd(site: string, name: string, items: { name: string; path: string }[]) {
  const valid = (Array.isArray(items) ? items : []).filter((it) => it && it.name && it.path)
  return { '@context': 'https://schema.org', '@type': 'ItemList', name, numberOfItems: valid.length, itemListElement: valid.slice(0, 50).map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, url: `${site}${it.path}` })) }
}

/** S7: sellability → schema.org availability. Purchasable here or via partner link = InStock. */
export function availabilityOf(bookable: boolean | null | undefined, outlink: string | null | undefined): 'InStock' | 'OutOfStock' {
  return bookable === true || !!outlink ? 'InStock' : 'OutOfStock'
}

/** S7: complete Offer, or null when no valid price exists (never a priceless Offer). */
export function offerLd(site: string, path: string, priceKrw: unknown, bookable?: boolean | null, outlink?: string | null) {
  const price = Number(priceKrw)
  if (!Number.isFinite(price) || price <= 0) return null
  return { '@type': 'Offer', url: `${site}${path}`, priceCurrency: 'KRW', price, availability: `https://schema.org/${availabilityOf(bookable ?? null, outlink ?? null)}` }
}

/**
 * S7: verified-review rating, or null unless ≥1 review exists (never a 0.0 rating).
 * review_count only counts published reviews, which require a fulfilled booking.
 */
export function aggregateRatingOf(score: unknown, count: unknown): { '@type': 'AggregateRating'; ratingValue: number; reviewCount: number } | null {
  if (score === null || score === undefined || score === '') return null
  const s = Number(score), n = Number(count)
  if (!Number.isFinite(s) || !Number.isFinite(n) || n < 1) return null
  return { '@type': 'AggregateRating', ratingValue: Math.round(s * 10) / 10, reviewCount: Math.floor(n) }
}
