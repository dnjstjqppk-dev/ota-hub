<script setup lang="ts">
/**
 * Home (design system "Horizon").
 * Every product, price and promotion shown here comes from the API. Nothing is invented:
 * sections without data are hidden, prices are labelled as reference prices, and only
 * promotions that are active and not expired are advertised.
 */
import { computed, onMounted, ref } from 'vue'
import { useCurrencyStore } from '~/stores/currency'
import { useApiUrl } from '~/composables/useApi'
import { CATEGORIES } from '~/config/navigation'
import { SEO_LOCALES } from '~/composables/useSeoPage'

const currency = useCurrencyStore()
const { t, locale } = useI18n()
const prefix = computed(() => (locale.value === 'ko' ? '' : `/${locale.value}`))

useHead({
  title: () => t('seo.home.title'),
  htmlAttrs: { lang: () => locale.value === 'ko' ? 'ko-KR' : locale.value === 'ja' ? 'ja-JP' : locale.value === 'zh' ? 'zh-CN' : 'en-US' },
  meta: [
    { name: 'description', content: () => t('seo.home.description') },
    { property: 'og:site_name', content: 'getfortrip' },
    { property: 'og:url', content: () => `https://getfortrip.com${prefix.value}/` }
  ],
  link: [
    { rel: 'canonical', href: () => `https://getfortrip.com${prefix.value}/` },
    ...SEO_LOCALES.map((l) => ({ rel: 'alternate' as const, hreflang: l.code, href: `https://getfortrip.com${l.prefix}/` })),
    { rel: 'alternate', hreflang: 'x-default', href: 'https://getfortrip.com/' }
  ]
})

type Load = 'loading' | 'ready' | 'error'
const hotels = ref<any[]>([]); const hotelState = ref<Load>('loading')
const activities = ref<any[]>([]); const activityState = ref<Load>('loading')
const promos = ref<any[]>([])
const moments = ref<any[]>([])

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

/** Lowest room price, or the hotel base price. Never a made-up fallback. */
function fromPrice(h: any): number | null {
  const roomPrices = (h.rooms || []).map((r: any) => Number(r.base_price_krw)).filter((n: number) => n > 0)
  const n = roomPrices.length ? Math.min(...roomPrices) : Number(h.base_price_krw)
  return n > 0 ? n : null
}
function photos(m: any): string[] { try { return JSON.parse(m.photos_json || '[]').slice(0, 3) } catch { return [] } }

/** Editorial picks (no counts or rankings implied). Images: Unsplash. */
const DESTINATIONS = [
  { key: 'tokyo', q: '도쿄', img: 'https://images.unsplash.com/photo-1503899036084-c55cdd92da26?w=640&q=70' },
  { key: 'osaka', q: '오사카', img: 'https://images.unsplash.com/photo-1589452271712-64b8a66c7b71?w=640&q=70' },
  { key: 'danang', q: '다낭', img: 'https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=640&q=70' },
  { key: 'bangkok', q: '방콕', img: 'https://images.unsplash.com/photo-1508009603885-50cf7c579365?w=640&q=70' },
  { key: 'seoul', q: '서울', img: 'https://images.unsplash.com/photo-1534274988757-a28bf1a57c17?w=640&q=70' },
  { key: 'paris', q: '파리', img: 'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=640&q=70' }
]

const PROMISES = computed(() => [
  { icon: 'lock', title: t('home.promise1t'), body: t('home.promise1b') },
  { icon: 'check', title: t('home.promise2t'), body: t('home.promise2b') },
  { icon: 'refund', title: t('home.promise3t'), body: t('home.promise3b') }
])
</script>

