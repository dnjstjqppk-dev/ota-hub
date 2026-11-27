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
import { itemListLd, jsonLdScript } from '~/composables/useJsonLd'
import { canonicalHref, hreflangLinks, ogMeta, useActiveLocaleContext } from '~/composables/useSeoPage'
import { addDaysIso, daysBetween, fmtDay, qDate, qInt, qOneOf, qStr, todayIso, useUrlQuery } from '~/composables/useUrlQuery'
// Resolved once in setup: head getters run at render time, outside the Nuxt context.
const flightSeoSite = `https://${useRuntimeConfig().public.brandDomain}`

const { route, router, patch, isSelf } = useUrlQuery()
const currency = useCurrencyStore()
const { t, locale } = useI18n()
const localePath = useLocalePath()

const SORT_IDS = ['cheapest', 'fastest', 'earliest'] as const
const SORTS = computed(() => SORT_IDS.map((id) => ({ id, label: t(`flights.search.sort_${id}`) })))
const SLOT_DEFS = [
  { id: 'dawn', range: '00–06', from: 0, to: 6 },
  { id: 'morning', range: '06–12', from: 6, to: 12 },
  { id: 'afternoon', range: '12–18', from: 12, to: 18 },
  { id: 'evening', range: '18–24', from: 18, to: 24 }
] as const
const SLOTS = computed(() => SLOT_DEFS.map((s) => ({ ...s, label: t(`flights.search.slot_${s.id}`), range: t('flights.search.slotRange', { r: s.range }) })))
const cabinLabel = (c: string) => t(`flights.search.cabin_${c}`, c)

