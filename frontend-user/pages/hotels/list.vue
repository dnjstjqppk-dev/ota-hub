<script setup lang="ts">
/**
 * Hotel search results (design system "Horizon").
 * The URL is the single source of truth (destination, dates, guests, filters, sort), so results are
 * shareable and the back button restores them. Results come only from the API: there is no client-side
 * fallback catalogue, and every badge on a card is a catalogue fact (no invented scores, prices or perks).
 */
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useCurrencyStore } from '~/stores/currency'
import { useApiUrl } from '~/composables/useApi'

const route = useRoute()
const router = useRouter()
const currency = useCurrencyStore()

// ------------------------------------------------------------------ URL state
const str = (v: unknown) => (typeof v === 'string' ? v : Array.isArray(v) ? String(v[0] ?? '') : '')
const int = (v: unknown, d: number, lo: number, hi: number) => { const n = parseInt(str(v), 10); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d }
const ISO = /^\d{4}-\d{2}-\d{2}$/

const SORTS = [
  { id: 'recommended', label: '추천순' },
  { id: 'price_asc', label: '낮은 요금순' },
  { id: 'score_desc', label: '평점 높은순' },
  { id: 'star_desc', label: '성급 높은순' }
] as const
type Sort = typeof SORTS[number]['id']
const TYPES = [{ id: '', label: '전체' }, { id: 'HOTEL', label: '호텔' }, { id: 'RESORT', label: '리조트' }, { id: 'APARTMENT', label: '레지던스' }]
const TYPE_LABEL: Record<string, string> = { HOTEL: '호텔', RESORT: '리조트', APARTMENT: '레지던스' }
const PRICE_STEPS = [100000, 200000, 300000, 400000, 500000, 700000, 1000000]
const PRICE_ANY = 0

const q = computed(() => {
  const r = route.query
  const checkIn = ISO.test(str(r.checkIn)) ? str(r.checkIn) : ''
  const checkOut = ISO.test(str(r.checkOut)) && str(r.checkOut) > checkIn ? str(r.checkOut) : ''
  const sort = (SORTS.some((s) => s.id === str(r.sortBy)) ? str(r.sortBy) : 'recommended') as Sort
  return {
    city: str(r.city || r.searchWord).trim(),
    checkIn, checkOut: checkIn ? checkOut : '',
    adults: int(r.adults, 2, 1, 9), children: int(r.children, 0, 0, 8), rooms: int(r.rooms, 1, 1, 5),
    star: int(r.star || r.starRating, 0, 0, 5),
    score: [4, 4.5, 4.8].includes(Number(str(r.minScore))) ? Number(str(r.minScore)) : 0,
    type: TYPE_LABEL[str(r.propertyType)] ? str(r.propertyType) : '',
    maxPrice: PRICE_STEPS.includes(Number(str(r.maxPrice))) ? Number(str(r.maxPrice)) : PRICE_ANY,
    freeCancel: str(r.freeCancel) === 'true',
    breakfast: str(r.breakfast) === 'true',
    sort
  }
})
type Q = typeof q.value

/** Write a partial change to the URL. Empty/default values are dropped to keep links short. */
function setQuery(patch: Partial<Q>) {
  const next = { ...q.value, ...patch }
  const out: Record<string, string> = {}
  if (next.city) out.city = next.city
  if (next.checkIn && next.checkOut) { out.checkIn = next.checkIn; out.checkOut = next.checkOut }
  if (next.adults !== 2) out.adults = String(next.adults)
  if (next.children) out.children = String(next.children)
  if (next.rooms !== 1) out.rooms = String(next.rooms)
  if (next.star) out.star = String(next.star)
  if (next.score) out.minScore = String(next.score)
  if (next.type) out.propertyType = next.type
  if (next.maxPrice) out.maxPrice = String(next.maxPrice)
  if (next.freeCancel) out.freeCancel = 'true'
  if (next.breakfast) out.breakfast = 'true'
  if (next.sort !== 'recommended') out.sortBy = next.sort
  router.replace({ query: out })
}
const FILTER_DEFAULTS = { star: 0, score: 0, type: '', maxPrice: PRICE_ANY, freeCancel: false, breakfast: false }
const activeFilters = computed(() => {
  const x = q.value
  const list: { key: string; label: string; clear: Partial<Q> }[] = []
  if (x.star) list.push({ key: 'star', label: `${x.star}성급${x.star < 5 ? ' 이상' : ''}`, clear: { star: 0 } })
  if (x.score) list.push({ key: 'score', label: `평점 ${x.score}+`, clear: { score: 0 } })
  if (x.type) list.push({ key: 'type', label: TYPE_LABEL[x.type], clear: { type: '' } })
  if (x.maxPrice) list.push({ key: 'price', label: `1박 ${currency.formatKRW(x.maxPrice)} 이하`, clear: { maxPrice: PRICE_ANY } })
  if (x.freeCancel) list.push({ key: 'fc', label: '무료 취소', clear: { freeCancel: false } })
  if (x.breakfast) list.push({ key: 'bf', label: '조식 포함', clear: { breakfast: false } })
  return list
})

