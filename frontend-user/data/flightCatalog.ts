/**
 * getfortrip - Master Verified Flight Catalog & Dynamic Search Engine
 * Single Source of Truth for Flights Inventory, Fares, Baggage & Itineraries
 */

export interface FlightLeg {
  id: string
  airline_code: string
  airline_name: string
  airline_logo?: string
  flight_number: string
  aircraft: string
  origin_code: string
  origin_name: string
  dest_code: string
  dest_name: string
  departure_time: string // HH:mm format for schedule template
  arrival_time: string   // HH:mm format
  duration_minutes: number
  stops: number // 0: 직항, 1: 1회 경유
  time_slot: 'MORNING' | 'AFTERNOON' | 'EVENING' | 'NIGHT'
  cabin_class: 'ECONOMY' | 'PREMIUM_ECONOMY' | 'BUSINESS' | 'FIRST'
  free_baggage_kg: number
  carry_on_kg: number
  available_seats: number
  base_price_krw: number
}

export interface FlightFareOption {
  id: string
  brand_name: string
  cabin_class: string
  checked_baggage: string
  change_policy: string
  refund_policy: string
  seat_selection: string
  price_krw: number
}

export interface FlightOffer {
  id: string
  direction: 'OUTBOUND' | 'RETURN'
  airline_name: string
  airline_code: string
  flight_number: string
  cabin_class: string
  departure_time: string // ISO string computed from target date
  arrival_time: string   // ISO string computed from target date
  departure_airport: string
  arrival_airport: string
  origin_code: string
  dest_code: string
  duration_minutes: number
  stops: number
  departure_time_slot: string
  free_baggage_kg: number
  available_seats: number
  base_price_krw: number
  fare_options: FlightFareOption[]
}

