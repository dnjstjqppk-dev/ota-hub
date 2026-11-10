<script setup lang="ts">
/**
 * Flight results (design system "Horizon").
 * URL = state: origin, dest, date, returnDate (round trip when present), passengers, filters, sort and
 * the chosen outbound flight (`out`). Results come only from the API — no client fallback catalogue and
 * no invented date-strip prices. Return options are limited to what checkout accepts: same supplier,
 * exact reverse route (worker/src/domain/pricing.ts computeRoundTripQuote).
 */
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useCurrencyStore } from '~/stores/currency'
import { useApiUrl } from '~/composables/useApi'
import { addDaysIso, daysBetween, fmtDay, qDate, qInt, qOneOf, qStr, todayIso, useUrlQuery } from '~/composables/useUrlQuery'

const { route, router, patch, isSelf } = useUrlQuery()
const currency = useCurrencyStore()

const SORTS = [{ id: 'cheapest', label: '낮은 가격순' }, { id: 'fastest', label: '짧은 비행시간순' }, { id: 'earliest', label: '이른 출발순' }] as const
const SLOTS = [
  { id: 'dawn', label: '새벽', range: '00–06시', from: 0, to: 6 },
  { id: 'morning', label: '오전', range: '06–12시', from: 6, to: 12 },
  { id: 'afternoon', label: '오후', range: '12–18시', from: 12, to: 18 },
  { id: 'evening', label: '저녁', range: '18–24시', from: 18, to: 24 }
] as const
const CABIN_KO: Record<string, string> = { ECONOMY: '일반석', PREMIUM_ECONOMY: '프리미엄 일반석', BUSINESS: '비즈니스석', FIRST: '일등석' }

const q = computed(() => {
  const r = route.query
  const date = qDate(r.date)
  const returnDate = date && qDate(r.returnDate) >= date ? qDate(r.returnDate) : ''
  return {
    origin: qStr(r.origin || r.dcity), dest: qStr(r.dest || r.acity), date, returnDate,
    adults: qInt(r.adults, 1, 1, 9), children: qInt(r.children, 0, 0, 8),
    stops: qStr(r.stops) === '0' ? 0 : null as number | null,
    slots: qStr(r.slots).split(',').filter((s) => SLOTS.some((x) => x.id === s)),
    airlines: qStr(r.airlines).split(',').filter(Boolean),
    bag: qStr(r.bag) === '1',
    sort: qOneOf(r.sortBy, SORTS.map((s) => s.id), 'cheapest'),
    out: qStr(r.out)
  }
})
const roundTrip = computed(() => !!q.value.returnDate)
const step = computed<'outbound' | 'return'>(() => (roundTrip.value && q.value.out ? 'return' : 'outbound'))

// ------------------------------------------------------------------ search form (draft)
const today = ref('')
const draft = reactive({ origin: '', dest: '', date: '', returnDate: '', trip: 'oneway' as 'oneway' | 'round', adults: 1, children: 0 })
const formOpen = ref(false)
const formError = ref('')
function syncDraft() {
  const x = q.value
  Object.assign(draft, { origin: x.origin, dest: x.dest, date: x.date, returnDate: x.returnDate, trip: x.returnDate ? 'round' : 'oneway', adults: x.adults, children: x.children })
}
syncDraft()
function swap() { const t = draft.origin; draft.origin = draft.dest; draft.dest = t }
function submit() {
  formError.value = ''
  if (!draft.origin.trim() || !draft.dest.trim()) { formError.value = '출발지와 도착지를 입력해 주세요.'; return }
  if (draft.origin.trim() === draft.dest.trim()) { formError.value = '출발지와 도착지가 같아요.'; return }
  if (!draft.date) { formError.value = '가는 날을 선택해 주세요.'; return }
  if (draft.trip === 'round' && !draft.returnDate) { formError.value = '오는 날을 선택해 주세요.'; return }
  formOpen.value = false
  router.replace({ query: {
    origin: draft.origin.trim(), dest: draft.dest.trim(), date: draft.date,
    ...(draft.trip === 'round' ? { returnDate: draft.returnDate } : {}),
    ...(draft.adults !== 1 ? { adults: String(draft.adults) } : {}), ...(draft.children ? { children: String(draft.children) } : {})
  } })
}

