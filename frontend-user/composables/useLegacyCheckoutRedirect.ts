import { onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'

type Q = Record<string, unknown>
const s = (v: unknown) => (Array.isArray(v) ? v[0] : v) as string | undefined
const isDate = (v: unknown) => typeof s(v) === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s(v)!)
const isCount = (v: unknown) => typeof s(v) === 'string' && /^\d{1,2}$/.test(s(v)!)

/**
 * The per-domain booking pages (/hotels/booking, /flights/booking, ...) were replaced by the
 * unified server-priced /checkout. Old links and bookmarks still land here, so translate their
 * query into checkout params. Client-side only: these routes are crawled by the prerenderer.
 * Price/total params from old links are intentionally dropped; the server computes the price.
 */
export function useLegacyCheckoutRedirect(domain: string, map: (q: Q) => { itemId?: unknown; unitId?: unknown; ratePlanId?: unknown; returnItemId?: unknown; returnDate?: unknown; startDate?: unknown; endDate?: unknown; adults?: unknown; children?: unknown; rooms?: unknown }) {
  const route = useRoute()
  const router = useRouter()
  onMounted(() => {
    const m = map(route.query as Q)
    const out: Record<string, string> = { domain }
    if (s(m.itemId)) out.itemId = s(m.itemId)!
    if (s(m.unitId)) out.unitId = s(m.unitId)!
    if (s(m.ratePlanId) && /^[A-Za-z0-9_-]{1,60}$/.test(s(m.ratePlanId)!)) out.ratePlanId = s(m.ratePlanId)!
    if (s(m.returnItemId) && /^[A-Za-z0-9_-]{1,100}$/.test(s(m.returnItemId)!)) out.returnItemId = s(m.returnItemId)!
    if (isDate(m.returnDate)) out.returnDate = s(m.returnDate)!
    if (isDate(m.startDate)) out.startDate = s(m.startDate)!
    if (isDate(m.endDate)) out.endDate = s(m.endDate)!
    for (const k of ['adults', 'children', 'rooms'] as const) if (isCount(m[k])) out[k] = s(m[k])!
    if (!out.itemId) return router.replace('/')
    router.replace({ path: '/checkout', query: out })
  })
}
