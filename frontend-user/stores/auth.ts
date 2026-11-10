// frontend-user/stores/auth.ts
import { defineStore } from 'pinia'
import { setMemoryToken, useApiUrl } from '~/composables/useApi'

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

const fromMe = (data: any): UserProfile => ({
  id: data.id,
  email: data.email,
  fullName: data.fullName || data.full_name,
  phoneNumber: data.phoneNumber || data.phone_number,
  phone: data.phoneNumber || data.phone_number,
  role: data.role || 'USER',
  tier: data.tier || 'SILVER',
  tripCoins: Number(data.tripCoins ?? data.trip_coins ?? 0),
  avatarUrl: data.avatarUrl || data.avatar_url
})

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
    // #35: session restore flows through the server's HttpOnly cookie jar —
    // no Authorization header is sent here. A cached profile paints first;
    // login state flips on only after the server confirms the cookie.
    async initAuth() {
      if (import.meta.server) return
      try {
        try { localStorage.removeItem('getfortrip_token') } catch {}
        const storedUser = localStorage.getItem('getfortrip_user')
        if (storedUser) {
          try {
            const parsed = JSON.parse(storedUser) || {}
            if (parsed.email) this.user = { ...parsed, tripCoins: Number(parsed.tripCoins ?? 0) || 0 }
          } catch {}
        }
        const res = await fetch(useApiUrl('/auth/me'), { credentials: 'include' })
        if (res.ok) {
          const data = await res.json()
          if (data && data.email) {
            this.user = fromMe(data)
            this.isLoggedIn = true
            try { localStorage.setItem('getfortrip_user', JSON.stringify(this.user)) } catch {}
            return
          }
        }
        this.clearLocal()
      } catch (e) {
        console.warn('Failed to restore auth session', e)
        this.clearLocal()
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
      setMemoryToken(token) // #35: memory only — never localStorage.
      if (import.meta.client) {
        try {
          localStorage.setItem('getfortrip_user', JSON.stringify(this.user))
          localStorage.removeItem('getfortrip_token')
        } catch (e) {}
      }
    },
    // Local state clears first (sync callers stay correct); the server call
    // then revokes the JWT and clears the HttpOnly jar via the cookie.
    async logout() {
      this.clearLocal()
      if (import.meta.client) {
        try {
          await fetch(useApiUrl('/auth/logout'), {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' }
          })
        } catch {}
      }
    },
    clearLocal() {
      this.user = null
      this.isLoggedIn = false
      this.token = ''
      setMemoryToken('')
      if (import.meta.client) {
        try {
          localStorage.removeItem('getfortrip_user')
          localStorage.removeItem('getfortrip_token')
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
