/**
 * getfortrip - Master Verified Hotel Catalog
 * Single Source of Truth for Hotel Inventory & Real-Time Search
 */

export interface RoomOption {
  id: string
  name: string
  name_ko: string
  bed_type: string
  max_occupancy: number
  room_size_sqm: number
  base_price_krw: number
  breakfast_included: boolean
  free_cancellation: boolean
  available_inventory: number
}

export interface HotelProperty {
  id: string
  name: string
  name_ko: string
  name_en: string
  city: string
  country: string
  address: string
  star_rating: number
  review_score: number | null
  review_count: number
  neighborhood: string
  subway_nearby: string
  property_type: 'HOTEL' | 'RESORT' | 'RYOKAN' | 'VILLA'
  free_cancellation: boolean
  free_breakfast: boolean
  thumbnail_url: string | null
  images: string[]
  amenities: string[]
  rooms: RoomOption[]
  reviews: Array<{
    id: string
    author: string
    rating: number
    date: string
    comment: string
  }>
}

export const MASTER_HOTEL_CATALOG: HotelProperty[] = [
  // ==========================================
  // 서울 (Seoul)
  // ==========================================
  {
    id: 'htl_seoul_01',
    name: '시그니엘 서울 롯데월드타워',
    name_ko: '시그니엘 서울 롯데월드타워',
    name_en: 'Signiel Seoul Lotte World Tower',
    city: '서울',
    country: '대한민국',
    address: '서울특별시 송파구 올림픽로 300 롯데월드타워 76-101층',
    star_rating: 5,
    review_score: null,
    review_count: 0,
    neighborhood: '잠실 롯데월드몰 / 석촌호수',
    subway_nearby: '지하철 2·8호선 잠실역 지하 직결',
    property_type: 'HOTEL',
    free_cancellation: true,
    free_breakfast: true,
    thumbnail_url: null,
    images: [],
    amenities: [],
    rooms: [
      {
        id: 'rm_seoul_01_dlx',
        name: '그랜드 디럭스 더블룸 (시티뷰)',
        name_ko: '그랜드 디럭스 더블룸 (시티뷰)',
        bed_type: '슈퍼킹베드 1개',
        max_occupancy: 2,
        room_size_sqm: 48,
        base_price_krw: 550000,
        breakfast_included: true,
        free_cancellation: true,
        available_inventory: 5
      },
      {
        id: 'rm_seoul_01_ste',
        name: '프리미어 리버뷰 스위트',
        name_ko: '프리미어 리버뷰 스위트',
        bed_type: '로열 킹베드 1개',
        max_occupancy: 3,
        room_size_sqm: 85,
        base_price_krw: 890000,
        breakfast_included: true,
        free_cancellation: true,
        available_inventory: 2
      }
    ],
    reviews: []
  },
  {
    id: 'htl_seoul_02',
    name: '서울 신라호텔',
    name_ko: '서울 신라호텔',
    name_en: 'The Shilla Seoul',
    city: '서울',
    country: '대한민국',
    address: '서울특별시 중구 동호로 249',
    star_rating: 5,
    review_score: null,
    review_count: 0,
    neighborhood: '남산 장충단공원',
    subway_nearby: '지하철 3호선 동대입구역 도보 5분',
    property_type: 'HOTEL',
    free_cancellation: true,
    free_breakfast: true,
    thumbnail_url: null,
    images: [],
    amenities: [],
    rooms: [
      {
        id: 'rm_seoul_02_dlx',
        name: '디럭스 킹 룸 (남산뷰)',
        name_ko: '디럭스 킹 룸 (남산뷰)',
        bed_type: '킹베드 1개',
        max_occupancy: 2,
        room_size_sqm: 43,
        base_price_krw: 460000,
        breakfast_included: true,
        free_cancellation: true,
        available_inventory: 4
      }
    ],
    reviews: []
  },
  {
    id: 'htl_seoul_03',
    name: '파크 하얏트 서울',
    name_ko: '파크 하얏트 서울',
    name_en: 'Park Hyatt Seoul',
    city: '서울',
    country: '대한민국',
    address: '서울특별시 강남구 테헤란로 606',
    star_rating: 5,
    review_score: null,
    review_count: 0,
    neighborhood: '강남 삼성동 코엑스 맞은편',
    subway_nearby: '지하철 2호선 삼성역 1번 출구 도보 1분',
    property_type: 'HOTEL',
    free_cancellation: true,
    free_breakfast: false,
    thumbnail_url: null,
    images: [],
    amenities: [],
    rooms: [
      {
        id: 'rm_seoul_03_std',
        name: '파크 킹 룸 (코엑스 시티뷰)',
        name_ko: '파크 킹 룸 (코엑스 시티뷰)',
        bed_type: '킹베드 1개',
        max_occupancy: 2,
        room_size_sqm: 42,
        base_price_krw: 490000,
        breakfast_included: false,
        free_cancellation: true,
        available_inventory: 6
      }
    ],
    reviews: []
  },

  // ==========================================
  // 도쿄 (Tokyo)
  // ==========================================
  {
    id: 'htl_tokyo_01',
    name: '그랜드 하얏트 도쿄 롯폰기 힐스',
    name_ko: '그랜드 하얏트 도쿄 롯폰기 힐스',
    name_en: 'Grand Hyatt Tokyo Roppongi Hills',
    city: '도쿄',
    country: '일본',
    address: '도쿄도 미나토구 롯폰기 6-10-3',
    star_rating: 5,
    review_score: null,
    review_count: 0,
    neighborhood: '롯폰기 힐스 쇼핑가 / 모리 타워',
    subway_nearby: '지하철 히비야선 롯폰기역 도보 3분',
    property_type: 'HOTEL',
    free_cancellation: true,
    free_breakfast: true,
    thumbnail_url: null,
    images: [],
    amenities: [],
    rooms: [
      {
        id: 'rm_tokyo_01_dlx',
        name: '디럭스 킹 룸 (시티뷰)',
        name_ko: '디럭스 킹 룸 (시티뷰)',
        bed_type: '킹베드 1개',
        max_occupancy: 2,
        room_size_sqm: 42,
        base_price_krw: 385000,
        breakfast_included: true,
        free_cancellation: true,
        available_inventory: 7
      },
      {
        id: 'rm_tokyo_01_ste',
        name: '그랜드 이그제큐티브 스위트',
        name_ko: '그랜드 이그제큐티브 스위트',
        bed_type: '킹베드 1개 + 거실',
        max_occupancy: 3,
        room_size_sqm: 78,
        base_price_krw: 680000,
        breakfast_included: true,
        free_cancellation: true,
        available_inventory: 3
      }
    ],
    reviews: []
  },
  {
    id: 'htl_tokyo_02',
    name: '파크 하얏트 도쿄 신주쿠',
    name_ko: '파크 하얏트 도쿄 신주쿠',
    name_en: 'Park Hyatt Tokyo Shinjuku',
    city: '도쿄',
    country: '일본',
    address: '도쿄도 신주쿠구 니시신주쿠 3-7-1-2',
    star_rating: 5,
    review_score: null,
    review_count: 0,
    neighborhood: '신주쿠 스카이스크래퍼 지구',
    subway_nearby: 'JR 신주쿠역 도보 10분 (무료 셔틀 운행)',
    property_type: 'HOTEL',
    free_cancellation: true,
    free_breakfast: true,
    thumbnail_url: null,
    images: [],
    amenities: [],
    rooms: [
      {
        id: 'rm_tokyo_02_std',
        name: '파크 디럭스 룸 (후지산 전망)',
        name_ko: '파크 디럭스 룸 (후지산 전망)',
        bed_type: '킹베드 1개',
        max_occupancy: 2,
        room_size_sqm: 55,
        base_price_krw: 450000,
        breakfast_included: true,
        free_cancellation: true,
        available_inventory: 4
      }
    ],
    reviews: []
  },
  {
    id: 'htl_tokyo_03',
    name: '게이오 플라자 호텔 도쿄 신주쿠',
    name_ko: '게이오 플라자 호텔 도쿄 신주쿠',
    name_en: 'Keio Plaza Hotel Tokyo Shinjuku',
    city: '도쿄',
    country: '일본',
    address: '도쿄도 신주쿠구 니시신주쿠 2-2-1',
    star_rating: 4,
    review_score: null,
    review_count: 0,
    neighborhood: '신주쿠 도청 앞',
    subway_nearby: '지하철 도초마에역 바로 앞 / JR 신주쿠역 도보 5분',
    property_type: 'HOTEL',
    free_cancellation: true,
    free_breakfast: false,
    thumbnail_url: null,
    images: [],
    amenities: [],
    rooms: [
      {
        id: 'rm_tokyo_03_std',
        name: '스탠다드 더블룸 (본관)',
        name_ko: '스탠다드 더블룸 (본관)',
        bed_type: '더블베드 1개',
        max_occupancy: 2,
        room_size_sqm: 28,
        base_price_krw: 230000,
        breakfast_included: false,
        free_cancellation: true,
        available_inventory: 12
      }
    ],
    reviews: []
  },

  // ==========================================
  // 오사카 (Osaka)
  // ==========================================
  {
    id: 'htl_osaka_01',
    name: '스위소텔 난카이 오사카',
    name_ko: '스위소텔 난카이 오사카',
    name_en: 'Swissotel Nankai Osaka',
    city: '오사카',
    country: '일본',
    address: '오사카부 오사카시 주오구 난바 5-1-60',
    star_rating: 5,
    review_score: null,
    review_count: 0,
    neighborhood: '도톤보리 / 난바역 직결',
    subway_nearby: '난카이 난바역 직결 (간사이 공항 라피트 바로 탑승)',
    property_type: 'HOTEL',
    free_cancellation: true,
    free_breakfast: false,
    thumbnail_url: null,
    images: [],
    amenities: [],
    rooms: [
      {
        id: 'rm_osaka_01_sel',
        name: '스위스 셀렉트 킹룸',
        name_ko: '스위스 셀렉트 킹룸',
        bed_type: '킹베드 1개',
        max_occupancy: 2,
        room_size_sqm: 32,
        base_price_krw: 275000,
        breakfast_included: false,
        free_cancellation: true,
        available_inventory: 8
      },
      {
        id: 'rm_osaka_01_adv',
        name: '어드밴티지 이그제큐티브 룸 (라운지 포함)',
        name_ko: '어드밴티지 이그제큐티브 룸 (라운지 포함)',
        bed_type: '슈퍼킹베드 1개',
        max_occupancy: 2,
        room_size_sqm: 38,
        base_price_krw: 390000,
        breakfast_included: true,
        free_cancellation: true,
        available_inventory: 4
      }
    ],
    reviews: []
  },
  {
    id: 'htl_osaka_02',
    name: '인터컨티넨탈 호텔 오사카',
    name_ko: '인터컨티넨탈 호텔 오사카',
    name_en: 'InterContinental Hotel Osaka',
    city: '오사카',
    country: '일본',
    address: '오사카부 오사카시 기타구 오후카초 3-60 그랜드 프론트 오사카',
    star_rating: 5,
    review_score: null,
    review_count: 0,
    neighborhood: '우메다 그랜드 프론트 쇼핑몰',
    subway_nearby: 'JR 오사카역 직결 도보 5분',
    property_type: 'HOTEL',
    free_cancellation: true,
    free_breakfast: true,
    thumbnail_url: null,
    images: [],
    amenities: [],
    rooms: [
      {
        id: 'rm_osaka_02_std',
        name: '클래식 킹룸 (우메다 시티뷰)',
        name_ko: '클래식 킹룸 (우메다 시티뷰)',
        bed_type: '킹베드 1개',
        max_occupancy: 2,
        room_size_sqm: 49,
        base_price_krw: 380000,
        breakfast_included: true,
        free_cancellation: true,
        available_inventory: 5
      }
    ],
    reviews: []
  },

  // ==========================================
  // 방콕 (Bangkok)
  // ==========================================
  {
    id: 'htl_bangkok_01',
    name: '샹그릴라 방콕 차오프라야',
    name_ko: '샹그릴라 방콕 차오프라야',
    name_en: 'Shangri-La Bangkok Chao Phraya',
    city: '방콕',
    country: '태국',
    address: '89 Soi Wat Suan Plu, Bangrak, Bangkok 10500',
    star_rating: 5,
    review_score: null,
    review_count: 0,
    neighborhood: '차오프라야 강변 / 사톤',
    subway_nearby: 'BTS 사판탁신역 도보 1분 (아이콘시암 셔틀 보트 직결)',
    property_type: 'RESORT',
    free_cancellation: true,
    free_breakfast: true,
    thumbnail_url: null,
    images: [],
    amenities: [],
    rooms: [
      {
        id: 'rm_bkk_01_dlx',
        name: '디럭스 리버뷰 킹룸',
        name_ko: '디럭스 리버뷰 킹룸',
        bed_type: '킹베드 1개',
        max_occupancy: 2,
        room_size_sqm: 40,
        base_price_krw: 210000,
        breakfast_included: true,
        free_cancellation: true,
        available_inventory: 9
      },
      {
        id: 'rm_bkk_01_ste',
        name: '크룽텝 윙 프라이빗 발코니 스위트',
        name_ko: '크룽텝 윙 프라이빗 발코니 스위트',
        bed_type: '슈퍼킹베드 1개',
        max_occupancy: 3,
        room_size_sqm: 76,
        base_price_krw: 395000,
        breakfast_included: true,
        free_cancellation: true,
        available_inventory: 3
      }
    ],
    reviews: []
  },
  {
    id: 'htl_bangkok_02',
    name: '더 수코타이 방콕',
    name_ko: '더 수코타이 방콕',
    name_en: 'The Sukhothai Bangkok',
    city: '방콕',
    country: '태국',
    address: '13/3 South Sathorn Road, Bangkok 10120',
    star_rating: 5,
    review_score: null,
    review_count: 0,
    neighborhood: '사톤 룸피니 공원',
    subway_nearby: 'MRT 룸피니역 도보 8분',
    property_type: 'HOTEL',
    free_cancellation: true,
    free_breakfast: true,
    thumbnail_url: null,
    images: [],
    amenities: [],
    rooms: [
      {
        id: 'rm_bkk_02_std',
        name: '슈페리어 더블룸 (연못 가든 뷰)',
        name_ko: '슈페리어 더블룸 (연못 가든 뷰)',
        bed_type: '킹베드 1개',
        max_occupancy: 2,
        room_size_sqm: 38,
        base_price_krw: 195000,
        breakfast_included: true,
        free_cancellation: true,
        available_inventory: 6
      }
    ],
    reviews: []
  },

  // ==========================================
  // 후쿠오카 (Fukuoka)
  // ==========================================
  {
    id: 'htl_fukuoka_01',
    name: '그랜드 하얏트 후쿠오카 캐널시티',
    name_ko: '그랜드 하얏트 후쿠오카 캐널시티',
    name_en: 'Grand Hyatt Fukuoka Canal City',
    city: '후쿠오카',
    country: '일본',
    address: '후쿠오카현 후쿠오카시 하카타구 스미요시 1-2-82',
    star_rating: 5,
    review_score: null,
    review_count: 0,
    neighborhood: '캐널시티 하카타 직결',
    subway_nearby: '지하철 나나쿠마선 쿠시다진자마에역 도보 2분 / 하카타역 도보 10분',
    property_type: 'HOTEL',
    free_cancellation: true,
    free_breakfast: true,
    thumbnail_url: null,
    images: [],
    amenities: [],
    rooms: [
      {
        id: 'rm_fuk_01_std',
        name: '스탠다드 킹 룸 (분수쇼 뷰)',
        name_ko: '스탠다드 킹 룸 (분수쇼 뷰)',
        bed_type: '킹베드 1개',
        max_occupancy: 2,
        room_size_sqm: 34,
        base_price_krw: 245000,
        breakfast_included: true,
        free_cancellation: true,
        available_inventory: 8
      },
      {
        id: 'rm_fuk_01_dlx',
        name: '클럽 킹 룸 (라운지 해피아워 포함)',
        name_ko: '클럽 킹 룸 (라운지 해피아워 포함)',
        bed_type: '킹베드 1개',
        max_occupancy: 2,
        room_size_sqm: 40,
        base_price_krw: 340000,
        breakfast_included: true,
        free_cancellation: true,
        available_inventory: 4
      }
    ],
    reviews: []
  },
  {
    id: 'htl_fukuoka_02',
    name: '솔라리아 니시테츠 호텔 후쿠오카 텐진',
    name_ko: '솔라리아 니시테츠 호텔 후쿠오카 텐진',
    name_en: 'Solaria Nishitetsu Hotel Fukuoka Tenjin',
    city: '후쿠오카',
    country: '일본',
    address: '후쿠오카시 주오구 텐진 2-2-43',
    star_rating: 4,
    review_score: null,
    review_count: 0,
    neighborhood: '텐진 솔라리아 플라자',
    subway_nearby: '니시테츠 후쿠오카(텐진)역 직결 / 지하철 텐진역 바로 연결',
    property_type: 'HOTEL',
    free_cancellation: true,
    free_breakfast: false,
    thumbnail_url: null,
    images: [],
    amenities: [],
    rooms: [
      {
        id: 'rm_fuk_02_std',
        name: '모던 더블룸 (텐진 파크뷰)',
        name_ko: '모던 더블룸 (텐진 파크뷰)',
        bed_type: '더블베드 1개',
        max_occupancy: 2,
        room_size_sqm: 24,
        base_price_krw: 145000,
        breakfast_included: false,
        free_cancellation: true,
        available_inventory: 11
      }
    ],
    reviews: []
  },

  // ==========================================
  // 파리 (Paris)
  // ==========================================
  {
    id: 'htl_paris_01',
    name: '풀만 파리 투르 에펠',
    name_ko: '풀만 파리 투르 에펠',
    name_en: 'Pullman Paris Tour Eiffel',
    city: '파리',
    country: '프랑스',
    address: '18 Avenue De Suffren, 75015 Paris',
    star_rating: 4,
    review_score: null,
    review_count: 0,
    neighborhood: '샹드마르스 공원 / 에펠탑',
    subway_nearby: 'RER C선 샹드마르스-투르에펠역 도보 2분 / 비르하케임역 도보 5분',
    property_type: 'HOTEL',
    free_cancellation: true,
    free_breakfast: true,
    thumbnail_url: null,
    images: [],
    amenities: [],
    rooms: [
      {
        id: 'rm_paris_01_efl',
        name: '디럭스 킹 룸 (에펠탑 전망 발코니)',
        name_ko: '디럭스 킹 룸 (에펠탑 전망 발코니)',
        bed_type: '킹베드 1개',
        max_occupancy: 2,
        room_size_sqm: 32,
        base_price_krw: 480000,
        breakfast_included: true,
        free_cancellation: true,
        available_inventory: 6
      },
      {
        id: 'rm_paris_01_ste',
        name: '주니어 스위트 (화이트 에펠 파노라마)',
        name_ko: '주니어 스위트 (화이트 에펠 파노라마)',
        bed_type: '슈퍼킹베드 1개 + 소파베드',
        max_occupancy: 3,
        room_size_sqm: 52,
        base_price_krw: 780000,
        breakfast_included: true,
        free_cancellation: true,
        available_inventory: 2
      }
    ],
    reviews: []
  },
  {
    id: 'htl_paris_02',
    name: '인터컨티넨탈 파리 르 그랑',
    name_ko: '인터컨티넨탈 파리 르 그랑',
    name_en: 'InterContinental Paris Le Grand',
    city: '파리',
    country: '프랑스',
    address: '2 Rue Scribe, 75009 Paris',
    star_rating: 5,
    review_score: null,
    review_count: 0,
    neighborhood: '오페라 가르니에 / 방돔 광장',
    subway_nearby: '지하철 오페라역 도보 1분',
    property_type: 'HOTEL',
    free_cancellation: true,
    free_breakfast: true,
    thumbnail_url: null,
    images: [],
    amenities: [],
    rooms: [
      {
        id: 'rm_paris_02_std',
        name: '클래식 룸 (오페라 하우스 뷰)',
        name_ko: '클래식 룸 (오페라 하우스 뷰)',
        bed_type: '킹베드 1개',
        max_occupancy: 2,
        room_size_sqm: 35,
        base_price_krw: 620000,
        breakfast_included: true,
        free_cancellation: true,
        available_inventory: 4
      }
    ],
    reviews: []
  }
]

