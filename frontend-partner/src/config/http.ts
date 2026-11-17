// JSON fetch for extranet views: cookie jar + memory Bearer, never throws on HTTP errors.
import { apiUrl, partnerToken } from './api'

export interface Res<T = any> { ok: boolean; status: number; data: T & { error?: string; code?: string } }

export async function pfetch<T = any>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<Res<T>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const t = partnerToken()
  if (t) headers.Authorization = `Bearer ${t}`
  try {
    const r = await fetch(apiUrl(path), { method: opts.method || 'GET', headers, credentials: 'include', body: opts.body === undefined ? undefined : JSON.stringify(opts.body) })
    const data = await r.json().catch(() => ({}))
    return { ok: r.ok, status: r.status, data }
  } catch {
    return { ok: false, status: 0, data: { error: '네트워크 오류가 발생했습니다.', code: 'NETWORK_ERROR' } as any }
  }
}

export const krw = (v: number | null | undefined) => (typeof v === 'number' ? `${Number(v).toLocaleString('ko-KR')}원` : '-')
export const dt = (s: string | null | undefined) => (s ? String(s).slice(0, 16).replace('T', ' ') : '-')
