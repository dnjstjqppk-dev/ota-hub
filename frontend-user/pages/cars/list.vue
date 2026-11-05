<script setup lang="ts">
/**
 * Car rental results (design system "Horizon"). URL = state (pickup place, rental period, filters, sort).
 * API only; dates are never defaulted to a hard-coded day. Price is per vehicle per day, tax (10%) extra.
 */
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useCurrencyStore } from '~/stores/currency'
import { useApiUrl } from '~/composables/useApi'
import { daysBetween, fmtDay, qDate, qOneOf, qStr, todayIso, useUrlQuery } from '~/composables/useUrlQuery'

const { route, router, patch, isSelf } = useUrlQuery()
const currency = useCurrencyStore()

const SORTS = [{ id: 'price_asc', label: '낮은 가격순' }, { id: 'price_desc', label: '높은 가격순' }, { id: 'seats', label: '좌석 많은순' }] as const
const TYPES = [{ id: '', label: '전체' }, { id: 'COMPACT', label: '소형' }, { id: 'SEDAN', label: '세단' }, { id: 'SUV', label: 'SUV' }, { id: 'VAN', label: '승합·밴' }, { id: 'LUXURY', label: '고급' }, { id: 'EV', label: '전기차' }]
const TYPE_KO: Record<string, string> = Object.fromEntries(TYPES.filter((t) => t.id).map((t) => [t.id, t.label]))

const q = computed(() => {
  const r = route.query
  const from = qDate(r.pickupDate || r.startDate)
  const to = qDate(r.returnDate || r.endDate)
  return {
    city: qStr(r.city || r.loc || r.location), from, to: from && to > from ? to : '',
    type: qOneOf(r.vehicleType, TYPES.map((t) => t.id), ''),
    auto: qStr(r.transmission) === 'AUTO',
    sort: qOneOf(r.sortBy, SORTS.map((s) => s.id), 'price_asc')
  }
})
const days = computed(() => (q.value.from && q.value.to ? daysBetween(q.value.from, q.value.to) : 0))

const today = ref('')
const draft = reactive({ city: '', from: '', to: '' })
const formOpen = ref(false)
function syncDraft() { Object.assign(draft, { city: q.value.city, from: q.value.from, to: q.value.to }) }
syncDraft()
function submit() {
  formOpen.value = false
  patch({ city: draft.city.trim(), loc: '', location: '', pickupDate: draft.from && draft.to ? draft.from : '', returnDate: draft.from && draft.to ? draft.to : '' })
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
    const p = new URLSearchParams({ sortBy: x.sort === 'seats' ? 'seats_desc' : x.sort })
    if (x.city) p.set('city', x.city)
    if (x.type) p.set('vehicleType', x.type)
    if (x.auto) p.set('transmission', 'AUTO')
    const res = await fetch(`${useApiUrl('/cars')}?${p}`, { signal: mine.signal })
    if (!res.ok) throw new Error(String(res.status))
    const j = await res.json()
    if (mine !== ctrl) return
    const list = Array.isArray(j.data) ? j.data : []
    // Sort client-side as well so the order always matches what the card shows.
    const by = { price_asc: (a: any, b: any) => a.daily_price_krw - b.daily_price_krw, price_desc: (a: any, b: any) => b.daily_price_krw - a.daily_price_krw, seats: (a: any, b: any) => b.seats - a.seats }[x.sort]
    items.value = [...list].sort(by)
    state.value = 'ready'
  } catch { if (mine === ctrl) state.value = 'error' } finally { clearTimeout(timer) }
}
const activeCount = computed(() => (q.value.type ? 1 : 0) + (q.value.auto ? 1 : 0))
const RESET = { vehicleType: '', transmission: '' }

function stayQuery() { return q.value.from && q.value.to ? { startDate: q.value.from, endDate: q.value.to } : {} }
function detailLink(c: any) { return { path: `/cars/detail/${c.id}`, query: stayQuery() } }
function book(c: any) { router.push({ path: '/checkout', query: { domain: 'CAR', itemId: c.id, ...stayQuery() } }) }

