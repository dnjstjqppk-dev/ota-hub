/**
 * getfortrip - Master Verified Airport Transfer Catalog & Booking Engine
 * Standardized vehicle classes, airport zones, real-time tracking & meet-and-greet policies
 */

export type TransferTier = 'ECONOMY_SEDAN' | 'COMFORT_SEDAN' | 'BUSINESS_VAN' | 'LUXURY_FIRST'

export interface TransferProperty {
  id: string
  airport_code: string
  airport_name: string
  destination_zone: string
  vehicle_tier: TransferTier
  vehicle_class: string
  vehicle_name: string
  vehicle_model_example: string
  max_passengers: number
  max_luggage: number
  price_krw: number
  free_waiting_mins: number
  flight_tracking: boolean
  meet_and_greet: boolean
  free_cancellation_hours: number
  image_url: string
  features: string[]
  service_highlights: string[]
  meeting_guide: string
}

export const MASTER_TRANSFER_CATALOG: TransferProperty[] = [
  // ==========================================
  // 대한민국: 인천국제공항 (ICN) T1 / T2
  // ==========================================
  {
    id: 'tf_icn_van_01',
    airport_code: 'ICN',
    airport_name: '인천국제공항 제1/제2여객터미널',
    destination_zone: '서울 도심 (명동/중구/용산/강남) 전역',
    vehicle_tier: 'BUSINESS_VAN',
    vehicle_class: '비즈니스 대형 밴 (Business MPV)',
    vehicle_name: '비즈니스 밴 리무진 (Business Van)',
    vehicle_model_example: '현대 스타리아 라운지 리무진 / 기아 카니발 하이리무진',
    max_passengers: 6,
    max_luggage: 6,
    price_krw: 120000,
    free_waiting_mins: 60,
    flight_tracking: true,
    meet_and_greet: true,
    free_cancellation_hours: 24,
    image_url: 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?w=800',
    features: ['항공편 지연 자동 추적', '입국장 60분 무료 대기', '기사 네임보드 피켓 영접', '고속도로 통행료/유류비 포함'],
    service_highlights: [
      '항공편 실시간 자동 추적: 항공기 조기 착륙 또는 지연 착륙 시 기사님이 착륙 시간에 맞춰 자동 대기',
      '입국장 무료 대기 60분: 비행기 착륙 시각부터 60분간 무료 대기 제공 (입국심사 및 수하물 수취 여유 보장)',
      '입국장 피켓 영접: 입국장 게이트 앞에서 고객님 성함이 적힌 네임보드를 든 전담 기사님 영접',
      '추가 요금 제로: 공항 고속도로 통행료, 주차료, 유류비 일체 포함 정찰제 요금',
      '무료 생수 및 스마트폰 초고속 충전기 구비'
    ],
    meeting_guide: '입국장 세관 통과 후 메인 로비로 나오시면, 입국 게이트 바로 앞에서 고객님의 영문 성함이 기재된 getfortrip 네임보드를 들고 계신 전담 기사님을 만나실 수 있습니다.'
  },
  {
    id: 'tf_icn_sedan_01',
    airport_code: 'ICN',
    airport_name: '인천국제공항 제1/제2여객터미널',
    destination_zone: '서울 도심 (명동/중구/마포/종로) 전역',
    vehicle_tier: 'ECONOMY_SEDAN',
    vehicle_class: '이코노미 세단 (Economy Sedan)',
    vehicle_name: '이코노미 정숙 세단 (Economy Sedan)',
    vehicle_model_example: '현대 쏘나타 디 엣지 / 기아 K5 동급',
    max_passengers: 3,
    max_luggage: 3,
    price_krw: 75000,
    free_waiting_mins: 60,
    flight_tracking: true,
    meet_and_greet: true,
    free_cancellation_hours: 24,
    image_url: 'https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=800',
    features: ['안락한 4도어 고급 세단', '생수 무료 제공', '무료 60분 대기', '통행료 전액 포함'],
    service_highlights: [
      '경제적이고 안락한 1~3인 전용 공항 이동 솔루션',
      '항공편 편명 기반 착륙 시간 실시간 모니터링',
      '비행기 착륙 후 60분간 무료 대기 보장',
      '인천공항 고속도로 톨게이트 비용 일체 포함'
    ],
    meeting_guide: '입국장 게이트 밖 택시 승차장 대신, 기사님이 지정해 드리는 여객터미널 단기주차장 전용 픽업 베이에서 원터치 탑승합니다.'
  },
  {
    id: 'tf_icn_comfort_01',
    airport_code: 'ICN',
    airport_name: '인천국제공항 제1/제2여객터미널',
    destination_zone: '서울 도심 및 강남권 (강남/서초/송파)',
    vehicle_tier: 'COMFORT_SEDAN',
    vehicle_class: '컴포트 프리미엄 세단 (Comfort Sedan)',
    vehicle_name: '컴포트 프리미엄 세단 (Comfort Sedan)',
    vehicle_model_example: '현대 그랜저 GN7 / 기아 K8 하이브리드',
    max_passengers: 3,
    max_luggage: 3,
    price_krw: 95000,
    free_waiting_mins: 60,
    flight_tracking: true,
    meet_and_greet: true,
    free_cancellation_hours: 24,
    image_url: 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800',
    features: ['정숙한 고급 대형 세단', '항공편 지연 무료 추적', '생수 및 물티슈 제공', '프리미엄 기사 배정'],
    service_highlights: [
      '비즈니스 출장 및 소규모 가족 이동에 최적화된 고급 세단',
      '부드러운 주행감과 정숙한 실내 환경',
      '기사님 피켓 영접 및 트렁크 짐 적재 무료 대행'
    ],
    meeting_guide: '세관 통과 후 출구 번호 앞에서 getfortrip 피켓을 들고 계신 기사님과 조우하시면 됩니다.'
  },
  {
    id: 'tf_icn_luxury_01',
    airport_code: 'ICN',
    airport_name: '인천국제공항 제1/제2여객터미널',
    destination_zone: '서울 전역 및 경기/인천 수도권',
    vehicle_tier: 'LUXURY_FIRST',
    vehicle_class: '럭셔리 VIP 세단 (Luxury First)',
    vehicle_name: '럭셔리 퍼스트 클래스 세단 (VIP Luxury)',
    vehicle_model_example: '제네시스 G90 / 메르세데스-벤츠 S-Class 동급',
    max_passengers: 3,
    max_luggage: 3,
    price_krw: 220000,
    free_waiting_mins: 90,
    flight_tracking: true,
    meet_and_greet: true,
    free_cancellation_hours: 24,
    image_url: 'https://images.unsplash.com/photo-1563720223185-11003d516935?w=800',
    features: ['정장 의전 전문 기사', 'VIP 입국 영접 서비스', '90분 무료 대기', '에비앙 생수 및 어메니티'],
    service_highlights: [
      '국빈 및 VIP 의전을 위한 최고급 플래그십 세단',
      '전문 의전 교육을 이수한 정장 기사 배정',
      '넉넉한 90분 무료 대기 서비스',
      '고속도로 톨게이트 및 유류비 완전 포함'
    ],
    meeting_guide: '입국 게이트 최전방에서 정장 차림의 전담 의전 기사님이 VIP 고객님 성함 피켓을 들고 대기합니다.'
  },

  // ==========================================
  // 대한민국: 김포국제공항 (GMP)
  // ==========================================
  {
    id: 'tf_gmp_van_01',
    airport_code: 'GMP',
    airport_name: '김포국제공항 국내선/국제선',
    destination_zone: '서울 도심 (명동/강남/잠실) 전역',
    vehicle_tier: 'BUSINESS_VAN',
    vehicle_class: '비즈니스 대형 밴 (Business MPV)',
    vehicle_name: '김포공항 비즈니스 패밀리 밴',
    vehicle_model_example: '기아 카니발 / 현대 스타리아',
    max_passengers: 6,
    max_luggage: 6,
    price_krw: 80000,
    free_waiting_mins: 60,
    flight_tracking: true,
    meet_and_greet: true,
    free_cancellation_hours: 24,
    image_url: 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?w=800',
    features: ['김포공항 전용 픽업', '입국장 60분 무료 대기', '도심 30분대 쾌속 주파', '짐 무료 적재'],
    service_highlights: [
      '서울 도심과 가장 가까운 김포공항 최적화 픽업',
      '하네다/간사이/쑹산 등 단거리 국제선 착륙 후 신속한 도심 호텔 이동'
    ],
    meeting_guide: '김포공항 입국장 1층 3번 게이트 앞 getfortrip 미팅 포인트에서 기사님과 조우합니다.'
  },

  // ==========================================
  // 일본: 도쿄 하네다(HND) / 나리타(NRT)
  // ==========================================
  {
    id: 'tf_hnd_van_01',
    airport_code: 'HND',
    airport_name: '도쿄 하네다 국제공항 (HND) T2/T3',
    destination_zone: '도쿄 23구 (신주쿠/시부야/긴자/롯폰기) 전역',
    vehicle_tier: 'BUSINESS_VAN',
    vehicle_class: '도쿄 알파드 VIP 프리미엄 밴',
    vehicle_name: '토요타 알파드 하이브리드 리무진 (Alphard Executive)',
    vehicle_model_example: 'Toyota Alphard / Vellfire Executive Lounge',
    max_passengers: 5,
    max_luggage: 5,
    price_krw: 165000,
    free_waiting_mins: 60,
    flight_tracking: true,
    meet_and_greet: true,
    free_cancellation_hours: 24,
    image_url: 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?w=800',
    features: ['한국어 가능 기사 옵션', '수도고속도로 톨게이트비 포함', '60분 무료 대기', '공식 녹색 번호판 허가 차량'],
    service_highlights: [
      '일본 국토교통성 인증 정식 녹색 영업 번호판(미도리 넘버) 보증 차량',
      '하네다 공항에서 도쿄 중심가까지 가장 럭셔리한 이동 경험',
      '수도고속도로 통행료 및 주차료 전액 포함 정찰 운임'
    ],
    meeting_guide: '하네다 제3터미널 입국 게이트 로비 Information 카운터 맞은편에서 네임보드 기사님을 만납니다.'
  },
  {
    id: 'tf_nrt_van_01',
    airport_code: 'NRT',
    airport_name: '도쿄 나리타 국제공항 (NRT) T1/T2/T3',
    destination_zone: '도쿄 23구 호텔/숙소 직행',
    vehicle_tier: 'BUSINESS_VAN',
    vehicle_class: '나리타-도쿄 장거리 직행 럭셔리 밴',
    vehicle_name: '토요타 하이에이스 / 알파드 프리미엄 리무진',
    vehicle_model_example: 'Toyota HiAce Grand Cabin / Alphard',
    max_passengers: 8,
    max_luggage: 8,
    price_krw: 260000,
    free_waiting_mins: 90,
    flight_tracking: true,
    meet_and_greet: true,
    free_cancellation_hours: 24,
    image_url: 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?w=800',
    features: ['장거리 픽업 90분 무료 대기', '히가시칸토 고속도로 톨비 포함', '대형 캐리어 8개 적재 가능'],
    service_highlights: [
      '나리타에서 도쿄 도심까지 70km 장거리 무환승 직행',
      '무거운 짐을 들고 나리타 익스프레스 환승할 필요 없는 도어투도어 프라이빗 픽업',
      '90분 넉넉한 착륙 무료 대기 시간 제공'
    ],
    meeting_guide: '나리타 입국장 출구 바로 앞 중앙 로비에서 고객님 성함 피켓 기사님 조우.'
  },

  // ==========================================
  // 일본: 오사카 간사이 국제공항 (KIX)
  // ==========================================
  {
    id: 'tf_kix_van_01',
    airport_code: 'KIX',
    airport_name: '오사카 간사이 국제공항 (KIX) T1/T2',
    destination_zone: '오사카 시내 (난바/우메다/신사이바시) / 교토',
    vehicle_tier: 'BUSINESS_VAN',
    vehicle_class: '간사이 알파드/하이에이스 프라이빗 밴',
    vehicle_name: '토요타 알파드 / 하이에이스 리무진',
    vehicle_model_example: 'Toyota Alphard / HiAce',
    max_passengers: 6,
    max_luggage: 6,
    price_krw: 180000,
    free_waiting_mins: 60,
    flight_tracking: true,
    meet_and_greet: true,
    free_cancellation_hours: 24,
    image_url: 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?w=800',
    features: ['한신고속도로 톨게이트 포함', '오사카/교토 호텔 직행', '정식 영업용 번호판'],
    service_highlights: [
      '오사카 도심 숙소 앞까지 바로 이동하는 프리미엄 픽업',
      '교토 직행 이동 시에도 추가 대기 없이 쾌적한 이동'
    ],
    meeting_guide: '간사이공항 제1터미널 1층 남측 출구 스타벅스 앞 피켓 미팅 포인트'
  }
]

export function searchTransferCatalog(params: {
  airportCode?: string
  destination?: string
  tier?: string
  minPassengers?: number
  minLuggage?: number
}): TransferProperty[] {
  let list = [...MASTER_TRANSFER_CATALOG]

  if (params.airportCode && params.airportCode !== 'ALL') {
    const code = params.airportCode.toUpperCase()
    list = list.filter(t => t.airport_code === code || t.airport_name.includes(code))
  }

  if (params.tier && params.tier !== 'ALL') {
    list = list.filter(t => t.vehicle_tier === params.tier)
  }

  if (params.minPassengers && params.minPassengers > 0) {
    list = list.filter(t => t.max_passengers >= params.minPassengers!)
  }

  if (params.minLuggage && params.minLuggage > 0) {
    list = list.filter(t => t.max_luggage >= params.minLuggage!)
  }

  return list
}

export function getTransferById(id: string): TransferProperty | null {
  return MASTER_TRANSFER_CATALOG.find(t => t.id === id) || null
}

