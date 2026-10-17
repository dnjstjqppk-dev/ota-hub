import { defineStore } from 'pinia'

export interface PartnerProfile {
  id: string
  companyName: string
  email: string
  partnerType: 'HOTEL' | 'TOUR' | 'CAR' | 'TRANSFER' | 'ALL'
  businessNumber: string
  contactPhone: string
  settlementRate: number
  token: string
}

const DEMO_PARTNERS: Record<string, PartnerProfile> = {
  'hotel_partner@getfortrip.com': {
    id: 'ptn_htl_01',
    companyName: '(주)하얏트 코리아 호스피탈리티',
    email: 'hotel_partner@getfortrip.com',
    partnerType: 'HOTEL',
    businessNumber: '101-81-99201',
    contactPhone: '02-797-1234',
    settlementRate: 0.90,
    token: 'ptn_sec_tok_hotel_8829'
  },
  'tour_partner@getfortrip.com': {
    id: 'ptn_tour_01',
    companyName: '(주)도쿄 익스플로러 투어스',
    email: 'tour_partner@getfortrip.com',
    partnerType: 'TOUR',
    businessNumber: '202-86-33918',
    contactPhone: '02-333-8822',
    settlementRate: 0.88,
    token: 'ptn_sec_tok_tour_7712'
  },
  'car_partner@getfortrip.com': {
    id: 'ptn_car_01',
    companyName: '글로벌 모빌리티 & 렌터카 파트너스',
    email: 'car_partner@getfortrip.com',
    partnerType: 'CAR',
    businessNumber: '303-88-55410',
    contactPhone: '064-744-8899',
    settlementRate: 0.92,
    token: 'ptn_sec_tok_car_4491'
  }
}

export const usePartnerStore = defineStore('partner', {
  state: () => {
    let saved: PartnerProfile | null = null
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem('getfortrip_partner_session')
        if (raw) saved = JSON.parse(raw)
      } catch (e) {}
    }
    return {
      partner: saved,
      isLoggedIn: !!saved
    }
  },
  actions: {
    login(email: string, pass: string): boolean {
      const cleanEmail = email.trim().toLowerCase()
      // Accept demo accounts or default valid credentials
      const found = DEMO_PARTNERS[cleanEmail]
      if (found && (pass === 'partner1234!' || pass === '1234' || pass.length >= 4)) {
        this.partner = found
        this.isLoggedIn = true
        if (typeof window !== 'undefined') {
          localStorage.setItem('getfortrip_partner_session', JSON.stringify(found))
        }
        return true
      }

      // Allow any non-empty credential for realistic onboarding test
      if (cleanEmail.includes('@') && pass.length >= 4) {
        const customPartner: PartnerProfile = {
          id: 'ptn_' + Math.random().toString(36).substring(2, 9),
          companyName: cleanEmail.split('@')[0].toUpperCase() + ' 파트너스',
          email: cleanEmail,
          partnerType: 'ALL',
          businessNumber: '120-88-' + Math.floor(10000 + Math.random() * 90000),
          contactPhone: '02-1588-9999',
          settlementRate: 0.90,
          token: 'ptn_sec_' + Math.random().toString(36).substring(2, 12)
        }
        this.partner = customPartner
        this.isLoggedIn = true
        if (typeof window !== 'undefined') {
          localStorage.setItem('getfortrip_partner_session', JSON.stringify(customPartner))
        }
        return true
      }

      return false
    },
    logout() {
      this.isLoggedIn = false
      this.partner = null
      if (typeof window !== 'undefined') {
        localStorage.removeItem('getfortrip_partner_session')
      }
    }
  }
})