const q = computed(() => {
  const r = route.query
  const date = qDate(r.date)
  const returnDate = date && qDate(r.returnDate) >= date ? qDate(r.returnDate) : ''
  return {
    origin: qStr(r.origin || r.dcity), dest: qStr(r.dest || r.acity), date, returnDate,
    adults: qInt(r.adults, 1, 1, 9), children: qInt(r.children, 0, 0, 8),
    stops: qStr(r.stops) === '0' ? 0 : null as number | null,
    slots: qStr(r.slots).split(',').filter((s) => SLOT_DEFS.some((x) => x.id === s)),
    airlines: qStr(r.airlines).split(',').filter(Boolean),
    bag: qStr(r.bag) === '1',
    sort: qOneOf(r.sortBy, [...SORT_IDS], 'cheapest'),
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
  if (!draft.origin.trim() || !draft.dest.trim()) { formError.value = t('flights.search.errRoute'); return }
  if (draft.origin.trim() === draft.dest.trim()) { formError.value = t('flights.search.errSame'); return }
  if (!draft.date) { formError.value = t('flights.search.errDate'); return }
  if (draft.trip === 'round' && !draft.returnDate) { formError.value = t('flights.search.errReturn'); return }
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
    (!x.slots.length || x.slots.some((s) => { const sl = SLOT_DEFS.find((z) => z.id === s)!; const h = hour(f.departure_time); return h >= sl.from && h < sl.to })))
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
const hm = (m: number) => (m % 60 ? t('flights.search.durHM', { h: Math.floor(m / 60), m: m % 60 }) : t('flights.search.durH', { h: Math.floor(m / 60) }))
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
  router.push(localePath({ path: '/checkout', query: {
    domain: 'FLIGHT', itemId: outId, startDate: x.date,
    ...(step.value === 'return' ? { returnItemId: f.id, returnDate: x.returnDate } : {}),
    adults: String(x.adults), ...(x.children ? { children: String(x.children) } : {})
  } }) as any)
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
// TG-15: SSR the first paint (ISR caches it); the watcher re-loads on client query changes.
await useSsrLoad('tg15-flights-list', load, { outbound, returns, state })
if (state.value === 'error' && import.meta.server) throw createError({ statusCode: 503, statusMessage: 'Catalog temporarily unavailable' })
onMounted(() => { today.value = todayIso() })
onBeforeUnmount(() => ctrl?.abort())

const heading = computed(() => {
  const x = q.value
  if (!x.origin || !x.dest) return t('flights.search.title')
  return step.value === 'return' ? `${cityOf(x.dest)} → ${cityOf(x.origin)}` : `${cityOf(x.origin)} → ${cityOf(x.dest)}`
})
const flightLocaleCtx = useActiveLocaleContext()
useHead(() => ({ title: q.value.origin && q.value.dest ? t('flights.search.docTitle', { o: cityOf(q.value.origin), d: cityOf(q.value.dest) }) : t('flights.search.title'), meta: [...ogMeta(flightSeoSite, '/flights/search', null, flightLocaleCtx.value.locale, flightLocaleCtx.value.sub)], link: [{ rel: 'canonical', href: canonicalHref('/flights/search', { sub: flightLocaleCtx.value.sub, locale: flightLocaleCtx.value.locale }) }, ...hreflangLinks(flightSeoSite, '/flights/search')] }))
// S7: visible results as ItemList for AI overviews (canonical bare paths).
useHead(() => {
  const elements = filtered.value
    .filter((f) => f && f.id)
    .map((f) => ({ name: [f.airline_name, f.flight_number, f.departure_airport, f.arrival_airport].filter(Boolean).join(' '), path: detailLink(f).path }))
    .filter((it) => it.name)
  return elements.length ? { script: [jsonLdScript(itemListLd(flightSeoSite, t('nav.flights'), elements))] } : {}
})
</script>

<template>
  <div class="pb-24 lg:pb-16">
    <!-- Search bar -->
    <section class="border-b border-line bg-surface">
      <div class="mx-auto max-w-7xl px-4 py-3 lg:px-6 lg:py-4">
        <button v-if="!formOpen" type="button" class="flex w-full items-center gap-3 rounded-2xl border border-line bg-canvas px-4 py-2.5 text-left lg:hidden" @click="formOpen = true">
          <AppIcon name="flight" class="text-ink-subtle" />
          <span class="min-w-0 flex-1">
            <span class="block truncate font-bold text-ink">{{ q.origin && q.dest ? `${cityOf(q.origin)} → ${cityOf(q.dest)}` : $t('flights.search.whereTo') }}</span>
            <span class="block truncate text-xs text-ink-muted">{{ $t('flights.search.phoneSummary', { date: q.date ? fmtDay(q.date) : $t('hotels.list.whenTbd'), ret: q.returnDate ? $t('flights.search.retPart', { d: fmtDay(q.returnDate) }) : $t('flights.search.onewayPart'), n: pax }) }}</span>
          </span>
          <span class="text-sm font-semibold text-primary">{{ $t('hotels.list.change') }}</span>
        </button>

        <form :class="['space-y-2 lg:block', formOpen ? 'block' : 'hidden']" novalidate @submit.prevent="submit">
          <div class="flex gap-1" role="radiogroup" :aria-label="$t('flights.search.tripAria')">
            <button v-for="tid in (['oneway', 'round'] as const)" :key="tid" type="button" role="radio" :aria-checked="draft.trip === tid" :aria-pressed="draft.trip === tid" class="chip py-1.5" @click="draft.trip = tid">{{ $t(`flights.search.trip_${tid}`) }}</button>
          </div>
          <div class="grid gap-2 lg:grid-cols-[1fr_auto_1fr_1.25fr_0.9fr_auto] lg:items-stretch">
            <div class="field-box"><label for="fs-origin" class="field-label">{{ $t('flights.search.origin') }}</label><SearchAutocomplete v-model="draft.origin" input-id="fs-origin" domain="flights" variant="bare" :placeholder="$t('flights.search.airportPh')" /></div>
            <button type="button" class="z-10 mx-auto -my-4 flex h-10 w-10 rotate-90 items-center justify-center self-center rounded-full border border-line bg-surface text-ink-muted hover:text-primary lg:my-0 lg:rotate-0" :aria-label="$t('flights.search.swap')" @click="swap"><AppIcon name="swap" :size="18" /></button>
            <div class="field-box"><label for="fs-dest" class="field-label">{{ $t('flights.search.dest') }}</label><SearchAutocomplete v-model="draft.dest" input-id="fs-dest" domain="flights" variant="bare" :placeholder="$t('flights.search.airportPh')" /></div>
            <DateRangePicker v-if="draft.trip === 'round'" v-model:start="draft.date" v-model:end="draft.returnDate" :start-label="$t('checkout.startFlight')" :end-label="$t('checkout.returnDate')" unit="day" :min="today" :max-range="180" compact />
            <DateRangePicker v-else v-model:start="draft.date" mode="single" :start-label="$t('checkout.startFlight')" :min="today" compact />
            <GuestPicker v-model:adults="draft.adults" v-model:children="draft.children" :show-rooms="false" :label="$t('flights.search.pax')" compact />
            <div class="flex gap-2">
              <button v-if="formOpen" type="button" class="btn-secondary lg:hidden" @click="formOpen = false; syncDraft()">{{ $t('common.cancel') }}</button>
              <button type="submit" class="btn-primary min-h-[52px] flex-1 rounded-2xl px-7 text-base"><AppIcon name="search" :size="18" />{{ $t('common.search') }}</button>
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
          <nav class="mb-1 flex items-center gap-1 text-xs text-ink-subtle" :aria-label="$t('common.breadcrumb')"><NuxtLink :to="$localePath('/')" class="hover:text-ink">{{ $t('common.home') }}</NuxtLink><AppIcon name="chevron-right" :size="12" /><NuxtLink :to="$localePath('/flights')" class="hover:text-ink">{{ $t('nav.flights') }}</NuxtLink></nav>
          <p v-if="roundTrip" class="mb-1 text-xs font-bold uppercase tracking-wide text-primary">{{ step === 'return' ? $t('flights.search.stepReturn') : $t('flights.search.stepOut') }}</p>
          <h1 class="text-xl font-bold tracking-tight text-ink sm:text-2xl">{{ heading }} <span v-if="state === 'ready' && q.origin" class="ml-1 text-base font-semibold text-ink-subtle tabular">{{ $t('flights.search.count', { n: filtered.length }) }}</span></h1>
        </div>
        <label class="flex items-center gap-2 text-sm text-ink-muted">
          <span class="hidden sm:inline">{{ $t('hotels.list.sort') }}</span>
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
            <p class="font-semibold text-ink">{{ $t('flights.search.chosenOut', { d: fmtDay(q.date, true), al: chosenOut.airline_name, fn: chosenOut.flight_number }) }}</p>
            <p class="text-ink-muted tabular">{{ chosenOut.departure_time }} {{ chosenOut.departure_airport }} → {{ chosenOut.arrival_time }} {{ chosenOut.arrival_airport }} · {{ currency.formatKRW(chosenOut.base_price_krw) }}</p>
          </div>
        </div>
        <button type="button" class="text-sm font-semibold text-primary hover:underline" @click="patch({ out: '' })">{{ $t('flights.search.repickOut') }}</button>
      </div>
      <p v-else-if="step === 'return' && state === 'ready' && !chosenOut" class="card mb-4 p-4 text-sm text-ink" role="alert">
        {{ $t('flights.search.outLost') }} <button type="button" class="font-semibold text-primary hover:underline" @click="patch({ out: '' })">{{ $t('flights.search.repickFromOut') }}</button>
      </p>

      <!-- Date strip -->
      <div v-if="strip.length" class="chip-rail -mx-4 mb-4 flex gap-1.5 px-4 pb-1">
        <button v-for="s in strip" :key="s.d" type="button" :aria-pressed="s.on" :disabled="s.disabled" class="seg min-w-[84px] flex-1 py-2.5 disabled:pointer-events-none disabled:opacity-30" @click="pickDay(s.d)">{{ s.label }}</button>
      </div>

      <!-- Phone filter chips -->
      <div class="chip-rail -mx-4 mb-3 flex gap-2 px-4 pb-1 lg:hidden">
        <button type="button" class="chip" :aria-pressed="activeCount > 0" @click="sheet = true"><AppIcon name="menu" :size="16" />{{ $t('hotels.list.filter') }}<span v-if="activeCount" class="flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-primary px-1 text-2xs text-primary-ink">{{ activeCount }}</span></button>
        <button type="button" class="chip" :aria-pressed="q.stops === 0" @click="patch({ stops: q.stops === 0 ? '' : '0' })">{{ $t('flights.search.nonstop') }}</button>
        <button type="button" class="chip" :aria-pressed="q.slots.includes('morning')" @click="toggleList('slots', 'morning')">{{ $t('flights.search.morningDep') }}</button>
        <button type="button" class="chip" :aria-pressed="q.bag" @click="patch({ bag: q.bag ? '' : '1' })">{{ $t('flights.search.withBag') }}</button>
      </div>

      <div class="grid gap-6 lg:grid-cols-[272px_1fr]">
        <aside class="hidden lg:block" :aria-label="$t('hotels.list.filter')">
          <div class="card sticky top-24 p-5">
            <div class="mb-4 flex items-center justify-between">
              <h2 class="font-bold text-ink">{{ $t('hotels.list.filter') }}</h2>
              <button v-if="activeCount" type="button" class="text-sm font-semibold text-primary hover:underline" @click="patch(RESET)">{{ $t('hotels.list.reset') }}</button>
            </div>
            <FlightFilterPanel :q="q" :slots="SLOTS" :airlines="airlines" @patch="patch" @toggle="toggleList" />
          </div>
        </aside>

        <div class="min-w-0">
          <p class="mb-3 flex items-start gap-1.5 text-xs text-ink-subtle">
            <AppIcon name="check" :size="14" class="mt-px" />{{ $t('flights.search.priceNote') }}
          </p>

          <div v-if="!q.origin || !q.dest" class="card px-6 py-12 text-center">
            <span class="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-soft text-primary"><AppIcon name="flight" /></span>
            <p class="mt-4 font-bold text-ink">{{ $t('flights.search.needRoute') }}</p>
            <p class="mt-1 text-sm text-ink-muted">{{ $t('flights.search.needRouteSub') }}</p>
          </div>

          <ResultsState v-else :state="state" :count="filtered.length" icon="flight" :empty-title="step === 'return' ? $t('flights.search.emptyReturn') : $t('flights.search.emptyOut')" :empty-hint="step === 'return' ? $t('flights.search.emptyReturnHint') : $t('flights.search.emptyOutHint')" :error-title="$t('flights.search.loadFail')" @retry="load">
            <template #empty-actions>
              <button v-if="activeCount" type="button" class="btn-primary" @click="patch(RESET)">{{ $t('hotels.list.resetFilters') }}</button>
              <button v-if="step === 'return'" type="button" class="btn-secondary" @click="patch({ out: '' })">{{ $t('flights.search.repickOut') }}</button>
            </template>
            <ul class="space-y-3">
              <li v-for="f in filtered" :key="f.id">
                <article class="card defer-paint group relative flex flex-col gap-4 p-4 transition-shadow hover:shadow-pop sm:p-5 md:flex-row md:items-center">
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
                        <p :class="['text-xs font-semibold', Number(f.stops || 0) === 0 ? 'text-success' : 'text-warning']">{{ Number(f.stops || 0) === 0 ? $t('flights.search.nonstop') : $t('flights.search.stopsN', { n: f.stops }) }}</p>
                      </div>
                      <div class="text-right">
                        <p class="text-lg font-bold text-ink tabular">{{ f.arrival_time }}<sup v-if="plusDays(f)" class="ml-0.5 text-2xs font-bold text-warning">+{{ plusDays(f) }}</sup></p>
                        <p class="text-xs font-semibold text-ink-muted">{{ f.arrival_airport }}</p>
                      </div>
                    </div>
                  </div>
                  <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted md:w-44 md:flex-col md:items-start">
                    <span class="font-semibold text-ink">{{ f.airline_name }} <span class="font-normal text-ink-subtle">{{ f.flight_number }}</span></span>
                    <span>{{ cabinLabel(f.cabin_class) }}<template v-if="Number(f.free_baggage_kg) > 0"> · {{ $t('flights.search.bagKg', { kg: f.free_baggage_kg }) }}</template></span>
                    <span v-if="Number(f.available_seats) > 0 && Number(f.available_seats) <= 5" class="font-semibold text-warning">{{ $t('flights.search.seatsLeft', { n: f.available_seats }) }}</span>
                    <span v-if="f.bookable === false" class="font-semibold text-warning">{{ $t('hotels.list.notBookableNow') }}</span>
                  </div>
                  <div class="flex items-center justify-between gap-3 border-t border-line pt-3 md:flex-col md:items-end md:border-0 md:pt-0">
                    <div class="text-left md:text-right">
                      <p class="text-xl font-extrabold text-ink tabular">{{ currency.formatKRW(f.base_price_krw) }}</p>
                      <p class="text-2xs text-ink-subtle">{{ $t('flights.search.refPrice') }}</p>
                    </div>
                    <div class="flex gap-2">
                      <NuxtLink :to="$localePath(detailLink(f))" class="btn-secondary px-3.5">{{ $t('flights.search.detail') }}</NuxtLink>
                      <button v-if="f.bookable === true" type="button" class="btn-primary" :disabled="!q.date" @click="choose(f)">{{ roundTrip && step === 'outbound' ? $t('flights.search.pickOut') : $t('flights.search.pick') }}</button>
                    </div>
                  </div>
                </article>
              </li>
            </ul>
          </ResultsState>
        </div>
      </div>
    </div>

    <FilterSheet :open="sheet" :apply-label="state === 'loading' ? $t('hotels.list.searching') : $t('flights.search.viewCount', { n: filtered.length })" @close="sheet = false" @reset="patch(RESET)">
      <FlightFilterPanel :q="q" :slots="SLOTS" :airlines="airlines" @patch="patch" @toggle="toggleList" />
    </FilterSheet>
  </div>
</template>
