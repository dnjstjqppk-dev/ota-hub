// frontend-user/stores/locale.ts
import { defineStore } from 'pinia'

export type SupportedLocale = 'ko-kr' | 'en-us' | 'ja-jp' | 'zh-cn'

const DICTIONARY: Record<SupportedLocale, Record<string, string>> = {
  'ko-kr': {
    hotels: '호텔',
    flights: '항공권',
    trains: '기차표',
    cars: '렌터카',
    transfers: '공항픽업',
    activities: '투어·티켓',
    packages: '항공+호텔',
    esim: 'eSIM',
    insurance: '여행자보험',
    best: 'Best',
    moments: '모먼트',
    deals: '프로모션',
    partnerCenter: '파트너 센터',
    myBookings: '내 예약',
    wishlist: '위시리스트',
    login: '로그인'
  },
  'en-us': {
    hotels: 'Hotels',
    flights: 'Flights',
    trains: 'Trains',
    cars: 'Cars',
    transfers: 'Transfers',
    activities: 'Attractions',
    packages: 'Flight+Hotel',
    esim: 'eSIM',
    insurance: 'Insurance',
    best: 'Best',
    moments: 'Moments',
    deals: 'Deals',
    partnerCenter: 'Partner Hub',
    myBookings: 'My Trips',
    wishlist: 'Wishlist',
    login: 'Sign In'
  },
  'ja-jp': {
    hotels: 'ホテル',
    flights: '航空券',
    trains: '鉄道・新幹線',
    cars: 'レンタカー',
    transfers: '空港送迎',
    activities: 'ツアー・チケット',
    packages: '航空券+ホテル',
    esim: 'eSIM',
    insurance: '旅行保険',
    best: 'Best',
    moments: 'モーメント',
    deals: 'セール',
    partnerCenter: 'パートナー',
    myBookings: '予約管理',
    wishlist: 'お気に入り',
    login: 'ログイン'
  },
  'zh-cn': {
    hotels: '酒店',
    flights: '机票',
    trains: '火车票',
    cars: '租车',
    transfers: '接送机',
    activities: '门票·玩乐',
    packages: '机+酒套餐',
    esim: 'eSIM',
    insurance: '旅游保险',
    best: '榜单',
    moments: '旅拍',
    deals: '特惠',
    partnerCenter: '商家中心',
    myBookings: '我的订单',
    wishlist: '心愿单',
    login: '登录'
  }
}

export const useLocaleStore = defineStore('locale', {
  state: () => ({
    activeLocale: 'ko-kr' as SupportedLocale
  }),
  actions: {
    initLocale() {
      if (typeof window === 'undefined') return
      const saved = localStorage.getItem('getfortrip_locale') as SupportedLocale | null
      if (saved && DICTIONARY[saved]) {
        this.activeLocale = saved
      }
    },
    setLocale(loc: SupportedLocale) {
      if (!DICTIONARY[loc]) return
      this.activeLocale = loc
      if (typeof window !== 'undefined') {
        localStorage.setItem('getfortrip_locale', loc)
        document.cookie = `getfortrip_locale=${loc}; Path=/; Max-Age=31536000; SameSite=Lax`
      }
    },
    t(key: string): string {
      return DICTIONARY[this.activeLocale]?.[key] || DICTIONARY['ko-kr'][key] || key
    }
  }
})
