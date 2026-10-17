import { defineStore } from 'pinia'

export interface UserProfile {
  id: string
  email: string
  fullName: string
  tier: string
  tripCoins: number
  avatarUrl?: string
}

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null as UserProfile | null,
    isLoggedIn: false
  }),
  getters: {
    gCoins: (state) => state.user?.tripCoins || 0
  },
  actions: {
    loginAsDemo() {
      this.user = {
        id: 'a0000000-0000-0000-0000-000000000001',
        email: 'vip@getfortrip.com',
        fullName: '김여행',
        tier: 'DIAMOND',
        tripCoins: 28500,
        avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200'
      }
      this.isLoggedIn = true
    },
    login(userObj: UserProfile) {
      this.user = userObj
      this.isLoggedIn = true
    },
    logout() {
      this.user = null
      this.isLoggedIn = false
    },
    deductCoins(amount: number) {
      if (this.user && this.user.tripCoins >= amount) {
        this.user.tripCoins -= amount
      }
    },
    addCoins(amount: number) {
      if (this.user) {
        this.user.tripCoins += amount
      }
    }
  }
})