// ------------------------------------------------------------------ data
const outbound = ref<any[]>([])
const returns = ref<any[]>([])
const state = ref<'loading' | 'ready' | 'error'>('loading')
let ctrl: AbortController | null = null

async function fetchLeg(from: string, to: string, signal: AbortSignal) {
  const p = new URLSearchParams({ origin: from, dest: to, limit: '100', sortBy: 'cheapest' })
  const res = await fetch(`${useApiUrl('/flights')}?${p}`, { signal })
  if (!res.ok) throw new Error(String(res.status))
  const j = await res.json()
  return Array.isArray(j.data) ? j.data : []
}
async function load() {
  ctrl?.abort(); ctrl = new AbortController(); const mine = ctrl
  const x = q.value
  if (!x.origin || !x.dest) { outbound.value = []; returns.value = []; state.value = 'ready'; return }
  state.value = 'loading'
  const timer = setTimeout(() => mine.abort(), 10000)
  try {
    const [o, r] = await Promise.all([fetchLeg(x.origin, x.dest, mine.signal), x.returnDate ? fetchLeg(x.dest, x.origin, mine.signal) : Promise.resolve([])])
    if (mine !== ctrl) return
    outbound.value = o; returns.value = r; state.value = 'ready'
  } catch {
    if (mine === ctrl) state.value = 'error'
  } finally { clearTimeout(timer) }
}

const chosenOut = computed(() => outbound.value.find((f) => f.id === q.value.out) || null)
/** Return flights checkout will accept for the chosen outbound flight. */
const compatibleReturns = computed(() => {
  const o = chosenOut.value
  if (!o) return []
  return returns.value.filter((r) => r.partner_id === o.partner_id && r.departure_airport === o.arrival_airport && r.arrival_airport === o.departure_airport)
})
const pool = computed(() => (step.value === 'return' ? compatibleReturns.value : outbound.value))

const hour = (t: string) => Number(String(t || '').slice(0, 2))
const filtered = computed(() => {
  const x = q.value
  let list = pool.value.filter((f) =>
    (x.stops === null || Number(f.stops || 0) === x.stops) &&
    (!x.airlines.length || x.airlines.includes(f.airline_name)) &&
    (!x.bag || Number(f.free_baggage_kg) > 0) &&
    (!x.slots.length || x.slots.some((s) => { const sl = SLOTS.find((z) => z.id === s)!; const h = hour(f.departure_time); return h >= sl.from && h < sl.to })))
  const by = { cheapest: (a: any, b: any) => a.base_price_krw - b.base_price_krw, fastest: (a: any, b: any) => a.duration_minutes - b.duration_minutes, earliest: (a: any, b: any) => String(a.departure_time).localeCompare(String(b.departure_time)) }[x.sort]
  return [...list].sort(by)
})
const airlines = computed(() => [...new Set(pool.value.map((f) => f.airline_name).filter(Boolean))].sort() as string[])
const activeCount = computed(() => (q.value.stops !== null ? 1 : 0) + (q.value.slots.length ? 1 : 0) + (q.value.airlines.length ? 1 : 0) + (q.value.bag ? 1 : 0))
function toggleList(key: 'slots' | 'airlines', v: string) {
  const cur = q.value[key]
  patch({ [key]: (cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]).join(',') })
}
const RESET = { stops: '', slots: '', airlines: '', bag: '' }

// ------------------------------------------------------------------ helpers
const pax = computed(() => q.value.adults + q.value.children)
const hm = (m: number) => `${Math.floor(m / 60)}시간${m % 60 ? ` ${m % 60}분` : ''}`
/**
 * Next-day arrival marker. Times are local to each airport, so duration cannot be added across time
 * zones (ICN 09:45 → CDG 16:00 is the same day); an arrival clock earlier than departure means +1.
 */
function plusDays(f: any) { return String(f.arrival_time) < String(f.departure_time) ? 1 : 0 }
const cityOf = (s: string) => String(s || '').replace(/\s*\([^)]*\)/, '')