// ------------------------------------------------------------------ search form (draft until submitted)
const draft = reactive({ city: '', checkIn: '', checkOut: '', adults: 2, children: 0, rooms: 1 })
const formOpen = ref(false) // phones: the summary bar expands into the form
const today = ref('')
function syncDraft() { const x = q.value; Object.assign(draft, { city: x.city, checkIn: x.checkIn, checkOut: x.checkOut, adults: x.adults, children: x.children, rooms: x.rooms }) }
syncDraft()
function submitSearch() {
  formOpen.value = false
  setQuery({ city: draft.city.trim(), checkIn: draft.checkIn, checkOut: draft.checkOut, adults: draft.adults, children: draft.children, rooms: Math.min(draft.rooms, draft.adults) })
}

const pad = (n: number) => String(n).padStart(2, '0')
const WEEK = ['일', '월', '화', '수', '목', '금', '토']
function shortDate(s: string) { const [y, m, d] = s.split('-').map(Number); const dt = new Date(y, m - 1, d); return `${m}.${pad(d)}(${WEEK[dt.getDay()]})` }
const nights = computed(() => (q.value.checkIn && q.value.checkOut ? Math.round((Date.parse(q.value.checkOut) - Date.parse(q.value.checkIn)) / 86400000) : 0))
const summaryLine = computed(() => {
  const x = q.value
  const when = nights.value ? `${shortDate(x.checkIn)} – ${shortDate(x.checkOut)} · ${nights.value}박` : '날짜 미정'
  return `${when} · 성인 ${x.adults}${x.children ? ` 아동 ${x.children}` : ''} · 객실 ${x.rooms}`
})

// ------------------------------------------------------------------ data
const hotels = ref<any[]>([])
const state = ref<'loading' | 'ready' | 'error'>('loading')
let ctrl: AbortController | null = null

async function load() {
  ctrl?.abort()
  ctrl = new AbortController()
  const mine = ctrl
  const x = q.value
  const p = new URLSearchParams({ limit: '100', sortBy: x.sort })
  if (x.city) p.set('city', x.city)
  if (x.star) p.set('star', String(x.star))
  if (x.score) p.set('minScore', String(x.score))
  if (x.type) p.set('propertyType', x.type)
  if (x.maxPrice) p.set('maxPrice', String(x.maxPrice))
  if (x.freeCancel) p.set('freeCancel', 'true')
  if (x.breakfast) p.set('breakfast', 'true')
  state.value = 'loading'
  try {
    const timeout = setTimeout(() => mine.abort(), 10000)
    const res = await fetch(`${useApiUrl('/hotels')}?${p}`, { signal: mine.signal })
    clearTimeout(timeout)
    if (!res.ok) throw new Error(String(res.status))
    const j = await res.json()
    if (mine !== ctrl) return
    hotels.value = Array.isArray(j.data) ? j.data : []
    state.value = 'ready'
  } catch {
    if (mine !== ctrl) return
    state.value = 'error'
  }
}

/** Lowest nightly room price (falls back to the hotel's base price). Null when unknown — never invented. */
function fromPrice(h: any): number | null {
  const prices = (h.rooms || []).map((r: any) => Number(r.base_price_krw)).filter((n: number) => n > 0)
  const n = prices.length ? Math.min(...prices) : Number(h.base_price_krw)
  return n > 0 ? n : null
}
function detailLink(h: any) {
  const x = q.value
  const query: Record<string, string> = {}
  if (x.checkIn && x.checkOut) { query.checkIn = x.checkIn; query.checkOut = x.checkOut }
  query.adults = String(x.adults)
  if (x.children) query.children = String(x.children)
  query.rooms = String(x.rooms)
  return { path: `/hotels/detail/${h.id}`, query }
}

