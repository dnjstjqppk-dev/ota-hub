/**
 * Company / CPO facts for legal surfaces (footer, privacy policy).
 * Values come from NUXT_PUBLIC_COMPANY_* env via runtimeConfig — the UI never
 * invents them. Missing values render as "준비 중" and fail the pre-deploy
 * commercialization check (Phase 7), so launch cannot ship a blank footer.
 *
 * Phase 1: mail-order business only. Travel-business registration and
 * guarantee-insurance numbers are not displayed (no such filing exists).
 */
export interface CompanyInfo {
  name: string
  ceo: string
  address: string
  bizNo: string
  mailOrderNo: string
  csPhone: string
  csHours: string
  cpoName: string
  cpoDept: string
  cpoPhone: string
  cpoEmail: string
  hosting: string
}

export function useCompany(): CompanyInfo & { orPending: (v: string) => string } {
  const config = useRuntimeConfig()
  const { t } = useI18n()
  const c = (config.public as any).company || {}
  const get = (k: string, fallback = ''): string => (typeof c[k] === 'string' && c[k] ? c[k] : fallback)
  return {
    name: get('name'),
    ceo: get('ceo'),
    address: get('address'),
    bizNo: get('bizNo'),
    mailOrderNo: get('mailOrderNo'),
    csPhone: get('csPhone'),
    csHours: get('csHours'),
    cpoName: get('cpoName'),
    cpoDept: get('cpoDept'),
    cpoPhone: get('cpoPhone'),
    cpoEmail: get('cpoEmail'),
    hosting: get('hosting', 'Cloudflare'),
    orPending: (v: string) => (v ? v : t('common.pending'))
  }
}
