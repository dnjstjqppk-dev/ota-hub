/**
 * getfortrip - Master Verified Activities, Tours & Attraction Tickets Catalog
 * Mobile QR vouchers, instant confirmation, guided tours, theme parks & passes
 */

export interface ActivityTicketOption {
  id: string
  name: string
  description: string
  price_krw: number
  original_price_krw: number
  age_group: 'ADULT' | 'CHILD' | 'SENIOR'
  instant_confirmation: boolean
  validity_days: number
}

export interface ActivityProperty {
  id: string
  title: string
  city: string
  country: string
  category: 'THEME_PARK' | 'TICKET' | 'DAY_TOUR' | 'DOCENT_TOUR' | 'PASS' | 'ESIM'
  category_name: string
  duration_type: 'HOURS' | 'HALF_DAY' | 'FULL_DAY' | 'MULTI_DAY'
  duration_text: string
  meeting_point?: string
  guide_language: string
  price_krw: number
  original_price_krw: number
  review_score: number
  review_count: number
  free_cancellation: boolean
  instant_confirmation: boolean
  badge: string
  image_url: string
  gallery: string[]
  highlights: string[]
  included: string[]
  excluded: string[]
  ticket_options: ActivityTicketOption[]
}

export const MASTER_ACTIVITY_CATALOG: ActivityProperty[] = [
  {
    id: 'act_disney_tokyo',
    title: '도쿄 디즈니랜드 1일 e-티켓 (모바일 QR 즉시 입장 확정)',
    city: '도쿄',
    country: '일본',
    category: 'THEME_PARK',
    category_name: '테마파크 / 놀이공원',
    duration_type: 'FULL_DAY',
    duration_text: '자유 이용',
    guide_language: '자유 일정 (한국어 안내 리플릿)',
    price_krw: 89000,
    original_price_krw: 98000,
    review_score: 4.9,
    review_count: 8740,
    free_cancellation: true,
    instant_confirmation: true,
    badge: '글로벌 베스트셀러',
    image_url: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=800',
    gallery: [
      'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=800',
      'https://images.unsplash.com/photo-1513836279014-a89f7a76ae86?w=800'
    ],
    highlights: [
      '도쿄 디즈니랜드 매표소 대기 없이 모바일 QR 바로 입장',
      '디즈니 프리미어 액세스(DPA) 연동 가능',
      '성인/아동/청소년 실시간 즉시 발권',
      '지정일 24시간 전까지 100% 무료 취소'
    ],
    included: ['도쿄 디즈니랜드 1일 자유이용권', '모바일 전자 바우처'],
    excluded: ['식음료 및 개인 경비', '유료 패스트트랙 DPA'],
    ticket_options: [
      {
        id: 'opt_disney_adult',
        name: '1일 패스포트 - 성인 (만 18세 이상)',
        description: '파크 내 모든 어트랙션 자유 이용 가능',
        price_krw: 89000,
        original_price_krw: 98000,
        age_group: 'ADULT',
        instant_confirmation: true,
        validity_days: 1
      },
      {
        id: 'opt_disney_child',
        name: '1일 패스포트 - 아동 (만 4~11세)',
        description: '만 4세~11세 어린이 전용 요금',
        price_krw: 53000,
        original_price_krw: 59000,
        age_group: 'CHILD',
        instant_confirmation: true,
        validity_days: 1
      }
    ]
  },
  {
    id: 'act_usj_osaka',
    title: '유니버설 스튜디오 재팬 1일 스튜디오 패스 (공식 파트너 QR)',
    city: '오사카',
    country: '일본',
    category: 'THEME_PARK',
    category_name: '테마파크 / 놀이공원',
    duration_type: 'FULL_DAY',
    duration_text: '종일 자유이용',
    guide_language: '자유 일정',
    price_krw: 82000,
    original_price_krw: 91000,
    review_score: 4.9,
    review_count: 11420,
    free_cancellation: true,
    instant_confirmation: true,
    badge: '인기 테마파크 1위',
    image_url: 'https://images.unsplash.com/photo-1590559899731-a372a146979d?w=800',
    gallery: [
      'https://images.unsplash.com/photo-1590559899731-a372a146979d?w=800'
    ],
    highlights: [
      '슈퍼 닌텐도 월드 & 해리포터 마법의 세계 입장',
      '공식 파트너 인증 다이렉트 QR코드 발권',
      '현장 매표소 교환 없이 개찰구 직행'
    ],
    included: ['USJ 1일 입장권', '모바일 입장 QR'],
    excluded: ['익스프레스 패스', '식음료'],
    ticket_options: [
      {
        id: 'opt_usj_adult',
        name: '스튜디오 패스 A (성인 만 12세 이상)',
        description: '지정일 입장권, 개찰구 QR 스캔 입장',
        price_krw: 82000,
        original_price_krw: 91000,
        age_group: 'ADULT',
        instant_confirmation: true,
        validity_days: 1
      }
    ]
  },
  {
    id: 'act_fuji_tour',
    title: '[한국어 가이드] 후지산 & 하코네 당일 럭셔리 버스 투어 (케이블카 포함)',
    city: '도쿄',
    country: '일본',
    category: 'DAY_TOUR',
    category_name: '당일 버스 / 밴 투어',
    duration_type: 'FULL_DAY',
    duration_text: '약 9시간 30분',
    meeting_point: '신주쿠역 서쪽출구 모드학원 코쿤타워 앞 08:00 미팅',
    guide_language: '한국어 전문 가이드',
    price_krw: 78000,
    original_price_krw: 89000,
    review_score: 4.8,
    review_count: 2430,
    free_cancellation: true,
    instant_confirmation: true,
    badge: '인기 1일 버스투어',
    image_url: 'https://images.unsplash.com/photo-1490806843957-31f4c9a91c65?w=800',
    gallery: [
      'https://images.unsplash.com/photo-1490806843957-31f4c9a91c65?w=800'
    ],
    highlights: [
      '신주쿠 출발 전용 리무진 버스로 후지산 5합목 방문',
      '하코네 로프웨이 케이블카 탑승 & 아시노코 해적유람선 조망',
      '한국인 베테랑 인솔 가이드 전 일정 동행'
    ],
    included: ['왕복 전용 버스', '한국어 가이드', '케이블카 티켓', '여행자 보험'],
    excluded: ['중식 (오시노핫카이 자유식)', '개인 경비'],
    ticket_options: [
      {
        id: 'opt_fuji_bus',
        name: '후지산 1일 투어 (1인 기준)',
        description: '만 3세 이상 전 연령 동일 요금 (좌석 배정)',
        price_krw: 78000,
        original_price_krw: 89000,
        age_group: 'ADULT',
        instant_confirmation: true,
        validity_days: 1
      }
    ]
  },
  {
    id: 'act_lotte_world',
    title: '서울 롯데월드 어드벤처 종합이용권 (종일권 + 아쿠아리움 옵션)',
    city: '서울',
    country: '대한민국',
    category: 'THEME_PARK',
    category_name: '테마파크 / 놀이공원',
    duration_type: 'FULL_DAY',
    duration_text: '종일 자유이용',
    guide_language: '자유 일정',
    price_krw: 42000,
    original_price_krw: 62000,
    review_score: 4.8,
    review_count: 5120,
    free_cancellation: true,
    instant_confirmation: true,
    badge: '잠실 랜드마크',
    image_url: 'https://images.unsplash.com/photo-1538688525198-9b88f6f53126?w=800',
    gallery: [
      'https://images.unsplash.com/photo-1538688525198-9b88f6f53126?w=800'
    ],
    highlights: [
      '국내 최대 실내외 테마파크 어드벤처 & 매직아일랜드 종일 이용',
      '모바일 바코드 즉시 입장 (당일 구매 후 바로 사용 가능)',
      '민속박물관 무료 관람 포함'
    ],
    included: ['롯데월드 종합이용권', '민속박물관 입장'],
    excluded: ['매직패스 프리미엄', '유료 체험시설'],
    ticket_options: [
      {
        id: 'opt_lotte_all',
        name: '종일 종합이용권 (성인/청소년 공통)',
        description: '구매 10분 후 바로 사용 가능한 모바일 바코드',
        price_krw: 42000,
        original_price_krw: 62000,
        age_group: 'ADULT',
        instant_confirmation: true,
        validity_days: 30
      }
    ]
  },
  {
    id: 'act_louvre_tour',
    title: '[공인 한국어 해설] 파리 루브르 박물관 모바일 패스트트랙 + 3시간 도슨트 투어',
    city: '파리',
    country: '프랑스',
    category: 'DOCENT_TOUR',
    category_name: '미술관 / 가이드 도슨트',
    duration_type: 'HOURS',
    duration_text: '약 3시간',
    meeting_point: '루브르 유리 피라미드 앞 루이 14세 기마상 앞 미팅',
    guide_language: '한국어 공인 가이드',
    price_krw: 68000,
    original_price_krw: 82000,
    review_score: 4.9,
    review_count: 1890,
    free_cancellation: true,
    instant_confirmation: true,
    badge: '파리 필수 도슨트',
    image_url: 'https://images.unsplash.com/photo-1499856871958-5b9627545d1a?w=800',
    gallery: [
      'https://images.unsplash.com/photo-1499856871958-5b9627545d1a?w=800'
    ],
    highlights: [
      '모나리자, 밀로의 비너스, 사모트라케의 니케 등 핵심 걸작 집중 해설',
      '프랑스 공인 국가 가이드의 깊이 있는 역사/예술 스토리텔링',
      '개인 무선 수신기 제공으로 편안한 관람'
    ],
    included: ['한국어 공인 도슨트 해설', '개인 무선 수신기'],
    excluded: ['루브르 박물관 입장 티켓 (뮤지엄패스 또는 공식티켓 지참 필요)'],
    ticket_options: [
      {
        id: 'opt_louvre_guided',
        name: '루브르 집중 도슨트 투어 (1인)',
        description: '소수 정예 그룹 해설 (최대 15인)',
        price_krw: 68000,
        original_price_krw: 82000,
        age_group: 'ADULT',
        instant_confirmation: true,
        validity_days: 1
      }
    ]
  },
  {
    id: 'act_esim_japan',
    title: '[초고속 5G] 일본 무제한 데이터 eSIM (도쿄/오사카/후쿠오카 당일 QR 수령)',
    city: '도쿄',
    country: '일본',
    category: 'ESIM',
    category_name: '해외 유심 / eSIM',
    duration_type: 'MULTI_DAY',
    duration_text: '5일 무제한',
    guide_language: '한국어 상세 개통 매뉴얼',
    price_krw: 6900,
    original_price_krw: 9900,
    review_score: 4.9,
    review_count: 14200,
    free_cancellation: true,
    instant_confirmation: true,
    badge: '필수 여행템 1위',
    image_url: 'https://images.unsplash.com/photo-1512499617640-c74ae3a79d37?w=800',
    gallery: [
      'https://images.unsplash.com/photo-1512499617640-c74ae3a79d37?w=800'
    ],
    highlights: [
      '유심 교체 없이 이메일/카카오톡 QR코드 스캔 즉시 개통',
      '일본 1위 통신사 NTT Docomo / SoftBank 5G 망 자동 로밍',
      '데이터 무제한 (매일 2GB 사용 후 128kbps 무제한 유지)'
    ],
    included: ['일본 데이터 eSIM QR 프로파일', '카카오톡 실시간 고객상담'],
    excluded: ['음성 통화 및 SMS'],
    ticket_options: [
      {
        id: 'opt_esim_5d',
        name: '일본 5일권 무제한 (매일 2GB 고속)',
        description: '구매 즉시 이메일로 QR코드 발송',
        price_krw: 6900,
        original_price_krw: 9900,
        age_group: 'ADULT',
        instant_confirmation: true,
        validity_days: 90
      }
    ]
  }
]

