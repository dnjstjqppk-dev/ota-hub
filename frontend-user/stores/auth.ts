// frontend-user/stores/auth.ts
import { defineStore } from 'pinia'
import { useApiUrl } from '~/composables/useApi'

export interface UserProfile {
  id: string
  email: string
  fullName: string
  phoneNumber?: string
  phone?: string
  role?: string
  tier: string
  tripCoins: number
  avatarUrl?: string
}

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null as UserProfile | null,
    isLoggedIn: false,
    token: '' as string
  }),
  getters: {
    gCoins: (state) => state.user?.tripCoins || 0
  },
  actions: {
    async initAuth() {
      if (import.meta.server) return
      try {
        const storedUser = localStorage.getItem('getfortrip_user')
        const storedToken = localStorage.getItem('getfortrip_token')
        if (storedToken === 'demo_jwt_token_sample_2026') {
          this.logout()
          return
        }
        if (storedUser && storedToken) {
          const parsed = JSON.parse(storedUser) || {}
          this.user = { ...parsed, tripCoins: Number(parsed.tripCoins ?? 0) || 0 }
          this.token = storedToken
          this.isLoggedIn = true
          // Verify and synchronize live profile/coins with server
          {
            const res = await fetch(useApiUrl('/auth/me'), {
              headers: { Authorization: `Bearer ${storedToken}` }
            })
            if (res.ok) {
              const data = await res.json()
              if (data && data.email) {
                this.user = {
                  id: data.id,
                  email: data.email,
                  fullName: data.fullName || data.full_name,
                  phoneNumber: data.phoneNumber || data.phone_number,
                  phone: data.phoneNumber || data.phone_number,
                  role: data.role || 'USER',
                  tier: data.tier || 'SILVER',
                  tripCoins: Number(data.tripCoins ?? data.trip_coins ?? 0),
                  avatarUrl: data.avatarUrl || data.avatar_url
                }
                localStorage.setItem('getfortrip_user', JSON.stringify(this.user))
              }
            } else if (res.status === 401) {
              this.logout()
            }
          }
        }
      } catch (e) {
        console.warn('Failed to restore auth from localStorage', e)
      }
    },
    login(userObj: UserProfile, token: string = '') {
      this.user = {
        ...userObj,
        phone: userObj.phone || userObj.phoneNumber || '',
        tripCoins: Number(userObj.tripCoins ?? 0) || 0
      }
      this.isLoggedIn = true
      this.token = token
      if (import.meta.client) {
        try {
          localStorage.setItem('getfortrip_user', JSON.stringify(this.user))
          if (token) localStorage.setItem('getfortrip_token', token)
        } catch (e) {}
      }
    },
    logout() {
      this.user = null
      this.isLoggedIn = false
      this.token = ''
      if (import.meta.client) {
        try {
          localStorage.removeItem('getfortrip_user')
          localStorage.removeItem('getfortrip_token')
          document.cookie = 'getfortrip_jwt=; Path=/; Max-Age=0;'
        } catch (e) {}
      }
    },
    deductCoins(amount: number) {
      if (this.user && amount > 0 && this.user.tripCoins >= amount) {
        this.user.tripCoins -= amount
        if (import.meta.client) {
          localStorage.setItem('getfortrip_user', JSON.stringify(this.user))
        }
      }
    },
    addCoins(amount: number) {
      if (this.user && amount > 0) {
        this.user.tripCoins += amount
        if (import.meta.client) {
          localStorage.setItem('getfortrip_user', JSON.stringify(this.user))
        }
      }
    }
  }
})