// Master Flight Schedule Templates (Outbound & Return for major routes)
export const MASTER_FLIGHT_SCHEDULES: FlightLeg[] = [
  // ==========================================
  // 서울/인천 (ICN) <-> 도쿄 나리타 (NRT)
  // ==========================================
  {
    id: 'flt_ke703',
    airline_code: 'KE',
    airline_name: '대한항공',
    flight_number: 'KE703',
    aircraft: 'Boeing 777-300ER',
    origin_code: 'ICN',
    origin_name: '인천국제공항 (ICN)',
    dest_code: 'NRT',
    dest_name: '도쿄 나리타 (NRT)',
    departure_time: '10:10',
    arrival_time: '12:35',
    duration_minutes: 145,
    stops: 0,
    time_slot: 'MORNING',
    cabin_class: 'ECONOMY',
    free_baggage_kg: 23,
    carry_on_kg: 10,
    available_seats: 9,
    base_price_krw: 245000
  },
  {
    id: 'flt_oz102',
    airline_code: 'OZ',
    airline_name: '아시아나항공',
    flight_number: 'OZ102',
    aircraft: 'Airbus A350-900',
    origin_code: 'ICN',
    origin_name: '인천국제공항 (ICN)',
    dest_code: 'NRT',
    dest_name: '도쿄 나리타 (NRT)',
    departure_time: '09:00',
    arrival_time: '11:20',
    duration_minutes: 140,
    stops: 0,
    time_slot: 'MORNING',
    cabin_class: 'ECONOMY',
    free_baggage_kg: 23,
    carry_on_kg: 10,
    available_seats: 6,
    base_price_krw: 238000
  },
  {
    id: 'flt_7c1102',
    airline_code: '7C',
    airline_name: '제주항공',
    flight_number: '7C1102',
    aircraft: 'Boeing 737-800',
    origin_code: 'ICN',
    origin_name: '인천국제공항 (ICN)',
    dest_code: 'NRT',
    dest_name: '도쿄 나리타 (NRT)',
    departure_time: '14:30',
    arrival_time: '16:55',
    duration_minutes: 145,
    stops: 0,
    time_slot: 'AFTERNOON',
    cabin_class: 'ECONOMY',
    free_baggage_kg: 15,
    carry_on_kg: 10,
    available_seats: 14,
    base_price_krw: 189000
  },
  {
    id: 'flt_ke705',
    airline_code: 'KE',
    airline_name: '대한항공',
    flight_number: 'KE705',
    aircraft: 'Boeing 787-9 드림라이너',
    origin_code: 'ICN',
    origin_name: '인천국제공항 (ICN)',
    dest_code: 'NRT',
    dest_name: '도쿄 나리타 (NRT)',
    departure_time: '18:45',
    arrival_time: '21:15',
    duration_minutes: 150,
    stops: 0,
    time_slot: 'EVENING',
    cabin_class: 'ECONOMY',
    free_baggage_kg: 23,
    carry_on_kg: 10,
    available_seats: 8,
    base_price_krw: 260000
  },
  // NRT -> ICN (Return Flights)
  {
    id: 'flt_ke704_ret',
    airline_code: 'KE',
    airline_name: '대한항공',
    flight_number: 'KE704',
    aircraft: 'Boeing 777-300ER',
    origin_code: 'NRT',
    origin_name: '도쿄 나리타 (NRT)',
    dest_code: 'ICN',
    dest_name: '인천국제공항 (ICN)',
    departure_time: '14:00',
    arrival_time: '16:45',
    duration_minutes: 165,
    stops: 0,
    time_slot: 'AFTERNOON',
    cabin_class: 'ECONOMY',
    free_baggage_kg: 23,
    carry_on_kg: 10,
    available_seats: 8,
    base_price_krw: 250000
  },
  {
    id: 'flt_oz101_ret',
    airline_code: 'OZ',
    airline_name: '아시아나항공',
    flight_number: 'OZ101',
    aircraft: 'Airbus A350-900',
    origin_code: 'NRT',
    origin_name: '도쿄 나리타 (NRT)',
    dest_code: 'ICN',
    dest_name: '인천국제공항 (ICN)',
    departure_time: '12:30',
    arrival_time: '15:15',
    duration_minutes: 165,
    stops: 0,
    time_slot: 'AFTERNOON',
    cabin_class: 'ECONOMY',
    free_baggage_kg: 23,
    carry_on_kg: 10,
    available_seats: 5,
    base_price_krw: 242000
  },
  {
    id: 'flt_7c1101_ret',
    airline_code: '7C',
    airline_name: '제주항공',
    flight_number: '7C1101',
    aircraft: 'Boeing 737-800',
    origin_code: 'NRT',
    origin_name: '도쿄 나리타 (NRT)',
    dest_code: 'ICN',
    dest_name: '인천국제공항 (ICN)',
    departure_time: '18:00',
    arrival_time: '20:45',
    duration_minutes: 165,
    stops: 0,
    time_slot: 'EVENING',
    cabin_class: 'ECONOMY',
    free_baggage_kg: 15,
    carry_on_kg: 10,
    available_seats: 11,
    base_price_krw: 195000
  },

  // ==========================================
  // 서울/인천 (ICN) <-> 오사카 간사이 (KIX)
  // ==========================================
  {
    id: 'flt_ke723',
    airline_code: 'KE',
    airline_name: '대한항공',
    flight_number: 'KE723',
    aircraft: 'Airbus A330-300',
    origin_code: 'ICN',
    origin_name: '인천국제공항 (ICN)',
    dest_code: 'KIX',
    dest_name: '오사카 간사이 (KIX)',
    departure_time: '09:20',
    arrival_time: '11:05',
    duration_minutes: 105,
    stops: 0,
    time_slot: 'MORNING',
    cabin_class: 'ECONOMY',
    free_baggage_kg: 23,
    carry_on_kg: 10,
    available_seats: 12,
    base_price_krw: 215000
  },
  {
    id: 'flt_7c1302',
    airline_code: '7C',
    airline_name: '제주항공',
    flight_number: '7C1302',
    aircraft: 'Boeing 737-800',
    origin_code: 'ICN',
    origin_name: '인천국제공항 (ICN)',
    dest_code: 'KIX',
    dest_name: '오사카 간사이 (KIX)',
    departure_time: '13:10',
    arrival_time: '14:55',
    duration_minutes: 105,
    stops: 0,
    time_slot: 'AFTERNOON',
    cabin_class: 'ECONOMY',
    free_baggage_kg: 15,
    carry_on_kg: 10,
    available_seats: 16,
    base_price_krw: 168000
  },
  {
    id: 'flt_ke724_ret',
    airline_code: 'KE',
    airline_name: '대한항공',
    flight_number: 'KE724',
    aircraft: 'Airbus A330-300',
    origin_code: 'KIX',
    origin_name: '오사카 간사이 (KIX)',
    dest_code: 'ICN',
    dest_name: '인천국제공항 (ICN)',
    departure_time: '12:20',
    arrival_time: '14:15',
    duration_minutes: 115,
    stops: 0,
    time_slot: 'AFTERNOON',
    cabin_class: 'ECONOMY',
    free_baggage_kg: 23,
    carry_on_kg: 10,
    available_seats: 9,
    base_price_krw: 220000
  },

  // ==========================================
  // 서울/인천 (ICN) <-> 방콕 수완나품 (BKK)
  // ==========================================
  {
    id: 'flt_ke657',
    airline_code: 'KE',
    airline_name: '대한항공',
    flight_number: 'KE657',
    aircraft: 'Boeing 777-300ER',
    origin_code: 'ICN',
    origin_name: '인천국제공항 (ICN)',
    dest_code: 'BKK',
    dest_name: '방콕 수완나품 (BKK)',
    departure_time: '09:05',
    arrival_time: '13:10',
    duration_minutes: 365,
    stops: 0,
    time_slot: 'MORNING',
    cabin_class: 'ECONOMY',
    free_baggage_kg: 23,
    carry_on_kg: 10,
    available_seats: 8,
    base_price_krw: 395000
  },
  {
    id: 'flt_tg659',
    airline_code: 'TG',
    airline_name: '타이항공',
    flight_number: 'TG659',
    aircraft: 'Boeing 787-8',
    origin_code: 'ICN',
    origin_name: '인천국제공항 (ICN)',
    dest_code: 'BKK',
    dest_name: '방콕 수완나품 (BKK)',
    departure_time: '10:20',
    arrival_time: '14:20',
    duration_minutes: 360,
    stops: 0,
    time_slot: 'MORNING',
    cabin_class: 'ECONOMY',
    free_baggage_kg: 30,
    carry_on_kg: 7,
    available_seats: 10,
    base_price_krw: 380000
  },
  {
    id: 'flt_ke658_ret',
    airline_code: 'KE',
    airline_name: '대한항공',
    flight_number: 'KE658',
    aircraft: 'Boeing 777-300ER',
    origin_code: 'BKK',
    origin_name: '방콕 수완나품 (BKK)',
    dest_code: 'ICN',
    dest_name: '인천국제공항 (ICN)',
    departure_time: '23:30',
    arrival_time: '06:55',
    duration_minutes: 325,
    stops: 0,
    time_slot: 'NIGHT',
    cabin_class: 'ECONOMY',
    free_baggage_kg: 23,
    carry_on_kg: 10,
    available_seats: 7,
    base_price_krw: 410000
  },

  // ==========================================
  // 서울/인천 (ICN) <-> 파리 샤를드골 (CDG)
  // ==========================================
  {
    id: 'flt_ke901',
    airline_code: 'KE',
    airline_name: '대한항공',
    flight_number: 'KE901',
    aircraft: 'Boeing 777-300ER',
    origin_code: 'ICN',
    origin_name: '인천국제공항 (ICN)',
    dest_code: 'CDG',
    dest_name: '파리 샤를 드골 (CDG)',
    departure_time: '12:20',
    arrival_time: '18:30',
    duration_minutes: 850,
    stops: 0,
    time_slot: 'AFTERNOON',
    cabin_class: 'ECONOMY',
    free_baggage_kg: 23,
    carry_on_kg: 10,
    available_seats: 5,
    base_price_krw: 980000
  },
  {
    id: 'flt_af267',
    airline_code: 'AF',
    airline_name: '에어프랑스',
    flight_number: 'AF267',
    aircraft: 'Boeing 777-300',
    origin_code: 'ICN',
    origin_name: '인천국제공항 (ICN)',
    dest_code: 'CDG',
    dest_name: '파리 샤를 드골 (CDG)',
    departure_time: '09:45',
    arrival_time: '16:00',
    duration_minutes: 855,
    stops: 0,
    time_slot: 'MORNING',
    cabin_class: 'ECONOMY',
    free_baggage_kg: 23,
    carry_on_kg: 12,
    available_seats: 7,
    base_price_krw: 940000
  },
  {
    id: 'flt_ke902_ret',
    airline_code: 'KE',
    airline_name: '대한항공',
    flight_number: 'KE902',
    aircraft: 'Boeing 777-300ER',
    origin_code: 'CDG',
    origin_name: '파리 샤를 드골 (CDG)',
    dest_code: 'ICN',
    dest_name: '인천국제공항 (ICN)',
    departure_time: '21:00',
    arrival_time: '16:30',
    duration_minutes: 690,
    stops: 0,
    time_slot: 'NIGHT',
    cabin_class: 'ECONOMY',
    free_baggage_kg: 23,
    carry_on_kg: 10,
    available_seats: 4,
    base_price_krw: 990000
  }
]

