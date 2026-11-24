<script setup lang="ts">
/**
 * A row of real catalogue items for a product landing page (design system "Horizon").
 * Flights and trains are grouped into routes with the lowest current reference fare; everything links
 * to a real result or detail page. The section hides itself when the API returns nothing.
 */
import { computed, onMounted, ref } from 'vue'
import { useCurrencyStore } from '~/stores/currency'
import { useApiUrl } from '~/composables/useApi'

type Kind = 'hotels' | 'flights' | 'trains' | 'cars' | 'transfers' | 'packages'
const props = withDefaults(defineProps<{ kind: Kind; title: string; hint?: string; limit?: number }>(), { limit: 8 })
const currency = useCurrencyStore()
const { t } = useI18n()

interface Card { key: string; to: string; img?: string | null; icon: string; eyebrow: string; title: string; meta?: string; price: number | null; unit: string }
const rows = ref<any[]>([])
const state = ref<'loading' | 'ready' | 'error'>('loading')

const API: Record<Kind, string> = { hotels: '/hotels?sortBy=score_desc&limit=100', flights: '/flights?limit=100', trains: '/trains', cars: '/cars', transfers: '/transfers', packages: '/packages' }
async function load() {
  state.value = 'loading'
  try {
    const r = await fetch(useApiUrl(API[props.kind]), { signal: AbortSignal.timeout(10000) })
    if (!r.ok) throw new Error(String(r.status))
    rows.value = (await r.json()).data || []
    state.value = 'ready'
  } catch { state.value = 'error' }
}
onMounted(load)

const enc = encodeURIComponent
const hm = (m: number) => `${Math.floor(m / 60)}${t('landing.hours')}${m % 60 ? ` ${m % 60}${t('landing.minutes')}` : ''}`
function routes(list: any[], from: string, to: string, fromLabel: (x: any) => string, toLabel: (x: any) => string, price: string) {
  const map = new Map<string, any[]>()
  for (const x of list) { const k = `${x[from]}→${x[to]}`; map.set(k, [...(map.get(k) || []), x]) }
  return [...map.values()].map((g) => ({ g, min: Math.min(...g.map((x) => Number(x[price]) || Infinity)), a: fromLabel(g[0]), b: toLabel(g[0]) }))
}
const cards = computed<Card[]>(() => {
  const list = rows.value
  const cityOf = (s: string) => String(s || '').replace(/\s*\([^)]*\)/, '')
  switch (props.kind) {
    case 'flights':
      return routes(list, 'departure_airport', 'arrival_airport', (x) => x.departure_airport, (x) => x.arrival_airport, 'base_price_krw')
        .sort((p, q) => p.min - q.min)
        .map(({ g, min, a, b }) => ({ key: `${a}-${b}`, to: `/flights/search?origin=${enc(a)}&dest=${enc(b)}`, icon: 'flight', eyebrow: `${cityOf(g[0].departure_city)} → ${cityOf(g[0].arrival_city)}`, title: `${a} → ${b}`, meta: t('landing.flightMeta', { n: g.length, a: [...new Set(g.map((x) => x.airline_name))].join(', ') }), price: Number.isFinite(min) ? min : null, unit: t('landing.unitFlight') }))
    case 'trains':
      return routes(list, 'departure_station', 'arrival_station', (x) => x.departure_station, (x) => x.arrival_station, 'price_krw')
        .map(({ g, min, a, b }) => ({ key: `${a}-${b}`, to: `/trains/search?dep=${enc(a)}&arr=${enc(b)}`, icon: 'train', eyebrow: [...new Set(g.map((x) => x.train_type))].join(' · '), title: `${a} → ${b}`, meta: t('landing.trainMeta', { n: g.length, d: hm(Math.min(...g.map((x) => x.duration_minutes))) }), price: Number.isFinite(min) ? min : null, unit: t('landing.unitTrain') }))
    case 'hotels':
      return list.map((h) => ({ key: h.id, to: `/hotels/detail/${h.id}`, img: h.thumbnail_url, icon: 'hotel', eyebrow: [h.city, h.star_rating ? t('landing.hotelStars', { n: h.star_rating }) : ''].filter(Boolean).join(' · '), title: h.name_ko, meta: h.review_score ? t('landing.hotelScore', { s: Number(h.review_score).toFixed(1) }) : t('landing.hotelNew'), price: Number(h.base_price_krw) || null, unit: t('landing.unitHotel') }))
    case 'cars':
      return list.map((c) => ({ key: c.id, to: `/cars/detail/${c.id}`, img: c.image_url, icon: 'car', eyebrow: c.company_name, title: c.vehicle_model, meta: c.pickup_location, price: Number(c.daily_price_krw) || null, unit: t('landing.unitCar') }))
    case 'transfers':
      return list.map((x) => ({ key: x.id, to: `/transfers/detail/${x.id}`, img: x.image_url, icon: 'transfer', eyebrow: t('landing.transferFrom', { a: x.airport_code }), title: x.service_title, meta: x.max_passengers ? t('landing.transferPax', { n: x.max_passengers }) : '', price: Number(x.price_krw) || null, unit: t('landing.unitTransfer') }))
    case 'packages':
      return list.map((p) => ({ key: p.id, to: `/packages/detail/${p.id}`, img: p.thumbnail_url || p.hero_image_url, icon: 'package', eyebrow: p.destination_city, title: p.title, meta: '', price: Number(p.bundle_price_krw ?? p.total_package_krw) || null, unit: t('landing.unitPackage') }))
  }
  return []
})
const shown = computed(() => cards.value.slice(0, props.limit))
const hasImages = computed(() => !['flights', 'trains'].includes(props.kind))
</script>

