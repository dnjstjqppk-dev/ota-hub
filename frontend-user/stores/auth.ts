import { defineStore } from 'pinia'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: {
      id: 'a0000000-0000-0000-0000-000000000001',
      email: 'vip@getfortrip.com',
      fullName: '김여행',
      tier: 'DIAMOND',
      tripCoins: 28500, // getfortrip Coins (G-Coins)
      avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200'
    },
    isLoggedIn: true
  }),
  getters: {
    gCoins: (state) => state.user.tripCoins
  },
  actions: {
    deductCoins(amount: number) {
      if (this.user.tripCoins >= amount) {
        this.user.tripCoins -= amount
      }
    },
    addCoins(amount: number) {
      this.user.tripCoins += amount
    }
  }
})
