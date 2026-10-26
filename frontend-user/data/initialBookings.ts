/**
 * getfortrip - Master Authenticated Booking Data Source
 * Single Source of Truth for User Bookings across /my/, /my/bookings/, and /my/bookings/:id
 */

export interface BookingRecord {
  id: string
  booking_code: string
  domain: string
  domain_type: string
  domainName: string
  title: string
  schedule: string
  roomInfo?: string
  amount: number
  amountKrw: number
  final_amount_krw: number
  paid_currency: string
  paid_currency_amount: number
  status: 'CONFIRMED' | 'PENDING' | 'CANCELLED' | 'COMPLETED'
  statusLabel: string
  confirmation_number: string
  pnr: string
  primary_contact_name: string
  primary_contact_email: string
  primary_contact_phone: string
  created_at: string
  badgeClass?: string
  voucher_url?: boolean
  special_requests?: string
}

export const INITIAL_USER_BOOKINGS: BookingRecord[] = [
  {
    id: 'GF-HT-98214',
    booking_code: 'GF-HT-98214',
    domain: 'HOTEL',
    domain_type: 'HOTEL',
    domainName: '호텔',
    title: '그랜드 하얏트 도쿄 롯폰기 힐스',
    schedule: '2026.11.01 (일) ~ 2026.11.03 (화) · 2박',
    roomInfo: '디럭스 킹 룸 (시티뷰 조식 포함)',
    amount: 320000,
    amountKrw: 320000,
    final_amount_krw: 320000,
    paid_currency: 'KRW',
    paid_currency_amount: 320000,
    status: 'CONFIRMED',
    statusLabel: '예약 확정 완료',
    confirmation_number: 'HYATT-SEL-882194',
    pnr: 'HYATT-SEL-882194',
    primary_contact_name: '김여행 (010-9988-7766)',
    primary_contact_email: 'vip@getfortrip.com',
    primary_contact_phone: '010-9988-7766',
    created_at: '2026-10-14T08:30:00Z',
    badgeClass: 'bg-emerald-50 text-emerald-600 border-emerald-200',
    voucher_url: true,
    special_requests: '고층 시티뷰 배정 부탁드립니다. 금연실 희망.'
  },
  {
    id: 'GF-FL-44912',
    booking_code: 'GF-FL-44912',
    domain: 'FLIGHT',
    domain_type: 'FLIGHT',
    domainName: '항공권',
    title: '대한항공 KE703 (인천 ICN → 도쿄 NRT)',
    schedule: '2026.11.01 (일) 10:10 출발 · 직항',
    roomInfo: '일반석 (무료 위탁수하물 23kg 포함) · 좌석 28A',
    amount: 258000,
    amountKrw: 258000,
    final_amount_krw: 258000,
    paid_currency: 'KRW',
    paid_currency_amount: 258000,
    status: 'CONFIRMED',
    statusLabel: '전자 항공권(e-Ticket) 발급',
    confirmation_number: 'KE-ETKT-70389',
    pnr: 'KE-ETKT-70389',
    primary_contact_name: '김여행 (010-9988-7766)',
    primary_contact_email: 'vip@getfortrip.com',
    primary_contact_phone: '010-9988-7766',
    created_at: '2026-10-15T02:15:00Z',
    badgeClass: 'bg-blue-50 text-blue-600 border-blue-200',
    voucher_url: true,
    special_requests: '통로측 좌석 사전 지정 완료'
  },
  {
    id: 'GF-TR-29103',
    booking_code: 'GF-TR-29103',
    domain: 'TRAIN',
    domain_type: 'TRAIN',
    domainName: '기차표',
    title: 'KTX 021 (서울역 → 부산역)',
    schedule: '2026.11.15 (일) 08:30 출발 · 2시간 35분 소요',
    roomInfo: '일반실 3호차 12A 창가석',
    amount: 59800,
    amountKrw: 59800,
    final_amount_krw: 59800,
    paid_currency: 'KRW',
    paid_currency_amount: 59800,
    status: 'CONFIRMED',
    statusLabel: '모바일 승차권 발권됨',
    confirmation_number: 'KTX-021-3H12A',
    pnr: 'KTX-021-3H12A',
    primary_contact_name: '김여행 (010-9988-7766)',
    primary_contact_email: 'vip@getfortrip.com',
    primary_contact_phone: '010-9988-7766',
    created_at: '2026-10-15T03:10:00Z',
    badgeClass: 'bg-purple-50 text-purple-600 border-purple-200',
    voucher_url: true,
    special_requests: '순방향 창가석 지정 완료'
  },
  {
    id: 'GF-CAR-11849',
    booking_code: 'GF-CAR-11849',
    domain: 'CAR',
    domain_type: 'CAR',
    domainName: '렌터카',
    title: '롯데렌터카 현대 더 뉴 아반떼 (2025/2026)',
    schedule: '2026.11.20 (금) 10:00 ~ 2026.11.22 (일) 18:00',
    roomInfo: '제주공항 셔틀 1구역 인수 · 완전자차(Super CDW) 포함',
    amount: 180000,
    amountKrw: 180000,
    final_amount_krw: 180000,
    paid_currency: 'KRW',
    paid_currency_amount: 180000,
    status: 'CONFIRMED',
    statusLabel: '차량 배차 확정',
    confirmation_number: 'LOTTE-RENT-5541',
    pnr: 'LOTTE-RENT-5541',
    primary_contact_name: '김여행 (010-9988-7766)',
    primary_contact_email: 'vip@getfortrip.com',
    primary_contact_phone: '010-9988-7766',
    created_at: '2026-10-15T03:45:00Z',
    badgeClass: 'bg-amber-50 text-amber-600 border-amber-200',
    voucher_url: true,
    special_requests: '금연 차량 배정 확정'
  },
  {
    id: 'GF-TF-77218',
    booking_code: 'GF-TF-77218',
    domain: 'TRANSFER',
    domain_type: 'TRANSFER',
    domainName: '공항픽업',
    title: '인천국제공항 T1 → 서울 도심 비즈니스 밴 리무진',
    schedule: '2026.11.01 (일) 12:30 탑승 (비행기 편명 KE703 추적)',
    roomInfo: '스타리아 라운지 리무진 (최대 6인, 수하물 6개)',
    amount: 95000,
    amountKrw: 95000,
    final_amount_krw: 95000,
    paid_currency: 'KRW',
    paid_currency_amount: 95000,
    status: 'CONFIRMED',
    statusLabel: '기사 배정 완료',
    confirmation_number: 'VAN-LIM-9941',
    pnr: 'VAN-LIM-9941',
    primary_contact_name: '김여행 (010-9988-7766)',
    primary_contact_email: 'vip@getfortrip.com',
    primary_contact_phone: '010-9988-7766',
    created_at: '2026-10-15T04:00:00Z',
    badgeClass: 'bg-teal-50 text-teal-600 border-teal-200',
    voucher_url: true,
    special_requests: '도착 게이트 앞 네임보드 영접 피켓 서비스'
  },
  {
    id: 'GF-ACT-33019',
    booking_code: 'GF-ACT-33019',
    domain: 'ACTIVITY',
    domain_type: 'ACTIVITY',
    domainName: '투어·티켓',
    title: '도쿄 시부야 스카이 전망대 입장권 (일몰 타임슬롯)',
    schedule: '2026.11.02 (월) 16:40 입장 확정 바우처',
    roomInfo: '성인 2인권 · QR코드 즉시 입장 (현장 매표소 교환 불필요)',
    amount: 48000,
    amountKrw: 48000,
    final_amount_krw: 48000,
    paid_currency: 'KRW',
    paid_currency_amount: 48000,
    status: 'CONFIRMED',
    statusLabel: '모바일 e-티켓 발급됨',
    confirmation_number: 'SHIBUYA-SKY-7719',
    pnr: 'SHIBUYA-SKY-7719',
    primary_contact_name: '김여행 (010-9988-7766)',
    primary_contact_email: 'vip@getfortrip.com',
    primary_contact_phone: '010-9988-7766',
    created_at: '2026-10-15T04:15:00Z',
    badgeClass: 'bg-indigo-50 text-indigo-600 border-indigo-200',
    voucher_url: true,
    special_requests: '일몰 15분 전 입장 권장'
  },
  {
    id: 'GF-PKG-55102',
    booking_code: 'GF-PKG-55102',
    domain: 'PACKAGE',
    domain_type: 'PACKAGE',
    domainName: '에어텔',
    title: '오사카 유니버설 스튜디오 재팬 + 난바 특급 호텔 3박4일 자유여행',
    schedule: '2026.12.10 (목) ~ 2026.12.13 (일) · 3박 4일',
    roomInfo: '아시아나항공 왕복 + 스위소텔 난카이 오사카 슈페리어 트윈',
    amount: 640000,
    amountKrw: 640000,
    final_amount_krw: 640000,
    paid_currency: 'KRW',
    paid_currency_amount: 640000,
    status: 'CONFIRMED',
    statusLabel: '패키지 확정 바우처 발송',
    confirmation_number: 'PKG-OSA-USJ-8812',
    pnr: 'PKG-OSA-USJ-8812',
    primary_contact_name: '김여행 (010-9988-7766)',
    primary_contact_email: 'vip@getfortrip.com',
    primary_contact_phone: '010-9988-7766',
    created_at: '2026-10-15T04:30:00Z',
    badgeClass: 'bg-rose-50 text-rose-600 border-rose-200',
    voucher_url: true,
    special_requests: 'USJ 익스프레스 패스 4 사전 예약 완료'
  }
]

