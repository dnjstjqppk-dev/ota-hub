export const API_BASE = (import.meta as any).env?.VITE_API_BASE_URL ||
  (typeof window !== 'undefined' && window.location.origin.includes('localhost')
    ? 'http://localhost:8787/api/v1'
    : 'https://ota-hub.dnjstjqppk.workers.dev/api/v1')

export function apiUrl(path: string): string {
  const cleanPath = path.startsWith('/') ? path : `/${path}`
  return `${API_BASE}${cleanPath}`
}

/** Session token: localStorage when "remember me" was checked, else the tab session. */
export function partnerToken(): string | null {
  try {
    return localStorage.getItem('getfortrip_partner_token') || sessionStorage.getItem('getfortrip_partner_token')
  } catch {
    return null
  }
}

/** Stored login payload (`data.partner`). */
export function partnerInfo(): Record<string, any> | null {
  try {
    const raw = localStorage.getItem('getfortrip_partner_info') || sessionStorage.getItem('getfortrip_partner_info')
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

/** True while the account is still in onboarding (approval pending). */
export function partnerOnboardingPending(): boolean {
  const st = String(partnerInfo()?.profileStatus || '').toUpperCase()
  return st === 'PENDING_APPROVAL' || st === 'PENDING'
}

export function clearPartnerSession(): void {
  try {
    localStorage.removeItem('getfortrip_partner_token')
    localStorage.removeItem('getfortrip_partner_info')
    sessionStorage.removeItem('getfortrip_partner_token')
    sessionStorage.removeItem('getfortrip_partner_info')
  } catch {}
  document.cookie = 'getfortrip_partner_jwt=; path=/; max-age=0'
}