function choose(f: any) {
  const x = q.value
  if (roundTrip.value && step.value === 'outbound') { patch({ out: f.id }, 'push'); window.scrollTo({ top: 0, behavior: 'smooth' }); return }
  const outId = step.value === 'return' ? x.out : f.id
  router.push({ path: '/checkout', query: {
    domain: 'FLIGHT', itemId: outId, startDate: x.date,
    ...(step.value === 'return' ? { returnItemId: f.id, returnDate: x.returnDate } : {}),
    adults: String(x.adults), ...(x.children ? { children: String(x.children) } : {})
  } })
}
function detailLink(f: any) {
  const x = q.value
  return { path: `/flights/detail/${f.id}`, query: { ...(x.date ? { startDate: step.value === 'return' ? x.returnDate : x.date } : {}), adults: String(x.adults), ...(x.children ? { children: String(x.children) } : {}) } }
}

// Date strip: navigate ±3 days. No prices — the catalogue has no per-date fares.
const strip = computed(() => {
  const base = step.value === 'return' ? q.value.returnDate : q.value.date
  if (!base) return []
  return [-3, -2, -1, 0, 1, 2, 3].map((n) => addDaysIso(base, n)).map((d) => ({
    d, label: fmtDay(d), on: d === base,
    disabled: (!!today.value && d < today.value) || (step.value === 'return' ? d < q.value.date : !!q.value.returnDate && d > q.value.returnDate)
  }))
})
function pickDay(d: string) { patch(step.value === 'return' ? { returnDate: d } : { date: d }) }

const sheet = ref(false)
watch(() => route.fullPath, () => { if (!isSelf()) return; syncDraft() })
watch(() => [q.value.origin, q.value.dest, q.value.returnDate ? 1 : 0], () => { if (isSelf()) load() })
onMounted(() => { today.value = todayIso(); load() })
onBeforeUnmount(() => ctrl?.abort())

const heading = computed(() => {
  const x = q.value
  if (!x.origin || !x.dest) return '항공권 검색'
  return step.value === 'return' ? `${cityOf(x.dest)} → ${cityOf(x.origin)}` : `${cityOf(x.origin)} → ${cityOf(x.dest)}`
})
useHead(() => ({ title: q.value.origin && q.value.dest ? `${cityOf(q.value.origin)}→${cityOf(q.value.dest)} 항공권` : '항공권 검색' }))
</script>

