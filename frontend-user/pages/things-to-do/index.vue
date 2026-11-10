<script setup lang="ts">
/**
 * Tours, tickets & experiences (design system "Horizon"). URL = state (keyword, category, filters, sort).
 * API only. Ratings are supplier-provided and labelled as such; prices are per person.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useCurrencyStore } from '~/stores/currency'
import { useApiUrl } from '~/composables/useApi'
import { qOneOf, qStr, useUrlQuery } from '~/composables/useUrlQuery'

const { route, patch, isSelf } = useUrlQuery()
const currency = useCurrencyStore()

const SORTS = [{ id: 'recommended', label: '추천순' }, { id: 'price_asc', label: '낮은 가격순' }, { id: 'rating_desc', label: '평점 높은순' }] as const
const CATEGORY_KO: Record<string, string> = { THEME_PARK: '테마파크', DAY_TOUR: '일일 투어', DOCENT_TOUR: '해설 투어', TICKET: '입장권', EXPERIENCE: '체험', CRUISE: '크루즈', SHOW: '공연', ESIM: 'eSIM·데이터' }

const q = computed(() => {
  const r = route.query
  return {
    text: qStr(r.q || r.city || r.query), category: qStr(r.category),
    instant: qStr(r.instant) === 'true', freeCancel: qStr(r.freeCancel) === 'true',
    sort: qOneOf(r.sortBy, SORTS.map((s) => s.id), 'recommended')
  }
})
const draft = ref('')
watch(() => q.value.text, (v) => { draft.value = v }, { immediate: true })
function submit() { patch({ q: draft.value.trim(), city: '', query: '' }) }

const items = ref<any[]>([])
const categories = ref<string[]>([])
const state = ref<'loading' | 'ready' | 'error'>('loading')
let ctrl: AbortController | null = null
async function load() {
  ctrl?.abort(); ctrl = new AbortController(); const mine = ctrl
  const x = q.value
  state.value = 'loading'
  const timer = setTimeout(() => mine.abort(), 10000)
  try {
    const p = new URLSearchParams({ sortBy: x.sort, limit: '100' })
    if (x.text) p.set('q', x.text)
    if (x.category) p.set('category', x.category)
    if (x.instant) p.set('instantOnly', 'true')
    if (x.freeCancel) p.set('freeCancelOnly', 'true')
    const res = await fetch(`${useApiUrl('/activities')}?${p}`, { signal: mine.signal })
    if (!res.ok) throw new Error(String(res.status))
    const j = await res.json()
    if (mine !== ctrl) return
    items.value = Array.isArray(j.data) ? j.data : []
    // Category chips come from what is actually on sale (never from a fixed list of empty categories).
    if (!x.category) categories.value = [...new Set(items.value.map((a) => a.category).filter(Boolean))] as string[]
    state.value = 'ready'
  } catch { if (mine === ctrl) state.value = 'error' } finally { clearTimeout(timer) }
}
const activeCount = computed(() => (q.value.category ? 1 : 0) + (q.value.instant ? 1 : 0) + (q.value.freeCancel ? 1 : 0))
const RESET = { category: '', instant: '', freeCancel: '' }

watch(() => route.fullPath, () => { if (isSelf()) load() })
onMounted(load)
onBeforeUnmount(() => ctrl?.abort())
useHead(() => ({
  title: q.value.text ? `${q.value.text} 투어·티켓` : '투어·티켓·체험',
  meta: [{ name: 'description', content: '테마파크 입장권, 현지 투어, 체험 상품을 비교하고 예약하세요.' }]
}))
</script>

<template>
  <div class="pb-24 lg:pb-16">
    <section class="relative overflow-hidden border-b border-line bg-gradient-to-b from-sapphire-50 to-canvas">
      <div class="mx-auto max-w-7xl px-4 pb-6 pt-8 lg:px-6 lg:pt-12">
        <nav class="mb-2 flex items-center gap-1 text-xs text-ink-subtle" aria-label="이동 경로"><NuxtLink to="/" class="hover:text-ink">홈</NuxtLink><AppIcon name="chevron-right" :size="12" /><span>투어·티켓</span></nav>
        <h1 class="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">여행지에서 할 일을 찾아보세요</h1>
        <form class="mt-5 flex max-w-2xl gap-2" role="search" novalidate @submit.prevent="submit">
          <div class="field-box flex-1"><label for="td-q" class="field-label">도시·명소·상품</label><SearchAutocomplete v-model="draft" input-id="td-q" domain="things-to-do" variant="bare" placeholder="예: 도쿄, 디즈니랜드, 루브르" @enter="submit" /></div>
          <button type="submit" class="btn-primary min-h-[52px] rounded-2xl px-6 text-base"><AppIcon name="search" :size="18" /><span class="hidden sm:inline">검색</span></button>
        </form>
      </div>
    </section>

    <div class="mx-auto max-w-7xl px-4 lg:px-6">
      <div class="flex flex-wrap items-end justify-between gap-3 pb-3 pt-6">
        <h2 class="text-xl font-bold tracking-tight text-ink">{{ q.text ? `‘${q.text}’ 검색 결과` : '모든 투어·티켓' }} <span v-if="state === 'ready'" class="ml-1 text-base font-semibold text-ink-subtle tabular">{{ items.length }}개</span></h2>
        <label class="flex items-center gap-2 text-sm text-ink-muted">
          <span class="hidden sm:inline">정렬</span>
          <select :value="q.sort" class="rounded-xl border border-line bg-surface py-2 pl-3 pr-8 text-sm font-semibold text-ink focus:border-primary focus:outline-none" @change="patch({ sortBy: ($event.target as HTMLSelectElement).value === 'recommended' ? '' : ($event.target as HTMLSelectElement).value })">
            <option v-for="s in SORTS" :key="s.id" :value="s.id">{{ s.label }}</option>
          </select>
        </label>
      </div>

      <div class="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <button type="button" class="chip" :aria-pressed="!q.category" @click="patch({ category: '' })">전체</button>
        <button v-for="c in categories" :key="c" type="button" class="chip" :aria-pressed="q.category === c" @click="patch({ category: q.category === c ? '' : c })">{{ CATEGORY_KO[c] || c }}</button>
        <span class="mx-1 w-px shrink-0 bg-line" aria-hidden="true" />
        <button type="button" class="chip" :aria-pressed="q.instant" @click="patch({ instant: q.instant ? '' : 'true' })"><AppIcon name="bolt" :size="14" />즉시 확정</button>
        <button type="button" class="chip" :aria-pressed="q.freeCancel" @click="patch({ freeCancel: q.freeCancel ? '' : 'true' })">무료 취소</button>
      </div>

      <ResultsState :state="state" :count="items.length" icon="ticket" :empty-title="q.text ? `‘${q.text}’에 맞는 상품이 없어요` : '조건에 맞는 상품이 없어요'" empty-hint="도시 이름으로 검색하거나 필터를 줄여 보세요." error-title="상품을 불러오지 못했어요" @retry="load">
        <template #empty-actions>
          <button v-if="activeCount" type="button" class="btn-primary" @click="patch(RESET)">필터 초기화</button>
          <button v-if="q.text" type="button" class="btn-secondary" @click="patch({ q: '', city: '', query: '' })">모든 상품 보기</button>
        </template>
        <ul class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <li v-for="a in items" :key="a.id">
            <article class="card group relative flex h-full flex-col overflow-hidden transition-shadow hover:shadow-pop">
              <SmartImg :src="a.thumbnail_url || a.image_url" :alt="a.title" icon="ticket" img-class="aspect-[4/3] w-full object-cover transition-transform duration-500 group-hover:scale-105" />
              <div class="flex flex-1 flex-col p-4">
                <p class="text-xs text-ink-subtle">{{ [a.city, CATEGORY_KO[a.category] || a.category].filter(Boolean).join(' · ') }}</p>
                <h3 class="mt-1 line-clamp-2 text-sm font-bold leading-snug text-ink"><NuxtLink :to="`/things-to-do/detail/${a.id}`" class="after:absolute after:inset-0 group-hover:text-primary">{{ a.title }}</NuxtLink></h3>
                <p v-if="Number(a.review_score) > 0" class="mt-1.5 flex items-center gap-1 text-xs text-ink-muted">
                  <AppIcon name="star" :size="12" stroke="0" class="fill-current text-warning" /><b class="text-ink tabular">{{ Number(a.review_score).toFixed(1) }}</b>
                  <span v-if="a.review_count" class="tabular">(인증 후기 {{ Number(a.review_count).toLocaleString('ko-KR') }})</span>
                </p>
                <p v-else class="mt-1.5 text-2xs font-semibold text-ink-subtle">신규</p>
                <ul class="mt-2 flex flex-wrap gap-x-2.5 gap-y-1 text-2xs font-semibold">
                  <li v-if="Number(a.instant_confirmation)" class="flex items-center gap-0.5 text-success"><AppIcon name="bolt" :size="12" />즉시 확정</li>
                  <li v-if="Number(a.free_cancellation)" class="flex items-center gap-0.5 text-success"><AppIcon name="check" :size="12" />무료 취소</li>
                </ul>
                <div class="mt-auto flex items-end justify-between pt-3">
                  <span v-if="a.bookable === false" class="text-xs font-semibold text-warning">직접 예약 불가</span>
                  <p v-if="Number(a.price_krw) > 0" class="ml-auto text-base font-extrabold text-ink tabular">{{ currency.formatKRW(Number(a.price_krw)) }}<span class="text-xs font-medium text-ink-subtle"> /1인</span></p>
                </div>
              </div>
            </article>
          </li>
        </ul>
      </ResultsState>
      <p class="mt-4 text-xs text-ink-subtle">평점은 공급사가 제공한 값이에요.</p>
    </div>
  </div>
</template>
