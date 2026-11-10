import { reactive, ref } from 'vue'
import { adminFetch, adminMemoryToken, apiUrl, clearAdminMemoryToken, setAdminMemoryToken } from '../config/api'
import { errorMessage } from './format'

const USER_KEY = 'getfortrip_admin_user'

export interface AdminUser { id: string; name: string; email: string; role: string }

/** Signed-in admin as returned by the login API — never a placeholder identity. */
export const session = reactive<{ user: AdminUser | null }>({ user: null })

export function saveSession(token: string, user: AdminUser) {
  setAdminMemoryToken(token) // #35: memory only — never localStorage.
  localStorage.setItem(USER_KEY, JSON.stringify(user))
  try { localStorage.removeItem('getfortrip_admin_token') } catch {}
  session.user = user
  settled = true
}
export function clearSession() {
  clearAdminMemoryToken()
  try {
    localStorage.removeItem('getfortrip_admin_token')
    localStorage.removeItem(USER_KEY)
  } catch {}
  session.user = null
  // Best-effort server logout: revokes the JWT and clears the admin jar.
  try {
    fetch(apiUrl('/admin/logout'), { method: 'POST', credentials: 'include' }).catch(() => {})
  } catch {}
}

// #35: one cookie-restore attempt per page load for the route guard. The
// server enforces ADMIN per endpoint; this only decides where to route.
let settled = false
export async function restoreSession(): Promise<boolean> {
  if (session.user) return true
  if (settled) return false
  settled = true
  try {
    // Memory Bearer covers cross-site staging (no cookie); the jar covers reloads.
    const headers: Record<string, string> = adminMemoryToken() ? { Authorization: `Bearer ${adminMemoryToken()}` } : {}
    const res = await fetch(apiUrl('/auth/me'), { credentials: 'include', headers })
    const data = await res.json().catch(() => null)
    if (res.ok && data && data.role === 'ADMIN' && data.id && data.email) {
      session.user = { id: data.id, name: data.fullName || '', email: data.email, role: 'ADMIN' }
      try { localStorage.setItem(USER_KEY, JSON.stringify(session.user)) } catch {}
      return true
    }
  } catch {}
  clearSession()
  return false
}

/** JSON request helper: throws an Error carrying the server's message on any non-2xx. */
export async function api<T = any>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init
  const res = await adminFetch(path, json === undefined ? rest : { ...rest, body: JSON.stringify(json) })
  if (!res.ok) throw new Error(await errorMessage(res))
  return res.json() as Promise<T>
}

// ------------------------------------------------------------------ toasts
export interface Toast { id: number; tone: 'success' | 'danger' | 'info'; text: string }
export const toasts = ref<Toast[]>([])
let seq = 0
export function toast(text: string, tone: Toast['tone'] = 'success', ms = 3800) {
  const id = ++seq
  toasts.value = [...toasts.value, { id, tone, text }]
  setTimeout(() => { toasts.value = toasts.value.filter((t) => t.id !== id) }, ms)
}
