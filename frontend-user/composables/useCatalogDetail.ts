import { ref, onMounted } from 'vue'
import { apiFetch } from '~/composables/useApi'

/**
 * Loads one catalog product from the API. `fallback` is the build-time snapshot entry for the SAME id:
 * it paints synchronously for prerendered SEO and is replaced by the live row on mount. A live 404 (delisted since the snapshot) clears it; an unknown id still renders "not found".
 */
export function useCatalogDetail(apiPath: string, id: string, fallback: Record<string, any> | null = null) {
  const item = ref<any>(fallback)
  const state = ref<'loading' | 'ok' | 'notfound' | 'error'>(fallback ? 'ok' : 'loading')

  async function load() {
    if (!id) { item.value = null; state.value = 'notfound'; return }
    if (!fallback) state.value = 'loading'
    const r = await apiFetch(`${apiPath}/${encodeURIComponent(id)}`)
    if (r.ok && r.data?.data) { item.value = r.data.data; state.value = 'ok'; return }
    if (r.status === 404) { item.value = null; state.value = 'notfound'; return }
    state.value = fallback ? 'ok' : 'error'
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
