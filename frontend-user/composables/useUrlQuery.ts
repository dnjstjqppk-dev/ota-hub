import { useRoute, useRouter } from 'vue-router'

/**
 * Helpers for pages whose state lives in the URL query (search results, detail pages).
 * Parsers never throw and clamp to safe ranges; `patch` merges a change and drops empty values
 * so links stay short and shareable.
 */
export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export function qStr(v: unknown): string {
  return typeof v === 'string' ? v.trim() : Array.isArray(v) ? String(v[0] ?? '').trim() : ''
}
export function qInt(v: unknown, d: number, lo: number, hi: number): number {
  const n = parseInt(qStr(v), 10)
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d
}
export function qDate(v: unknown): string {
  const s = qStr(v)
  if (!ISO_DATE.test(s)) return ''
  const t = Date.parse(`${s}T00:00:00Z`)
  return Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== s ? '' : s
}
export function qOneOf<T extends string>(v: unknown, allowed: readonly T[], d: T): T {
  const s = qStr(v) as T
  return allowed.includes(s) ? s : d
}

export function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
export function addDaysIso(s: string, n: number): string {
  const [y, m, d] = s.split('-').map(Number)
  const dt = new Date(y, m - 1, d + n)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000)
}
const WEEK = ['일', '월', '화', '수', '목', '금', '토']
export function fmtDay(s: string, long = false): string {
  if (!s) return ''
  const [y, m, d] = s.split('-').map(Number)
  const w = WEEK[new Date(y, m - 1, d).getDay()]
  return long ? `${m}월 ${d}일 (${w})` : `${m}.${String(d).padStart(2, '0')}(${w})`
}

export function useUrlQuery() {
  const route = useRoute()
  const router = useRouter()
  const selfPath = route.path

  /** Merge `change` into the current query; '', null, undefined and false remove the key. */
  function patch(change: Record<string, string | number | boolean | null | undefined>, mode: 'replace' | 'push' = 'replace') {
    if (route.path !== selfPath) return
    const next: Record<string, string> = {}
    for (const [k, v] of Object.entries(route.query)) { const s = qStr(v); if (s) next[k] = s }
    for (const [k, v] of Object.entries(change)) {
      if (v === '' || v === null || v === undefined || v === false) delete next[k]
      else next[k] = String(v)
    }
    router[mode]({ query: next })
  }
  /** True while this page (not the one being navigated to) owns the route. */
  const isSelf = () => route.path === selfPath
  return { route, router, patch, isSelf }
}
