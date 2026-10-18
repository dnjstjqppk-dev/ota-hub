import { defineStore } from 'pinia'

export interface UserProfile {
  id: string
  email: string
  fullName: string
  phoneNumber?: string
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
    initAuth() {
      if (import.meta.server) return
      try {
        const storedUser = localStorage.getItem('getfortrip_user')
        const storedToken = localStorage.getItem('getfortrip_token')
        if (storedUser && storedToken) {
          this.user = JSON.parse(storedUser)
          this.token = storedToken
          this.isLoggedIn = true
        }
      } catch (e) {
        console.warn('Failed to restore auth from localStorage', e)
      }
    },
    loginAsDemo() {
      const demoUser: UserProfile = {
        id: 'usr-admin-001',
        email: 'vip@getfortrip.com',
        fullName: '김여행 (VIP)',
        tier: 'DIAMOND',
        tripCoins: 28500,
        avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200'
      }
      this.login(demoUser, 'demo_jwt_token_sample_2026')
    },
    login(userObj: UserProfile, token: string = '') {
      this.user = userObj
      this.isLoggedIn = true
      this.token = token
      if (import.meta.client) {
        try {
          localStorage.setItem('getfortrip_user', JSON.stringify(userObj))
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
      if (this.user && this.user.tripCoins >= amount) {
        this.user.tripCoins -= amount
        if (import.meta.client) {
          localStorage.setItem('getfortrip_user', JSON.stringify(this.user))
        }
      }
    },
    addCoins(amount: number) {
      if (this.user) {
        this.user.tripCoins += amount
        if (import.meta.client) {
          localStorage.setItem('getfortrip_user', JSON.stringify(this.user))
        }
      }
    }
  }
})
