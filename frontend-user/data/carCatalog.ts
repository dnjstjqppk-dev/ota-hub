/**
 * getfortrip - Master Verified Car Rental Catalog & Booking Engine
 * Multi-city fleet, insurance tiers, driver age & cancellation policies
 */

export interface CarInsurancePlan {
  id: 'super' | 'standard'
  name: string
  badge: string
  deductible_krw: number
  description: string
  daily_fee_krw: number
}

export interface RentalCarProperty {
  id: string
  company_name: string
  company_logo?: string
  vehicle_model: string
  vehicle_category: 'COMPACT' | 'SEDAN' | 'SUV' | 'VAN' | 'ELECTRIC' | 'LUXURY'
  seats: number
  luggage_large: number
  luggage_small: number
  transmission: 'AUTO' | 'MANUAL'
  fuel_type: 'GASOLINE' | 'DIESEL' | 'HYBRID' | 'ELECTRIC'
  pickup_city: string
  pickup_location_name: string
  daily_price_krw: number
  insurance_super_cdw: boolean
  unlimited_mileage: boolean
  free_cancellation_hours: number
  min_driver_age: number
  min_driving_experience_years: number
  image_url: string
  gallery: string[]
  features: string[]
  insurance_plans: CarInsurancePlan[]
}

export const MASTER_CAR_CATALOG: RentalCarProperty[] = [
  {
    id: 'car_avante_01',
    company_name: '롯데렌터카 (Lotte Rent-a-Car)',
    vehicle_model: '현대 더 뉴 아반떼 CN7 (2025/2026)',
    vehicle_category: 'SEDAN',
    seats: 5,
    luggage_large: 2,
    luggage_small: 2,
    transmission: 'AUTO',
    fuel_type: 'GASOLINE',
    pickup_city: '제주',
    pickup_location_name: '제주국제공항 렌터카하우스 셔틀 1구역 (도보 3분)',
    daily_price_krw: 48000,
    insurance_super_cdw: true,
    unlimited_mileage: true,
    free_cancellation_hours: 48,
    min_driver_age: 21,
    min_driving_experience_years: 1,
    image_url: 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?w=800',
    gallery: [
      'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?w=800',
      'https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=800',
      'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800'
    ],
    features: ['스마트 크루즈 컨트롤', '열선/통풍 시트', '후방 카메라 & 전후방 센서', '블루투스/애플 카플레이', '하이패스 내장'],
    insurance_plans: [
      {
        id: 'super',
        name: '완전자차 보장 (Super CDW)',
        badge: '추천 안심 플랜',
        deductible_krw: 0,
        description: '사고 시 고객 부담 면책금 0원, 휴차보상료 100% 면제, 타이어/휠 파손 보장',
        daily_fee_krw: 10000
      },
      {
        id: 'standard',
        name: '일반자차 보장 (Standard CDW)',
        badge: '기본형 플랜',
        deductible_krw: 300000,
        description: '사고 시 건당 최대 30만원 자기부담금 발생, 휴차보상료 50% 고객 부담',
        daily_fee_krw: 0
      }
    ]
  },
  {
    id: 'car_yaris_01',
    company_name: 'Times Car Rental Japan',
    vehicle_model: 'Toyota Yaris Hybrid (2025/2026)',
    vehicle_category: 'COMPACT',
    seats: 5,
    luggage_large: 2,
    luggage_small: 1,
    transmission: 'AUTO',
    fuel_type: 'HYBRID',
    pickup_city: '도쿄',
    pickup_location_name: '도쿄 나리타 국제공항 제1터미널 렌터카 카운터',
    daily_price_krw: 62000,
    insurance_super_cdw: true,
    unlimited_mileage: true,
    free_cancellation_hours: 48,
    min_driver_age: 21,
    min_driving_experience_years: 1,
    image_url: 'https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=800',
    gallery: [
      'https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=800',
      'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?w=800'
    ],
    features: ['하이브리드 고연비 (30km/L)', '일본 현지 한국어 내비게이션', 'ETC 하이패스 단말기 장착', '비상 자동제동 시스템'],
    insurance_plans: [
      {
        id: 'super',
        name: '슈퍼 안심 보상 (Super CDW + NOC 면제)',
        badge: '추천 안심 플랜',
        deductible_krw: 0,
        description: '휴차영업손실(NOC) 전액 면제, 타이어 펑크 및 유리 파손 무상 보상',
        daily_fee_krw: 12000
      },
      {
        id: 'standard',
        name: '기본 면책 보상 (Standard CDW)',
        badge: '기본형 플랜',
        deductible_krw: 500000,
        description: '사고 시 최대 5만엔 면책금 및 NOC(2만~5만엔) 발생',
        daily_fee_krw: 0
      }
    ]
  },
  {
    id: 'car_tucson_01',
    company_name: 'SK렌터카 (SK Rent-a-Car)',
    vehicle_model: '현대 디 올 뉴 투싼 1.6T (2025)',
    vehicle_category: 'SUV',
    seats: 5,
    luggage_large: 3,
    luggage_small: 2,
    transmission: 'AUTO',
    fuel_type: 'GASOLINE',
    pickup_city: '제주',
    pickup_location_name: '제주국제공항 셔틀 탑승장 2구역 SK렌터카 지점',
    daily_price_krw: 65000,
    insurance_super_cdw: true,
    unlimited_mileage: true,
    free_cancellation_hours: 48,
    min_driver_age: 21,
    min_driving_experience_years: 1,
    image_url: 'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=800',
    gallery: [
      'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=800'
    ],
    features: ['넓은 트렁크 캠핑/골프백 3개 적재', '어라운드 뷰 360 카메라', '파노라마 선루프', '스마트폰 무선충전'],
    insurance_plans: [
      {
        id: 'super',
        name: '완전자차 보장 (Super CDW)',
        badge: '추천 안심 플랜',
        deductible_krw: 0,
        description: '사고 시 고객 부담 면책금 0원, 휴차보상료 100% 면제',
        daily_fee_krw: 10000
      },
      {
        id: 'standard',
        name: '일반자차 보장 (Standard CDW)',
        badge: '기본형 플랜',
        deductible_krw: 300000,
        description: '사고 시 건당 최대 30만원 자기부담금 발생',
        daily_fee_krw: 0
      }
    ]
  },
  {
    id: 'car_carnival_01',
    company_name: '롯데렌터카 (Lotte Rent-a-Car)',
    vehicle_model: '기아 더 뉴 카니발 9인승 리무진',
    vehicle_category: 'VAN',
    seats: 9,
    luggage_large: 4,
    luggage_small: 4,
    transmission: 'AUTO',
    fuel_type: 'DIESEL',
    pickup_city: '제주',
    pickup_location_name: '제주국제공항 렌터카하우스 셔틀 1구역',
    daily_price_krw: 95000,
    insurance_super_cdw: true,
    unlimited_mileage: true,
    free_cancellation_hours: 48,
    min_driver_age: 26,
    min_driving_experience_years: 2,
    image_url: 'https://images.unsplash.com/photo-1563720223185-11003d516935?w=800',
    gallery: [
      'https://images.unsplash.com/photo-1563720223185-11003d516935?w=800'
    ],
    features: ['가족/단체 여행 최적 9인승', '고속도로 버스전용차로 통행 가능(6인 이상 탑승시)', '파워 슬라이딩 도어', '독립 2열 리클라이닝'],
    insurance_plans: [
      {
        id: 'super',
        name: '완전자차 보장 (Super CDW)',
        badge: '추천 안심 플랜',
        deductible_krw: 0,
        description: '사고 시 고객 부담 면책금 0원, 휴차보상료 100% 면제',
        daily_fee_krw: 15000
      },
      {
        id: 'standard',
        name: '일반자차 보장 (Standard CDW)',
        badge: '기본형 플랜',
        deductible_krw: 500000,
        description: '사고 시 건당 최대 50만원 자기부담금 발생',
        daily_fee_krw: 0
      }
    ]
  }
]

