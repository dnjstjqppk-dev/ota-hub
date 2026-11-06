import { reactive, ref } from 'vue'
import { adminFetch } from '../config/api'
import { errorMessage } from './format'

const TOKEN_KEY = 'getfortrip_admin_token'
const USER_KEY = 'getfortrip_admin_user'

export interface AdminUser { id: string; name: string; email: string; role: string }

function readUser(): AdminUser | null {
  try {
    const u = JSON.parse(localStorage.getItem(USER_KEY) || 'null')
    return u && u.id && u.email ? u : null
  } catch { return null }
}

/** Signed-in admin as returned by the login API — never a placeholder identity. */
export const session = reactive<{ user: AdminUser | null }>({ user: readUser() })

export function saveSession(token: string, user: AdminUser) {
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(USER_KEY, JSON.stringify(user))
  session.user = user
}
export function clearSession() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
  session.user = null
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