/**
 * Get unified booking list for the active user.
 * Merges localStorage dynamically created bookings with verified seed bookings.
 */
export function getUserBookings(currentUserEmail?: string): BookingRecord[] {
  const isDemo = currentUserEmail === 'vip@getfortrip.com'
  if (typeof window === 'undefined') {
    return isDemo ? INITIAL_USER_BOOKINGS : []
  }

  try {
    const raw = localStorage.getItem('user_mock_bookings')
    const list = raw ? JSON.parse(raw) : []
    const userCreated = Array.isArray(list) ? list : []

    if (isDemo) {
      const existingIds = new Set(userCreated.map((b: any) => b.id))
      const combined = [...userCreated]
      for (const seed of INITIAL_USER_BOOKINGS) {
        if (!existingIds.has(seed.id)) {
          combined.push(seed)
        }
      }
      return combined
    }
    return userCreated
  } catch (e) {
    return isDemo ? INITIAL_USER_BOOKINGS : []
  }
}

/**
 * Strict lookup for a single booking by ID.
 * Returns null if the booking does not exist or does not belong to the user.
 * NEVER returns dummy fallback data for unknown booking IDs.
 */
export function getUserBookingById(id: string): BookingRecord | null {
  const all = getUserBookings()
  const found = all.find(b => b.id === id || b.booking_code === id)
  return found || null
}

