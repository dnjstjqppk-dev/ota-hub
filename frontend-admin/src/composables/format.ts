/** Display helpers shared by every admin view. Values come straight from the API; nothing is invented here. */

export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger'

export const krw = (n: unknown) => {
  const v = Number(n)
  return Number.isFinite(v) ? `₩${Math.round(v).toLocaleString('ko-KR')}` : '—'
}
export const num = (n: unknown) => {
  const v = Number(n)
  return Number.isFinite(v) ? v.toLocaleString('ko-KR') : '—'
}
export function dateTime(s: unknown): string {
  if (!s) return '—'
  const d = new Date(String(s).includes('T') || String(s).endsWith('Z') ? String(s) : `${String(s).replace(' ', 'T')}Z`)
  if (Number.isNaN(d.getTime())) return String(s)
  return d.toLocaleString('ko-KR', { year: '2-digit', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
}
export function dateOnly(s: unknown): string {
  if (!s) return '—'
  return String(s).slice(0, 10)
}

/** Booking state machine labels (worker/src/domain/state-machine.ts). */
export const BOOKING_STATUS: Record<string, { label: string; tone: Tone }> = {
  AWAITING_PAYMENT: { label: '결제 대기', tone: 'neutral' },
  PAYMENT_PROCESSING: { label: '결제 처리 중', tone: 'info' },
  PAYMENT_AUTHORIZED: { label: '결제 승인', tone: 'info' },
  SUPPLIER_BOOKING_PENDING: { label: '공급사 확정 대기', tone: 'warning' },
  SUPPLIER_CONFIRMED: { label: '공급사 확정', tone: 'info' },
  TICKETING_PENDING: { label: '발권 대기', tone: 'warning' },
  TICKETED: { label: '발권 완료', tone: 'success' },
  VOUCHER_ISSUED: { label: '바우처 발급', tone: 'success' },
  COMPLETED: { label: '이용 완료', tone: 'success' },
  CANCELLATION_REQUESTED: { label: '취소 요청', tone: 'warning' },
  REFUND_PENDING: { label: '환불 진행 중', tone: 'warning' },
  REFUNDED: { label: '환불 완료', tone: 'neutral' },
  CANCELLED: { label: '취소', tone: 'neutral' },
  EXPIRED: { label: '결제 기한 만료', tone: 'neutral' },
  FAILED: { label: '실패', tone: 'danger' },
  MANUAL_REVIEW_REQUIRED: { label: '수동 검토 필요', tone: 'danger' }
}
export const bookingStatus = (s: string) => BOOKING_STATUS[s] || { label: s || '—', tone: 'neutral' as Tone }

export const DOMAIN_LABEL: Record<string, string> = {
  HOTEL: '호텔', FLIGHT: '항공', TRAIN: '기차', CAR: '렌터카', TRANSFER: '공항 이동', ACTIVITY: '투어·티켓', PACKAGE: '패키지'
}
export const domainLabel = (d: string) => DOMAIN_LABEL[String(d || '').toUpperCase()] || d || '—'

export const PARTNER_STATUS: Record<string, { label: string; tone: Tone }> = {
  PENDING_APPROVAL: { label: '승인 대기', tone: 'warning' },
  ACTIVE: { label: '활성', tone: 'success' },
  SUSPENDED: { label: '정지', tone: 'danger' },
  REJECTED: { label: '반려', tone: 'neutral' }
}
export const partnerStatus = (s: string) => PARTNER_STATUS[s] || { label: s || '—', tone: 'neutral' as Tone }

/** API error body → readable message. */
export async function errorMessage(res: Response, fallback = '요청을 처리하지 못했어요.'): Promise<string> {
  try {
    const j = await res.clone().json()
    return j.error?.message || j.message || (typeof j.error === 'string' ? j.error : '') || fallback
  } catch {
    return `${fallback} (HTTP ${res.status})`
  }
}