/**
 * Generate 7-day lowest price calendar dynamically based on target date
 * Never produces static/outdated dates!
 */
export function generateDynamicDateStrip(baseDateStr?: string): Array<{
  dateStr: string
  label: string
  dayOfWeek: string
  isToday: boolean
  isSelected: boolean
  priceKRW: number
}> {
  const target = baseDateStr ? new Date(baseDateStr) : new Date()
  if (isNaN(target.getTime())) {
    target.setTime(Date.now())
  }

  const daysOfWeek = ['일', '월', '화', '수', '목', '금', '토']
  const strip = []
  const todayStr = new Date().toISOString().slice(0, 10)

  for (let offset = -3; offset <= 3; offset++) {
    const d = new Date(target)
    d.setDate(d.getDate() + offset)
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    const dateStr = `${yyyy}-${mm}-${dd}`
    const isToday = dateStr === todayStr
    const isSelected = offset === 0
    const dow = daysOfWeek[d.getDay()]

    // Base price fluctuation simulation
    const baseP = 210000 + Math.abs(offset) * 12000 + (d.getDay() === 0 || d.getDay() === 6 ? 28000 : 0)

    strip.push({
      dateStr,
      label: `${d.getMonth() + 1}/${d.getDate()}`,
      dayOfWeek: dow,
      isToday,
      isSelected,
      priceKRW: baseP
    })
  }

  return strip
}