<template>
  <div class="pb-24 lg:pb-16">
    <!-- Search bar -->
    <section class="border-b border-line bg-surface">
      <div class="mx-auto max-w-7xl px-4 py-3 lg:px-6 lg:py-4">
        <button v-if="!formOpen" type="button" class="flex w-full items-center gap-3 rounded-2xl border border-line bg-canvas px-4 py-2.5 text-left lg:hidden" @click="formOpen = true">
          <AppIcon name="flight" class="text-ink-subtle" />
          <span class="min-w-0 flex-1">
            <span class="block truncate font-bold text-ink">{{ q.origin && q.dest ? `${cityOf(q.origin)} → ${cityOf(q.dest)}` : '어디로 떠나세요?' }}</span>
            <span class="block truncate text-xs text-ink-muted">{{ q.date ? fmtDay(q.date) : '날짜 미정' }}{{ q.returnDate ? ` – ${fmtDay(q.returnDate)} 왕복` : ' 편도' }} · {{ pax }}명</span>
          </span>
          <span class="text-sm font-semibold text-primary">변경</span>
        </button>

        <form :class="['space-y-2 lg:block', formOpen ? 'block' : 'hidden']" novalidate @submit.prevent="submit">
          <div class="flex gap-1" role="radiogroup" aria-label="여정">
            <button v-for="t in [{ id: 'oneway', label: '편도' }, { id: 'round', label: '왕복' }]" :key="t.id" type="button" role="radio" :aria-checked="draft.trip === t.id" :aria-pressed="draft.trip === t.id" class="chip py-1.5" @click="draft.trip = t.id as any">{{ t.label }}</button>
          </div>
          <div class="grid gap-2 lg:grid-cols-[1fr_auto_1fr_1.25fr_0.9fr_auto] lg:items-stretch">
            <div class="field-box"><label for="fs-origin" class="field-label">출발</label><SearchAutocomplete v-model="draft.origin" input-id="fs-origin" domain="flights" variant="bare" placeholder="도시 또는 공항" /></div>
            <button type="button" class="z-10 mx-auto -my-4 flex h-10 w-10 rotate-90 items-center justify-center self-center rounded-full border border-line bg-surface text-ink-muted hover:text-primary lg:my-0 lg:rotate-0" aria-label="출발지와 도착지 바꾸기" @click="swap"><AppIcon name="swap" :size="18" /></button>
            <div class="field-box"><label for="fs-dest" class="field-label">도착</label><SearchAutocomplete v-model="draft.dest" input-id="fs-dest" domain="flights" variant="bare" placeholder="도시 또는 공항" /></div>
            <DateRangePicker v-if="draft.trip === 'round'" v-model:start="draft.date" v-model:end="draft.returnDate" start-label="가는 날" end-label="오는 날" unit="day" :min="today" :max-range="180" compact />
            <DateRangePicker v-else v-model:start="draft.date" mode="single" start-label="가는 날" :min="today" compact />
            <GuestPicker v-model:adults="draft.adults" v-model:children="draft.children" :show-rooms="false" label="탑승객" compact />
            <div class="flex gap-2">
              <button v-if="formOpen" type="button" class="btn-secondary lg:hidden" @click="formOpen = false; syncDraft()">취소</button>
              <button type="submit" class="btn-primary min-h-[52px] flex-1 rounded-2xl px-7 text-base"><AppIcon name="search" :size="18" />검색</button>
            </div>
          </div>
          <p v-if="formError" class="text-sm font-medium text-danger" role="alert">{{ formError }}</p>
        </form>
      </div>
    </section>

    <div class="mx-auto max-w-7xl px-4 lg:px-6">
      <!-- Heading -->
      <div class="flex flex-wrap items-end justify-between gap-3 pb-3 pt-6">
        <div>
          <nav class="mb-1 flex items-center gap-1 text-xs text-ink-subtle" aria-label="이동 경로"><NuxtLink to="/" class="hover:text-ink">홈</NuxtLink><AppIcon name="chevron-right" :size="12" /><NuxtLink to="/flights" class="hover:text-ink">항공권</NuxtLink></nav>
          <p v-if="roundTrip" class="mb-1 text-xs font-bold uppercase tracking-wide text-primary">{{ step === 'return' ? '2/2 오는 편 선택' : '1/2 가는 편 선택' }}</p>
          <h1 class="text-xl font-bold tracking-tight text-ink sm:text-2xl">{{ heading }} <span v-if="state === 'ready' && q.origin" class="ml-1 text-base font-semibold text-ink-subtle tabular">{{ filtered.length }}편</span></h1>
        </div>
        <label class="flex items-center gap-2 text-sm text-ink-muted">
          <span class="hidden sm:inline">정렬</span>
          <select :value="q.sort" class="rounded-xl border border-line bg-surface py-2 pl-3 pr-8 text-sm font-semibold text-ink focus:border-primary focus:outline-none" @change="patch({ sortBy: ($event.target as HTMLSelectElement).value === 'cheapest' ? '' : ($event.target as HTMLSelectElement).value })">
            <option v-for="s in SORTS" :key="s.id" :value="s.id">{{ s.label }}</option>
          </select>
        </label>
      </div>

      <!-- Chosen outbound (round trip, step 2) -->
      <div v-if="step === 'return' && chosenOut" class="card mb-4 flex flex-wrap items-center justify-between gap-3 border-primary/40 bg-primary-soft/50 p-4">
        <div class="flex items-center gap-3 text-sm">
          <span class="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-ink"><AppIcon name="check" :size="16" /></span>
          <div>
            <p class="font-semibold text-ink">가는 편 · {{ fmtDay(q.date, true) }} · {{ chosenOut.airline_name }} {{ chosenOut.flight_number }}</p>
            <p class="text-ink-muted tabular">{{ chosenOut.departure_time }} {{ chosenOut.departure_airport }} → {{ chosenOut.arrival_time }} {{ chosenOut.arrival_airport }} · {{ currency.formatKRW(chosenOut.base_price_krw) }}</p>
          </div>
        </div>
        <button type="button" class="text-sm font-semibold text-primary hover:underline" @click="router.back()">가는 편 다시 고르기</button>
      </div>
      <p v-else-if="step === 'return' && state === 'ready' && !chosenOut" class="card mb-4 p-4 text-sm text-ink" role="alert">
        선택한 가는 편을 찾을 수 없어요. <button type="button" class="font-semibold text-primary hover:underline" @click="patch({ out: '' })">가는 편부터 다시 고르기</button>
      </p>

      <!-- Date strip -->
      <div v-if="strip.length" class="-mx-4 mb-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <button v-for="s in strip" :key="s.d" type="button" :aria-pressed="s.on" :disabled="s.disabled" class="seg min-w-[84px] flex-1 py-2.5 disabled:pointer-events-none disabled:opacity-30" @click="pickDay(s.d)">{{ s.label }}</button>
      </div>

      <!-- Phone filter chips -->
      <div class="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:hidden [&::-webkit-scrollbar]:hidden">
        <button type="button" class="chip" :aria-pressed="activeCount > 0" @click="sheet = true"><AppIcon name="menu" :size="16" />필터<span v-if="activeCount" class="flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-primary px-1 text-2xs text-primary-ink">{{ activeCount }}</span></button>
        <button type="button" class="chip" :aria-pressed="q.stops === 0" @click="patch({ stops: q.stops === 0 ? '' : '0' })">직항</button>
        <button type="button" class="chip" :aria-pressed="q.slots.includes('morning')" @click="toggleList('slots', 'morning')">오전 출발</button>
        <button type="button" class="chip" :aria-pressed="q.bag" @click="patch({ bag: q.bag ? '' : '1' })">위탁 수하물 포함</button>
      </div>

      <div class="grid gap-6 lg:grid-cols-[272px_1fr]">
        <aside class="hidden lg:block" aria-label="필터">
          <div class="card sticky top-24 p-5">
            <div class="mb-4 flex items-center justify-between">
              <h2 class="font-bold text-ink">필터</h2>
              <button v-if="activeCount" type="button" class="text-sm font-semibold text-primary hover:underline" @click="patch(RESET)">초기화</button>
            </div>
            <FlightFilterPanel :q="q" :slots="SLOTS" :airlines="airlines" @patch="patch" @toggle="toggleList" />
          </div>
        </aside>

        <div class="min-w-0">
          <p class="mb-3 flex items-start gap-1.5 text-xs text-ink-subtle">
            <AppIcon name="check" :size="14" class="mt-px" />표시 요금은 성인 1명·편도 참고가예요. 탑승객 수와 날짜를 반영한 최종 금액은 결제 전 확인 화면에서 확정돼요. 항공권은 발권 후 환불이 불가해요.
          </p>

          <div v-if="!q.origin || !q.dest" class="card px-6 py-12 text-center">
            <span class="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-soft text-primary"><AppIcon name="flight" /></span>
            <p class="mt-4 font-bold text-ink">출발지와 도착지를 입력해 주세요</p>
            <p class="mt-1 text-sm text-ink-muted">도시를 고르면 그 도시의 모든 공항을 함께 찾아요. 예: 서울 → 도쿄</p>
          </div>

          <ResultsState v-else :state="state" :count="filtered.length" icon="flight" :empty-title="step === 'return' ? '이 가는 편과 함께 예약할 수 있는 오는 편이 없어요' : '조건에 맞는 항공편이 없어요'" :empty-hint="step === 'return' ? '왕복은 같은 판매처의 역방향 노선만 한 번에 예약할 수 있어요. 다른 가는 편을 고르거나 편도로 각각 예약해 주세요.' : '필터를 줄이거나 날짜·공항을 바꿔 보세요.'" error-title="항공편을 불러오지 못했어요" @retry="load">
            <template #empty-actions>
              <button v-if="activeCount" type="button" class="btn-primary" @click="patch(RESET)">필터 초기화</button>
              <button v-if="step === 'return'" type="button" class="btn-secondary" @click="router.back()">가는 편 다시 고르기</button>
            </template>
            <ul class="space-y-3">
              <li v-for="f in filtered" :key="f.id">
                <article class="card group relative flex flex-col gap-4 p-4 transition-shadow hover:shadow-pop sm:p-5 md:flex-row md:items-center">
                  <div class="flex min-w-0 flex-1 items-center gap-4">
                    <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface-sunken text-xs font-bold text-ink-muted" aria-hidden="true">{{ f.airline_code || '✈' }}</span>
                    <div class="grid min-w-0 flex-1 grid-cols-[auto_1fr_auto] items-center gap-3 sm:gap-5">
                      <div class="text-left">
                        <p class="text-lg font-bold text-ink tabular">{{ f.departure_time }}</p>
                        <p class="text-xs font-semibold text-ink-muted">{{ f.departure_airport }}</p>
                      </div>
                      <div class="text-center">
                        <p class="text-xs text-ink-subtle">{{ hm(Number(f.duration_minutes)) }}</p>
                        <div class="relative my-1 h-px bg-line-strong"><span class="absolute -top-1 right-0 h-2 w-2 rounded-full bg-primary" /></div>
                        <p :class="['text-xs font-semibold', Number(f.stops || 0) === 0 ? 'text-success' : 'text-warning']">{{ Number(f.stops || 0) === 0 ? '직항' : `${f.stops}회 경유` }}</p>
                      </div>
                      <div class="text-right">
                        <p class="text-lg font-bold text-ink tabular">{{ f.arrival_time }}<sup v-if="plusDays(f)" class="ml-0.5 text-2xs font-bold text-warning">+{{ plusDays(f) }}</sup></p>
                        <p class="text-xs font-semibold text-ink-muted">{{ f.arrival_airport }}</p>
                      </div>
                    </div>
                  </div>
                  <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted md:w-44 md:flex-col md:items-start">
                    <span class="font-semibold text-ink">{{ f.airline_name }} <span class="font-normal text-ink-subtle">{{ f.flight_number }}</span></span>
                    <span>{{ CABIN_KO[f.cabin_class] || f.cabin_class }}<template v-if="Number(f.free_baggage_kg) > 0"> · 위탁 {{ f.free_baggage_kg }}kg</template></span>
                    <span v-if="Number(f.available_seats) > 0 && Number(f.available_seats) <= 5" class="font-semibold text-warning">잔여 {{ f.available_seats }}석</span>
                    <span v-if="f.bookable === false" class="font-semibold text-warning">현재 직접 예약 불가</span>
                  </div>
                  <div class="flex items-center justify-between gap-3 border-t border-line pt-3 md:flex-col md:items-end md:border-0 md:pt-0">
                    <div class="text-left md:text-right">
                      <p class="text-xl font-extrabold text-ink tabular">{{ currency.formatKRW(f.base_price_krw) }}</p>
                      <p class="text-2xs text-ink-subtle">성인 1명 편도 참고가</p>
                    </div>
                    <div class="flex gap-2">
                      <NuxtLink :to="detailLink(f)" class="btn-secondary px-3.5">상세</NuxtLink>
                      <button v-if="f.bookable === true" type="button" class="btn-primary" :disabled="!q.date" @click="choose(f)">{{ roundTrip && step === 'outbound' ? '가는 편 선택' : '선택' }}</button>
                    </div>
                  </div>
                </article>
              </li>
            </ul>
          </ResultsState>
        </div>
      </div>
    </div>

    <FilterSheet :open="sheet" :apply-label="state === 'loading' ? '검색 중…' : `항공편 ${filtered.length}개 보기`" @close="sheet = false" @reset="patch(RESET)">
      <FlightFilterPanel :q="q" :slots="SLOTS" :airlines="airlines" @patch="patch" @toggle="toggleList" />
    </FilterSheet>
  </div>
</template>
