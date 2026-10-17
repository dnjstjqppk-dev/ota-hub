/**
 * getfortrip - Master Verified Train Catalog & Route Search Engine
 * Strict Origin-Destination Match & Zero Foreign Route Pollution
 */

export interface TrainJourney {
  id: string
  train_number: string
  train_type: 'KTX' | 'KTX-산천' | 'SRT' | 'SHINKANSEN' | 'EUROSTAR' | 'TGV'
  country: 'KR' | 'JP' | 'FR' | 'GB'
  departure_station: string
  arrival_station: string
  departure_time: string // HH:mm
  arrival_time: string   // HH:mm
  duration_minutes: number
  seat_class: string
  price_krw: number
  available_seats: number
  stops: number
  free_cancellation_hours: number
}

export const MASTER_TRAIN_SCHEDULES: TrainJourney[] = [
  // ==========================================
  // 대한민국: 서울역 <-> 부산역 (KTX / KTX-산천)
  // ==========================================
  {
    id: 'trn_ktx_021',
    train_number: 'KTX 021',
    train_type: 'KTX-산천',
    country: 'KR',
    departure_station: '서울역',
    arrival_station: '부산역',
    departure_time: '08:30',
    arrival_time: '11:05',
    duration_minutes: 155,
    seat_class: '일반실',
    price_krw: 59800,
    available_seats: 42,
    stops: 2,
    free_cancellation_hours: 24
  },
  {
    id: 'trn_ktx_025',
    train_number: 'KTX 025',
    train_type: 'KTX',
    country: 'KR',
    departure_station: '서울역',
    arrival_station: '부산역',
    departure_time: '10:00',
    arrival_time: '12:40',
    duration_minutes: 160,
    seat_class: '일반실',
    price_krw: 59800,
    available_seats: 18,
    stops: 3,
    free_cancellation_hours: 24
  },
  {
    id: 'trn_ktx_041',
    train_number: 'KTX 041',
    train_type: 'KTX-산천',
    country: 'KR',
    departure_station: '서울역',
    arrival_station: '부산역',
    departure_time: '13:30',
    arrival_time: '16:02',
    duration_minutes: 152,
    seat_class: '특실 / 우등실',
    price_krw: 83700,
    available_seats: 12,
    stops: 1,
    free_cancellation_hours: 24
  },
  {
    id: 'trn_ktx_055',
    train_number: 'KTX 055',
    train_type: 'KTX',
    country: 'KR',
    departure_station: '서울역',
    arrival_station: '부산역',
    departure_time: '17:15',
    arrival_time: '19:58',
    duration_minutes: 163,
    seat_class: '일반실',
    price_krw: 59800,
    available_seats: 27,
    stops: 3,
    free_cancellation_hours: 24
  },

  // ==========================================
  // 대한민국: 부산역 -> 서울역 (상행 KTX)
  // ==========================================
  {
    id: 'trn_ktx_022_ret',
    train_number: 'KTX 022',
    train_type: 'KTX-산천',
    country: 'KR',
    departure_station: '부산역',
    arrival_station: '서울역',
    departure_time: '09:00',
    arrival_time: '11:35',
    duration_minutes: 155,
    seat_class: '일반실',
    price_krw: 59800,
    available_seats: 31,
    stops: 2,
    free_cancellation_hours: 24
  },
  {
    id: 'trn_ktx_034_ret',
    train_number: 'KTX 034',
    train_type: 'KTX',
    country: 'KR',
    departure_station: '부산역',
    arrival_station: '서울역',
    departure_time: '14:20',
    arrival_time: '17:02',
    duration_minutes: 162,
    seat_class: '일반실',
    price_krw: 59800,
    available_seats: 19,
    stops: 3,
    free_cancellation_hours: 24
  },

  // ==========================================
  // 일본 신칸센: 도쿄역 <-> 신오사카역 (Tokaido Shinkansen)
  // ==========================================
  {
    id: 'trn_shinkansen_nozomi23',
    train_number: 'NOZOMI 23',
    train_type: 'SHINKANSEN',
    country: 'JP',
    departure_station: '도쿄역',
    arrival_station: '신오사카역',
    departure_time: '09:00',
    arrival_time: '11:30',
    duration_minutes: 150,
    seat_class: '지정석 (Standard Reserved)',
    price_krw: 145000,
    available_seats: 25,
    stops: 3,
    free_cancellation_hours: 48
  },
  {
    id: 'trn_shinkansen_nozomi45',
    train_number: 'NOZOMI 45',
    train_type: 'SHINKANSEN',
    country: 'JP',
    departure_station: '도쿄역',
    arrival_station: '신오사카역',
    departure_time: '11:30',
    arrival_time: '14:00',
    duration_minutes: 150,
    seat_class: '그린샤 (Green Car 1등석)',
    price_krw: 205000,
    available_seats: 8,
    stops: 3,
    free_cancellation_hours: 48
  },
  {
    id: 'trn_shinkansen_nozomi28_ret',
    train_number: 'NOZOMI 28',
    train_type: 'SHINKANSEN',
    country: 'JP',
    departure_station: '신오사카역',
    arrival_station: '도쿄역',
    departure_time: '13:00',
    arrival_time: '15:30',
    duration_minutes: 150,
    seat_class: '지정석 (Standard Reserved)',
    price_krw: 145000,
    available_seats: 19,
    stops: 3,
    free_cancellation_hours: 48
  },

  // ==========================================
  // 유럽 초고속열차: 파리 북역 <-> 런던 세인트판크라스 (Eurostar)
  // ==========================================
  {
    id: 'trn_eurostar_9015',
    train_number: 'Eurostar 9015',
    train_type: 'EUROSTAR',
    country: 'FR',
    departure_station: '파리 북역 (Paris Gare du Nord)',
    arrival_station: '런던 세인트 판크라스 (London St Pancras)',
    departure_time: '10:12',
    arrival_time: '11:30',
    duration_minutes: 138,
    seat_class: 'Standard',
    price_krw: 168000,
    available_seats: 14,
    stops: 0,
    free_cancellation_hours: 72
  }
]

/**
 * Strict Origin-Destination Filter
 * Ensures NO different city/country routes pollute search results!
 */
export function searchTrainCatalog(params: {
  depStation?: string
  arrStation?: string
  date?: string
  trainType?: string
  seatClass?: string
}): TrainJourney[] {
  let list = [...MASTER_TRAIN_SCHEDULES]

  const cleanStation = (val?: string) => {
    if (!val) return ''
    return val.replace(/\s*\([^)]*\)/g, '').trim().toLowerCase()
  }

  const dep = cleanStation(params.depStation)
  const arr = cleanStation(params.arrStation)

  // 1. Strict Origin & Destination matching
  if (dep) {
    list = list.filter(t => cleanStation(t.departure_station).includes(dep) || dep.includes(cleanStation(t.departure_station)))
  }
  if (arr) {
    list = list.filter(t => cleanStation(t.arrival_station).includes(arr) || arr.includes(cleanStation(t.arrival_station)))
  }

  // 2. Train Type filter
  if (params.trainType && params.trainType !== 'ALL') {
    list = list.filter(t => t.train_type === params.trainType)
  }

  // 3. Seat Class filter
  if (params.seatClass && params.seatClass !== 'ALL') {
    list = list.filter(t => t.seat_class.includes(params.seatClass!))
  }

  return list
}

export function getTrainById(id: string): TrainJourney | null {
  return MASTER_TRAIN_SCHEDULES.find(t => t.id === id) || null
}