watch(() => route.fullPath, () => { if (!isSelf()) return; syncDraft(); load() })
onMounted(() => { today.value = todayIso(); load() })
onBeforeUnmount(() => ctrl?.abort())
useHead(() => ({ title: q.value.city ? `${q.value.city} 렌터카` : '렌터카 검색' }))
</script>

<template>
  <div class="pb-24 lg:pb-16">
    <section class="border-b border-line bg-surface">
      <div class="mx-auto max-w-7xl px-4 py-3 lg:px-6 lg:py-4">
        <button v-if="!formOpen" type="button" class="flex w-full items-center gap-3 rounded-2xl border border-line bg-canvas px-4 py-2.5 text-left lg:hidden" @click="formOpen = true">
          <AppIcon name="car" class="text-ink-subtle" />
          <span class="min-w-0 flex-1">
            <span class="block truncate font-bold text-ink">{{ q.city || '모든 인수 장소' }}</span>
            <span class="block truncate text-xs text-ink-muted">{{ days ? `${fmtDay(q.from)} – ${fmtDay(q.to)} · ${days}일` : '대여 기간 미정' }}</span>
          </span>
          <span class="text-sm font-semibold text-primary">변경</span>
        </button>
        <form :class="['grid gap-2 lg:grid lg:grid-cols-[1.4fr_1.4fr_auto]', formOpen ? 'grid' : 'hidden']" novalidate @submit.prevent="submit">
          <div class="field-box"><label for="cl-city" class="field-label">인수 장소</label><SearchAutocomplete v-model="draft.city" input-id="cl-city" domain="cars" variant="bare" placeholder="공항, 도시 또는 기차역" @enter="submit" /></div>
          <DateRangePicker v-model:start="draft.from" v-model:end="draft.to" start-label="인수" end-label="반납" unit="day" :min="today" :max-range="60" compact />
          <div class="flex gap-2">
            <button v-if="formOpen" type="button" class="btn-secondary lg:hidden" @click="formOpen = false; syncDraft()">취소</button>
            <button type="submit" class="btn-primary min-h-[52px] flex-1 rounded-2xl px-7 text-base"><AppIcon name="search" :size="18" />검색</button>
          </div>
        </form>
      </div>
    </section>

    <div class="mx-auto max-w-7xl px-4 lg:px-6">
      <div class="flex flex-wrap items-end justify-between gap-3 pb-3 pt-6">
        <div>
          <nav class="mb-1 flex items-center gap-1 text-xs text-ink-subtle" aria-label="이동 경로"><NuxtLink to="/" class="hover:text-ink">홈</NuxtLink><AppIcon name="chevron-right" :size="12" /><NuxtLink to="/cars" class="hover:text-ink">렌터카</NuxtLink></nav>
          <h1 class="text-xl font-bold tracking-tight text-ink sm:text-2xl">{{ q.city ? `${q.city} 렌터카` : '모든 렌터카' }} <span v-if="state === 'ready'" class="ml-1 text-base font-semibold text-ink-subtle tabular">{{ items.length }}대</span></h1>
          <p v-if="days" class="mt-0.5 text-sm text-ink-muted">{{ fmtDay(q.from, true) }} – {{ fmtDay(q.to, true) }} · {{ days }}일</p>
        </div>
        <label class="flex items-center gap-2 text-sm text-ink-muted">
          <span class="hidden sm:inline">정렬</span>
          <select :value="q.sort" class="rounded-xl border border-line bg-surface py-2 pl-3 pr-8 text-sm font-semibold text-ink focus:border-primary focus:outline-none" @change="patch({ sortBy: ($event.target as HTMLSelectElement).value === 'price_asc' ? '' : ($event.target as HTMLSelectElement).value })">
            <option v-for="s in SORTS" :key="s.id" :value="s.id">{{ s.label }}</option>
          </select>
        </label>
      </div>

      <div class="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <button v-for="t in TYPES" :key="t.id" type="button" class="chip" :aria-pressed="q.type === t.id" @click="patch({ vehicleType: t.id })">{{ t.label }}</button>
        <button type="button" class="chip" :aria-pressed="q.auto" @click="patch({ transmission: q.auto ? '' : 'AUTO' })">자동 변속기</button>
      </div>

      <p class="mb-3 flex items-start gap-1.5 text-xs text-ink-subtle"><AppIcon name="check" :size="14" class="mt-px" />표시 요금은 차량 1대·1일 참고가이며 세금 10%가 별도로 붙어요. 최종 금액은 결제 전 확인 화면에서 확정돼요.</p>
      <ResultsState :state="state" :count="items.length" icon="car" :empty-title="q.city ? `‘${q.city}’에서 조건에 맞는 차량이 없어요` : '조건에 맞는 차량이 없어요'" empty-hint="다른 인수 장소로 검색하거나 차종 조건을 줄여 보세요." error-title="렌터카 목록을 불러오지 못했어요" @retry="load">
        <template #empty-actions>
          <button v-if="activeCount" type="button" class="btn-primary" @click="patch(RESET)">필터 초기화</button>
          <button v-if="q.city" type="button" class="btn-secondary" @click="patch({ city: '' })">모든 인수 장소 보기</button>
        </template>
        <ul class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <li v-for="c in items" :key="c.id">
            <article class="card group relative flex h-full flex-col overflow-hidden transition-shadow hover:shadow-pop">
              <SmartImg :src="c.image_url" :alt="c.vehicle_model" icon="car" img-class="aspect-[16/10] w-full object-cover" />
              <div class="flex flex-1 flex-col p-4">
                <p class="text-xs text-ink-subtle">{{ c.company_name }}</p>
                <h2 class="mt-0.5 font-bold leading-snug text-ink"><NuxtLink :to="detailLink(c)" class="after:absolute after:inset-0 group-hover:text-primary">{{ c.vehicle_model }}</NuxtLink></h2>
                <ul class="mt-2 flex flex-wrap gap-1.5 text-xs text-ink-muted">
                  <li v-if="TYPE_KO[c.vehicle_type]" class="rounded-md bg-surface-sunken px-2 py-0.5">{{ TYPE_KO[c.vehicle_type] }}</li>
                  <li v-if="c.seats" class="rounded-md bg-surface-sunken px-2 py-0.5">{{ c.seats }}인승</li>
                  <li v-if="c.transmission" class="rounded-md bg-surface-sunken px-2 py-0.5">{{ c.transmission === 'AUTO' ? '자동' : '수동' }}</li>
                </ul>
                <p v-if="c.pickup_location" class="mt-2 flex items-start gap-1 text-xs text-ink-muted"><AppIcon name="map-pin" :size="14" class="mt-px text-ink-subtle" /><span class="line-clamp-2">{{ c.pickup_location }}</span></p>
                <p v-if="c.insurance_included" class="mt-1.5 flex items-center gap-1 text-xs font-semibold text-success"><AppIcon name="shield" :size="14" />기본 보험 포함</p>
                <div class="mt-auto flex items-end justify-between gap-2 border-t border-line pt-3">
                  <div>
                    <p class="text-lg font-extrabold text-ink tabular">{{ currency.formatKRW(c.daily_price_krw) }}<span class="text-xs font-medium text-ink-subtle"> /일</span></p>
                    <p v-if="days" class="text-2xs text-ink-subtle tabular">{{ days }}일 약 {{ currency.formatKRW(c.daily_price_krw * days) }} + 세금</p>
                  </div>
                  <button v-if="c.bookable !== false && days" type="button" class="btn-primary relative z-[1]" @click="book(c)">선택</button>
                  <span v-else-if="c.bookable === false" class="text-xs font-semibold text-warning">직접 예약 불가</span>
                </div>
              </div>
            </article>
          </li>
        </ul>
      </ResultsState>
    </div>
  </div>
</template>