<template>
  <section v-if="state !== 'ready' || shown.length" class="mx-auto mt-14 max-w-7xl px-4 lg:px-6" :aria-label="title">
    <div class="mb-5">
      <h2 class="text-2xl font-bold tracking-tight text-ink">{{ title }}</h2>
      <p v-if="hint" class="mt-1 text-sm text-ink-muted">{{ hint }}</p>
    </div>
    <div v-if="state === 'loading'" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div v-for="n in 4" :key="n" class="h-40 animate-pulse rounded-card bg-surface-sunken" />
    </div>
    <div v-else-if="state === 'error'" class="card p-6 text-center text-sm">
      <span class="text-ink-muted">{{ t('landing.railError') }}</span>
      <button type="button" class="ml-2 font-semibold text-primary" @click="load">{{ t('common.retry') }}</button>
    </div>
    <ul v-else class="-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-4 [&::-webkit-scrollbar]:hidden">
      <li v-for="c in shown" :key="c.key" class="w-[78vw] max-w-[300px] shrink-0 snap-start sm:w-auto sm:max-w-none">
        <NuxtLink :to="$localePath(c.to)" class="card group flex h-full flex-col overflow-hidden transition-shadow hover:shadow-pop">
          <SmartImg v-if="hasImages" :src="c.img" :alt="c.title" :icon="c.icon" img-class="aspect-[16/10] w-full object-cover transition-transform duration-500 group-hover:scale-105" />
          <div class="flex flex-1 flex-col p-4">
            <span v-if="!hasImages" class="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-primary-soft text-primary"><AppIcon :name="c.icon" /></span>
            <p class="line-clamp-1 text-xs text-ink-subtle">{{ c.eyebrow }}</p>
            <h3 class="mt-0.5 line-clamp-2 font-bold leading-snug text-ink group-hover:text-primary">{{ c.title }}</h3>
            <p v-if="c.meta" class="mt-1 line-clamp-1 text-xs text-ink-muted">{{ c.meta }}</p>
            <div class="mt-auto pt-3">
              <p v-if="c.price" class="text-lg font-extrabold text-ink tabular">{{ currency.formatKRW(c.price) }}</p>
              <p class="text-2xs text-ink-subtle">{{ c.unit }} · {{ t('landing.refPrice') }}</p>
            </div>
          </div>
        </NuxtLink>
      </li>
    </ul>
  </section>
</template>
