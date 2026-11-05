<script setup lang="ts">
/**
 * Train results (design system "Horizon"). URL = state (stations, date, passengers, filters, sort).
 * API only — no client fallback timetable. Prices are per person, one way (server: PER_PERSON line).
 */
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useCurrencyStore } from '~/stores/currency'
import { useApiUrl } from '~/composables/useApi'
import { fmtDay, qDate, qInt, qOneOf, qStr, todayIso, useUrlQuery } from '~/composables/useUrlQuery'

const { route, router, patch, isSelf } = useUrlQuery()
const currency = useCurrencyStore()

const SORTS = [{ id: 'departure', label: '출발 시간순' }, { id: 'price', label: '낮은 가격순' }, { id: 'duration', label: '짧은 소요시간순' }] as const
const q = computed(() => {
  const r = route.query
  return {
    dep: qStr(r.dep), arr: qStr(r.arr), date: qDate(r.date),
    adults: qInt(r.adults, 1, 1, 9), children: qInt(r.children, 0, 0, 8),
    type: qStr(r.type), seat: qStr(r.seat),
    sort: qOneOf(r.sortBy, SORTS.map((s) => s.id), 'departure')
  }
})

const today = ref('')
const draft = reactive({ dep: '', arr: '', date: '', adults: 1, children: 0 })
const formOpen = ref(false)
const formError = ref('')
function syncDraft() { const x = q.value; Object.assign(draft, { dep: x.dep, arr: x.arr, date: x.date, adults: x.adults, children: x.children }) }
syncDraft()
function swap() { const t = draft.dep; draft.dep = draft.arr; draft.arr = t }
function submit() {
  formError.value = ''
  if (!draft.dep.trim() || !draft.arr.trim()) { formError.value = '출발역과 도착역을 입력해 주세요.'; return }
  if (draft.dep.trim() === draft.arr.trim()) { formError.value = '출발역과 도착역이 같아요.'; return }
  formOpen.value = false
  router.replace({ query: { dep: draft.dep.trim(), arr: draft.arr.trim(), ...(draft.date ? { date: draft.date } : {}), ...(draft.adults !== 1 ? { adults: String(draft.adults) } : {}), ...(draft.children ? { children: String(draft.children) } : {}) } })
}

const items = ref<any[]>([])
const state = ref<'loading' | 'ready' | 'error'>('loading')
let ctrl: AbortController | null = null
async function load() {
  ctrl?.abort(); ctrl = new AbortController(); const mine = ctrl
  const x = q.value
  state.value = 'loading'
  const timer = setTimeout(() => mine.abort(), 10000)
  try {
    const p = new URLSearchParams({ sortBy: 'departure_asc' })
    if (x.dep) p.set('dep', x.dep)
    if (x.arr) p.set('arr', x.arr)
    const res = await fetch(`${useApiUrl('/trains')}?${p}`, { signal: mine.signal })
    if (!res.ok) throw new Error(String(res.status))
    const j = await res.json()
    if (mine !== ctrl) return
    items.value = Array.isArray(j.data) ? j.data : []
    state.value = 'ready'
  } catch { if (mine === ctrl) state.value = 'error' } finally { clearTimeout(timer) }
}

const types = computed(() => [...new Set(items.value.map((t) => t.train_type).filter(Boolean))] as string[])
const seats = computed(() => [...new Set(items.value.map((t) => t.seat_class).filter(Boolean))] as string[])
const filtered = computed(() => {
  const x = q.value
  const list = items.value.filter((t) => (!x.type || t.train_type === x.type) && (!x.seat || t.seat_class === x.seat))
  const by = { departure: (a: any, b: any) => String(a.departure_time).localeCompare(String(b.departure_time)), price: (a: any, b: any) => a.price_krw - b.price_krw, duration: (a: any, b: any) => a.duration_minutes - b.duration_minutes }[x.sort]
  return [...list].sort(by)
})
const activeCount = computed(() => (q.value.type ? 1 : 0) + (q.value.seat ? 1 : 0))
const RESET = { type: '', seat: '' }

const pax = computed(() => q.value.adults + q.value.children)
const hm = (m: number) => `${Math.floor(m / 60)}시간${m % 60 ? ` ${m % 60}분` : ''}`
function paxQuery() { const x = q.value; return { adults: String(x.adults), ...(x.children ? { children: String(x.children) } : {}) } }
function detailLink(t: any) { return { path: `/trains/detail/${t.id}`, query: { ...(q.value.date ? { startDate: q.value.date } : {}), ...paxQuery() } } }
function book(t: any) { router.push({ path: '/checkout', query: { domain: 'TRAIN', itemId: t.id, startDate: q.value.date, ...paxQuery() } }) }

