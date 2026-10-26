export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1'

export const apiUrl = (path: string = ''): string => {
  if (!path) return API_BASE_URL
  const cleanPath = path.startsWith('/') ? path : `/${path}`
  return `${API_BASE_URL}${cleanPath}`
}

export async function adminFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('getfortrip_admin_token') : null
  const headers = new Headers(options.headers || {})
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json')
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }
  const res = await fetch(apiUrl(path), {
    ...options,
    headers
  })
  if (res.status === 401 || res.status === 403) {
    if (typeof window !== 'undefined' && !window.location.pathname.endsWith('/login')) {
      localStorage.removeItem('getfortrip_admin_token')
      localStorage.removeItem('getfortrip_admin_user')
      window.location.href = '/admin/login'
    }
  }
  return res
}
