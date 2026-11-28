<script setup lang="ts">
/**
 * Home (design system "Terra Nord").
 * Architectural Nordic-Editorial layout with explicit Web / Tablet / Mobile ergonomics.
 * Every product, price and promotion shown here comes from the API — zero fabricated data.
 */
import { computed, onMounted, ref } from 'vue'
import { useCurrencyStore } from '~/stores/currency'
import { useApiUrl } from '~/composables/useApi'
import { CATEGORIES } from '~/config/navigation'
import { canonicalHref, hreflangLinks, useActiveLocaleContext } from '~/composables/useSeoPage'
import { useRecentlyViewed } from '~/composables/useRecentlyViewed'

const currency = useCurrencyStore()
const recent = useRecentlyViewed()
const { t, locale } = useI18n()
const localeCtx = useActiveLocaleContext()

useHead({
  title: () => t('seo.home.title'),
  htmlAttrs: { lang: () => localeCtx.value.hreflang },
  meta: [
    { name: 'description', content: () => t('seo.home.description') },
    { property: 'og:site_name', content: 'getfortrip' },
    { property: 'og:url', content: () => canonicalHref('/', { sub: localeCtx.value.sub, locale: localeCtx.value.locale }) }
  ],
  link: [
    { rel: 'canonical', href: () => canonicalHref('/', { sub: localeCtx.value.sub, locale: localeCtx.value.locale }) },
    ...hreflangLinks('https://getfortrip.com', '/')
  ]
})

type Load = 'loading' | 'ready' | 'error'
const hotels = ref<any[]>([]); const hotelState = ref<Load>('loading')
const activities = ref<any[]>([]); const activityState = ref<Load>('loading')
const promos = ref<any[]>([])
const moments = ref<any[]>([])

const hotelName = (h: any) => (locale.value === 'ko' ? (h.name_ko || h.name) : (h.name_en || h.name_ko || h.name))

async function getJson(path: string) {
  const r = await fetch(useApiUrl(path))
  if (!r.ok) throw new Error(`${path} ${r.status}`)
  return r.json()
}
async function loadHotels() {
  hotelState.value = 'loading'
  try { hotels.value = ((await getJson('/hotels?sortBy=score_desc&limit=8')).data || []).slice(0, 8); hotelState.value = 'ready' } catch { hotelState.value = 'error' }
}
async function loadActivities() {
  activityState.value = 'loading'
  try { activities.value = ((await getJson('/activities?limit=4')).data || []).slice(0, 4); activityState.value = 'ready' } catch { activityState.value = 'error' }
}

onMounted(() => {
  recent.hydrate()
  loadHotels()
  loadActivities()
  getJson('/promotions').then((j) => {
    const now = Date.now()
    promos.value = (j.promotions || []).filter((p: any) => p.is_active && (!p.valid_until || Date.parse(p.valid_until) > now) && !String(p.title || '').includes('[테스트]'))
  }).catch(() => {})
  getJson('/moments').then((j) => { moments.value = (j.moments || []).slice(0, 3) }).catch(() => {})
})

const promo = computed(() => promos.value[0])
const promoLabel = computed(() => {
  const p = promo.value
  if (!p) return ''
  return t('my.benefitOff', { v: p.discount_type === 'PERCENTAGE' ? `${p.discount_value}%` : currency.formatKRW(p.discount_value) })
})

function fromPrice(h: any): number | null {
  const roomPrices = (h.rooms || []).map((r: any) => Number(r.base_price_krw)).filter((n: number) => n > 0)
  const n = roomPrices.length ? Math.min(...roomPrices) : Number(h.base_price_krw)
  return n > 0 ? n : null
}
function photos(m: any): string[] { try { return JSON.parse(m.photos_json || '[]').slice(0, 3) } catch { return [] } }

const DESTINATIONS = [
  { key: 'tokyo', q: '도쿄', img: 'https://images.unsplash.com/photo-1503899036084-c55cdd92da26?w=800&q=75' },
  { key: 'osaka', q: '오사카', img: 'https://images.unsplash.com/photo-1589452271712-64b8a66c7b71?w=640&q=75' },
  { key: 'danang', q: '다낭', img: 'https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=640&q=75' },
  { key: 'bangkok', q: '방콕', img: 'https://images.unsplash.com/photo-1508009603885-50cf7c579365?w=640&q=75' },
  { key: 'seoul', q: '서울', img: 'https://images.unsplash.com/photo-1534274988757-a28bf1a57c17?w=800&q=75' },
  { key: 'paris', q: '파리', img: 'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=640&q=75' }
]

