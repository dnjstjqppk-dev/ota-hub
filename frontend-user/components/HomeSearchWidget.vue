<script setup lang="ts">
/**
 * Home search console (design system "Horizon").
 * One tab per bookable product line; every place field is a SearchAutocomplete backed by
 * /search/suggest. Dates default relative to today (set on the client so prerendered HTML
 * never ships a stale date) and are validated before navigating.
 */
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'

type Tab = 'hotels' | 'flights' | 'packages' | 'activities' | 'trains' | 'cars' | 'transfers'
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'hotels', label: '호텔', icon: 'hotel' },
  { id: 'flights', label: '항공권', icon: 'flight' },
  { id: 'packages', label: '항공+호텔', icon: 'package' },
  { id: 'activities', label: '투어·티켓', icon: 'ticket' },
  { id: 'trains', label: '기차', icon: 'train' },
  { id: 'cars', label: '렌터카', icon: 'car' },
  { id: 'transfers', label: '공항 이동', icon: 'transfer' }
]

const router = useRouter()
const tab = ref<Tab>('hotels')
const errors = ref<Record<string, string>>({})

const f = reactive({
  city: '', checkIn: '', checkOut: '',
  adults: 2, children: 0, rooms: 1,
  origin: '', dest: '', flightDate: '',
  pkgOrigin: '', pkgDest: '',
  keyword: '',
  dep: '', arr: '', trainDate: '',
  carPlace: '', carFrom: '', carTo: '',
  airport: '', area: '', transferDate: ''
})

const today = ref('')
function iso(d: Date) { return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10) }
function plus(days: number) { const d = new Date(); d.setDate(d.getDate() + days); return iso(d) }

onMounted(() => {
  today.value = plus(0)
  f.checkIn = plus(14); f.checkOut = plus(16)
  f.flightDate = plus(14); f.trainDate = plus(14); f.transferDate = plus(14)
  f.carFrom = plus(14); f.carTo = plus(17)
})

const nights = computed(() => {
  if (!f.checkIn || !f.checkOut) return 0
  return Math.round((Date.parse(f.checkOut) - Date.parse(f.checkIn)) / 86400000)
})

function swap(a: 'origin' | 'dep', b: 'dest' | 'arr') { const t = f[a]; f[a] = f[b]; f[b] = t }

// ------------------------------------------------------------------ submit
function need(field: string, value: string, msg: string) { if (!value.trim()) errors.value[field] = msg }
function notPast(field: string, value: string) { if (value && today.value && value < today.value) errors.value[field] = '오늘 이후 날짜를 선택해 주세요.' }

function submit() {
  errors.value = {}
  const t = tab.value
  if (t === 'hotels') {
    need('city', f.city, '목적지를 입력해 주세요.')
    notPast('checkIn', f.checkIn)
    if (nights.value < 1) errors.value.checkOut = '체크아웃은 체크인 다음 날 이후여야 해요.'
    else if (nights.value > 30) errors.value.checkOut = '최대 30박까지 검색할 수 있어요.'
  } else if (t === 'flights') {
    need('origin', f.origin, '출발지를 입력해 주세요.'); need('dest', f.dest, '도착지를 입력해 주세요.')
    if (f.origin && f.origin.trim() === f.dest.trim()) errors.value.dest = '출발지와 도착지가 같아요.'
    notPast('flightDate', f.flightDate)
  } else if (t === 'packages') {
    need('pkgDest', f.pkgDest, '여행지를 입력해 주세요.')
  } else if (t === 'activities') {
    need('keyword', f.keyword, '도시나 명소를 입력해 주세요.')
  } else if (t === 'trains') {
    need('dep', f.dep, '출발역을 입력해 주세요.'); need('arr', f.arr, '도착역을 입력해 주세요.')
    if (f.dep && f.dep.trim() === f.arr.trim()) errors.value.arr = '출발역과 도착역이 같아요.'
    notPast('trainDate', f.trainDate)
  } else if (t === 'cars') {
    need('carPlace', f.carPlace, '인수 장소를 입력해 주세요.')
    notPast('carFrom', f.carFrom)
    if (f.carTo && f.carFrom && f.carTo <= f.carFrom) errors.value.carTo = '반납일은 인수일 이후여야 해요.'
  } else if (t === 'transfers') {
    need('airport', f.airport, '공항을 입력해 주세요.')
    notPast('transferDate', f.transferDate)
  }
  if (Object.keys(errors.value).length) return

  const go = (path: string, query: Record<string, string | number>) => router.push({ path, query })
  if (t === 'hotels') go('/hotels/list', { city: f.city, checkIn: f.checkIn, checkOut: f.checkOut, adults: f.adults, children: f.children, rooms: f.rooms })
  else if (t === 'flights') go('/flights/search', { origin: f.origin, dest: f.dest, date: f.flightDate })
  else if (t === 'packages') go('/packages/list', { city: f.pkgDest, ...(f.pkgOrigin ? { origin: f.pkgOrigin } : {}) })
  else if (t === 'activities') go('/things-to-do', { q: f.keyword })
  else if (t === 'trains') go('/trains/search', { dep: f.dep, arr: f.arr, date: f.trainDate })
  else if (t === 'cars') go('/cars/list', { city: f.carPlace, pickupDate: f.carFrom, returnDate: f.carTo })
  else go('/transfers/list', { airport: f.airport, ...(f.area ? { destination: f.area } : {}), date: f.transferDate })
}