/**
 * Search Flight Offers with full facet filtering & real-time sorting
 */
export function searchFlightCatalog(params: {
  origin?: string
  dest?: string
  date?: string
  direction?: 'OUTBOUND' | 'RETURN'
  stops?: number | null
  airlines?: string[]
  timeSlot?: string
  baggageOnly?: boolean
  cabinClass?: string
  sortBy?: 'cheapest' | 'fastest' | 'recommended'
}): FlightOffer[] {
  let list = [...MASTER_FLIGHT_SCHEDULES]

  // Code extraction helper (e.g. "인천국제공항 (ICN)" -> "ICN")
  const parseCode = (val?: string) => {
    if (!val) return ''
    const match = val.match(/\b([A-Z]{3})\b/)
    return match ? match[1] : val.trim().toUpperCase()
  }

  const originCode = parseCode(params.origin)
  const destCode = parseCode(params.dest)

  if (originCode && originCode !== 'ALL') {
    list = list.filter(f => f.origin_code === originCode || f.origin_name.includes(originCode))
  }
  if (destCode && destCode !== 'ALL') {
    list = list.filter(f => f.dest_code === destCode || f.dest_name.includes(destCode))
  }

  // Stops filter
  if (params.stops !== null && params.stops !== undefined) {
    list = list.filter(f => f.stops === params.stops)
  }

  // Airlines filter
  if (params.airlines && params.airlines.length > 0) {
    list = list.filter(f => params.airlines!.includes(f.airline_name))
  }

  // Departure Time Slot filter
  if (params.timeSlot && params.timeSlot !== 'ALL') {
    list = list.filter(f => f.time_slot === params.timeSlot)
  }

  // Baggage filter
  if (params.baggageOnly) {
    list = list.filter(f => f.free_baggage_kg >= 20)
  }

  // Cabin Class
  if (params.cabinClass && params.cabinClass !== 'ALL') {
    list = list.filter(f => f.cabin_class === params.cabinClass)
  }

  // Convert to full FlightOffer with fare brands & ISO dates
  const targetDateStr = params.date || new Date().toISOString().slice(0, 10)

  let offers: FlightOffer[] = list.map(f => {
    const depIso = `${targetDateStr}T${f.departure_time}:00+09:00`
    const arrIso = `${targetDateStr}T${f.arrival_time}:00+09:00`

    const fareStandard: FlightFareOption = {
      id: `${f.id}_std`,
      brand_name: '이코노미 스탠다드 (Standard)',
      cabin_class: '일반석 (Economy)',
      checked_baggage: `위탁수하물 1개 (${f.free_baggage_kg}kg)`,
      change_policy: '출발 24시간 전 수수료 30,000원 후 변경 가능',
      refund_policy: '환불 수수료 50,000원 공제 후 환불',
      seat_selection: '체크인 시 무료 좌석 배정',
      price_krw: f.base_price_krw
    }

    const fareFlex: FlightFareOption = {
      id: `${f.id}_flx`,
      brand_name: '이코노미 플렉스 (Flex Plus)',
      cabin_class: '일반석 (Economy Plus)',
      checked_baggage: `위탁수하물 2개 (${f.free_baggage_kg + 5}kg)`,
      change_policy: '무료 여정 변경 1회 보장',
      refund_policy: '출발 전 전액 환불 가능 (수수료 0원)',
      seat_selection: '사전 선호 좌석 무료 지정',
      price_krw: f.base_price_krw + 45000
    }

    const fareBiz: FlightFareOption = {
      id: `${f.id}_biz`,
      brand_name: '프레스티지 / 비즈니스 (Business)',
      cabin_class: '비즈니스석 (Lie-flat)',
      checked_baggage: '위탁수하물 2개 (각 32kg) + 전용 수속',
      change_policy: '무제한 무료 여정 변경',
      refund_policy: '전액 환불 (수수료 면제)',
      seat_selection: '공항 프리미엄 라운지 이용권 포함',
      price_krw: f.base_price_krw * 2.4
    }

    return {
      id: f.id,
      direction: params.direction || 'OUTBOUND',
      airline_name: f.airline_name,
      airline_code: f.airline_code,
      flight_number: f.flight_number,
      cabin_class: f.cabin_class,
      departure_time: depIso,
      arrival_time: arrIso,
      departure_airport: f.origin_name,
      arrival_airport: f.dest_name,
      origin_code: f.origin_code,
      dest_code: f.dest_code,
      duration_minutes: f.duration_minutes,
      stops: f.stops,
      departure_time_slot: f.time_slot,
      free_baggage_kg: f.free_baggage_kg,
      available_seats: f.available_seats,
      base_price_krw: f.base_price_krw,
      fare_options: [fareStandard, fareFlex, fareBiz]
    }
  })

  // Sort
  if (params.sortBy === 'fastest') {
    offers.sort((a, b) => a.duration_minutes - b.duration_minutes)
  } else if (params.sortBy === 'cheapest') {
    offers.sort((a, b) => a.base_price_krw - b.base_price_krw)
  } else {
    // Recommended: balance price and duration
    offers.sort((a, b) => (a.base_price_krw + a.duration_minutes * 300) - (b.base_price_krw + b.duration_minutes * 300))
  }

  return offers
}

export function getFlightById(id: string): FlightLeg | null {
  return MASTER_FLIGHT_SCHEDULES.find(f => f.id === id) || null
}
