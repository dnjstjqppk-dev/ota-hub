import { ref, onMounted } from 'vue'
import { apiFetch } from '~/composables/useApi'

/**
 * Loads one catalog product from the API. There is deliberately no fallback product:
 * an unknown id renders "not found", never a different (default) product that could be booked by mistake.
 */
export function useCatalogDetail(apiPath: string, id: string) {
  const item = ref<any>(null)
  const state = ref<'loading' | 'ok' | 'notfound' | 'error'>('loading')

  async function load() {
    if (!id) { state.value = 'notfound'; return }
    state.value = 'loading'
    const r = await apiFetch(`${apiPath}/${encodeURIComponent(id)}`)
    if (r.ok && r.data?.data) { item.value = r.data.data; state.value = 'ok'; return }
    state.value = r.status === 404 ? 'notfound' : 'error'
  }

  onMounted(load)
  return { item, state, reload: load }
}

/** JSON-LD script entry with "<" escaped so catalog text can never close the script tag. */
export function jsonLdScript(data: Record<string, unknown>) {
  return { type: 'application/ld+json' as const, innerHTML: JSON.stringify(data).replace(/</g, '\\u003c') }
}

export const BOOKABLE_REASON_KO: Record<string, string> = {
  SUPPLIER_NOT_REGISTERED: '공급사 정보가 등록되지 않은 상품입니다.',
  EXTERNAL_LINK_ONLY: '제휴사 사이트에서 예약하는 상품입니다.',
  SUPPLIER_BLOCKED: '현재 판매가 중지된 상품입니다.',
  SUPPLIER_NOT_INTEGRATED: '공급사 연동 전이라 아직 직접 예약할 수 없습니다.'
}
