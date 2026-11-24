<script setup lang="ts">
/**
 * Airport transfer results (design system "Horizon"). URL = state (airport, destination, date, passengers).
 * API only. Price is per vehicle, one way; vehicles too small for the party are hidden (the quote API
 * rejects them with OCCUPANCY_EXCEEDED) and the page says so.
 */
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useCurrencyStore } from '~/stores/currency'
import { useApiUrl } from '~/composables/useApi'
import { fmtDay, qDate, qInt, qOneOf, qStr, todayIso, useUrlQuery } from '~/composables/useUrlQuery'

const { route, router, patch, isSelf } = useUrlQuery()
const currency = useCurrencyStore()
const { t } = useI18n()
const localePath = useLocalePath()

const SORT_IDS = ['price_asc', 'price_desc', 'capacity'] as const
const SORTS = computed(() => SORT_IDS.map((id) => ({ id, label: t(`transfers.list.sort_${id}`) })))
const q = computed(() => {
  const r = route.query
  return {
    airport: qStr(r.airport), destination: qStr(r.destination || r.dest), date: qDate(r.date || r.startDate),
    adults: qInt(r.adults || r.passengers, 2, 1, 9), children: qInt(r.children, 0, 0, 8),
    sort: qOneOf(r.sortBy, [...SORT_IDS], 'price_asc')
  }
})
const pax = computed(() => q.value.adults + q.value.children)

const today = ref('')
const draft = reactive({ airport: '', destination: '', date: '', adults: 2, children: 0 })
const formOpen = ref(false)
const formError = ref('')
function syncDraft() { const x = q.value; Object.assign(draft, { airport: x.airport, destination: x.destination, date: x.date, adults: x.adults, children: x.children }) }
syncDraft()
function submit() {
  formError.value = ''
  if (!draft.airport.trim()) { formError.value = t('transfers.list.errAirport'); return }
  formOpen.value = false
  router.replace({ query: { airport: draft.airport.trim(), ...(draft.destination.trim() ? { destination: draft.destination.trim() } : {}), ...(draft.date ? { date: draft.date } : {}), adults: String(draft.adults), ...(draft.children ? { children: String(draft.children) } : {}) } })
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
    const p = new URLSearchParams()
    if (x.airport) p.set('airport', x.airport)
    if (x.destination) p.set('destination', x.destination)
    const res = await fetch(`${useApiUrl('/transfers')}?${p}`, { signal: mine.signal })
    if (!res.ok) throw new Error(String(res.status))
    const j = await res.json()
    if (mine !== ctrl) return
    items.value = Array.isArray(j.data) ? j.data : []
    state.value = 'ready'
  } catch { if (mine === ctrl) state.value = 'error' } finally { clearTimeout(timer) }
}
const fits = computed(() => items.value.filter((t) => !Number(t.max_passengers) || Number(t.max_passengers) >= pax.value))
const hiddenBySize = computed(() => items.value.length - fits.value.length)
const sorted = computed(() => {
  const by = { price_asc: (a: any, b: any) => a.price_krw - b.price_krw, price_desc: (a: any, b: any) => b.price_krw - a.price_krw, capacity: (a: any, b: any) => b.max_passengers - a.max_passengers }[q.value.sort]
  return [...fits.value].sort(by)
})

function paxQuery() { const x = q.value; return { adults: String(x.adults), ...(x.children ? { children: String(x.children) } : {}) } }
function detailLink(t: any) { return { path: `/transfers/detail/${t.id}`, query: { ...(q.value.date ? { startDate: q.value.date } : {}), ...paxQuery() } } }
function book(t: any) { router.push(localePath({ path: '/checkout', query: { domain: 'TRANSFER', itemId: t.id, startDate: q.value.date, ...paxQuery() } }) as any) }

watch(() => route.fullPath, () => { if (isSelf()) syncDraft() })
watch(() => [q.value.airport, q.value.destination], () => { if (isSelf()) load() })
// TG-15: SSR the first paint (ISR caches it); the watcher re-loads on client query changes.
await useAsyncData('tg15-transfers-list', () => load())
if (state.value === 'error' && import.meta.server) throw createError({ statusCode: 503, statusMessage: 'Catalog temporarily unavailable' })
onMounted(() => { today.value = todayIso() })
onBeforeUnmount(() => ctrl?.abort())
useHead(() => ({ title: q.value.airport ? t('transfers.list.docTitle', { a: q.value.airport }) : t('transfers.list.title') }))
</script>

