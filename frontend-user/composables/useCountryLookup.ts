import { useApiUrl } from '~/composables/useApi'

export interface Country { code: string; name: string }

/**
 * Resolve an ISO country code or a typed country name to { code, name } using the places-backed
 * suggest API (never a hard-coded list). Returns null when nothing matches or the API fails.
 */
export async function resolveCountry(input: string, domain: 'esim' | 'insurance'): Promise<Country | null> {
  const q = input.trim()
  if (!q) return null
  try {
    const r = await fetch(useApiUrl(`/search/suggest?q=${encodeURIComponent(q)}&domain=${domain}&limit=8`), { signal: AbortSignal.timeout(8000) })
    if (!r.ok) return null
    const rows: any[] = ((await r.json()).data || []).filter((x: any) => x.place_type === 'COUNTRY' && x.code)
    const up = q.toUpperCase()
    const hit = rows.find((x) => x.code === up) || rows.find((x) => x.value === q) || rows[0]
    return hit ? { code: String(hit.code).toUpperCase(), name: String(hit.value || hit.title) } : null
  } catch {
    return null
  }
}

export const isIsoCountry = (s: string) => /^[A-Z]{2}$/.test(s)
