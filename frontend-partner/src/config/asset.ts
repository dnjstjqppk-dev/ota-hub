import { API_BASE } from './api'

/** Upload URLs are API paths (/api/v1/uploads/…); resolve them against the API host. */
export function assetUrl(u: string | null | undefined): string {
  if (!u) return ''
  return u.startsWith('/api/v1/') ? `${API_BASE}${u.slice('/api/v1'.length)}` : u
}
