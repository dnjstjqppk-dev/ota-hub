// frontend-user/stores/wishlist.ts
import { defineStore } from 'pinia'
import { useAuthStore } from './auth'
import { useApiUrl } from '~/composables/useApi'

export interface WishlistItem {
  id: string
  domainType: 'HOTEL' | 'FLIGHT' | 'TRAIN' | 'CAR' | 'TRANSFER' | 'ACTIVITY' | 'PACKAGE'
  itemId: string
  title: string
  subtitle?: string
  priceKrw: number
  thumbnailUrl?: string
  targetUrl: string
  createdAt: string
}

const DETAIL_BASE: Record<string, string> = {
  HOTEL: 'hotels',
  FLIGHT: 'flights',
  TRAIN: 'trains',
  CAR: 'cars',
  TRANSFER: 'transfers',
  ACTIVITY: 'things-to-do',
  PACKAGE: 'packages'
}

export function detailUrl(domainType: string, itemId: string): string {
  return `/${DETAIL_BASE[domainType] || 'hotels'}/detail/${itemId}`
}

export const useWishlistStore = defineStore('wishlist', {
  state: () => ({
    items: [] as WishlistItem[]
  }),
  getters: {
    count: (state) => state.items.length,
    isSaved: (state) => (itemId: string) => state.items.some((i) => i.itemId === itemId)
  },
  actions: {
    async initWishlist() {
      if (typeof window === 'undefined') return
      try {
        const raw = localStorage.getItem('getfortrip_wishlist')
        if (raw) this.items = JSON.parse(raw)
      } catch (e) {}

      const authStore = useAuthStore()
      if (authStore.isLoggedIn && authStore.token) {
        try {
          const res = await fetch(useApiUrl('/wishlist'), {
            headers: { Authorization: `Bearer ${authStore.token}` }
          })
          if (res.ok) {
            const json = await res.json()
            // Merge: server wins, but items saved while logged out are kept.
            const serverItems = (Array.isArray(json.wishlist) ? json.wishlist : []).map((w: any) => ({
              id: w.id,
              domainType: w.domain_type || 'HOTEL',
              itemId: w.item_id,
              title: w.item_title,
              priceKrw: w.price_krw || 0,
              thumbnailUrl: w.thumbnail_url || '',
              targetUrl: detailUrl(w.domain_type || 'HOTEL', w.item_id),
              createdAt: w.created_at
            }))
            const seen = new Set(serverItems.map((i: WishlistItem) => i.itemId))
            this.items = [...this.items.filter((i) => !seen.has(i.itemId)), ...serverItems]
            localStorage.setItem('getfortrip_wishlist', JSON.stringify(this.items))
          }
        } catch (e) {}
      }
    },
    async toggleWishlist(item: Omit<WishlistItem, 'id' | 'createdAt'>) {
      const authStore = useAuthStore()
      const existingIdx = this.items.findIndex((i) => i.itemId === item.itemId)
      if (existingIdx >= 0) {
        const removed = this.items.splice(existingIdx, 1)[0]
        if (typeof window !== 'undefined') {
          localStorage.setItem('getfortrip_wishlist', JSON.stringify(this.items))
        }
        if (authStore.isLoggedIn && authStore.token) {
          fetch(useApiUrl(`/wishlist/${removed.itemId}`), {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${authStore.token}` }
          }).catch(() => {})
        }
        return false
      } else {
        const newItem: WishlistItem = {
          ...item,
          id: 'wsh_' + Date.now(),
          createdAt: new Date().toISOString()
        }
        this.items.unshift(newItem)
        if (typeof window !== 'undefined') {
          localStorage.setItem('getfortrip_wishlist', JSON.stringify(this.items))
        }
        if (authStore.isLoggedIn && authStore.token) {
          fetch(useApiUrl('/wishlist'), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${authStore.token}`
            },
            body: JSON.stringify({
              domainType: item.domainType,
              itemId: item.itemId,
              itemTitle: item.title,
              metadata: item
            })
          }).catch(() => {})
        }
        return true
      }
    },
  }
})
