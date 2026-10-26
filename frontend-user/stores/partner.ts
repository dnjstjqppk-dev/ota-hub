import { defineStore } from 'pinia'
import { useApiUrl } from '~/composables/useApi'

export interface PartnerProfile {
  id: string
  companyName: string
  email: string
  partnerType: 'HOTEL' | 'TOUR' | 'CAR' | 'TRANSFER' | 'FLIGHT' | 'ALL'
  businessNumber: string
  contactPhone: string
  settlementRate: number
  token: string
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
    async login(email: string, pass: string): Promise<boolean> {
      const cleanEmail = email.trim().toLowerCase()
      if (!cleanEmail || !pass) return false

      try {
        const res = await fetch(useApiUrl('/partner/login'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: cleanEmail, password: pass })
        })
        if (!res.ok) return false
        const json = await res.json()
        const p = json.partner || json.data
        if (!p || !p.token) return false

        const profile: PartnerProfile = {
          id: p.id,
          companyName: p.companyName || p.company_name,
          email: p.email,
          partnerType: p.partnerType || p.partner_type || 'HOTEL',
          businessNumber: p.businessNumber || p.business_number,
          contactPhone: p.contactPhone || p.contact_phone || '',
          settlementRate: Number(p.settlementRate || p.settlement_rate || 0.9),
          token: p.token
        }
        this.partner = profile
        this.isLoggedIn = true
        if (typeof window !== 'undefined') {
          localStorage.setItem('getfortrip_partner_session', JSON.stringify(profile))
        }
        return true
      } catch (e) {
        return false
      }
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
