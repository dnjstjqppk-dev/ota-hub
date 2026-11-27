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
  { key: 'deals', label: '특가·쿠폰', to: '/deals', icon: 'gift' },
  { key: 'best', label: 'getfortrip Best', to: '/trip-best', icon: 'trophy' },
  { key: 'moments', label: '여행 모먼트', to: '/moments', icon: 'camera' }
]

export const SUPPORT_LINKS = [
  { key: 'help', label: '고객센터', to: '/help', icon: 'support' },
  { key: 'faq', label: '자주 묻는 질문', to: '/faq', icon: 'support' },
  { key: 'refundPolicy', label: '취소·환불 규정', to: '/refund-policy', icon: 'refund' }
]

export const CURRENCIES = ['KRW', 'USD', 'JPY', 'GBP', 'HKD', 'TWD', 'EUR', 'CNY'] as const

export const LOCALES = [
  { id: 'ko', sub: 'kr', locale: 'ko-kr', curr: 'KRW', label: '한국어 (KR)' },
  { id: 'ja', sub: 'jp', locale: 'ja-jp', curr: 'JPY', label: '日本語 (JP)' },
  { id: 'en', sub: 'uk', locale: 'en-gb', curr: 'GBP', label: 'English (UK)' },
  { id: 'zh', sub: 'hk', locale: 'zh-hk', curr: 'HKD', label: '繁體中文 (HK)' },
  { id: 'zh', sub: 'tw', locale: 'zh-tw', curr: 'TWD', label: '繁體中文 (TW)' },
  { id: 'en', sub: 'www', locale: 'en-us', curr: 'USD', label: 'English (Global)' }
] as const
