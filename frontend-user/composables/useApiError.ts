/**
 * GAP-01: localized API errors. Server responses carry a stable `code`; map it
 * to errors.<CODE> and fall back to a caller-supplied generic key — never the
 * Korean server string, so every locale stays consistent.
 */
export function useApiError() {
  const { t, te } = useI18n()
  return (r: { data?: any }, fallbackKey: string): string => {
    const code = r?.data?.code
    if (typeof code === 'string' && code && te(`errors.${code}`)) return t(`errors.${code}`) as string
    return t(fallbackKey) as string
  }
}
