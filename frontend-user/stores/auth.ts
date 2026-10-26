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
        if (storedUser && storedToken) {
          this.user = JSON.parse(storedUser)
          this.token = storedToken
          this.isLoggedIn = true
          // Verify and synchronize live profile/coins with server
          if (storedToken !== 'demo_jwt_token_sample_2026') {
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
    loginAsDemo() {
      const demoUser: UserProfile = {
        id: 'usr-demo-vip',
        email: 'vip@getfortrip.com',
        fullName: '김여행 (VIP 체험)',
        phoneNumber: '010-1234-5678',
        phone: '010-1234-5678',
        tier: 'DIAMOND',
        tripCoins: 28500,
        avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200'
      }
      this.login(demoUser, 'demo_jwt_token_sample_2026')
    },
    login(userObj: UserProfile, token: string = '') {
      this.user = {
        ...userObj,
        phone: userObj.phone || userObj.phoneNumber || ''
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