<template>
  <div>
    <!-- Editorial Meridian Hero -->
    <section class="mx-auto max-w-7xl px-4 pt-5 lg:px-6 lg:pt-7">
      <div class="relative overflow-hidden rounded-[32px] bg-midnight-900 px-6 pb-28 pt-10 text-white shadow-pop sm:px-10 sm:pt-14 lg:px-14 lg:pb-32 lg:pt-16">
        <!-- Subtle Meridian atmospheric glow & compass arcs -->
        <div class="pointer-events-none absolute inset-0" aria-hidden="true">
          <div class="absolute -right-24 -top-24 h-96 w-96 rounded-full" style="background: radial-gradient(closest-side, rgb(13 107 94 / 0.35), transparent)" />
          <div class="absolute -bottom-24 left-1/3 h-80 w-80 rounded-full" style="background: radial-gradient(closest-side, rgb(208 90 52 / 0.2), transparent)" />
          <svg class="absolute inset-0 h-full w-full text-horizon-300/15" viewBox="0 0 1200 460" preserveAspectRatio="xMidYMid slice">
            <circle cx="1020" cy="120" r="240" fill="none" stroke="currentColor" stroke-width="1" />
            <circle cx="1020" cy="120" r="340" fill="none" stroke="currentColor" stroke-width="0.8" stroke-dasharray="6 8" />
            <path d="M0 360 Q 480 230 1200 320" fill="none" stroke="currentColor" stroke-width="1.2" />
            <path d="M0 400 Q 540 290 1200 380" fill="none" stroke="currentColor" stroke-width="0.9" opacity="0.6" />
          </svg>
        </div>

        <div class="relative max-w-2xl">
          <span class="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3.5 py-1 text-2xs font-bold uppercase tracking-widest text-horizon-300 backdrop-blur">
            <span class="h-1.5 w-1.5 rounded-full bg-coral-400" />
            GETFORTRIP MERIDIAN
          </span>
          <h1 class="mt-5 text-[34px] font-extrabold leading-[1.12] tracking-tight text-white sm:text-5xl lg:text-[54px]">
            {{ $t('home.heroA') }}<br class="sm:hidden" /> {{ $t('home.heroB') }}
          </h1>
          <p class="mt-4 max-w-xl text-base leading-relaxed text-white/75 sm:text-lg">{{ $t('home.heroSub') }}</p>
        </div>
      </div>

      <!-- Floating Search Dock overlapping Hero -->
      <div class="relative z-10 -mt-20 px-1 sm:px-4 lg:px-6">
        <HomeSearchWidget />
      </div>
    </section>

    <!-- Categories: Editorial Pill Rail -->
    <nav class="mx-auto mt-10 max-w-7xl px-4 lg:px-6" :aria-label="$t('header.navAria')">
      <ul class="chip-rail -mx-4 flex gap-2.5 px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-9 sm:overflow-visible sm:px-0">
        <li v-for="c in CATEGORIES" :key="c.key" class="shrink-0">
          <NuxtLink :to="$localePath(c.to)" class="group flex w-[82px] flex-col items-center gap-2 rounded-2xl border border-transparent py-3 text-center text-xs font-bold text-ink-muted transition hover:border-line hover:bg-surface hover:text-ink sm:w-auto sm:hover:shadow-card">
            <span class="flex h-12 w-12 items-center justify-center rounded-2xl border border-line bg-surface text-primary shadow-sm transition sm:group-hover:-translate-y-0.5 sm:group-hover:border-primary/40 sm:group-hover:bg-primary sm:group-hover:text-primary-ink"><AppIcon :name="c.icon" :size="21" /></span>
            {{ $t('nav.' + c.key) }}
          </NuxtLink>
        </li>
      </ul>
    </nav>

    <!-- CR-05 operator-managed banners and curated picks (hidden when none are live) -->
    <HomeMarketing />

    <!-- Active promotion (only when a real, unexpired one exists) -->
    <section v-if="promo" class="mx-auto mt-10 max-w-7xl px-4 lg:px-6">
      <div class="relative overflow-hidden rounded-card border border-coral-500/20 bg-gradient-to-r from-midnight-900 via-midnight-800 to-sapphire-900 px-6 py-6 text-white shadow-card sm:flex sm:items-center sm:justify-between sm:gap-6 sm:px-8">
        <div class="flex items-center gap-4">
          <span class="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-coral-500 text-white shadow-sm"><AppIcon name="gift" :size="24" /></span>
          <div>
            <p class="text-lg font-extrabold tracking-tight">{{ promo.title }}</p>
            <p class="mt-0.5 text-sm text-white/75">
              {{ promoLabel }}<template v-if="promo.max_discount_krw"> · {{ $t('my.condMax', { v: currency.formatKRW(promo.max_discount_krw) }) }}</template><template v-if="promo.min_order_amount_krw"> · {{ $t('my.condMin', { v: currency.formatKRW(promo.min_order_amount_krw) }) }}</template><template v-if="promo.valid_until"> · {{ $t('home.mkt.endsAt', { d: promo.valid_until.slice(0, 10) }) }}</template>
            </p>
          </div>
        </div>
        <NuxtLink :to="$localePath('/deals')" class="mt-4 inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white px-5 py-2.5 text-sm font-bold text-midnight-900 transition-colors hover:bg-sapphire-50 sm:mt-0">{{ $t('home.claimCoupon') }}<AppIcon name="arrow-right" :size="16" /></NuxtLink>
      </div>
    </section>

    <!-- Destinations: Asymmetric Editorial Bento Grid -->
    <section class="mx-auto mt-16 max-w-7xl px-4 lg:px-6" aria-labelledby="h-dest">
      <div class="mb-6 flex items-end justify-between">
        <div>
          <p class="text-2xs font-bold uppercase tracking-widest text-primary">CURATED DESTINATIONS</p>
          <h2 id="h-dest" class="mt-1 text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">{{ $t('home.destTitle') }}</h2>
        </div>
      </div>
      <div class="rail -mx-4 flex gap-3.5 px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 lg:grid-cols-12">
        <NuxtLink
          v-for="(d, idx) in DESTINATIONS"
          :key="d.key"
          :to="$localePath(`/hotels/list?city=${encodeURIComponent(d.q)}`)"
          :class="[
            'group relative aspect-[3/4] w-[44vw] max-w-[220px] shrink-0 snap-start overflow-hidden rounded-card bg-surface-sunken shadow-card sm:w-auto sm:max-w-none',
            idx === 0 || idx === 5 ? 'lg:col-span-3 lg:aspect-[4/5]' : 'lg:col-span-3 lg:aspect-[4/5]'
          ]"
        >
          <SmartImg :src="d.img" :alt="$t('home.destAlt', { name: $t(`home.destName.${d.key}`) })" img-class="h-full w-full object-cover sm:transition-transform sm:duration-500 sm:group-hover:scale-105" />
          <div class="absolute inset-0 bg-gradient-to-t from-midnight-950/85 via-midnight-950/15 to-transparent" />
          <div class="absolute inset-x-0 bottom-0 p-4 text-white">
            <span class="inline-block rounded-full bg-white/15 px-2.5 py-0.5 text-2xs font-semibold text-white/90 backdrop-blur-md">{{ $t(`home.destCountry.${d.key}`) }}</span>
            <p class="mt-1.5 text-xl font-extrabold tracking-tight">{{ $t(`home.destName.${d.key}`) }}</p>
          </div>
        </NuxtLink>
      </div>
    </section>

    <!-- Hotels -->
    <section class="mx-auto mt-16 max-w-7xl px-4 lg:px-6" aria-labelledby="h-hotels">
      <div class="mb-6 flex items-end justify-between gap-4">
        <div>
          <p class="text-2xs font-bold uppercase tracking-widest text-primary">STAYS</p>
          <h2 id="h-hotels" class="mt-1 text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">{{ $t('home.hotelsTitle') }}</h2>
          <p class="mt-1 text-sm text-ink-muted">{{ $t('home.hotelsSub') }}</p>
        </div>
        <NuxtLink :to="$localePath('/hotels/list')" class="hidden shrink-0 items-center gap-1 rounded-full border border-line bg-surface px-4 py-2 text-xs font-bold text-ink transition-colors hover:border-primary hover:text-primary sm:flex">{{ $t('home.viewAll') }}<AppIcon name="chevron-right" :size="15" /></NuxtLink>
      </div>

      <div v-if="hotelState === 'loading'" class="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
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
        <NuxtLink v-for="h in hotels" :key="h.id" :to="$localePath(`/hotels/detail/${h.id}`)" class="group w-[78vw] max-w-[320px] shrink-0 snap-start overflow-hidden rounded-card border border-line bg-surface shadow-card transition-[border-color,box-shadow] duration-200 hover:border-line-strong sm:w-auto sm:max-w-none sm:transition-all sm:hover:-translate-y-0.5 sm:hover:shadow-pop">
          <div class="relative aspect-[4/3] overflow-hidden bg-surface-sunken">
            <SmartImg :src="h.thumbnail_url" :alt="h.name_ko" icon="hotel" img-class="h-full w-full object-cover sm:transition-transform sm:duration-500 sm:group-hover:scale-105" />
            <span v-if="h.free_cancellation" class="absolute left-3 top-3 rounded-full bg-surface/95 px-2.5 py-1 text-2xs font-bold text-success shadow-sm backdrop-blur">{{ $t('hotels.list.freeCancel') }}</span>
          </div>
          <div class="p-4">
            <p class="text-2xs font-semibold uppercase tracking-wide text-ink-subtle">{{ h.city }}, {{ h.country }}<template v-if="h.star_rating"> · {{ $t('hotels.list.starAria', { n: h.star_rating }) }}</template></p>
            <h3 class="mt-1 line-clamp-1 font-extrabold text-ink transition-colors group-hover:text-primary">{{ h.name_ko }}</h3>
            <p v-if="h.review_score" class="mt-2 flex items-center gap-1.5 text-sm">
              <span class="rounded-lg bg-primary px-2 py-0.5 text-xs font-bold text-primary-ink tabular">{{ Number(h.review_score).toFixed(1) }}</span>
              <span v-if="h.review_count" class="text-xs text-ink-subtle">{{ $t('home.reviewCount', { n: $n(Number(h.review_count)) }) }}</span>
            </p>
            <p v-else class="mt-2 text-xs font-semibold text-ink-subtle">{{ $t('home.newNoReviews') }}</p>
            <div class="mt-3.5 flex items-end justify-between border-t border-line pt-3">
              <span class="text-xs text-ink-subtle">{{ h.bookable === false ? $t('hotels.list.notBookableNow') : $t('hotels.list.perNightRef') }}</span>
              <span v-if="fromPrice(h)" class="text-right"><span class="text-lg font-extrabold text-ink tabular">{{ currency.formatKRW(fromPrice(h)!) }}</span><span class="text-xs text-ink-subtle">~</span></span>
            </div>
          </div>
        </NuxtLink>
      </div>
    </section>

    <!-- Activities -->
    <section v-if="activityState !== 'ready' || activities.length" class="mx-auto mt-16 max-w-7xl px-4 lg:px-6" aria-labelledby="h-act">
      <div class="mb-6 flex items-end justify-between gap-4">
        <div>
          <p class="text-2xs font-bold uppercase tracking-widest text-accent">EXPERIENCES</p>
          <h2 id="h-act" class="mt-1 text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">{{ $t('home.actTitle') }}</h2>
        </div>
        <NuxtLink :to="$localePath('/things-to-do')" class="flex shrink-0 items-center gap-1 rounded-full border border-line bg-surface px-4 py-2 text-xs font-bold text-ink transition-colors hover:border-primary hover:text-primary">{{ $t('home.viewAll') }}<AppIcon name="chevron-right" :size="15" /></NuxtLink>
      </div>
      <div v-if="activityState === 'loading'" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div v-for="n in 4" :key="n" class="h-28 animate-pulse rounded-card bg-surface-sunken" />
      </div>
      <div v-else-if="activityState === 'error'" class="rounded-card border border-dashed border-line-strong bg-surface p-6 text-center text-sm">
        <span class="text-ink-muted">{{ $t('home.actFail') }}</span>
        <button type="button" class="ml-2 font-bold text-primary" @click="loadActivities">{{ $t('common.retry') }}</button>
      </div>
      <div v-else class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <NuxtLink v-for="a in activities" :key="a.id" :to="$localePath(`/things-to-do/detail/${a.id}`)" class="group flex gap-3.5 rounded-card border border-line bg-surface p-3.5 shadow-card transition-[border-color,box-shadow] duration-200 hover:border-line-strong sm:transition-all sm:hover:-translate-y-0.5 sm:hover:shadow-pop">
          <SmartImg :src="a.thumbnail_url" :alt="a.title" icon="ticket" img-class="h-24 w-24 shrink-0 rounded-xl object-cover" />
          <div class="flex min-w-0 flex-col">
            <p class="text-2xs font-bold uppercase tracking-wide text-ink-subtle">{{ a.city }}</p>
            <h3 class="mt-0.5 line-clamp-2 text-sm font-extrabold leading-snug text-ink transition-colors group-hover:text-primary">{{ a.title }}</h3>
            <div class="mt-auto flex items-center gap-2 pt-2">
              <span v-if="a.instant_confirmed" class="flex items-center gap-0.5 text-2xs font-bold text-success"><AppIcon name="bolt" :size="12" />{{ $t('todo.instant') }}</span>
              <span v-if="Number(a.price_krw) > 0" class="ml-auto text-sm font-extrabold text-ink tabular">{{ currency.formatKRW(Number(a.price_krw)) }}~</span>
            </div>
          </div>
        </NuxtLink>
      </div>
    </section>

    <!-- Editorial Trust Pillars (01 · 02 · 03) -->
    <section class="mx-auto mt-20 max-w-7xl px-4 lg:px-6" aria-labelledby="h-promise">
      <h2 id="h-promise" class="sr-only">{{ $t('home.promiseTitle') }}</h2>
      <div class="grid gap-4 md:grid-cols-3">
        <div v-for="(p, idx) in PROMISES" :key="p.title" class="rounded-card border border-line bg-surface p-6 shadow-card">
          <div class="flex items-center justify-between">
            <span class="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary-soft text-primary"><AppIcon :name="p.icon" :size="20" /></span>
            <span class="font-mono text-xs font-bold text-ink-subtle">0{{ idx + 1 }}</span>
          </div>
          <h3 class="mt-5 text-base font-extrabold text-ink">{{ p.title }}</h3>
          <p class="mt-2 text-sm leading-relaxed text-ink-muted">{{ p.body }}</p>
        </div>
      </div>
    </section>

    <!-- Moments (user posts, only when there are any) -->
    <section v-if="moments.length" class="mx-auto mt-16 max-w-7xl px-4 lg:px-6" aria-labelledby="h-moments">
      <div class="mb-6 flex items-end justify-between gap-4">
        <div>
          <p class="text-2xs font-bold uppercase tracking-widest text-primary">TRAVEL JOURNAL</p>
          <h2 id="h-moments" class="mt-1 text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">{{ $t('home.momentsTitle') }}</h2>
        </div>
        <NuxtLink :to="$localePath('/moments')" class="flex shrink-0 items-center gap-1 rounded-full border border-line bg-surface px-4 py-2 text-xs font-bold text-ink transition-colors hover:border-primary hover:text-primary">{{ $t('home.more') }}<AppIcon name="chevron-right" :size="15" /></NuxtLink>
      </div>
      <div class="grid gap-4 md:grid-cols-3">
        <article v-for="m in moments" :key="m.id" class="rounded-card border border-line bg-surface p-5 shadow-card">
          <div class="flex items-center gap-3">
            <img v-if="m.user_avatar" :src="m.user_avatar" alt="" class="h-9 w-9 rounded-full object-cover" />
            <div><p class="text-sm font-bold text-ink">{{ m.user_name }}</p><p class="text-xs text-ink-subtle">{{ m.city }}</p></div>
          </div>
          <h3 class="mt-3 line-clamp-1 font-extrabold text-ink">{{ m.title }}</h3>
          <p class="mt-1 line-clamp-2 text-sm text-ink-muted">{{ m.content }}</p>
          <div v-if="photos(m).length" class="mt-3 flex gap-2">
            <img v-for="p in photos(m)" :key="p" :src="p" alt="" loading="lazy" class="h-16 w-20 rounded-xl object-cover" />
          </div>
        </article>
      </div>
    </section>
  </div>
</template>
