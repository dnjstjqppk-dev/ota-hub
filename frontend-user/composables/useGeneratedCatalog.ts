/**
 * C7: build-time catalog snapshot (scripts/gen-seo-snapshot.mjs) as
 * first-paint data. Every entry comes from D1 at build time — no invented
 * products. Detail pages render this synchronously (so prerendered HTML has
 * real titles/meta) and refresh from the live API on mount.
 */
import generated from '~/data/generatedCatalog.json'

export interface GeneratedEntry {
  name: string | null
  city: string | null
  image: string | null
  priceKrw: number | null
  score: number | null
  reviewCount: number
}

const byDomain = ((generated as any).products || {}) as Record<string, Record<string, GeneratedEntry>>

export function getGenerated(domain: string, id: string): GeneratedEntry | null {
  return byDomain[domain]?.[id] || null
}

/** Alias-rich partial matching the API item shapes loosely (all consumers null-guard). */
export function generatedFallback(domain: string, id: string): Record<string, any> | null {
  const g = getGenerated(domain, id)
  if (!g) return null
  const base: Record<string, any> = {
    id,
    title: g.name,
    name: g.name,
    name_ko: g.name,
    city: g.city,
    thumbnail_url: g.image,
    image_url: g.image,
    base_price_krw: g.priceKrw,
    price_krw: g.priceKrw,
    total_package_krw: g.priceKrw,
    review_score: g.score,
    review_count: g.reviewCount
  }
  if (domain === 'HOTEL') {
    // HotelProperty-lite: arrays the template iterates must exist.
    Object.assign(base, {
      name_en: '', country: '', address: '', star_rating: null,
      images: [], amenities: [], rooms: [], description: '',
      free_cancellation: false, free_breakfast: false
    })
  }
  return base
}
