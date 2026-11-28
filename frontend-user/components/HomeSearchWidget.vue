<script setup lang="ts">
/**
 * Home search console (design system "Terra Nord").
 * Explicit 3-tier responsive grids:
 * - Mobile (<640px): clean single-column stack with tactile 60px touch fields.
 * - Tablet (640px–1023px): balanced 2-column grid (side-by-side Origin/Dest, Dates/Guests).
 * - Desktop (>=1024px): unified single-row architectural search dock.
 */
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'

type Tab = 'hotels' | 'flights' | 'packages' | 'activities' | 'trains' | 'cars' | 'transfers'
const TABS: { id: Tab; icon: string }[] = [
  { id: 'hotels', icon: 'hotel' },
  { id: 'flights', icon: 'flight' },
  { id: 'packages', icon: 'package' },
  { id: 'activities', icon: 'ticket' },
  { id: 'trains', icon: 'train' },
  { id: 'cars', icon: 'car' },
  { id: 'transfers', icon: 'transfer' }
]
const { t } = useI18n()
const localePath = useLocalePath()

const props = withDefaults(defineProps<{ initialTab?: Tab; fixed?: boolean }>(), { initialTab: 'hotels', fixed: false })
const router = useRouter()
const tab = ref<Tab>(props.initialTab)
const errors = ref<Record<string, string>>({})

const f = reactive({
  city: '', checkIn: '', checkOut: '',
  adults: 2, children: 0, rooms: 1,
  origin: '', dest: '', flightDate: '', returnDate: '', trip: 'round' as 'round' | 'oneway',
  pax: 1, paxChildren: 0,
  pkgDest: '', pkgDate: '',
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
  f.flightDate = plus(14); f.returnDate = plus(18); f.trainDate = plus(14); f.transferDate = plus(14); f.pkgDate = plus(14)
  f.carFrom = plus(14); f.carTo = plus(17)
})

const nights = computed(() => {
  if (!f.checkIn || !f.checkOut) return 0
  return Math.round((Date.parse(f.checkOut) - Date.parse(f.checkIn)) / 86400000)
})

function swap(a: 'origin' | 'dep', b: 'dest' | 'arr') { const tmp = f[a]; f[a] = f[b]; f[b] = tmp }

function need(field: string, value: string, msg: string) { if (!value.trim()) errors.value[field] = msg }
function notPast(field: string, value: string) { if (value && today.value && value < today.value) errors.value[field] = t('home.search.notPast') }

function submit() {
  errors.value = {}
  const tb = tab.value
  if (tb === 'hotels') {
    need('city', f.city, t('home.search.needDest'))
    notPast('checkIn', f.checkIn)
    if (nights.value < 1) errors.value.checkOut = t('home.search.checkoutAfter')
    else if (nights.value > 30) errors.value.checkOut = t('home.search.maxNights')
  } else if (tb === 'flights') {
    need('origin', f.origin, t('home.search.needOrigin')); need('dest', f.dest, t('home.search.needArr'))
    if (f.origin && f.origin.trim() === f.dest.trim()) errors.value.dest = t('home.search.sameOD')
    notPast('flightDate', f.flightDate)
    if (f.trip === 'round' && (!f.returnDate || f.returnDate < f.flightDate)) errors.value.returnDate = t('home.search.returnAfter')
  } else if (tb === 'packages') {
    need('pkgDest', f.pkgDest, t('home.search.needPkgDest'))
  } else if (tb === 'activities') {
    need('keyword', f.keyword, t('home.search.needKeyword'))
  } else if (tb === 'trains') {
    need('dep', f.dep, t('home.search.needDep')); need('arr', f.arr, t('home.search.needArrStation'))
    if (f.dep && f.dep.trim() === f.arr.trim()) errors.value.arr = t('home.search.sameDepArr')
    notPast('trainDate', f.trainDate)
  } else if (tb === 'cars') {
    need('carPlace', f.carPlace, t('home.search.needCarPlace'))
    notPast('carFrom', f.carFrom)
    if (f.carTo && f.carFrom && f.carTo <= f.carFrom) errors.value.carTo = t('home.search.dropoffAfter')
  } else if (tb === 'transfers') {
    need('airport', f.airport, t('home.search.needAirport'))
    notPast('transferDate', f.transferDate)
  }
  if (Object.keys(errors.value).length) return

  const go = (path: string, query: Record<string, string | number>) => router.push(localePath({ path, query }))
  if (tb === 'hotels') return go('/hotels/list', { city: f.city, checkIn: f.checkIn, checkOut: f.checkOut, adults: f.adults, children: f.children, rooms: f.rooms })
  const pax = { adults: f.pax, ...(f.paxChildren ? { children: f.paxChildren } : {}) }
  if (tb === 'flights') go('/flights/search', { origin: f.origin, dest: f.dest, date: f.flightDate, ...(f.trip === 'round' ? { returnDate: f.returnDate } : {}), ...pax })
  else if (tb === 'packages') go('/packages/list', { city: f.pkgDest, ...(f.pkgDate ? { date: f.pkgDate } : {}), ...pax })
  else if (tb === 'activities') go('/things-to-do', { q: f.keyword })
  else if (tb === 'trains') go('/trains/search', { dep: f.dep, arr: f.arr, date: f.trainDate, ...pax })
  else if (tb === 'cars') go('/cars/list', { city: f.carPlace, pickupDate: f.carFrom, returnDate: f.carTo })
  else go('/transfers/list', { airport: f.airport, ...(f.area ? { destination: f.area } : {}), date: f.transferDate })
}

