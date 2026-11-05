/** Product categories shared by the header, mobile drawer, home quick links and search tabs. */
export interface NavCategory {
  key: string
  label: string
  to: string
  icon: string
  /** Shown in the top bar; the rest go under "더보기". */
  primary: boolean
}

export const CATEGORIES: NavCategory[] = [
  { key: 'hotels', label: '호텔', to: '/hotels', icon: 'hotel', primary: true },
  { key: 'flights', label: '항공권', to: '/flights', icon: 'flight', primary: true },
  { key: 'packages', label: '항공+호텔', to: '/packages', icon: 'package', primary: true },
  { key: 'things-to-do', label: '투어·티켓', to: '/things-to-do', icon: 'ticket', primary: true },
  { key: 'trains', label: '기차', to: '/trains', icon: 'train', primary: true },
  { key: 'cars', label: '렌터카', to: '/cars', icon: 'car', primary: true },
  { key: 'transfers', label: '공항 이동', to: '/transfers', icon: 'transfer', primary: false },
  { key: 'esim', label: 'eSIM', to: '/esim', icon: 'esim', primary: false },
  { key: 'insurance', label: '여행자보험', to: '/insurance', icon: 'shield', primary: false }
]

export const DISCOVER_LINKS = [
  { label: '특가·쿠폰', to: '/deals', icon: 'gift' },
  { label: 'getfortrip Best', to: '/trip-best', icon: 'trophy' },
  { label: '여행 모먼트', to: '/moments', icon: 'camera' }
]

export const SUPPORT_LINKS = [
  { label: '고객센터', to: '/help', icon: 'support' },
  { label: '자주 묻는 질문', to: '/faq', icon: 'support' },
  { label: '취소·환불 규정', to: '/refund-policy', icon: 'refund' }
]

export const CURRENCIES = ['KRW', 'USD', 'JPY', 'EUR', 'CNY', 'GBP'] as const

export const LOCALES = [
  { id: 'ko-kr', label: '한국어' },
  { id: 'en-us', label: 'English' },
  { id: 'ja-jp', label: '日本語' },
  { id: 'zh-cn', label: '中文' }
] as const