// Filters change the URL → the URL drives loading. Search-form fields only follow the URL when it changes.
// Ignore the route change that navigates away from this page (it is still mounted during the transition).
watch(() => route.fullPath, () => { if (route.path !== '/hotels/list') return; syncDraft(); load() })
onMounted(() => {
  const d = new Date(); today.value = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  load()
})
onBeforeUnmount(() => ctrl?.abort())

// ------------------------------------------------------------------ mobile filter sheet
const sheet = ref(false)
watch(sheet, (v) => { document.documentElement.style.overflow = v ? 'hidden' : '' })
onBeforeUnmount(() => { document.documentElement.style.overflow = '' })

useHead(() => ({
  title: q.value.city ? `${q.value.city} 호텔·숙소` : '호텔·숙소 검색',
  meta: [{ name: 'description', content: `${q.value.city || '전 세계'} 호텔과 리조트를 평점, 성급, 요금으로 비교하고 예약하세요.` }]
}))

const CHIP = 'inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-semibold transition-colors'
const chip = (on: boolean) => [CHIP, on ? 'border-primary bg-primary-soft text-primary' : 'border-line bg-surface text-ink-muted hover:border-line-strong hover:text-ink']
</script>

<template>
  <div class="pb-24 lg:pb-16">
    <!-- Search bar -->
    <section class="border-b border-line bg-surface">
      <div class="mx-auto max-w-7xl px-4 py-3 lg:px-6 lg:py-4">
        <!-- Phone summary -->
        <button v-if="!formOpen" type="button" class="flex w-full items-center gap-3 rounded-2xl border border-line bg-canvas px-4 py-2.5 text-left lg:hidden" @click="formOpen = true">
          <AppIcon name="search" class="text-ink-subtle" />
          <span class="min-w-0 flex-1">
            <span class="block truncate font-bold text-ink">{{ q.city || '모든 목적지' }}</span>
            <span class="block truncate text-xs text-ink-muted">{{ summaryLine }}</span>
          </span>
          <span class="text-sm font-semibold text-primary">변경</span>
        </button>

        <form :class="['grid gap-2 lg:grid lg:grid-cols-[1.5fr_1.4fr_1fr_auto]', formOpen ? 'grid' : 'hidden']" novalidate @submit.prevent="submitSearch">
          <div class="relative flex min-h-[52px] flex-col justify-center rounded-2xl border border-line bg-surface px-4 py-1.5 transition-colors focus-within:border-primary focus-within:shadow-focus hover:border-line-strong">
            <label for="hl-city" class="mb-0.5 block text-2xs font-semibold uppercase tracking-wide text-ink-subtle">목적지</label>
            <SearchAutocomplete v-model="draft.city" input-id="hl-city" domain="hotels" variant="bare" placeholder="도시, 지역, 호텔명" @enter="submitSearch" />
          </div>
          <DateRangePicker v-model:start="draft.checkIn" v-model:end="draft.checkOut" start-label="체크인" end-label="체크아웃" :min="today" :max-range="30" compact />
          <GuestPicker v-model:adults="draft.adults" v-model:children="draft.children" v-model:rooms="draft.rooms" compact />
          <div class="flex gap-2">
            <button v-if="formOpen" type="button" class="rounded-2xl border border-line px-4 text-sm font-semibold text-ink-muted lg:hidden" @click="formOpen = false; syncDraft()">취소</button>
            <button type="submit" class="flex min-h-[52px] flex-1 items-center justify-center gap-2 rounded-2xl bg-primary px-7 font-bold text-primary-ink transition-colors hover:bg-primary-hover"><AppIcon name="search" :size="18" />검색</button>
          </div>
        </form>
      </div>
    </section>

    <div class="mx-auto max-w-7xl px-4 lg:px-6">
      <!-- Heading + sort -->
      <div class="flex flex-wrap items-end justify-between gap-3 pb-3 pt-6">
        <div>
          <nav class="mb-1 flex items-center gap-1 text-xs text-ink-subtle" aria-label="이동 경로">
            <NuxtLink to="/" class="hover:text-ink">홈</NuxtLink><AppIcon name="chevron-right" :size="12" /><NuxtLink to="/hotels" class="hover:text-ink">호텔</NuxtLink>
          </nav>
          <h1 class="text-xl font-bold tracking-tight text-ink sm:text-2xl">
            {{ q.city ? `${q.city}의 숙소` : '모든 숙소' }}
            <span v-if="state === 'ready'" class="ml-1 text-base font-semibold text-ink-subtle tabular">{{ hotels.length }}개</span>
          </h1>
        </div>
        <label class="flex items-center gap-2 text-sm text-ink-muted">
          <span class="hidden sm:inline">정렬</span>
          <select :value="q.sort" class="rounded-xl border border-line bg-surface py-2 pl-3 pr-8 text-sm font-semibold text-ink focus:border-primary focus:outline-none focus:ring-0" @change="setQuery({ sort: ($event.target as HTMLSelectElement).value as Sort })">
            <option v-for="s in SORTS" :key="s.id" :value="s.id">{{ s.label }}</option>
          </select>
        </label>
      </div>

      <!-- Phone: filter button + quick chips -->
      <div class="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:hidden [&::-webkit-scrollbar]:hidden">
        <button type="button" :class="[...chip(activeFilters.length > 0), 'shrink-0 whitespace-nowrap']" @click="sheet = true">
          <AppIcon name="menu" :size="16" />필터<span v-if="activeFilters.length" class="flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-primary px-1 text-2xs text-primary-ink tabular">{{ activeFilters.length }}</span>
        </button>
        <button type="button" :class="[...chip(q.freeCancel), 'shrink-0']" :aria-pressed="q.freeCancel" @click="setQuery({ freeCancel: !q.freeCancel })">무료 취소</button>
        <button type="button" :class="[...chip(q.breakfast), 'shrink-0']" :aria-pressed="q.breakfast" @click="setQuery({ breakfast: !q.breakfast })">조식 포함</button>
        <button type="button" :class="[...chip(q.star === 5), 'shrink-0']" :aria-pressed="q.star === 5" @click="setQuery({ star: q.star === 5 ? 0 : 5 })">5성급</button>
        <button type="button" :class="[...chip(q.score === 4.5), 'shrink-0']" :aria-pressed="q.score === 4.5" @click="setQuery({ score: q.score === 4.5 ? 0 : 4.5 })">평점 4.5+</button>
      </div>

      <div class="grid gap-6 lg:grid-cols-[272px_1fr]">
        <!-- Filters (desktop sidebar; same panel is reused in the phone sheet) -->
        <aside class="hidden lg:block" aria-label="필터">
          <div class="sticky top-24 rounded-card border border-line bg-surface p-5">
            <div class="mb-4 flex items-center justify-between">
              <h2 class="font-bold text-ink">필터</h2>
              <button v-if="activeFilters.length" type="button" class="text-sm font-semibold text-primary hover:underline" @click="setQuery(FILTER_DEFAULTS)">초기화</button>
            </div>
            <HotelFilterPanel :q="q" :types="TYPES" :price-steps="PRICE_STEPS" @set="setQuery" />
          </div>
        </aside>

        <!-- Results -->
        <div class="min-w-0">
          <div v-if="activeFilters.length" class="mb-3 hidden flex-wrap items-center gap-2 lg:flex">
            <button v-for="f in activeFilters" :key="f.key" type="button" class="inline-flex items-center gap-1 rounded-full bg-primary-soft py-1 pl-3 pr-2 text-sm font-semibold text-primary hover:bg-primary/15" :aria-label="`${f.label} 필터 해제`" @click="setQuery(f.clear)">
              {{ f.label }}<AppIcon name="close" :size="14" />
            </button>
          </div>

          <p class="mb-3 flex items-start gap-1.5 text-xs text-ink-subtle">
            <AppIcon name="check" :size="14" class="mt-px" />표시 요금은 객실 1개·1박 참고가이며 세금 10%가 별도로 붙어요. 최종 금액은 예약 단계에서 날짜·인원 기준으로 확정됩니다.
          </p>

          <!-- Loading -->
          <ul v-if="state === 'loading'" class="space-y-3" aria-busy="true" aria-label="숙소를 불러오는 중">
            <li v-for="n in 4" :key="n" class="flex flex-col overflow-hidden rounded-card border border-line bg-surface sm:flex-row">
              <div class="aspect-[16/10] animate-pulse bg-surface-sunken sm:aspect-auto sm:h-auto sm:w-64" />
              <div class="flex-1 space-y-3 p-5"><div class="h-3 w-24 rounded bg-surface-sunken" /><div class="h-5 w-2/3 rounded bg-surface-sunken" /><div class="h-3 w-1/2 rounded bg-surface-sunken" /><div class="h-8 w-32 rounded bg-surface-sunken sm:ml-auto" /></div>
            </li>
          </ul>

          <!-- Error -->
          <div v-else-if="state === 'error'" class="rounded-card border border-dashed border-line-strong bg-surface px-6 py-12 text-center" role="alert">
            <span class="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-danger-soft text-danger"><AppIcon name="close" /></span>
            <p class="mt-4 font-bold text-ink">숙소 목록을 불러오지 못했어요</p>
            <p class="mt-1 text-sm text-ink-muted">네트워크 상태를 확인한 뒤 다시 시도해 주세요.</p>
            <button type="button" class="mt-5 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-ink hover:bg-primary-hover" @click="load">다시 시도</button>
          </div>

          <!-- Empty -->
          <div v-else-if="!hotels.length" class="rounded-card border border-dashed border-line-strong bg-surface px-6 py-12 text-center">
            <span class="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-sunken text-ink-subtle"><AppIcon name="hotel" /></span>
            <p class="mt-4 font-bold text-ink">{{ q.city ? `‘${q.city}’에서 조건에 맞는 숙소가 없어요` : '조건에 맞는 숙소가 없어요' }}</p>
            <p class="mt-1 text-sm text-ink-muted">필터를 줄이거나 다른 목적지로 검색해 보세요.</p>
            <div class="mt-5 flex flex-wrap justify-center gap-2">
              <button v-if="activeFilters.length" type="button" class="rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-ink hover:bg-primary-hover" @click="setQuery(FILTER_DEFAULTS)">필터 초기화</button>
              <button v-if="q.city" type="button" class="rounded-xl border border-line px-5 py-2.5 text-sm font-semibold text-ink hover:bg-surface-sunken" @click="setQuery({ city: '' })">모든 목적지 보기</button>
            </div>
          </div>

          <!-- List -->
          <ul v-else class="space-y-3">
            <li v-for="h in hotels" :key="h.id">
              <article class="group relative flex flex-col overflow-hidden rounded-card border border-line bg-surface transition-shadow hover:shadow-pop sm:flex-row">
                <div class="relative aspect-[16/10] shrink-0 overflow-hidden bg-surface-sunken sm:aspect-auto sm:w-64 md:w-72">
                  <SmartImg :src="h.thumbnail_url" :alt="h.name_ko" icon="hotel" img-class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105 sm:absolute sm:inset-0" />
                </div>
                <div class="flex min-w-0 flex-1 flex-col p-4 sm:p-5">
                  <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0">
                      <p class="flex flex-wrap items-center gap-x-2 text-xs text-ink-subtle">
                        <span v-if="Number(h.star_rating) > 0" class="flex items-center text-warning" :aria-label="`${h.star_rating}성급`">
                          <AppIcon v-for="n in Number(h.star_rating)" :key="n" name="star" :size="12" stroke="0" class="fill-current" />
                        </span>
                        <span>{{ TYPE_LABEL[h.property_type] || '숙소' }}</span>
                      </p>
                      <h2 class="mt-1 text-lg font-bold leading-snug text-ink">
                        <NuxtLink :to="detailLink(h)" class="after:absolute after:inset-0 group-hover:text-primary">{{ h.name_ko }}</NuxtLink>
                      </h2>
                      <p v-if="h.name_en" class="truncate text-xs text-ink-subtle">{{ h.name_en }}</p>
                    </div>
                    <div v-if="Number(h.review_score) > 0" class="flex shrink-0 flex-col items-end">
                      <span class="rounded-lg bg-primary px-2 py-1 text-sm font-bold text-primary-ink tabular">{{ Number(h.review_score).toFixed(1) }}</span>
                      <span v-if="h.review_count" class="mt-1 text-2xs text-ink-subtle tabular">인증 후기 {{ Number(h.review_count).toLocaleString('ko-KR') }}</span>
                    </div>
                    <div v-else class="flex shrink-0 flex-col items-end">
                      <span class="rounded-lg bg-surface-sunken px-2 py-1 text-xs font-bold text-ink-muted">신규</span>
                    </div>
                  </div>

                  <p class="mt-2 flex items-start gap-1 text-sm text-ink-muted">
                    <AppIcon name="map-pin" :size="16" class="mt-0.5 text-ink-subtle" />
                    <span class="line-clamp-2">{{ [h.neighborhood || h.city, h.subway_nearby].filter(Boolean).join(' · ') }}</span>
                  </p>

                  <ul v-if="h.amenities?.length" class="mt-2.5 hidden flex-wrap gap-1.5 md:flex">
                    <li v-for="a in h.amenities.slice(0, 3)" :key="a" class="rounded-md bg-surface-sunken px-2 py-0.5 text-xs text-ink-muted">{{ a }}</li>
                    <li v-if="h.amenities.length > 3" class="px-1 py-0.5 text-xs text-ink-subtle">+{{ h.amenities.length - 3 }}</li>
                  </ul>

                  <div class="mt-auto flex items-end justify-between gap-3 pt-4">
                    <ul class="flex flex-wrap gap-x-3 gap-y-1 text-xs font-semibold">
                      <li v-if="h.free_cancellation" class="flex items-center gap-1 text-success"><AppIcon name="check" :size="14" />무료 취소</li>
                      <li v-if="h.free_breakfast" class="flex items-center gap-1 text-success"><AppIcon name="check" :size="14" />조식 포함</li>
                      <li v-if="h.bookable === false" class="flex items-center gap-1 text-warning">현재 직접 예약 불가</li>
                    </ul>
                    <div v-if="fromPrice(h)" class="shrink-0 text-right">
                      <p class="text-2xs text-ink-subtle">1박 참고가</p>
                      <p class="text-xl font-extrabold text-ink tabular">{{ currency.formatKRW(fromPrice(h)!) }}<span class="text-xs font-medium text-ink-subtle">~</span></p>
                      <p v-if="nights > 0" class="text-2xs text-ink-subtle tabular">{{ nights }}박 · 객실 {{ q.rooms }}개 약 {{ currency.formatKRW(fromPrice(h)! * nights * q.rooms) }}</p>
                    </div>
                    <p v-else class="shrink-0 text-sm text-ink-subtle">요금 확인 필요</p>
                  </div>
                </div>
              </article>
            </li>
          </ul>
        </div>
      </div>
    </div>

    <!-- Phone filter sheet -->
    <Teleport to="body">
      <Transition enter-from-class="opacity-0" enter-active-class="transition-opacity duration-150" leave-to-class="opacity-0" leave-active-class="transition-opacity duration-100">
        <div v-if="sheet" class="fixed inset-0 z-[70] bg-midnight-950/50 lg:hidden" @click="sheet = false" />
      </Transition>
      <div v-if="sheet" role="dialog" aria-modal="true" aria-label="필터" class="fixed inset-x-0 bottom-0 z-[71] flex max-h-[88vh] animate-pop-in flex-col rounded-t-[28px] bg-surface-raised shadow-pop lg:hidden">
        <div class="flex items-center justify-between border-b border-line px-5 pb-3 pt-4">
          <h2 class="text-base font-bold text-ink">필터</h2>
          <button type="button" class="flex h-9 w-9 items-center justify-center rounded-full text-ink-muted hover:bg-surface-sunken" aria-label="닫기" @click="sheet = false"><AppIcon name="close" /></button>
        </div>
        <div class="flex-1 overflow-y-auto overscroll-contain px-5 py-4">
          <HotelFilterPanel :q="q" :types="TYPES" :price-steps="PRICE_STEPS" @set="setQuery" />
        </div>
        <div class="flex gap-2 border-t border-line px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
          <button type="button" class="rounded-xl px-4 py-3 text-sm font-semibold text-ink-muted hover:bg-surface-sunken" @click="setQuery(FILTER_DEFAULTS)">초기화</button>
          <button type="button" class="flex-1 rounded-xl bg-primary py-3 text-sm font-bold text-primary-ink hover:bg-primary-hover" @click="sheet = false">
            {{ state === 'loading' ? '검색 중…' : `숙소 ${hotels.length}개 보기` }}
          </button>
        </div>
      </div>
    </Teleport>
  </div>
</template>