function pickTab(next: Tab) { tab.value = next; errors.value = {} }
const BOX = 'relative flex min-h-[60px] flex-col justify-center rounded-field border bg-surface px-3.5 py-2 transition focus-within:border-primary focus-within:shadow-focus'
const box = (field: string) => [BOX, errors.value[field] ? 'border-danger' : 'border-line hover:border-line-strong']
const LABEL = 'mb-0.5 block text-2xs font-bold uppercase tracking-wider text-ink-subtle'
const CTA = 'flex min-h-[56px] items-center justify-center gap-2 rounded-field bg-primary px-7 text-sm font-bold text-primary-ink shadow-sm transition hover:bg-primary-hover sm:min-h-[60px] sm:text-base'
</script>

<template>
  <section class="relative rounded-card border border-line bg-surface-raised p-4 shadow-pop sm:p-5 lg:p-6" :aria-label="t('home.search.title')">
    <!-- Architectural Tab Header -->
    <div v-if="!fixed" class="chip-rail -mx-1 mb-4 flex gap-1.5 border-b border-line px-1 pb-3.5" role="tablist">
      <button
        v-for="tb in TABS"
        :key="tb.id"
        type="button"
        role="tab"
        :aria-selected="tab === tb.id"
        :class="[
          'flex min-h-[40px] shrink-0 items-center gap-2 rounded-field px-3.5 py-2 text-xs font-bold transition sm:text-sm',
          tab === tb.id ? 'bg-primary text-primary-ink shadow-sm' : 'bg-surface-sunken/70 text-ink-muted hover:bg-surface-sunken hover:text-ink'
        ]"
        @click="pickTab(tb.id)"
      >
        <AppIcon :name="tb.icon" :size="16" />{{ $t('nav.' + tb.id) }}
      </button>
    </div>

    <form class="grid gap-2.5" novalidate @submit.prevent="submit">
      <!-- Hotels: 1-col Mobile -> 2-col Tablet -> 4-col Desktop -->
      <div v-if="tab === 'hotels'" class="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-[1.55fr_1.35fr_1fr_auto]">
        <div :class="[...box('city'), 'sm:col-span-2 lg:col-span-1']">
          <label :for="'hs-city'" :class="LABEL">{{ t('home.search.dest') }}</label>
          <SearchAutocomplete v-model="f.city" input-id="hs-city" domain="hotels" variant="bare" :placeholder="t('home.search.phCity')" />
        </div>
        <DateRangePicker v-model:start="f.checkIn" v-model:end="f.checkOut" :start-label="t('home.search.checkIn')" :end-label="t('home.search.checkOut')" :min="today" :max-range="30" :invalid="!!(errors.checkIn || errors.checkOut)" />
        <GuestPicker v-model:adults="f.adults" v-model:children="f.children" v-model:rooms="f.rooms" />
        <button type="submit" :class="[CTA, 'sm:col-span-2 lg:col-span-1']"><AppIcon name="search" :size="18" />{{ t('common.search') }}</button>
      </div>

      <!-- Flights: 1-col Mobile -> 2-col Tablet (Origin ⇄ Dest row + Dates/Pax row) -> Inline Desktop -->
      <div v-else-if="tab === 'flights'" class="grid gap-2.5">
        <div class="flex gap-1.5" role="radiogroup" :aria-label="t('home.search.journey')">
          <button v-for="o in [{ id: 'round', label: t('home.search.round') }, { id: 'oneway', label: t('home.search.oneway') }]" :key="o.id" type="button" role="radio" :aria-checked="f.trip === o.id" :aria-pressed="f.trip === o.id" class="chip !min-h-[34px] !py-1" @click="f.trip = o.id as any">{{ o.label }}</button>
        </div>
        <div class="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-[1.85fr_1.25fr_0.95fr_auto] lg:items-stretch">
          <div class="grid grid-cols-1 gap-2 sm:col-span-2 sm:grid-cols-[1fr_auto_1fr] sm:items-center lg:col-span-1">
            <div :class="box('origin')"><label for="hs-origin" :class="LABEL">{{ t('home.search.origin') }}</label><SearchAutocomplete v-model="f.origin" input-id="hs-origin" domain="flights" variant="bare" :placeholder="t('home.search.phOrigin')" /></div>
            <button type="button" class="z-10 mx-auto -my-3.5 flex h-9 w-9 rotate-90 items-center justify-center rounded-full border border-line bg-surface text-ink-muted shadow-sm transition hover:border-primary hover:text-primary sm:my-0 sm:rotate-0" :aria-label="t('home.search.swapOD')" @click="swap('origin', 'dest')"><AppIcon name="swap" :size="16" /></button>
            <div :class="box('dest')"><label for="hs-dest" :class="LABEL">{{ t('home.search.arr') }}</label><SearchAutocomplete v-model="f.dest" input-id="hs-dest" domain="flights" variant="bare" :placeholder="t('home.search.phOrigin')" /></div>
          </div>
          <DateRangePicker v-if="f.trip === 'round'" v-model:start="f.flightDate" v-model:end="f.returnDate" :start-label="t('home.search.outbound')" :end-label="t('home.search.inbound')" unit="day" :min="today" :max-range="180" :invalid="!!(errors.flightDate || errors.returnDate)" />
          <DateRangePicker v-else v-model:start="f.flightDate" mode="single" :start-label="t('home.search.outbound')" :min="today" :invalid="!!errors.flightDate" />
          <GuestPicker v-model:adults="f.pax" v-model:children="f.paxChildren" :show-rooms="false" :label="t('search.passengers')" />
          <button type="submit" :class="[CTA, 'sm:col-span-2 lg:col-span-1']"><AppIcon name="search" :size="18" />{{ t('common.search') }}</button>
        </div>
      </div>

      <!-- Packages: 1-col Mobile -> 2-col Tablet -> 4-col Desktop -->
      <div v-else-if="tab === 'packages'" class="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-[1.45fr_1fr_1fr_auto]">
        <div :class="[...box('pkgDest'), 'sm:col-span-2 lg:col-span-1']"><label for="hs-pdest" :class="LABEL">{{ t('home.search.pkgDest') }}</label><SearchAutocomplete v-model="f.pkgDest" input-id="hs-pdest" domain="packages" variant="bare" :placeholder="t('home.search.phPkg')" /></div>
        <DateRangePicker v-model:start="f.pkgDate" mode="single" :start-label="t('home.search.departDate')" :min="today" />
        <GuestPicker v-model:adults="f.pax" v-model:children="f.paxChildren" :show-rooms="false" :label="t('search.travelers')" />
        <button type="submit" :class="[CTA, 'sm:col-span-2 lg:col-span-1']"><AppIcon name="search" :size="18" />{{ t('common.search') }}</button>
      </div>

      <!-- Activities -->
      <div v-else-if="tab === 'activities'" class="grid grid-cols-1 gap-2.5 sm:grid-cols-[1fr_auto]">
        <div :class="box('keyword')"><label for="hs-kw" :class="LABEL">{{ t('home.search.keyword') }}</label><SearchAutocomplete v-model="f.keyword" input-id="hs-kw" domain="things-to-do" variant="bare" :placeholder="t('home.search.phKeyword')" /></div>
        <button type="submit" :class="CTA"><AppIcon name="search" :size="18" />{{ t('common.search') }}</button>
      </div>

      <!-- Trains: 1-col Mobile -> 2-col Tablet -> Inline Desktop -->
      <div v-else-if="tab === 'trains'" class="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-[1.85fr_0.95fr_0.95fr_auto] lg:items-stretch">
        <div class="grid grid-cols-1 gap-2 sm:col-span-2 sm:grid-cols-[1fr_auto_1fr] sm:items-center lg:col-span-1">
          <div :class="box('dep')"><label for="hs-dep" :class="LABEL">{{ t('home.search.dep') }}</label><SearchAutocomplete v-model="f.dep" input-id="hs-dep" domain="trains" variant="bare" :placeholder="t('home.search.phStation')" /></div>
          <button type="button" class="z-10 mx-auto -my-3.5 flex h-9 w-9 rotate-90 items-center justify-center rounded-full border border-line bg-surface text-ink-muted shadow-sm transition hover:border-primary hover:text-primary sm:my-0 sm:rotate-0" :aria-label="t('home.search.swapDepArr')" @click="swap('dep', 'arr')"><AppIcon name="swap" :size="16" /></button>
          <div :class="box('arr')"><label for="hs-arr" :class="LABEL">{{ t('home.search.arrStation') }}</label><SearchAutocomplete v-model="f.arr" input-id="hs-arr" domain="trains" variant="bare" :placeholder="t('home.search.phStationArr')" /></div>
        </div>
        <DateRangePicker v-model:start="f.trainDate" mode="single" :start-label="t('home.search.trainDate')" :min="today" :invalid="!!errors.trainDate" />
        <GuestPicker v-model:adults="f.pax" v-model:children="f.paxChildren" :show-rooms="false" :label="t('search.riders')" />
        <button type="submit" :class="[CTA, 'sm:col-span-2 lg:col-span-1']"><AppIcon name="search" :size="18" />{{ t('common.search') }}</button>
      </div>

      <!-- Cars: 1-col Mobile -> 2-col Tablet -> 3-col Desktop -->
      <div v-else-if="tab === 'cars'" class="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-[1.55fr_1.4fr_auto]">
        <div :class="box('carPlace')"><label for="hs-car" :class="LABEL">{{ t('home.search.carPlace') }}</label><SearchAutocomplete v-model="f.carPlace" input-id="hs-car" domain="cars" variant="bare" :placeholder="t('search.suggest.phCars')" /></div>
        <DateRangePicker v-model:start="f.carFrom" v-model:end="f.carTo" :start-label="t('home.search.carFrom')" :end-label="t('home.search.carTo')" unit="day" :min="today" :max-range="60" :invalid="!!(errors.carFrom || errors.carTo)" />
        <button type="submit" :class="[CTA, 'sm:col-span-2 lg:col-span-1']"><AppIcon name="search" :size="18" />{{ t('common.search') }}</button>
      </div>

      <!-- Transfers: 1-col Mobile -> 2-col Tablet -> 4-col Desktop -->
      <div v-else class="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_0.85fr_auto]">
        <div :class="box('airport')"><label for="hs-apt" :class="LABEL">{{ t('home.search.airport') }}</label><SearchAutocomplete v-model="f.airport" input-id="hs-apt" domain="flights" variant="bare" :placeholder="t('home.search.phTransferAirport')" /></div>
        <div :class="box('area')"><label for="hs-area" :class="LABEL">{{ t('home.search.area') }}</label><SearchAutocomplete v-model="f.area" input-id="hs-area" domain="transfers" variant="bare" :placeholder="t('home.search.phTransferArea')" /></div>
        <DateRangePicker v-model:start="f.transferDate" mode="single" :start-label="t('home.search.useDate')" :min="today" :invalid="!!errors.transferDate" />
        <button type="submit" :class="CTA"><AppIcon name="search" :size="18" />{{ t('common.search') }}</button>
      </div>

      <ul v-if="Object.keys(errors).length" class="space-y-1 px-1 pt-1 text-sm font-medium text-danger" role="alert">
        <li v-for="(m, k) in errors" :key="k" class="flex items-center gap-1.5"><AppIcon name="close" :size="14" />{{ m }}</li>
      </ul>
    </form>
  </section>
</template>
