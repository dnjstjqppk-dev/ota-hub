export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ||
  (typeof window !== 'undefined' && (window.location.host.startsWith('ota-admin') || window.location.host.startsWith('admin.'))
    ? 'https://ota-hub.dnjstjqppk.workers.dev/api/v1'
    : (typeof window !== 'undefined' && window.location.origin.includes('localhost')
      ? 'http://localhost:8787/api/v1'
      : '/api/v1'))

export const apiUrl = (path: string = ''): string => {
  if (!path) return API_BASE_URL
  const cleanPath = path.startsWith('/') ? path : `/${path}`
  return `${API_BASE_URL}${cleanPath}`
}

// #35: the JWT lives in memory only (gone on reload) and in the server's
// HttpOnly admin jar. It is NEVER written to localStorage: reload-restore
// flows through the cookie (credentials: 'include' below).
let memoryToken: string | null = null
export const setAdminMemoryToken = (t: string | null) => { memoryToken = t || null }
export const adminMemoryToken = (): string | null => memoryToken
export const clearAdminMemoryToken = () => { memoryToken = null }

export async function adminFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const headers = new Headers(options.headers || {})
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json')
  }
  if (memoryToken) {
    headers.set('Authorization', `Bearer ${memoryToken}`)
  }
  const res = await fetch(apiUrl(path), {
    credentials: 'include',
    ...options,
    headers
  })
  if (res.status === 401 || res.status === 403) {
    if (typeof window !== 'undefined' && !window.location.pathname.endsWith('/login')) {
      clearAdminMemoryToken()
      localStorage.removeItem('getfortrip_admin_token')
      localStorage.removeItem('getfortrip_admin_user')
      const loginPath = window.location.pathname.startsWith('/admin') ? '/admin/login' : '/login'
      window.location.href = loginPath
    }
  }
  return res
}
