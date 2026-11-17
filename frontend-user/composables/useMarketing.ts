// CR-05: operator-managed marketing slots. One fetch per page load, shared by
// the home sections and the popup. Nothing renders when the API returns nothing.
import { useApiUrl } from '~/composables/useApi'

export interface MarketingSlot {
  id: string
  placement: 'HERO' | 'STRIP' | 'POPUP' | 'HOME_PICK'
  title: string
  subtitle: string | null
  imageUrl: string | null
  linkUrl: string | null
  endsAt: string | null
  product: { domainType: string; id: string; title: string; eyebrow: string | null; priceKrw: number | null } | null
}

/** Our own upload URLs are API paths; resolve them against the API base (dev runs the API on another origin). */
export function assetUrl(u: string | null | undefined): string | null {
  if (!u) return null
  return u.startsWith('/api/v1/') ? useApiUrl(u.slice('/api/v1'.length)) : u
}

let inflight: Promise<MarketingSlot[]> | null = null

export function useMarketingSlots() {
  const slots = useState<MarketingSlot[]>('marketing-slots', () => [])
  const loaded = useState<boolean>('marketing-slots-loaded', () => false)
  async function load() {
    if (import.meta.server || loaded.value) return
    inflight ||= fetch(useApiUrl('/marketing/slots'))
      .then((r) => (r.ok ? r.json() : { slots: [] }))
      .then((j) => (Array.isArray(j.slots) ? j.slots : []))
      .catch(() => [])
    slots.value = await inflight
    loaded.value = true
  }
  const by = (p: MarketingSlot['placement']) => computed(() => slots.value.filter((s) => s.placement === p))
  return { slots, loaded, load, hero: by('HERO'), strip: by('STRIP'), popup: by('POPUP'), picks: by('HOME_PICK') }
}

/** Internal links route through NuxtLink; https links open in a new tab. */
export const isExternal = (u: string | null | undefined) => !!u && /^https:\/\//.test(u)
