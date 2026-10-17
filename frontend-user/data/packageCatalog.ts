/**
 * getfortrip - Master Verified Flight+Hotel Bundle Packages Catalog
 * Air+Hotel Dynamic Packaging, Savings Calculation & Real Component Linking
 */

export interface PackageBundle {
  id: string
  title: string
  city: string
  country: string
  origin_airport: string
  duration_nights: number
  duration_days: number
  airline_name: string
  airline_code: string
  flight_offer_id: string
  return_flight_offer_id: string
  hotel_id: string
  hotel_name: string
  hotel_star: number
  room_type_id: string
  room_name: string
  original_price_krw: number
  bundle_price_krw: number
  savings_amount_krw: number
  savings_percentage: number
  badge: string
  hero_image_url: string
  gallery: string[]
  features: string[]
  flight_summary: {
    outbound: string
    inbound: string
    baggage: string
  }
  hotel_summary: {
    address: string
    breakfast: boolean
    free_cancel: boolean
  }
}

export const MASTER_PACKAGE_CATALOG: PackageBundle[] = [
  {
    id: 'pkg_tokyo_4d3n',
    title: '[항공+호텔 결합] 도쿄 롯폰기 하얏트 럭셔리 에어텔 4일 (대한항공 직항 왕복 + 5성급 3박)',
    city: '도쿄',
    country: '일본',
    origin_airport: '서울/인천 (ICN)',
    duration_nights: 3,
    duration_days: 4,
    airline_name: '대한항공 (직항 왕복)',
    airline_code: 'KE',
    flight_offer_id: 'flt_ke703',
    return_flight_offer_id: 'flt_ke704_ret',
    hotel_id: 'htl_tokyo_01',
    hotel_name: '그랜드 하얏트 도쿄 롯폰기 힐스 (5성급)',
    hotel_star: 5,
    room_type_id: 'rm_01',
    room_name: '디럭스 킹 룸 (시티뷰)',
    original_price_krw: 1400000,
    bundle_price_krw: 1150000,
    savings_amount_krw: 250000,
    savings_percentage: 18,
    badge: '베스트셀러 에어텔',
    hero_image_url: 'https://images.unsplash.com/photo-1503899036084-c55cdd92da26?w=800',
    gallery: [
      'https://images.unsplash.com/photo-1503899036084-c55cdd92da26?w=800',
      'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=800',
      'https://images.unsplash.com/photo-1571003123894-1f0594d2b5d9?w=800'
    ],
    features: [
      '대한항공 직항 왕복 (위탁수하물 23kg 포함)',
      '그랜드 하얏트 도쿄 3박 전 일정 조식 뷔페 포함',
      '롯폰기 힐스 쇼핑몰 & 전망대 직결',
      '24시간 한국인 안심 여행 케어 컨시어지'
    ],
    flight_summary: {
      outbound: '인천(ICN) 10:10 -> 도쿄(NRT) 12:35 (KE703)',
      inbound: '도쿄(NRT) 14:00 -> 인천(ICN) 16:45 (KE704)',
      baggage: '위탁수하물 1인당 23kg 무료'
    },
    hotel_summary: {
      address: '도쿄도 미나토구 롯폰기 6-10-3',
      breakfast: true,
      free_cancel: true
    }
  },
  {
    id: 'pkg_osaka_3d2n',
    title: '[인기 에어텔] 오사카 난바 스위소텔 올인원 3일 (아시아나 직항 + 5성급 2박)',
    city: '오사카',
    country: '일본',
    origin_airport: '서울/인천 (ICN)',
    duration_nights: 2,
    duration_days: 3,
    airline_name: '아시아나항공 (직항 왕복)',
    airline_code: 'OZ',
    flight_offer_id: 'flt_oz102',
    return_flight_offer_id: 'flt_oz101_ret',
    hotel_id: 'htl_osaka_01',
    hotel_name: '스위소텔 난카이 오사카 (5성급)',
    hotel_star: 5,
    room_type_id: 'rm_osaka_01',
    room_name: '어드밴티지 더블룸 (고층 시티뷰)',
    original_price_krw: 920000,
    bundle_price_krw: 750000,
    savings_amount_krw: 170000,
    savings_percentage: 19,
    badge: '난바역 직결 호텔',
    hero_image_url: 'https://images.unsplash.com/photo-1590559899731-a372a146979d?w=800',
    gallery: [
      'https://images.unsplash.com/photo-1590559899731-a372a146979d?w=800',
      'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800'
    ],
    features: [
      '아시아나항공 직항 왕복 (수하물 23kg)',
      '난카이 난바역 직결 5성급 호텔 2박',
      '간사이공항 특급 라피트 왕복 승차권 증정',
      '도톤보리 도보 3분 초역세권'
    ],
    flight_summary: {
      outbound: '인천(ICN) 09:00 -> 오사카(KIX) 10:45',
      inbound: '오사카(KIX) 17:00 -> 인천(ICN) 18:50',
      baggage: '위탁수하물 23kg 무료'
    },
    hotel_summary: {
      address: '오사카부 오사카시 주오구 난바 5-1-60',
      breakfast: true,
      free_cancel: true
    }
  },
  {
    id: 'pkg_bangkok_5d4n',
    title: '[리버사이드 힐링] 방콕 샹그릴라 호텔 5일 (대한항공 직항 왕복 + 리버뷰 4박)',
    city: '방콕',
    country: '태국',
    origin_airport: '서울/인천 (ICN)',
    duration_nights: 4,
    duration_days: 5,
    airline_name: '대한항공 (직항 왕복)',
    airline_code: 'KE',
    flight_offer_id: 'flt_ke657',
    return_flight_offer_id: 'flt_ke658_ret',
    hotel_id: 'htl_bangkok_01',
    hotel_name: '샹그릴라 방콕 차오프라야 (5성급)',
    hotel_star: 5,
    room_type_id: 'rm_bkk_01',
    room_name: '디럭스 발코니 리버뷰 룸',
    original_price_krw: 1250000,
    bundle_price_krw: 990000,
    savings_amount_krw: 260000,
    savings_percentage: 21,
    badge: '차오프라야 리버뷰',
    hero_image_url: 'https://images.unsplash.com/photo-1508009603885-50cf7c579365?w=800',
    gallery: [
      'https://images.unsplash.com/photo-1508009603885-50cf7c579365?w=800'
    ],
    features: [
      '대한항공 주간 직항 (수하물 23kg)',
      '차오프라야 강변 5성급 샹그릴라 4박 전 일정 조식',
      '샹그릴라 전용 디너 크루즈 1회 할인권',
      '아이콘시암 무료 셔틀보트 이용'
    ],
    flight_summary: {
      outbound: '인천(ICN) 09:05 -> 방콕(BKK) 13:10',
      inbound: '방콕(BKK) 23:30 -> 인천(ICN) 06:55+1',
      baggage: '위탁수하물 23kg 무료'
    },
    hotel_summary: {
      address: '89 Soi Wat Suan Plu, Bangrak, Bangkok 10500',
      breakfast: true,
      free_cancel: true
    }
  },
  {
    id: 'pkg_paris_6d5n',
    title: '[유럽 프리미엄] 파리 풀만 에펠탑 6일 (에어프랑스 직항 + 에펠뷰 5박)',
    city: '파리',
    country: '프랑스',
    origin_airport: '서울/인천 (ICN)',
    duration_nights: 5,
    duration_days: 6,
    airline_name: '에어프랑스 (직항 왕복)',
    airline_code: 'AF',
    flight_offer_id: 'flt_af267',
    return_flight_offer_id: 'flt_ke902_ret',
    hotel_id: 'htl_paris_01',
    hotel_name: '풀만 파리 투르 에펠 (Pullman Paris Tour Eiffel)',
    hotel_star: 4,
    room_type_id: 'rm_paris_01',
    room_name: '클래식 발코니 에펠탑뷰 룸',
    original_price_krw: 3200000,
    bundle_price_krw: 2650000,
    savings_amount_krw: 550000,
    savings_percentage: 17,
    badge: '에펠탑 도보 1분',
    hero_image_url: 'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=800',
    gallery: [
      'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=800'
    ],
    features: [
      '에어프랑스 직항 왕복 (위탁수하물 23kg)',
      '에펠탑 초근접 4성급 호텔 5박',
      '루브르 박물관 모바일 패스트트랙 e-티켓 포함',
      '세느강 바토무슈 유람선 탑승권 증정'
    ],
    flight_summary: {
      outbound: '인천(ICN) 09:45 -> 파리(CDG) 16:00',
      inbound: '파리(CDG) 21:00 -> 인천(ICN) 16:30+1',
      baggage: '위탁수하물 23kg 무료'
    },
    hotel_summary: {
      address: '18 Avenue De Suffren, Entree Au 22 Rue Jean Rey, 75015 Paris',
      breakfast: true,
      free_cancel: true
    }
  }
]

export function getPackageById(id: string): PackageBundle | null {
  return MASTER_PACKAGE_CATALOG.find(p => p.id === id) || null
}

export function searchPackageCatalog(params: {
  city?: string
  origin?: string
  duration?: number
  sortBy?: 'recommended' | 'price_asc' | 'savings_desc'
}): PackageBundle[] {
  let list = [...MASTER_PACKAGE_CATALOG]

  if (params.city && params.city.trim()) {
    const q = params.city.trim().toLowerCase()
    list = list.filter(p => p.city.toLowerCase().includes(q) || p.title.toLowerCase().includes(q))
  }

  if (params.duration && params.duration > 0) {
    list = list.filter(p => p.duration_nights === params.duration)
  }

  if (params.sortBy === 'price_asc') {
    list.sort((a, b) => a.bundle_price_krw - b.bundle_price_krw)
  } else if (params.sortBy === 'savings_desc') {
    list.sort((a, b) => b.savings_amount_krw - a.savings_amount_krw)
  }

  return list
}

