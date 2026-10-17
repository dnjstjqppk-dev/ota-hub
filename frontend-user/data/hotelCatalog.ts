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
  review_score: number
  review_count: number
  neighborhood: string
  subway_nearby: string
  property_type: 'HOTEL' | 'RESORT' | 'RYOKAN' | 'VILLA'
  free_cancellation: boolean
  free_breakfast: boolean
  thumbnail_url: string
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
    review_score: 4.9,
    review_count: 3450,
    neighborhood: '잠실 롯데월드몰 / 석촌호수',
    subway_nearby: '지하철 2·8호선 잠실역 지하 직결',
    property_type: 'HOTEL',
    free_cancellation: true,
    free_breakfast: true,
    thumbnail_url: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800',
    images: [
      'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800',
      'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=800',
      'https://images.unsplash.com/photo-1571003123894-1f0594d2b5d9?w=800'
    ],
    amenities: ['초고층 스카이라운지', '미쉐린 스타 스테이 다이닝', '실내 온수 인피니티풀', '에비앙 럭셔리 스파', '무료 발레파킹', '24시간 롤스로이스 리무진 의전'],
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
    reviews: [
      { id: 'rev_s1', author: '강** 여행자', rating: 5.0, date: '2026-10-12', comment: '81층에서 내려다보는 한강 야경이 경이롭습니다. 라운지 살롱 드 시그니엘 샴페인 서비스도 최고였습니다.' },
      { id: 'rev_s2', author: 'Kim J.W.', rating: 4.8, date: '2026-10-05', comment: '기념일 호캉스로 다녀왔는데 직원분들의 환대와 턴다운 서비스가 매우 인상적이었습니다.' }
    ]
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
    review_score: 4.9,
    review_count: 4120,
    neighborhood: '남산 장충단공원',
    subway_nearby: '지하철 3호선 동대입구역 도보 5분',
    property_type: 'HOTEL',
    free_cancellation: true,
    free_breakfast: true,
    thumbnail_url: 'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=800',
    images: [
      'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=800',
      'https://images.unsplash.com/photo-1571003123894-1f0594d2b5d9?w=800'
    ],
    amenities: ['어번 아일랜드 야외 온수 수영장', '라연 미쉐린 3스타 한식당', '겔랑 스파', '패스트리 부티크', '비즈니스 이그제큐티브 라운지'],
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
    reviews: [
      { id: 'rev_s3', author: '이**', rating: 5.0, date: '2026-09-30', comment: '파크뷰 조식 뷔페와 어번 아일랜드는 국내 최고입니다.' }
    ]
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
    review_score: 4.8,
    review_count: 2280,
    neighborhood: '강남 삼성동 코엑스 맞은편',
    subway_nearby: '지하철 2호선 삼성역 1번 출구 도보 1분',
    property_type: 'HOTEL',
    free_cancellation: true,
    free_breakfast: false,
    thumbnail_url: 'https://images.unsplash.com/photo-1590559899731-a372a146979d?w=800',
    images: [
      'https://images.unsplash.com/photo-1590559899731-a372a146979d?w=800'
    ],
    amenities: ['24층 최고층 로비 파노라마 통창', '오셀라스 럭셔리 스파', '실내 온수 인피니티풀', '팀버 하우스 바이닐 바'],
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
    reviews: [
      { id: 'rev_s4', author: '정**', rating: 4.7, date: '2026-10-08', comment: '화강암으로 마감된 통창 욕실과 야경이 정말 매력적입니다.' }
    ]
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
    review_score: 4.9,
    review_count: 2180,
    neighborhood: '롯폰기 힐스 쇼핑가 / 모리 타워',
    subway_nearby: '지하철 히비야선 롯폰기역 도보 3분',
    property_type: 'HOTEL',
    free_cancellation: true,
    free_breakfast: true,
    thumbnail_url: 'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=800',
    images: [
      'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=800',
      'https://images.unsplash.com/photo-1571003123894-1f0594d2b5d9?w=800',
      'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=800'
    ],
    amenities: ['나가미네 스파 & 피트니스', '실내 온수풀', '도쿄 타워 전망', '10개 인터내셔널 레스토랑 & 바', '무료 Wi-Fi', '24시간 룸서비스'],
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
    reviews: [
      { id: 'rev_t1', author: '이**', rating: 5.0, date: '2026-10-10', comment: '위치, 룸 컨디션, 서비스 모두 최고였습니다. 롯폰기 힐스와 직결되어 편리합니다.' },
      { id: 'rev_t2', author: 'Sato K.', rating: 4.8, date: '2026-09-28', comment: '조식 뷔페 퀄리티가 대단히 높습니다. 도쿄 출장 시 늘 머무는 곳입니다.' }
    ]
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
    review_score: 4.9,
    review_count: 1840,
    neighborhood: '신주쿠 스카이스크래퍼 지구',
    subway_nearby: 'JR 신주쿠역 도보 10분 (무료 셔틀 운행)',
    property_type: 'HOTEL',
    free_cancellation: true,
    free_breakfast: true,
    thumbnail_url: 'https://images.unsplash.com/photo-1503899036084-c55cdd92da26?w=800',
    images: [
      'https://images.unsplash.com/photo-1503899036084-c55cdd92da26?w=800'
    ],
    amenities: ['클럽 온 더 파크 럭셔리 스파', '뉴욕 그릴 & 바', '52층 파노라마 후지산 전망', '피트니스 센터'],
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
    reviews: [
      { id: 'rev_t3', author: '최**', rating: 5.0, date: '2026-10-02', comment: '영화 로스트 인 트랜스레이션의 감성을 온전히 느낄 수 있는 환상적인 뷰.' }
    ]
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
    review_score: 4.7,
    review_count: 5210,
    neighborhood: '신주쿠 도청 앞',
    subway_nearby: '지하철 도초마에역 바로 앞 / JR 신주쿠역 도보 5분',
    property_type: 'HOTEL',
    free_cancellation: true,
    free_breakfast: false,
    thumbnail_url: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800',
    images: ['https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800'],
    amenities: ['공항 리무진 버스 직결', '야외 수영장 (여름철)', '편의점 24시간', '디즈니랜드 무료 셔틀'],
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
    reviews: [
      { id: 'rev_t4', author: '박**', rating: 4.7, date: '2026-09-15', comment: '나리타/하네다 리무진 버스가 호텔 현관까지 와서 이동이 정말 편했습니다.' }
    ]
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
    review_score: 4.8,
    review_count: 1890,
    neighborhood: '도톤보리 / 난바역 직결',
    subway_nearby: '난카이 난바역 직결 (간사이 공항 라피트 바로 탑승)',
    property_type: 'HOTEL',
    free_cancellation: true,
    free_breakfast: false,
    thumbnail_url: 'https://images.unsplash.com/photo-1590559899731-a372a146979d?w=800',
    images: [
      'https://images.unsplash.com/photo-1590559899731-a372a146979d?w=800',
      'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=800'
    ],
    amenities: ['난카이 난바역 바로 위 위치', '36층 테이블36 파노라마 레스토랑', '실내 온수풀 & 스파', '피트니스 센터'],
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
    reviews: [
      { id: 'rev_o1', author: '한**', rating: 5.0, date: '2026-10-14', comment: '공항 오갈 때 무거운 캐리어 끌 필요 없이 난바역 엘리베이터 타면 끝입니다. 도톤보리 도보 5분!' }
    ]
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
    review_score: 4.9,
    review_count: 2450,
    neighborhood: '우메다 그랜드 프론트 쇼핑몰',
    subway_nearby: 'JR 오사카역 직결 도보 5분',
    property_type: 'HOTEL',
    free_cancellation: true,
    free_breakfast: true,
    thumbnail_url: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800',
    images: ['https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800'],
    amenities: ['일본 전통 대욕장 & 자쿠지', '미쉐린 피에르 다이닝', '실내 온수풀', '24시간 클럽 인터컨티넨탈'],
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
    reviews: [
      { id: 'rev_o2', author: 'Yamada T.', rating: 4.9, date: '2026-09-22', comment: '우메다 쇼핑과 교통 편의성 최고. 대욕장 시설이 훌륭하여 피로가 싹 풀렸습니다.' }
    ]
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
    review_score: 4.8,
    review_count: 3890,
    neighborhood: '차오프라야 강변 / 사톤',
    subway_nearby: 'BTS 사판탁신역 도보 1분 (아이콘시암 셔틀 보트 직결)',
    property_type: 'RESORT',
    free_cancellation: true,
    free_breakfast: true,
    thumbnail_url: 'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=800',
    images: [
      'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=800',
      'https://images.unsplash.com/photo-1571003123894-1f0594d2b5d9?w=800'
    ],
    amenities: ['차오프라야 리버사이드 수영장 2개', 'CHI 더 스파', '아이콘시암 전용 무료 셔틀보트', '호라이즌 디너 크루즈 선착장'],
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
    reviews: [
      { id: 'rev_b1', author: '김**', rating: 5.0, date: '2026-10-11', comment: '발코니에서 바라보는 강변 노을이 예술입니다. 아이콘시암 보트도 바로 앞에서 탈 수 있어요.' }
    ]
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
    review_score: 4.9,
    review_count: 2150,
    neighborhood: '사톤 룸피니 공원',
    subway_nearby: 'MRT 룸피니역 도보 8분',
    property_type: 'HOTEL',
    free_cancellation: true,
    free_breakfast: true,
    thumbnail_url: 'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=800',
    images: ['https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=800'],
    amenities: ['도심 속 태국 정통 연못 가든', '야외 25m 온수 수영장', '초콜릿 뷔페 살롱', '보타니카 스파'],
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
    reviews: [
      { id: 'rev_b2', author: 'Somchai P.', rating: 5.0, date: '2026-09-18', comment: '방콕 도심 한가운데에서 평화로운 오아시스를 만난 느낌입니다.' }
    ]
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
    review_score: 4.8,
    review_count: 2840,
    neighborhood: '캐널시티 하카타 직결',
    subway_nearby: '지하철 나나쿠마선 쿠시다진자마에역 도보 2분 / 하카타역 도보 10분',
    property_type: 'HOTEL',
    free_cancellation: true,
    free_breakfast: true,
    thumbnail_url: 'https://images.unsplash.com/photo-1571003123894-1f0594d2b5d9?w=800',
    images: [
      'https://images.unsplash.com/photo-1571003123894-1f0594d2b5d9?w=800',
      'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=800'
    ],
    amenities: ['캐널시티 복합 쇼핑몰 직결', '클럽 올림푸스 실내 온수풀 & 스파', '분수쇼 뷰 바 피즈', '나카스 포장마차 거리 도보 3분'],
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
    reviews: [
      { id: 'rev_f1', author: '윤**', rating: 5.0, date: '2026-10-13', comment: '캐널시티 분수쇼가 바로 보이는 방이어서 아이들이 너무 좋아했습니다. 나카스 강변도 가까워요.' }
    ]
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
    review_score: 4.7,
    review_count: 3620,
    neighborhood: '텐진 솔라리아 플라자',
    subway_nearby: '니시테츠 후쿠오카(텐진)역 직결 / 지하철 텐진역 바로 연결',
    property_type: 'HOTEL',
    free_cancellation: true,
    free_breakfast: false,
    thumbnail_url: 'https://images.unsplash.com/photo-1590559899731-a372a146979d?w=800',
    images: ['https://images.unsplash.com/photo-1590559899731-a372a146979d?w=800'],
    amenities: ['텐진역 직결 최고의 위치', '17층 전망 레스토랑 레드 플랑', '백화점 쇼핑가 바로 연결', '공항철도 직결'],
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
    reviews: [
      { id: 'rev_f2', author: '오**', rating: 4.8, date: '2026-09-29', comment: '텐진 쇼핑과 맛집 투어하기에 후쿠오카 최고의 입지입니다.' }
    ]
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
    review_score: 4.8,
    review_count: 4890,
    neighborhood: '샹드마르스 공원 / 에펠탑',
    subway_nearby: 'RER C선 샹드마르스-투르에펠역 도보 2분 / 비르하케임역 도보 5분',
    property_type: 'HOTEL',
    free_cancellation: true,
    free_breakfast: true,
    thumbnail_url: 'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=800',
    images: [
      'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=800',
      'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=800'
    ],
    amenities: ['에펠탑 도보 1분 정면 뷰', '프레임(FR|AME) 오가닉 레스토랑 & 바', '24시간 피트니스 센터', '전 객실 발코니 에펠탑 조망'],
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
    reviews: [
      { id: 'rev_p1', author: '송**', rating: 5.0, date: '2026-10-09', comment: '밤마다 방 발코니에서 반짝이는 에펠탑을 와인 마시며 바라보는 경험은 평생 잊지 못합니다.' },
      { id: 'rev_p2', author: 'Dupont M.', rating: 4.8, date: '2026-09-14', comment: '에펠탑 바로 옆 위치라 이동과 산책이 정말 최고였습니다.' }
    ]
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
    review_score: 4.9,
    review_count: 2710,
    neighborhood: '오페라 가르니에 / 방돔 광장',
    subway_nearby: '지하철 오페라역 도보 1분',
    property_type: 'HOTEL',
    free_cancellation: true,
    free_breakfast: true,
    thumbnail_url: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800',
    images: ['https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800'],
    amenities: ['1862년 나폴레옹 3세 시대 유서 깊은 궁전 양식', '카페 드 라 페(Café de la Paix)', '딥티크 어메니티', '클럽 라운지'],
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
    reviews: [
      { id: 'rev_p3', author: '남**', rating: 5.0, date: '2026-10-01', comment: '오페라 가르니에가 문을 열면 바로 앞에 펼쳐집니다. 카페 드 라 페의 밀푀유와 조식도 환상적입니다.' }
    ]
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
    list.sort((a, b) => b.review_score - a.review_score)
  }

  return list
}

/**
 * Find hotel by ID
 */
export function getHotelById(id: string): HotelProperty | null {
  return MASTER_HOTEL_CATALOG.find(h => h.id === id) || null
}