export function getActivityById(id: string): ActivityProperty | null {
  return MASTER_ACTIVITY_CATALOG.find(a => a.id === id) || null
}

export function searchActivityCatalog(params: {
  city?: string
  category?: string
  freeCancel?: boolean
  instantOnly?: boolean
  maxPrice?: number
  sortBy?: 'recommended' | 'price_asc' | 'rating_desc'
}): ActivityProperty[] {
  let list = [...MASTER_ACTIVITY_CATALOG]

  if (params.city && params.city.trim()) {
    const q = params.city.trim().toLowerCase()
    list = list.filter(a => a.city.toLowerCase().includes(q) || a.title.toLowerCase().includes(q))
  }

  if (params.category && params.category !== 'ALL') {
    list = list.filter(a => a.category === params.category)
  }

  if (params.freeCancel) {
    list = list.filter(a => a.free_cancellation)
  }

  if (params.instantOnly) {
    list = list.filter(a => a.instant_confirmation)
  }

  if (params.maxPrice && params.maxPrice < 200000) {
    list = list.filter(a => a.price_krw <= params.maxPrice!)
  }

  if (params.sortBy === 'price_asc') {
    list.sort((a, b) => a.price_krw - b.price_krw)
  } else if (params.sortBy === 'rating_desc') {
    list.sort((a, b) => b.review_score - a.review_score)
  }

  return list
}