export function getCarById(id: string): RentalCarProperty | null {
  return MASTER_CAR_CATALOG.find(c => c.id === id) || null
}

export function searchCarCatalog(params: {
  city?: string
  category?: string
  transmission?: string
  superCdwOnly?: boolean
  freeCancelOnly?: boolean
  sortBy?: 'recommended' | 'price_asc' | 'seats_desc'
}): RentalCarProperty[] {
  let list = [...MASTER_CAR_CATALOG]

  if (params.city && params.city.trim()) {
    const q = params.city.trim().toLowerCase()
    list = list.filter(c => c.pickup_city.toLowerCase().includes(q) || c.pickup_location_name.toLowerCase().includes(q))
  }

  if (params.category && params.category !== 'ALL') {
    list = list.filter(c => c.vehicle_category === params.category)
  }

  if (params.transmission && params.transmission !== 'ALL') {
    list = list.filter(c => c.transmission === params.transmission)
  }

  if (params.superCdwOnly) {
    list = list.filter(c => c.insurance_super_cdw)
  }

  if (params.freeCancelOnly) {
    list = list.filter(c => c.free_cancellation_hours > 0)
  }

  if (params.sortBy === 'price_asc') {
    list.sort((a, b) => a.daily_price_krw - b.daily_price_krw)
  } else if (params.sortBy === 'seats_desc') {
    list.sort((a, b) => b.seats - a.seats)
  }

  return list
}