<template>
  <div class="pb-24 lg:pb-16">
    <section class="border-b border-line bg-surface">
      <div class="mx-auto max-w-7xl px-4 py-3 lg:px-6 lg:py-4">
        <button v-if="!formOpen" type="button" class="flex w-full items-center gap-3 rounded-2xl border border-line bg-canvas px-4 py-2.5 text-left lg:hidden" @click="formOpen = true">
          <AppIcon name="transfer" class="text-ink-subtle" />
          <span class="min-w-0 flex-1">
            <span class="block truncate font-bold text-ink">{{ q.airport ? `${q.airport}${q.destination ? ` → ${q.destination}` : ''}` : $t('transfers.list.pickAirport') }}</span>
            <span class="block truncate text-xs text-ink-muted">{{ $t('trains.search.phoneSummary', { date: q.date ? fmtDay(q.date) : $t('hotels.list.whenTbd'), n: pax }) }}</span>
          </span>
          <span class="text-sm font-semibold text-primary">{{ $t('hotels.list.change') }}</span>
        </button>
        <form :class="['lg:block', formOpen ? 'block' : 'hidden']" novalidate @submit.prevent="submit">
          <div class="grid gap-2 lg:grid-cols-[1fr_1fr_0.9fr_0.9fr_auto]">
            <div class="field-box"><label for="tl-apt" class="field-label">{{ $t('transfers.list.airport') }}</label><SearchAutocomplete v-model="draft.airport" input-id="tl-apt" domain="flights" variant="bare" :placeholder="$t('transfers.list.airportPh')" /></div>
            <div class="field-box"><label for="tl-dest" class="field-label">{{ $t('transfers.list.destOpt') }}</label><SearchAutocomplete v-model="draft.destination" input-id="tl-dest" domain="transfers" variant="bare" :placeholder="$t('transfers.list.destPh')" /></div>
            <DateRangePicker v-model:start="draft.date" mode="single" :start-label="$t('checkout.startDefault')" :min="today" compact />
            <GuestPicker v-model:adults="draft.adults" v-model:children="draft.children" :show-rooms="false" :label="$t('transfers.list.riders')" compact />
            <div class="flex gap-2">
              <button v-if="formOpen" type="button" class="btn-secondary lg:hidden" @click="formOpen = false; syncDraft()">{{ $t('common.cancel') }}</button>
              <button type="submit" class="btn-primary min-h-[52px] flex-1 rounded-2xl px-7 text-base"><AppIcon name="search" :size="18" />{{ $t('common.search') }}</button>
            </div>
          </div>
          <p v-if="formError" class="mt-2 text-sm font-medium text-danger" role="alert">{{ formError }}</p>
        </form>
      </div>
    </section>

    <div class="mx-auto max-w-7xl px-4 lg:px-6">
      <div class="flex flex-wrap items-end justify-between gap-3 pb-3 pt-6">
        <div>
          <nav class="mb-1 flex items-center gap-1 text-xs text-ink-subtle" :aria-label="$t('common.breadcrumb')"><NuxtLink :to="$localePath('/')" class="hover:text-ink">{{ $t('common.home') }}</NuxtLink><AppIcon name="chevron-right" :size="12" /><NuxtLink :to="$localePath('/transfers')" class="hover:text-ink">{{ $t('nav.transfers') }}</NuxtLink></nav>
          <h1 class="text-xl font-bold tracking-tight text-ink sm:text-2xl">{{ q.airport ? $t('transfers.list.h1city', { a: q.airport }) : $t('transfers.list.h1all') }} <span v-if="state === 'ready'" class="ml-1 text-base font-semibold text-ink-subtle tabular">{{ $t('hotels.list.count', { n: sorted.length }) }}</span></h1>
          <p v-if="q.date" class="mt-0.5 text-sm text-ink-muted">{{ $t('trains.search.phoneSummary', { date: fmtDay(q.date, true), n: pax }) }}</p>
        </div>
        <label class="flex items-center gap-2 text-sm text-ink-muted">
          <span class="hidden sm:inline">{{ $t('hotels.list.sort') }}</span>
          <select :value="q.sort" class="rounded-xl border border-line bg-surface py-2 pl-3 pr-8 text-sm font-semibold text-ink focus:border-primary focus:outline-none" @change="patch({ sortBy: ($event.target as HTMLSelectElement).value === 'price_asc' ? '' : ($event.target as HTMLSelectElement).value })">
            <option v-for="s in SORTS" :key="s.id" :value="s.id">{{ s.label }}</option>
          </select>
        </label>
      </div>

      <p class="mb-3 flex items-start gap-1.5 text-xs text-ink-subtle"><AppIcon name="check" :size="14" class="mt-px" />{{ $t('transfers.list.priceNote') }}</p>
      <p v-if="state === 'ready' && hiddenBySize" class="mb-3 rounded-xl bg-surface-sunken px-4 py-2.5 text-sm text-ink-muted">{{ $t('transfers.list.hiddenBySize', { n: pax, c: hiddenBySize }) }}</p>

      <ResultsState :state="state" :count="sorted.length" icon="transfer" :empty-title="hiddenBySize ? $t('transfers.list.emptySize', { n: pax }) : $t('transfers.list.emptyAll')" :empty-hint="hiddenBySize ? $t('transfers.list.emptySizeHint') : $t('transfers.list.emptyAllHint')" :error-title="$t('transfers.list.loadFail')" @retry="load">
        <template #empty-actions><button v-if="q.destination" type="button" class="btn-secondary" @click="patch({ destination: '', dest: '' })">{{ $t('transfers.list.noDest') }}</button></template>
        <ul class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <li v-for="t in sorted" :key="t.id">
            <article class="card group relative flex h-full flex-col overflow-hidden transition-shadow hover:shadow-pop">
              <SmartImg :src="t.image_url" :alt="t.service_title" icon="transfer" img-class="aspect-[16/10] w-full object-cover" />
              <div class="flex flex-1 flex-col p-4">
                <p class="text-xs font-semibold text-primary">{{ $t('transfers.list.fromAirport', { a: t.airport_code }) }}</p>
                <h2 class="mt-0.5 font-bold leading-snug text-ink"><NuxtLink :to="$localePath(detailLink(t))" class="after:absolute after:inset-0 group-hover:text-primary">{{ t.service_title }}</NuxtLink></h2>
                <p v-if="t.destination_area" class="mt-2 flex items-start gap-1 text-xs text-ink-muted"><AppIcon name="map-pin" :size="14" class="mt-px text-ink-subtle" /><span class="line-clamp-2">{{ t.destination_area }}</span></p>
                <ul class="mt-2 flex flex-wrap gap-1.5 text-xs text-ink-muted">
                  <li v-if="t.max_passengers" class="flex items-center gap-1 rounded-md bg-surface-sunken px-2 py-0.5"><AppIcon name="users" :size="12" />{{ $t('transfers.list.maxPax', { n: t.max_passengers }) }}</li>
                  <li v-if="t.max_luggage" class="flex items-center gap-1 rounded-md bg-surface-sunken px-2 py-0.5"><AppIcon name="briefcase" :size="12" />{{ $t('transfers.list.maxLug', { n: t.max_luggage }) }}</li>
                  <li v-if="Number(t.flight_tracking)" class="rounded-md bg-surface-sunken px-2 py-0.5">{{ $t('transfers.list.tracking') }}</li>
                </ul>
                <div class="mt-auto flex items-end justify-between gap-2 border-t border-line pt-3">
                  <div><p class="text-lg font-extrabold text-ink tabular">{{ currency.formatKRW(t.price_krw) }}</p><p class="text-2xs text-ink-subtle">{{ $t('transfers.list.perVehicle') }}</p></div>
                  <button v-if="t.bookable !== false && q.date" type="button" class="btn-primary relative z-[1]" @click="book(t)">{{ $t('flights.search.pick') }}</button>
                  <span v-else-if="t.bookable === false" class="text-xs font-semibold text-warning">{{ $t('transfers.list.noDirect') }}</span>
                </div>
              </div>
            </article>
          </li>
        </ul>
      </ResultsState>
    </div>
  </div>
</template>