const PROMISES = computed(() => [
  { icon: 'lock', title: t('home.promise1t'), body: t('home.promise1b') },
  { icon: 'check', title: t('home.promise2t'), body: t('home.promise2b') },
  { icon: 'refund', title: t('home.promise3t'), body: t('home.promise3b') }
])
</script>

<template>
  <div>
    <!-- Terra Nord Daylight Architectural Hero -->
    <section class="relative overflow-hidden border-b border-line bg-gradient-to-b from-primary-soft/65 via-canvas to-canvas">
      <!-- Subtle Architectural Grid Backdrop -->
      <div class="pointer-events-none absolute inset-0 opacity-[0.35] dark:opacity-[0.14]" style="background-image: linear-gradient(to right, rgb(var(--gft-line)) 1px, transparent 1px), linear-gradient(to bottom, rgb(var(--gft-line)) 1px, transparent 1px); background-size: 72px 72px;" aria-hidden="true" />
      <div class="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-primary/10 blur-3xl" aria-hidden="true" />
      <div class="pointer-events-none absolute -left-20 top-32 h-72 w-72 rounded-full bg-accent/10 blur-3xl" aria-hidden="true" />

      <div class="relative mx-auto max-w-7xl px-4 pb-8 pt-6 sm:pt-10 lg:px-6 lg:pb-12 lg:pt-12">
        <!-- Editorial Split Top Row -->
        <div class="grid gap-6 lg:grid-cols-12 lg:items-end">
          <div class="lg:col-span-7">
            <div class="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-surface/90 px-3.5 py-1 text-2xs font-bold uppercase tracking-[0.2em] text-primary shadow-sm backdrop-blur">
              <span class="h-1.5 w-1.5 rounded-full bg-accent" />
              GETFORTRIP · TERRA NORD
            </div>
            <h1 class="mt-4 font-display text-3xl font-extrabold leading-[1.1] tracking-tight text-ink sm:text-5xl lg:text-[52px]">
              {{ $t('home.heroA') }}<br class="sm:hidden" /> {{ $t('home.heroB') }}
            </h1>
            <p class="mt-3.5 max-w-xl text-sm leading-relaxed text-ink-muted sm:text-base lg:text-lg">{{ $t('home.heroSub') }}</p>
            <div class="mt-5 flex flex-wrap items-center gap-2.5">
              <NuxtLink :to="$localePath('/deals')" class="inline-flex min-h-[40px] items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:opacity-90">
                <AppIcon name="gift" :size="14" />{{ $t('discover.deals') }}
              </NuxtLink>
              <NuxtLink :to="$localePath('/trip-best')" class="inline-flex min-h-[40px] items-center gap-1.5 rounded-full border border-line bg-surface px-4 py-2 text-xs font-bold text-ink transition hover:border-primary hover:text-primary">
                <AppIcon name="trophy" :size="14" class="text-primary" />{{ $t('discover.best') }}
              </NuxtLink>
            </div>
          </div>

          <!-- Tablet & Desktop Curated Visual Trio -->
          <div class="hidden grid-cols-3 gap-3 md:grid lg:col-span-5">
            <NuxtLink
              v-for="(d, idx) in DESTINATIONS.slice(0, 3)"
              :key="d.key"
              :to="$localePath(`/hotels/list?city=${encodeURIComponent(d.q)}`)"
              class="group relative aspect-[3/4] overflow-hidden rounded-2xl border border-line bg-surface-sunken shadow-card"
            >
              <SmartImg :src="d.img" :alt="$t('home.destAlt', { name: $t(`home.destName.${d.key}`) })" img-class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
              <div class="absolute inset-0 bg-gradient-to-t from-midnight-950/80 via-transparent to-transparent" />
              <span class="absolute left-2.5 top-2.5 rounded-md bg-surface/90 px-1.5 py-0.5 font-mono text-[10px] font-bold text-ink backdrop-blur">0{{ idx + 1 }}</span>
              <div class="absolute inset-x-0 bottom-0 p-3 text-white">
                <p class="text-[10px] font-semibold uppercase tracking-wider text-white/80">{{ $t(`home.destCountry.${d.key}`) }}</p>
                <p class="font-display text-sm font-bold">{{ $t(`home.destName.${d.key}`) }}</p>
              </div>
            </NuxtLink>
          </div>
        </div>

        <!-- Integrated Architectural Search Dock -->
        <div class="mt-6 lg:mt-8">
          <HomeSearchWidget />
        </div>

        <!-- Responsive Category Bento Strip (Rail on Mobile, 3-col on Tablet, 9-col on Desktop) -->
        <nav class="mt-5" :aria-label="$t('header.navAria')">
          <ul class="chip-rail -mx-4 flex gap-2 px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 lg:grid-cols-9">
            <li v-for="c in CATEGORIES" :key="c.key" class="shrink-0">
              <NuxtLink
                :to="$localePath(c.to)"
                class="group flex min-h-[48px] items-center gap-2.5 rounded-field border border-line bg-surface px-3.5 py-2.5 text-xs font-bold text-ink transition hover:border-primary/50 hover:shadow-card lg:flex-col lg:justify-center lg:gap-1.5 lg:px-2 lg:py-3 lg:text-center"
              >
                <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary transition group-hover:bg-primary group-hover:text-primary-ink lg:h-10 lg:w-10 lg:rounded-xl">
                  <AppIcon :name="c.icon" :size="18" />
                </span>
                <span class="whitespace-nowrap lg:line-clamp-1 lg:whitespace-normal">{{ $t('nav.' + c.key) }}</span>
              </NuxtLink>
            </li>
          </ul>
        </nav>
      </div>
    </section>

    <!-- Recently Viewed (personalized client history, hidden when empty) -->
    <section v-if="recent.items.value.length" class="mx-auto mt-10 max-w-7xl px-4 lg:px-6" aria-labelledby="h-recent">
      <div class="mb-4 flex items-center justify-between gap-3">
        <h2 id="h-recent" class="font-display text-lg font-extrabold tracking-tight text-ink sm:text-xl">{{ $t('home.recentlyViewed') }}</h2>
        <button type="button" class="text-xs font-semibold text-ink-subtle hover:text-ink" @click="recent.clear()">{{ $t('home.clearRecent') }}</button>
      </div>
      <div class="rail -mx-4 flex gap-3.5 px-4 pb-2 sm:mx-0 sm:px-0">
        <NuxtLink
          v-for="r in recent.items.value"
          :key="`${r.domain}-${r.id}`"
          :to="$localePath(r.path)"
          class="card group flex w-64 shrink-0 snap-start items-center gap-3 p-3 hover:border-primary/40"
        >
          <SmartImg :src="r.image" :alt="r.title" icon="hotel" img-class="h-14 w-14 shrink-0 rounded-xl object-cover" />
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-bold text-ink group-hover:text-primary">{{ r.title }}</p>
            <p v-if="r.subtitle" class="truncate text-2xs text-ink-subtle">{{ r.subtitle }}</p>
            <p v-if="r.priceKrw" class="mt-0.5 text-xs font-extrabold tabular text-primary">{{ currency.formatKRW(r.priceKrw) }}~</p>
          </div>
        </NuxtLink>
      </div>
    </section>

    <!-- CR-05 operator-managed banners and curated picks -->
    <HomeMarketing />

    <!-- Active Promotion Voucher Strip -->
    <section v-if="promo" class="mx-auto mt-10 max-w-7xl px-4 lg:px-6">
      <div class="relative overflow-hidden rounded-card border border-primary/30 bg-primary-soft/60 px-5 py-5 text-ink shadow-card sm:flex sm:items-center sm:justify-between sm:gap-6 sm:px-7">
        <div class="flex items-start gap-4 sm:items-center">
          <span class="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-ink shadow-sm"><AppIcon name="gift" :size="22" /></span>
          <div>
            <p class="font-display text-base font-extrabold tracking-tight text-ink sm:text-lg">{{ promo.title }}</p>
            <p class="mt-0.5 text-xs text-ink-muted sm:text-sm">
              <strong class="font-bold text-primary">{{ promoLabel }}</strong><template v-if="promo.max_discount_krw"> · {{ $t('my.condMax', { v: currency.formatKRW(promo.max_discount_krw) }) }}</template><template v-if="promo.min_order_amount_krw"> · {{ $t('my.condMin', { v: currency.formatKRW(promo.min_order_amount_krw) }) }}</template><template v-if="promo.valid_until"> · {{ $t('home.mkt.endsAt', { d: promo.valid_until.slice(0, 10) }) }}</template>
            </p>
          </div>
        </div>
        <NuxtLink :to="$localePath('/deals')" class="btn-primary mt-4 w-full shrink-0 sm:mt-0 sm:w-auto">{{ $t('home.claimCoupon') }}<AppIcon name="arrow-right" :size="16" /></NuxtLink>
      </div>
    </section>

    <!-- Destinations: Editorial Magazine Grid (Mobile Rail -> sm:2 -> md:3 -> lg:6) -->
    <section class="mx-auto mt-14 max-w-7xl px-4 lg:px-6" aria-labelledby="h-dest">
      <div class="mb-5 flex items-end justify-between gap-3">
        <div>
          <p class="font-mono text-2xs font-bold uppercase tracking-[0.2em] text-primary">01 · DESTINATIONS</p>
          <h2 id="h-dest" class="mt-1 font-display text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">{{ $t('home.destTitle') }}</h2>
        </div>
        <NuxtLink :to="$localePath('/search')" class="btn-secondary !min-h-[38px] !px-3.5 !py-1.5 !text-xs">{{ $t('home.quickSearch') }}<AppIcon name="chevron-right" :size="14" /></NuxtLink>
      </div>
      <div class="rail -mx-4 flex gap-3.5 px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 md:grid-cols-3 lg:grid-cols-6">
        <NuxtLink
          v-for="(d, idx) in DESTINATIONS"
          :key="d.key"
          :to="$localePath(`/hotels/list?city=${encodeURIComponent(d.q)}`)"
          class="group relative aspect-[4/5] w-[46vw] max-w-[210px] shrink-0 snap-start overflow-hidden rounded-card border border-line bg-surface-sunken shadow-card sm:w-auto sm:max-w-none"
        >
          <SmartImg :src="d.img" :alt="$t('home.destAlt', { name: $t(`home.destName.${d.key}`) })" img-class="h-full w-full object-cover sm:transition-transform sm:duration-500 sm:group-hover:scale-105" />
          <div class="absolute inset-0 bg-gradient-to-t from-midnight-950/85 via-midnight-950/15 to-transparent" />
          <span class="absolute left-3 top-3 rounded-md bg-surface/90 px-2 py-0.5 font-mono text-[10px] font-bold text-ink backdrop-blur">0{{ idx + 1 }}</span>
          <div class="absolute inset-x-0 bottom-0 p-4 text-white">
            <span class="text-2xs font-semibold uppercase tracking-wider text-white/80">{{ $t(`home.destCountry.${d.key}`) }}</span>
            <p class="mt-0.5 font-display text-lg font-extrabold tracking-tight sm:text-xl">{{ $t(`home.destName.${d.key}`) }}</p>
          </div>
        </NuxtLink>
      </div>
    </section>

    <!-- Hotels: Architectural Stay Cards -->
    <section class="mx-auto mt-16 max-w-7xl px-4 lg:px-6" aria-labelledby="h-hotels">
      <div class="mb-5 flex items-end justify-between gap-4">
        <div>
          <p class="font-mono text-2xs font-bold uppercase tracking-[0.2em] text-primary">02 · CURATED STAYS</p>
          <h2 id="h-hotels" class="mt-1 font-display text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">{{ $t('home.hotelsTitle') }}</h2>
          <p class="mt-1 text-sm text-ink-muted">{{ $t('home.hotelsSub') }}</p>
        </div>
        <NuxtLink :to="$localePath('/hotels/list')" class="btn-secondary shrink-0 !min-h-[38px] !px-3.5 !py-1.5 !text-xs">{{ $t('home.viewAll') }}<AppIcon name="chevron-right" :size="14" /></NuxtLink>
      </div>

      <div v-if="hotelState === 'loading'" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div v-for="n in 4" :key="n" class="overflow-hidden rounded-card border border-line bg-surface shadow-card">
          <div class="aspect-[4/3] animate-pulse bg-surface-sunken" />
          <div class="space-y-2 p-4"><div class="h-3 w-1/3 rounded bg-surface-sunken" /><div class="h-4 w-3/4 rounded bg-surface-sunken" /><div class="h-4 w-1/2 rounded bg-surface-sunken" /></div>
        </div>
      </div>
      <div v-else-if="hotelState === 'error'" class="rounded-card border border-dashed border-line-strong bg-surface p-8 text-center">
        <p class="font-semibold text-ink">{{ $t('home.hotelsFail') }}</p>
        <button type="button" class="btn-secondary mt-3" @click="loadHotels">{{ $t('common.retry') }}</button>
      </div>
      <p v-else-if="!hotels.length" class="rounded-card border border-dashed border-line-strong bg-surface p-8 text-center text-sm text-ink-muted">{{ $t('home.hotelsEmpty') }}</p>
      <div v-else class="rail -mx-4 flex gap-4 px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-4">
        <NuxtLink v-for="h in hotels" :key="h.id" :to="$localePath(`/hotels/detail/${h.id}`)" class="card group flex w-[78vw] max-w-[310px] shrink-0 snap-start flex-col overflow-hidden hover:border-primary/45 sm:w-auto sm:max-w-none sm:transition-all sm:hover:-translate-y-0.5 sm:hover:shadow-pop">
          <div class="relative aspect-[16/11] overflow-hidden bg-surface-sunken">
            <SmartImg :src="h.thumbnail_url" :alt="hotelName(h)" icon="hotel" img-class="h-full w-full object-cover sm:transition-transform sm:duration-500 sm:group-hover:scale-105" />
            <span v-if="h.free_cancellation" class="absolute left-3 top-3 rounded-md bg-surface/95 px-2 py-1 text-2xs font-bold text-success shadow-sm backdrop-blur">{{ $t('hotels.list.freeCancel') }}</span>
            <span v-if="h.review_score" class="absolute right-3 top-3 rounded-md bg-primary px-2 py-0.5 text-xs font-bold text-primary-ink shadow-sm tabular">{{ Number(h.review_score).toFixed(1) }}</span>
          </div>
          <div class="flex flex-1 flex-col p-4">
            <p class="text-2xs font-bold uppercase tracking-wider text-ink-subtle">{{ h.city }}, {{ h.country }}<template v-if="h.star_rating"> · {{ h.star_rating }}★</template></p>
            <h3 class="mt-1 line-clamp-1 font-display text-base font-bold text-ink transition-colors group-hover:text-primary">{{ hotelName(h) }}</h3>
            <p v-if="h.review_count" class="mt-1 text-xs text-ink-subtle">{{ $t('home.reviewCount', { n: $n(Number(h.review_count)) }) }}</p>
            <p v-else class="mt-1 text-xs text-ink-subtle">{{ $t('home.newNoReviews') }}</p>
            <div class="mt-auto flex items-baseline justify-between border-t border-line pt-3 mt-3">
              <span class="text-2xs text-ink-subtle">{{ h.bookable === false ? $t('hotels.list.notBookableNow') : $t('hotels.list.perNightRef') }}</span>
              <span v-if="fromPrice(h)" class="text-right"><span class="text-lg font-extrabold text-ink tabular">{{ currency.formatKRW(fromPrice(h)!) }}</span><span class="text-xs text-ink-subtle">~</span></span>
            </div>
          </div>
        </NuxtLink>
      </div>
    </section>

    <!-- Activities -->
    <section v-if="activityState !== 'ready' || activities.length" class="mx-auto mt-16 max-w-7xl px-4 lg:px-6" aria-labelledby="h-act">
      <div class="mb-5 flex items-end justify-between gap-4">
        <div>
          <p class="font-mono text-2xs font-bold uppercase tracking-[0.2em] text-accent">03 · EXPERIENCES</p>
          <h2 id="h-act" class="mt-1 font-display text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">{{ $t('home.actTitle') }}</h2>
        </div>
        <NuxtLink :to="$localePath('/things-to-do')" class="btn-secondary shrink-0 !min-h-[38px] !px-3.5 !py-1.5 !text-xs">{{ $t('home.viewAll') }}<AppIcon name="chevron-right" :size="14" /></NuxtLink>
      </div>
      <div v-if="activityState === 'loading'" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div v-for="n in 4" :key="n" class="h-28 animate-pulse rounded-card bg-surface-sunken" />
      </div>
      <div v-else-if="activityState === 'error'" class="rounded-card border border-dashed border-line-strong bg-surface p-6 text-center text-sm">
        <span class="text-ink-muted">{{ $t('home.actFail') }}</span>
        <button type="button" class="ml-2 font-bold text-primary" @click="loadActivities">{{ $t('common.retry') }}</button>
      </div>
      <div v-else class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <NuxtLink v-for="a in activities" :key="a.id" :to="$localePath(`/things-to-do/detail/${a.id}`)" class="card group flex gap-3.5 p-3.5 hover:border-primary/45 sm:transition-all sm:hover:-translate-y-0.5 sm:hover:shadow-pop">
          <SmartImg :src="a.thumbnail_url" :alt="a.title" icon="ticket" img-class="h-24 w-24 shrink-0 rounded-xl object-cover" />
          <div class="flex min-w-0 flex-1 flex-col">
            <p class="text-2xs font-bold uppercase tracking-wider text-accent">{{ a.city }}</p>
            <h3 class="mt-0.5 line-clamp-2 text-sm font-bold leading-snug text-ink transition-colors group-hover:text-primary">{{ a.title }}</h3>
            <div class="mt-auto flex items-center gap-2 pt-2">
              <span v-if="a.instant_confirmed" class="flex items-center gap-0.5 text-2xs font-bold text-success"><AppIcon name="bolt" :size="12" />{{ $t('todo.instant') }}</span>
              <span v-if="Number(a.price_krw) > 0" class="ml-auto text-sm font-extrabold text-ink tabular">{{ currency.formatKRW(Number(a.price_krw)) }}~</span>
            </div>
          </div>
        </NuxtLink>
      </div>
    </section>

    <!-- Architectural Ledger Trust Pillars -->
    <section class="mx-auto mt-16 max-w-7xl px-4 lg:px-6" aria-labelledby="h-promise">
      <h2 id="h-promise" class="sr-only">{{ $t('home.promiseTitle') }}</h2>
      <div class="grid gap-px overflow-hidden rounded-card border border-line bg-line md:grid-cols-3">
        <div v-for="(p, idx) in PROMISES" :key="p.title" class="bg-surface p-6 sm:p-7">
          <div class="flex items-center justify-between">
            <span class="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-soft text-primary"><AppIcon :name="p.icon" :size="19" /></span>
            <span class="font-mono text-xs font-bold text-ink-subtle">0{{ idx + 1 }}</span>
          </div>
          <h3 class="mt-4 font-display text-base font-extrabold text-ink">{{ p.title }}</h3>
          <p class="mt-1.5 text-sm leading-relaxed text-ink-muted">{{ p.body }}</p>
        </div>
      </div>
    </section>

    <!-- Moments (Travel Journal) -->
    <section v-if="moments.length" class="mx-auto mt-16 max-w-7xl px-4 lg:px-6" aria-labelledby="h-moments">
      <div class="mb-5 flex items-end justify-between gap-4">
        <div>
          <p class="font-mono text-2xs font-bold uppercase tracking-[0.2em] text-primary">04 · JOURNAL</p>
          <h2 id="h-moments" class="mt-1 font-display text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">{{ $t('home.momentsTitle') }}</h2>
        </div>
        <NuxtLink :to="$localePath('/moments')" class="btn-secondary shrink-0 !min-h-[38px] !px-3.5 !py-1.5 !text-xs">{{ $t('home.more') }}<AppIcon name="chevron-right" :size="14" /></NuxtLink>
      </div>
      <div class="grid gap-4 md:grid-cols-3">
        <article v-for="m in moments" :key="m.id" class="card p-5">
          <div class="flex items-center gap-3">
            <img v-if="m.user_avatar" :src="m.user_avatar" alt="" class="h-9 w-9 rounded-full object-cover" />
            <div><p class="text-sm font-bold text-ink">{{ m.user_name }}</p><p class="text-xs text-ink-subtle">{{ m.city }}</p></div>
          </div>
          <h3 class="mt-3 line-clamp-1 font-bold text-ink">{{ m.title }}</h3>
          <p class="mt-1 line-clamp-2 text-sm text-ink-muted">{{ m.content }}</p>
          <div v-if="photos(m).length" class="mt-3 flex gap-2">
            <img v-for="p in photos(m)" :key="p" :src="p" alt="" loading="lazy" class="h-16 w-20 rounded-xl object-cover" />
          </div>
        </article>
      </div>
    </section>
  </div>
</template>
