import { defineStore } from 'pinia'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: {
      id: 'a0000000-0000-0000-0000-000000000001',
      email: 'vip@tripclone.com',
      fullName: '김트립',
      tier: 'DIAMOND',
      tripCoins: 28500,
      avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200'
    },
    isLoggedIn: true
  }),
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