/**
 * Filter and query hotels with strict destination isolation.
 * When 0 results match, returns [] - NEVER fallback to other cities.
 */
export function searchHotelCatalog(params: {
  city?: string
  star?: number
  minScore?: number
  maxPrice?: number
  freeCancel?: boolean
  breakfast?: boolean
  propertyType?: string
  sortBy?: 'recommended' | 'price_asc' | 'score_desc'
}): HotelProperty[] {
  let list = [...MASTER_HOTEL_CATALOG]

  if (params.city && params.city.trim()) {
    const q = params.city.trim().toLowerCase()
    list = list.filter(h => 
      h.city.toLowerCase().includes(q) ||
      h.name_ko.toLowerCase().includes(q) ||
      h.name_en.toLowerCase().includes(q) ||
      h.address.toLowerCase().includes(q) ||
      h.country.toLowerCase().includes(q)
    )
  }

  if (params.star && params.star > 0) {
    list = list.filter(h => h.star_rating >= params.star!)
  }

  if (params.minScore && params.minScore > 0) {
    list = list.filter(h => h.review_score >= params.minScore!)
  }

  if (params.maxPrice && params.maxPrice < 1000000) {
    list = list.filter(h => {
      const minPrice = h.rooms?.[0]?.base_price_krw || 0
      return minPrice <= params.maxPrice!
    })
  }

  if (params.freeCancel) {
    list = list.filter(h => h.free_cancellation)
  }

  if (params.breakfast) {
    list = list.filter(h => h.free_breakfast)
  }

  if (params.propertyType && params.propertyType !== 'ALL') {
    list = list.filter(h => h.property_type === params.propertyType)
  }

  if (params.sortBy === 'price_asc') {
    list.sort((a, b) => (a.rooms[0]?.base_price_krw || 0) - (b.rooms[0]?.base_price_krw || 0))
  } else if (params.sortBy === 'score_desc') {
    // Unrated properties (null) sort last — never as zero-score equals.
    list.sort((a, b) => (b.review_score ?? -1) - (a.review_score ?? -1))
  }

  return list
}

/**
 * Find hotel by ID
 */
export function getHotelById(id: string): HotelProperty | null {
  return MASTER_HOTEL_CATALOG.find(h => h.id === id) || null
}

