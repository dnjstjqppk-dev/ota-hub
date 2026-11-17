import { ref } from 'vue'
import { apiFetch } from '~/composables/useApi'

/**
 * Loads one catalog product from the API. `fallback` is the build-time snapshot entry for the SAME id:
 * TG-15: the first paint is SSR (ISR caches it). Server-side misses 404 and server-side failures 503 — a stale fallback or an error shell must never bake into the edge cache.
 */
export async function useCatalogDetail(apiPath: string, id: string, fallback: Record<string, any> | null = null) {
  const item = ref<any>(fallback)
  const state = ref<'loading' | 'ok' | 'notfound' | 'error'>(fallback ? 'ok' : 'loading')
  const liveOk = ref(false)

  async function load() {
    if (!id) { item.value = null; state.value = 'notfound'; return }
    if (!fallback) state.value = 'loading'
    const r = await apiFetch(`${apiPath}/${encodeURIComponent(id)}`)
    if (r.ok && r.data?.data) { item.value = r.data.data; state.value = 'ok'; liveOk.value = true; return }
    if (r.status === 404) { item.value = null; state.value = 'notfound'; return }
    state.value = fallback ? 'ok' : 'error'
  }

  await useAsyncData(`tg15-detail-${apiPath}-${id}`, () => load())
  if (import.meta.server && !liveOk.value) {
    if (state.value === 'notfound') throw createError({ statusCode: 404, statusMessage: 'Product not found' })
    throw createError({ statusCode: 503, statusMessage: 'Catalog temporarily unavailable' })
  }
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
