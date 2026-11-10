export const API_BASE = (import.meta as any).env?.VITE_API_BASE_URL ||
  (typeof window !== 'undefined' && window.location.origin.includes('localhost')
    ? 'http://localhost:8787/api/v1'
    : 'https://ota-hub.dnjstjqppk.workers.dev/api/v1')

export function apiUrl(path: string): string {
  const cleanPath = path.startsWith('/') ? path : `/${path}`
  return `${API_BASE}${cleanPath}`
}

// #35: the JWT lives in memory only (gone on reload) and in the server's
// HttpOnly partner jar. It is NEVER written to localStorage/sessionStorage.
// Reload-restore flows through the cookie: every API fetch below sends
// credentials: 'include', and Bearer is attached only while memory holds one.
let memoryToken: string | null = null
export function setPartnerMemoryToken(t: string | null): void {
  memoryToken = t || null
}

/**
 * Memory session token. Empty (never null) after reload so every existing
 * `Bearer ${partnerToken()}` interpolation degrades to an empty Bearer,
 * which the server skips in favor of the cookie jar — never "Bearer null".
 */
export function partnerToken(): string {
  return memoryToken || ''
}

/** Stored login payload (`data.partner`). Display cache only — never a credential. */
export function partnerInfo(): Record<string, any> | null {
  try {
    const raw = localStorage.getItem('getfortrip_partner_info') || sessionStorage.getItem('getfortrip_partner_info')
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function savePartnerInfo(info: Record<string, any>, persistent: boolean): void {
  try {
    const raw = JSON.stringify(info)
    const store = persistent ? localStorage : sessionStorage
    const other = persistent ? sessionStorage : localStorage
    store.setItem('getfortrip_partner_info', raw)
    other.removeItem('getfortrip_partner_info')
    localStorage.removeItem('getfortrip_partner_token')
    sessionStorage.removeItem('getfortrip_partner_token')
  } catch {}
}

/** True while the account is still in onboarding (approval pending). */
export function partnerOnboardingPending(): boolean {
  const st = String(partnerInfo()?.profileStatus || '').toUpperCase()
  return st === 'PENDING_APPROVAL' || st === 'PENDING'
}

export function clearPartnerSession(): void {
  memoryToken = null
  try {
    localStorage.removeItem('getfortrip_partner_token')
    localStorage.removeItem('getfortrip_partner_info')
    sessionStorage.removeItem('getfortrip_partner_token')
    sessionStorage.removeItem('getfortrip_partner_info')
  } catch {}
  // Best-effort server logout: revokes the JWT and clears the partner jar.
  try {
    fetch(apiUrl('/partner/logout'), { method: 'POST', credentials: 'include' }).catch(() => {})
  } catch {}
}

// One cookie-restore attempt per page load for the route guard.
let settled = false
export async function restorePartnerSession(): Promise<boolean> {
  if (settled) return !!partnerInfo()
  settled = true
  try {
    // Memory Bearer covers cross-site staging (no cookie); the jar covers reloads.
    const headers: Record<string, string> = memoryToken ? { Authorization: `Bearer ${memoryToken}` } : {}
    const res = await fetch(apiUrl('/partner/profile'), { credentials: 'include', headers })
    const data = await res.json().catch(() => null)
    const p = data && data.partner ? data.partner : null
    if (res.ok && p && p.id) {
      savePartnerInfo({
        id: p.id,
        email: p.email,
        companyName: p.company_name,
        partnerType: p.partner_type,
        profileStatus: p.profile?.status || null
      }, true)
      return true
    }
  } catch {}
  clearPartnerSession()
  return false
}
