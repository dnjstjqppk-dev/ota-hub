// GAP-07: cart store. Legs are priced server quotes; the store keeps display
// facts so /cart renders without a quotes GET endpoint. Server revalidates
// every leg at booking, so stale facts can never overcharge.
import { defineStore } from 'pinia'
import { apiFetch } from '~/composables/useApi'
import { buildLegQuoteBody, type LegQuoteInput } from '~/composables/useCartLeg'

export interface CartLeg {
  quoteId: string
  domain: string
  title: string
  totalMinor: number
  serviceStart: string
  serviceEnd: string
  adults: number
  children: number
  infants: number
}

const KEY = 'getfortrip_cart_v1'

function load(): CartLeg[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(KEY)
    const arr = raw ? JSON.parse(raw) : []
    return Array.isArray(arr) ? arr.filter((l) => l && l.quoteId && typeof l.totalMinor === 'number' && typeof l.adults === 'number') : []
  } catch {
    return []
  }
}

export const useCartStore = defineStore('cart', {
  // 2026-11-27 review: legs start EMPTY on both server and client so SSR and
  // hydration render the same markup; hydrate() loads localStorage after mount
  // (GlobalHeader/cart/checkout call it in onMounted; every mutation calls it
  // first so a pre-mount add can never overwrite the saved cart).
  state: () => ({ legs: [] as CartLeg[], hydrated: false, adding: false, error: '' as string }),
  getters: {
    count: (s) => s.legs.length,
    totalMinor: (s) => s.legs.reduce((n, l) => n + (l.totalMinor || 0), 0),
    ids: (s) => s.legs.map((l) => l.quoteId),
  },
  actions: {
    hydrate() {
      if (this.hydrated || typeof window === 'undefined') return
      this.hydrated = true
      const saved = load()
      if (saved.length) this.legs = [...saved, ...this.legs.filter((l) => !saved.some((s) => s.quoteId === l.quoteId))]
    },
    persist() {
      try { localStorage.setItem(KEY, JSON.stringify(this.legs)) } catch {}
    },
    remove(quoteId: string) {
      this.hydrate()
      this.legs = this.legs.filter((l) => l.quoteId !== quoteId)
      this.persist()
    },
    clear() {
      this.hydrate()
      this.legs = []
      this.persist()
    },
    async add(input: LegQuoteInput): Promise<boolean> {
      this.hydrate()
      this.error = ''
      if (this.legs.length >= 8) { this.error = 'MAX_CART_LEGS'; return false }
      this.adding = true
      try {
        const r = await apiFetch('/quotes', { method: 'POST', body: buildLegQuoteBody(input) as any })
        if (!r.ok) { this.error = (r.data as any)?.error || 'CART_ADD_FAILED'; return false }
        const q = (r.data as any).quote
        this.legs = [...this.legs.filter((l) => l.quoteId !== q.quoteId), {
          quoteId: q.quoteId, domain: input.domain, title: input.title,
          totalMinor: q.totalMinor, serviceStart: q.serviceStart, serviceEnd: q.serviceEnd,
          adults: input.adults, children: input.children || 0, infants: input.infants || 0,
        }]
        this.persist()
        return true
      } finally {
        this.adding = false
      }
    },
  },
})
