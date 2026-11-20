/** Shared JSON-LD builders (pure, SSR-safe). Pages pass catalogue facts only — never invented amenities. */

export interface FaqItem { q: string; a: string }
export interface Crumb { name: string; path: string }
export interface ProductInput { site: string; path: string; name: string; image?: string; priceKrw?: number | null; currency?: string; availability?: string }

/** Script entry with "<" escaped so catalogue text can never close the tag. */
export function jsonLdScript(data: Record<string, unknown>) {
  return { type: 'application/ld+json' as const, innerHTML: JSON.stringify(data).replace(/</g, '\\u003c') }
}

export function orgWebsiteLd(site: string) {
  return {
    '@context': 'https://schema.org', '@graph': [
      { '@type': 'Organization', '@id': `${site}/#org`, name: 'getfortrip', url: site, logo: `${site}/logo.svg` },
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
  return { '@context': 'https://schema.org', '@type': 'ItemList', name, numberOfItems: items.length, itemListElement: items.slice(0, 50).map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, url: `${site}${it.path}` })) }
}
