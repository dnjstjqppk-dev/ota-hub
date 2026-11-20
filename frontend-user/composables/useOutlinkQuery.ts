/**
 * Affiliate outlink context (Phase 3): carry the traveler's picked
 * destination / dates / party / room options into the /out/ click URL so the
 * worker can map them onto the partner deeplink without loss. Pure and
 * framework-free — the server allowlist remains authoritative; this only
 * merges non-empty values into the query string the catalog API emitted.
 */

const FORWARD_KEYS = ['dest', 'origin', 'startDate', 'endDate', 'adults', 'children', 'rooms', 'cabin'] as const

export type OutlinkContext = Partial<Record<(typeof FORWARD_KEYS)[number], string | number>>

/**
 * @example appendOutlinkContext('/out/agoda/h1?domain=HOTEL', { startDate: '2026-12-01', adults: 2 })
 * // '/out/agoda/h1?domain=HOTEL&startDate=2026-12-01&adults=2'
 */
export function appendOutlinkContext(outlinkPath: string, ctx: OutlinkContext): string {
  const params = new URLSearchParams()
  for (const k of FORWARD_KEYS) {
    const v = ctx[k]
    if (v === undefined || v === null || v === '') continue
    params.set(k, String(v))
  }
  const extra = params.toString()
  if (!extra) return outlinkPath
  return outlinkPath + (outlinkPath.includes('?') ? '&' : '?') + extra
}