const sheet = ref(false)
watch(() => route.fullPath, () => { if (isSelf()) syncDraft() })
watch(() => [q.value.dep, q.value.arr], () => { if (isSelf()) load() })
onMounted(() => { today.value = todayIso(); load() })
onBeforeUnmount(() => ctrl?.abort())
useHead(() => ({ title: q.value.dep && q.value.arr ? `${q.value.dep}→${q.value.arr} 기차표` : '기차표 검색' }))
</script>

<template>
  <div class="pb-24 lg:pb-16">
    <section class="border-b border-line bg-surface">
      <div class="mx-auto max-w-7xl px-4 py-3 lg:px-6 lg:py-4">
        <button v-if="!formOpen" type="button" class="flex w-full items-center gap-3 rounded-2xl border border-line bg-canvas px-4 py-2.5 text-left lg:hidden" @click="formOpen = true">
          <AppIcon name="train" class="text-ink-subtle" />
          <span class="min-w-0 flex-1">
            <span class="block truncate font-bold text-ink">{{ q.dep && q.arr ? `${q.dep} → ${q.arr}` : '어디로 가세요?' }}</span>
            <span class="block truncate text-xs text-ink-muted">{{ q.date ? fmtDay(q.date) : '날짜 미정' }} · {{ pax }}명</span>
          </span>
          <span class="text-sm font-semibold text-primary">변경</span>
        </button>
        <form :class="['lg:block', formOpen ? 'block' : 'hidden']" novalidate @submit.prevent="submit">
          <div class="grid gap-2 lg:grid-cols-[1fr_auto_1fr_1fr_0.9fr_auto] lg:items-stretch">
            <div class="field-box"><label for="ts-dep" class="field-label">출발역</label><SearchAutocomplete v-model="draft.dep" input-id="ts-dep" domain="trains" variant="bare" placeholder="예: 서울역" /></div>
            <button type="button" class="z-10 mx-auto -my-4 flex h-10 w-10 rotate-90 items-center justify-center self-center rounded-full border border-line bg-surface text-ink-muted hover:text-primary lg:my-0 lg:rotate-0" aria-label="출발역과 도착역 바꾸기" @click="swap"><AppIcon name="swap" :size="18" /></button>
            <div class="field-box"><label for="ts-arr" class="field-label">도착역</label><SearchAutocomplete v-model="draft.arr" input-id="ts-arr" domain="trains" variant="bare" placeholder="예: 부산역" /></div>
            <DateRangePicker v-model:start="draft.date" mode="single" start-label="탑승일" :min="today" compact />
            <GuestPicker v-model:adults="draft.adults" v-model:children="draft.children" :show-rooms="false" label="승객" compact />
            <div class="flex gap-2">
              <button v-if="formOpen" type="button" class="btn-secondary lg:hidden" @click="formOpen = false; syncDraft()">취소</button>
              <button type="submit" class="btn-primary min-h-[52px] flex-1 rounded-2xl px-7 text-base"><AppIcon name="search" :size="18" />검색</button>
            </div>
          </div>
          <p v-if="formError" class="mt-2 text-sm font-medium text-danger" role="alert">{{ formError }}</p>
        </form>
      </div>
    </section>

    <div class="mx-auto max-w-7xl px-4 lg:px-6">
      <div class="flex flex-wrap items-end justify-between gap-3 pb-3 pt-6">
        <div>
          <nav class="mb-1 flex items-center gap-1 text-xs text-ink-subtle" aria-label="이동 경로"><NuxtLink to="/" class="hover:text-ink">홈</NuxtLink><AppIcon name="chevron-right" :size="12" /><NuxtLink to="/trains" class="hover:text-ink">기차</NuxtLink></nav>
          <h1 class="text-xl font-bold tracking-tight text-ink sm:text-2xl">{{ q.dep && q.arr ? `${q.dep} → ${q.arr}` : '모든 열차' }} <span v-if="state === 'ready'" class="ml-1 text-base font-semibold text-ink-subtle tabular">{{ filtered.length }}편</span></h1>
          <p v-if="q.date" class="mt-0.5 text-sm text-ink-muted">{{ fmtDay(q.date, true) }} 탑승</p>
        </div>
        <label class="flex items-center gap-2 text-sm text-ink-muted">
          <span class="hidden sm:inline">정렬</span>
          <select :value="q.sort" class="rounded-xl border border-line bg-surface py-2 pl-3 pr-8 text-sm font-semibold text-ink focus:border-primary focus:outline-none" @change="patch({ sortBy: ($event.target as HTMLSelectElement).value === 'departure' ? '' : ($event.target as HTMLSelectElement).value })">
            <option v-for="s in SORTS" :key="s.id" :value="s.id">{{ s.label }}</option>
          </select>
        </label>
      </div>

      <div v-if="types.length > 1 || seats.length > 1" class="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:hidden [&::-webkit-scrollbar]:hidden">
        <button type="button" class="chip" :aria-pressed="activeCount > 0" @click="sheet = true"><AppIcon name="menu" :size="16" />필터<span v-if="activeCount" class="flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-primary px-1 text-2xs text-primary-ink">{{ activeCount }}</span></button>
        <button v-for="t in types" :key="t" type="button" class="chip" :aria-pressed="q.type === t" @click="patch({ type: q.type === t ? '' : t })">{{ t }}</button>
      </div>

      <div class="grid gap-6 lg:grid-cols-[272px_1fr]">
        <aside class="hidden lg:block" aria-label="필터">
          <div class="card sticky top-24 space-y-6 p-5">
            <div class="flex items-center justify-between"><h2 class="font-bold text-ink">필터</h2><button v-if="activeCount" type="button" class="text-sm font-semibold text-primary hover:underline" @click="patch(RESET)">초기화</button></div>
            <TrainFilterPanel :q="q" :types="types" :seats="seats" @patch="patch" />
          </div>
        </aside>

        <div class="min-w-0">
          <p class="mb-3 flex items-start gap-1.5 text-xs text-ink-subtle"><AppIcon name="check" :size="14" class="mt-px" />표시 요금은 1인 편도 참고가예요. 아동도 성인과 같은 요금이 적용되며, 최종 금액은 결제 전 확인 화면에서 확정돼요.</p>
          <ResultsState :state="state" :count="filtered.length" icon="train" empty-title="조건에 맞는 열차가 없어요" empty-hint="역 이름을 확인하거나 필터를 줄여 보세요. 예: 서울역 → 부산역" error-title="열차 정보를 불러오지 못했어요" @retry="load">
            <template #empty-actions><button v-if="activeCount" type="button" class="btn-primary" @click="patch(RESET)">필터 초기화</button></template>
            <ul class="space-y-3">
              <li v-for="t in filtered" :key="t.id">
                <article class="card flex flex-col gap-4 p-4 transition-shadow hover:shadow-pop sm:p-5 md:flex-row md:items-center">
                  <div class="grid min-w-0 flex-1 grid-cols-[auto_1fr_auto] items-center gap-3 sm:gap-5">
                    <div><p class="text-lg font-bold text-ink tabular">{{ t.departure_time }}</p><p class="max-w-[8rem] truncate text-xs font-semibold text-ink-muted">{{ t.departure_station }}</p></div>
                    <div class="text-center"><p class="text-xs text-ink-subtle">{{ hm(Number(t.duration_minutes)) }}</p><div class="relative my-1 h-px bg-line-strong"><span class="absolute -top-1 right-0 h-2 w-2 rounded-full bg-primary" /></div></div>
                    <div class="text-right"><p class="text-lg font-bold text-ink tabular">{{ t.arrival_time }}</p><p class="max-w-[8rem] truncate text-xs font-semibold text-ink-muted">{{ t.arrival_station }}</p></div>
                  </div>
                  <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted md:w-48 md:flex-col md:items-start">
                    <span class="font-semibold text-ink">{{ t.train_type }} <span class="font-normal text-ink-subtle">{{ t.train_number }}</span></span>
                    <span>{{ t.seat_class }}</span>
                    <span v-if="Number(t.available_seats) > 0 && Number(t.available_seats) <= 10" class="font-semibold text-warning">잔여 {{ t.available_seats }}석</span>
                  </div>
                  <div class="flex items-center justify-between gap-3 border-t border-line pt-3 md:flex-col md:items-end md:border-0 md:pt-0">
                    <div class="md:text-right"><p class="text-xl font-extrabold text-ink tabular">{{ currency.formatKRW(t.price_krw) }}</p><p class="text-2xs text-ink-subtle">1인 편도 참고가</p></div>
                    <div class="flex gap-2">
                      <NuxtLink :to="detailLink(t)" class="btn-secondary px-3.5">상세</NuxtLink>
                      <button v-if="t.bookable !== false && q.date" type="button" class="btn-primary" @click="book(t)">선택</button>
                      <NuxtLink v-else-if="t.bookable !== false" :to="detailLink(t)" class="btn-primary">날짜 선택</NuxtLink>
                    </div>
                  </div>
                </article>
              </li>
            </ul>
          </ResultsState>
        </div>
      </div>
    </div>

    <FilterSheet :open="sheet" :apply-label="`열차 ${filtered.length}편 보기`" @close="sheet = false" @reset="patch(RESET)">
      <TrainFilterPanel :q="q" :types="types" :seats="seats" @patch="patch" />
    </FilterSheet>
  </div>
</template>