function pickTab(t: Tab) { tab.value = t; errors.value = {} }
const BOX = 'relative flex min-h-[64px] flex-col justify-center rounded-2xl border bg-surface px-4 py-2.5 transition-colors focus-within:border-primary focus-within:shadow-focus'
const box = (field: string) => [BOX, errors.value[field] ? 'border-danger' : 'border-line hover:border-line-strong']
const LABEL = 'mb-0.5 block text-2xs font-semibold uppercase tracking-wide text-ink-subtle'
</script>

<template>
  <section class="relative rounded-[28px] border border-line bg-surface-raised p-3 shadow-pop sm:p-5" aria-label="여행 검색">
    <!-- Tabs -->
    <div class="-mx-1 flex gap-1 overflow-x-auto px-1 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist">
      <button
        v-for="t in TABS"
        :key="t.id"
        type="button"
        role="tab"
        :aria-selected="tab === t.id"
        :class="['flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors', tab === t.id ? 'bg-ink text-ink-inverse' : 'text-ink-muted hover:bg-surface-sunken hover:text-ink']"
        @click="pickTab(t.id)"
      >
        <AppIcon :name="t.icon" :size="18" />{{ t.label }}
      </button>
    </div>

    <form class="grid gap-2" novalidate @submit.prevent="submit">
      <!-- Hotels -->
      <div v-if="tab === 'hotels'" class="grid grid-cols-1 gap-2 lg:grid-cols-[1.6fr_1.3fr_1fr_auto]">
        <div :class="box('city')">
          <label :for="'hs-city'" :class="LABEL">목적지</label>
          <SearchAutocomplete v-model="f.city" input-id="hs-city" domain="hotels" variant="bare" placeholder="도시, 지역, 명소, 호텔명" />
        </div>
        <DateRangePicker v-model:start="f.checkIn" v-model:end="f.checkOut" start-label="체크인" end-label="체크아웃" :min="today" :max-range="30" :invalid="!!(errors.checkIn || errors.checkOut)" />
        <GuestPicker v-model:adults="f.adults" v-model:children="f.children" v-model:rooms="f.rooms" />
        <button type="submit" class="flex min-h-[64px] items-center justify-center gap-2 rounded-2xl bg-primary px-8 text-base font-bold text-primary-ink transition-colors hover:bg-primary-hover"><AppIcon name="search" />검색</button>
      </div>

      <!-- Flights -->
      <div v-else-if="tab === 'flights'" class="grid grid-cols-1 gap-2 lg:grid-cols-[1fr_auto_1fr_0.9fr_auto] lg:items-stretch">
        <div :class="box('origin')"><label for="hs-origin" :class="LABEL">출발</label><SearchAutocomplete v-model="f.origin" input-id="hs-origin" domain="flights" variant="bare" placeholder="도시 또는 공항" /></div>
        <button type="button" class="mx-auto -my-4 z-10 flex h-10 w-10 rotate-90 items-center justify-center self-center rounded-full border border-line bg-surface text-ink-muted hover:text-primary lg:my-0 lg:rotate-0" aria-label="출발지와 도착지 바꾸기" @click="swap('origin', 'dest')"><AppIcon name="swap" :size="18" /></button>
        <div :class="box('dest')"><label for="hs-dest" :class="LABEL">도착</label><SearchAutocomplete v-model="f.dest" input-id="hs-dest" domain="flights" variant="bare" placeholder="도시 또는 공항" /></div>
        <DateRangePicker v-model:start="f.flightDate" mode="single" start-label="가는 날" :min="today" :invalid="!!errors.flightDate" />
        <button type="submit" class="flex min-h-[64px] items-center justify-center gap-2 rounded-2xl bg-primary px-8 text-base font-bold text-primary-ink hover:bg-primary-hover"><AppIcon name="search" />검색</button>
      </div>

      <!-- Packages -->
      <div v-else-if="tab === 'packages'" class="grid grid-cols-1 gap-2 lg:grid-cols-[1fr_1fr_auto]">
        <div :class="box('pkgOrigin')"><label for="hs-porigin" :class="LABEL">출발 (선택)</label><SearchAutocomplete v-model="f.pkgOrigin" input-id="hs-porigin" domain="flights" variant="bare" placeholder="출발 도시 또는 공항" /></div>
        <div :class="box('pkgDest')"><label for="hs-pdest" :class="LABEL">여행지</label><SearchAutocomplete v-model="f.pkgDest" input-id="hs-pdest" domain="packages" variant="bare" placeholder="도시 또는 국가" /></div>
        <button type="submit" class="flex min-h-[64px] items-center justify-center gap-2 rounded-2xl bg-primary px-8 text-base font-bold text-primary-ink hover:bg-primary-hover"><AppIcon name="search" />검색</button>
      </div>

      <!-- Activities -->
      <div v-else-if="tab === 'activities'" class="grid grid-cols-1 gap-2 lg:grid-cols-[1fr_auto]">
        <div :class="box('keyword')"><label for="hs-kw" :class="LABEL">어디에서 무엇을 할까요?</label><SearchAutocomplete v-model="f.keyword" input-id="hs-kw" domain="things-to-do" variant="bare" placeholder="도시, 명소, 테마파크, 체험" /></div>
        <button type="submit" class="flex min-h-[64px] items-center justify-center gap-2 rounded-2xl bg-primary px-8 text-base font-bold text-primary-ink hover:bg-primary-hover"><AppIcon name="search" />검색</button>
      </div>

      <!-- Trains -->
      <div v-else-if="tab === 'trains'" class="grid grid-cols-1 gap-2 lg:grid-cols-[1fr_auto_1fr_0.9fr_auto] lg:items-stretch">
        <div :class="box('dep')"><label for="hs-dep" :class="LABEL">출발역</label><SearchAutocomplete v-model="f.dep" input-id="hs-dep" domain="trains" variant="bare" placeholder="예: 서울역" /></div>
        <button type="button" class="mx-auto -my-4 z-10 flex h-10 w-10 rotate-90 items-center justify-center self-center rounded-full border border-line bg-surface text-ink-muted hover:text-primary lg:my-0 lg:rotate-0" aria-label="출발역과 도착역 바꾸기" @click="swap('dep', 'arr')"><AppIcon name="swap" :size="18" /></button>
        <div :class="box('arr')"><label for="hs-arr" :class="LABEL">도착역</label><SearchAutocomplete v-model="f.arr" input-id="hs-arr" domain="trains" variant="bare" placeholder="예: 부산역" /></div>
        <DateRangePicker v-model:start="f.trainDate" mode="single" start-label="탑승일" :min="today" :invalid="!!errors.trainDate" />
        <button type="submit" class="flex min-h-[64px] items-center justify-center gap-2 rounded-2xl bg-primary px-8 text-base font-bold text-primary-ink hover:bg-primary-hover"><AppIcon name="search" />검색</button>
      </div>

      <!-- Cars -->
      <div v-else-if="tab === 'cars'" class="grid grid-cols-1 gap-2 lg:grid-cols-[1.6fr_1.4fr_auto]">
        <div :class="box('carPlace')"><label for="hs-car" :class="LABEL">인수 장소</label><SearchAutocomplete v-model="f.carPlace" input-id="hs-car" domain="cars" variant="bare" placeholder="공항, 도시 또는 기차역" /></div>
        <DateRangePicker v-model:start="f.carFrom" v-model:end="f.carTo" start-label="인수" end-label="반납" unit="day" :min="today" :max-range="60" :invalid="!!(errors.carFrom || errors.carTo)" />
        <button type="submit" class="flex min-h-[64px] items-center justify-center gap-2 rounded-2xl bg-primary px-8 text-base font-bold text-primary-ink hover:bg-primary-hover"><AppIcon name="search" />검색</button>
      </div>

      <!-- Transfers -->
      <div v-else class="grid grid-cols-1 gap-2 lg:grid-cols-[1fr_1fr_0.8fr_auto]">
        <div :class="box('airport')"><label for="hs-apt" :class="LABEL">공항</label><SearchAutocomplete v-model="f.airport" input-id="hs-apt" domain="flights" variant="bare" placeholder="예: 인천국제공항" /></div>
        <div :class="box('area')"><label for="hs-area" :class="LABEL">목적지 (선택)</label><SearchAutocomplete v-model="f.area" input-id="hs-area" domain="transfers" variant="bare" placeholder="지역, 호텔, 명소" /></div>
        <DateRangePicker v-model:start="f.transferDate" mode="single" start-label="이용일" :min="today" :invalid="!!errors.transferDate" />
        <button type="submit" class="flex min-h-[64px] items-center justify-center gap-2 rounded-2xl bg-primary px-8 text-base font-bold text-primary-ink hover:bg-primary-hover"><AppIcon name="search" />검색</button>
      </div>

      <ul v-if="Object.keys(errors).length" class="space-y-1 px-1 pt-1 text-sm font-medium text-danger" role="alert">
        <li v-for="(m, k) in errors" :key="k" class="flex items-center gap-1.5"><AppIcon name="close" :size="14" />{{ m }}</li>
      </ul>
    </form>
  </section>
</template>
