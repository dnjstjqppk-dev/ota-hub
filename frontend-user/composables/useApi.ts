export const useApiUrl = (path: string = ''): string => {
  const config = useRuntimeConfig()
  const base = config.public.apiBase || '/api/v1'
  if (!path) return base
  const cleanPath = path.startsWith('/') ? path : `/${path}`
  return `${base}${cleanPath}`
}

export interface ApiResult<T = any> {
  ok: boolean
  status: number
  data: T & { error?: string; code?: string; details?: any }
}

/**
 * #35: the JWT lives in memory only (set at login, gone on reload) and in the
 * server's HttpOnly cookie jar. It is NEVER persisted to localStorage, so a
 * stolen XSS payload cannot exfiltrate a week-long token from storage.
 * Reload-restore flows through the cookie (credentials: 'include' below).
 */
let memoryToken = ''
export const setMemoryToken = (t: string) => { memoryToken = t || '' }

/** Authenticated JSON fetch that never throws on HTTP errors. */
export async function apiFetch<T = any>(path: string, opts: { method?: string; body?: unknown; headers?: Record<string, string> } = {}): Promise<ApiResult<T>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(opts.headers || {}) }
  if (import.meta.client && memoryToken) {
    headers.Authorization = `Bearer ${memoryToken}`
  }
  try {
    const res = await fetch(useApiUrl(path), {
      method: opts.method || 'GET',
      headers,
      credentials: 'include',
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body)
    })
    let data: any = {}
    try { data = await res.json() } catch {}
    return { ok: res.ok, status: res.status, data }
  } catch {
    return { ok: false, status: 0, data: { error: '네트워크 오류가 발생했습니다. 연결을 확인해주세요.', code: 'NETWORK_ERROR' } as any }
  }
}

export const formatKrw = (minor: number | null | undefined) =>
  typeof minor === 'number' ? `${minor.toLocaleString('ko-KR')}원` : '-'

// Mirrors worker money.decimalsOf: KRW/JPY have no minor subunit, the rest use 2.
export const formatMinor = (minor: number | null | undefined, currency: string) => {
  if (typeof minor !== 'number') return '-'
  const d = currency === 'KRW' || currency === 'JPY' ? 0 : 2
  return `${(minor / 10 ** d).toLocaleString('ko-KR', { minimumFractionDigits: d, maximumFractionDigits: d })} ${currency}`
}
