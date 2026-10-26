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

export interface PriceAlertItem {
  id: string
  email: string
  routeOrHotel: string
  targetPrice: number
  currentPriceKrw: number
  currency: string
  isActive: boolean
  createdAt: string
}

export const useWishlistStore = defineStore('wishlist', {
  state: () => ({
    items: [] as WishlistItem[],
    alerts: [] as PriceAlertItem[]
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
        const rawAlerts = localStorage.getItem('getfortrip_price_alerts')
        if (rawAlerts) this.alerts = JSON.parse(rawAlerts)
      } catch (e) {}

      const authStore = useAuthStore()
      if (authStore.isLoggedIn && authStore.token) {
        try {
          const res = await fetch(useApiUrl('/wishlist'), {
            headers: { Authorization: `Bearer ${authStore.token}` }
          })
          if (res.ok) {
            const json = await res.json()
            if (Array.isArray(json.wishlist) && json.wishlist.length > 0) {
              this.items = json.wishlist.map((w: any) => ({
                id: w.id,
                domainType: w.domain_type || 'HOTEL',
                itemId: w.item_id,
                title: w.item_title,
                priceKrw: w.price_krw || 0,
                thumbnailUrl: w.thumbnail_url || '',
                targetUrl: `/${(w.domain_type || 'hotel').toLowerCase()}s/detail/${w.item_id}`,
                createdAt: w.created_at
              }))
            }
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
    async addPriceAlert(payload: { email: string; routeOrHotel: string; targetPrice: number; currentPriceKrw?: number; currency?: string }) {
      const authStore = useAuthStore()
      const alertItem: PriceAlertItem = {
        id: 'pal_' + Date.now(),
        email: payload.email,
        routeOrHotel: payload.routeOrHotel,
        targetPrice: payload.targetPrice,
        currentPriceKrw: payload.currentPriceKrw || payload.targetPrice,
        currency: payload.currency || 'KRW',
        isActive: true,
        createdAt: new Date().toISOString()
      }
      this.alerts.unshift(alertItem)
      if (typeof window !== 'undefined') {
        localStorage.setItem('getfortrip_price_alerts', JSON.stringify(this.alerts))
      }
      if (authStore.token) {
        await fetch(useApiUrl('/price-alerts'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authStore.token}`
          },
          body: JSON.stringify(payload)
        }).catch(() => {})
      }
      return alertItem
    },
    removePriceAlert(id: string) {
      this.alerts = this.alerts.filter((a) => a.id !== id)
      if (typeof window !== 'undefined') {
        localStorage.setItem('getfortrip_price_alerts', JSON.stringify(this.alerts))
      }
    }
  }
})
