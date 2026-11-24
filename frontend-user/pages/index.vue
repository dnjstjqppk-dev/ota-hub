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
    <!-- Hero -->
    <section class="relative">
      <div class="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true"><div class="absolute inset-0 bg-gradient-to-b from-sapphire-50 via-canvas to-canvas" />
      <svg class="pointer-events-none absolute inset-x-0 top-0 h-[420px] w-full text-sapphire-200" viewBox="0 0 1440 420" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <path d="M0 300 Q 720 200 1440 300" fill="none" stroke="currentColor" stroke-width="1.5" />
        <path d="M0 340 Q 720 250 1440 340" fill="none" stroke="currentColor" stroke-width="1" opacity=".6" />
        <path d="M0 380 Q 720 300 1440 380" fill="none" stroke="currentColor" stroke-width="1" opacity=".35" />
      </svg></div>

      <div class="relative mx-auto max-w-7xl px-4 pb-10 pt-10 sm:pt-14 lg:px-6 lg:pb-14 lg:pt-20">
        <div class="max-w-2xl">
          <h1 class="text-[32px] font-extrabold leading-[1.15] tracking-tight text-ink sm:text-5xl">{{ $t('home.heroA') }}<br class="sm:hidden" /> {{ $t('home.heroB') }}</h1>
          <p class="mt-4 max-w-xl text-base leading-relaxed text-ink-muted sm:text-lg">{{ $t('home.heroSub') }}</p>
        </div>
        <div class="mt-8">
          <HomeSearchWidget />
        </div>
      </div>
    </section>

    <!-- Categories -->
    <nav class="mx-auto max-w-7xl px-4 lg:px-6" :aria-label="$t('header.navAria')">
      <ul class="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-9 sm:px-0 [&::-webkit-scrollbar]:hidden">
        <li v-for="c in CATEGORIES" :key="c.key" class="shrink-0">
          <NuxtLink :to="$localePath(c.to)" class="group flex w-[76px] flex-col items-center gap-2 rounded-2xl py-3 text-center text-xs font-semibold text-ink-muted transition-colors hover:bg-surface hover:text-ink sm:w-auto">
            <span class="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface text-primary shadow-card transition-transform group-hover:-translate-y-0.5"><AppIcon :name="c.icon" :size="22" /></span>
            {{ $t('nav.' + c.key) }}
          </NuxtLink>
        </li>
      </ul>
    </nav>

    <!-- CR-05 operator-managed banners and curated picks (hidden when none are live) -->
    <HomeMarketing />

    <!-- Active promotion (only when a real, unexpired one exists) -->
    <section v-if="promo" class="mx-auto mt-10 max-w-7xl px-4 lg:px-6">
      <div class="flex flex-col items-start gap-4 rounded-card bg-midnight-900 px-6 py-6 text-white sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <div class="flex items-center gap-4">
          <span class="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-coral-500 text-white"><AppIcon name="gift" :size="24" /></span>
          <div>
            <p class="text-lg font-bold">{{ promo.title }}</p>
            <p class="mt-0.5 text-sm text-white/70">
              {{ promoLabel }}<template v-if="promo.max_discount_krw"> · {{ $t('my.condMax', { v: currency.formatKRW(promo.max_discount_krw) }) }}</template><template v-if="promo.min_order_amount_krw"> · {{ $t('my.condMin', { v: currency.formatKRW(promo.min_order_amount_krw) }) }}</template><template v-if="promo.valid_until"> · {{ $t('home.mkt.endsAt', { d: promo.valid_until.slice(0, 10) }) }}</template>
            </p>
          </div>
        </div>
        <NuxtLink :to="$localePath('/deals')" class="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-midnight-900 hover:bg-sapphire-50">{{ $t('home.claimCoupon') }}<AppIcon name="arrow-right" :size="16" /></NuxtLink>
      </div>
    </section>

    <!-- Destinations -->
    <section class="mx-auto mt-16 max-w-7xl px-4 lg:px-6" aria-labelledby="h-dest">
      <div class="mb-5 flex items-end justify-between">
        <h2 id="h-dest" class="text-2xl font-bold tracking-tight text-ink">{{ $t('home.destTitle') }}</h2>
      </div>
      <div class="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 lg:grid-cols-6 [&::-webkit-scrollbar]:hidden">
        <NuxtLink v-for="d in DESTINATIONS" :key="d.key" :to="$localePath(`/hotels/list?city=${encodeURIComponent(d.q)}`)" class="group relative aspect-[3/4] w-[42vw] max-w-[200px] shrink-0 snap-start overflow-hidden rounded-card bg-surface-sunken sm:w-auto sm:max-w-none">
          <SmartImg :src="d.img" :alt="$t('home.destAlt', { name: $t(`home.destName.${d.key}`) })" img-class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
          <div class="absolute inset-0 bg-gradient-to-t from-midnight-950/80 via-midnight-950/10 to-transparent" />
          <div class="absolute inset-x-0 bottom-0 p-4 text-white">
            <p class="text-xs font-medium text-white/70">{{ $t(`home.destCountry.${d.key}`) }}</p>
            <p class="text-lg font-bold">{{ $t(`home.destName.${d.key}`) }}</p>
          </div>
        </NuxtLink>
      </div>
    </section>

    <!-- Hotels -->
    <section class="mx-auto mt-16 max-w-7xl px-4 lg:px-6" aria-labelledby="h-hotels">
      <div class="mb-5 flex items-end justify-between gap-4">
        <div>
          <h2 id="h-hotels" class="text-2xl font-bold tracking-tight text-ink">{{ $t('home.hotelsTitle') }}</h2>
          <p class="mt-1 text-sm text-ink-muted">{{ $t('home.hotelsSub') }}</p>
        </div>
        <NuxtLink :to="$localePath('/hotels/list')" class="hidden shrink-0 items-center gap-1 text-sm font-semibold text-primary hover:underline sm:flex">{{ $t('home.viewAll') }}<AppIcon name="chevron-right" :size="16" /></NuxtLink>
      </div>

      <div v-if="hotelState === 'loading'" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div v-for="n in 4" :key="n" class="overflow-hidden rounded-card bg-surface shadow-card">
          <div class="aspect-[4/3] animate-pulse bg-surface-sunken" />
          <div class="space-y-2 p-4"><div class="h-3 w-1/3 rounded bg-surface-sunken" /><div class="h-4 w-3/4 rounded bg-surface-sunken" /><div class="h-4 w-1/2 rounded bg-surface-sunken" /></div>
        </div>
      </div>
      <div v-else-if="hotelState === 'error'" class="rounded-card border border-dashed border-line-strong p-8 text-center">
        <p class="font-semibold text-ink">{{ $t('home.hotelsFail') }}</p>
        <button type="button" class="mt-3 rounded-lg border border-line px-4 py-2 text-sm font-semibold text-primary hover:bg-primary-soft" @click="loadHotels">{{ $t('common.retry') }}</button>
      </div>
      <p v-else-if="!hotels.length" class="rounded-card border border-dashed border-line-strong p-8 text-center text-sm text-ink-muted">{{ $t('home.hotelsEmpty') }}</p>
      <div v-else class="-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-4 [&::-webkit-scrollbar]:hidden">
        <NuxtLink v-for="h in hotels" :key="h.id" :to="$localePath(`/hotels/detail/${h.id}`)" class="group w-[78vw] max-w-[320px] shrink-0 snap-start overflow-hidden rounded-card bg-surface shadow-card transition-shadow hover:shadow-pop sm:w-auto sm:max-w-none">
          <div class="relative aspect-[4/3] overflow-hidden bg-surface-sunken">
            <SmartImg :src="h.thumbnail_url" :alt="h.name_ko" icon="hotel" img-class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
            <span v-if="h.free_cancellation" class="absolute left-3 top-3 rounded-full bg-surface/95 px-2.5 py-1 text-2xs font-semibold text-success">{{ $t('hotels.list.freeCancel') }}</span>
          </div>
          <div class="p-4">
            <p class="text-xs text-ink-subtle">{{ h.city }}, {{ h.country }}<template v-if="h.star_rating"> · {{ $t('hotels.list.starAria', { n: h.star_rating }) }}</template></p>
            <h3 class="mt-1 line-clamp-1 font-bold text-ink group-hover:text-primary">{{ h.name_ko }}</h3>
            <p v-if="h.review_score" class="mt-1.5 flex items-center gap-1.5 text-sm">
              <span class="rounded-md bg-primary px-1.5 py-0.5 text-xs font-bold text-primary-ink tabular">{{ Number(h.review_score).toFixed(1) }}</span>
              <span v-if="h.review_count" class="text-xs text-ink-subtle">{{ $t('home.reviewCount', { n: $n(Number(h.review_count)) }) }}</span>
            </p>
            <p v-else class="mt-1.5 text-xs font-semibold text-ink-subtle">{{ $t('home.newNoReviews') }}</p>
            <div class="mt-3 flex items-end justify-between border-t border-line pt-3">
              <span class="text-xs text-ink-subtle">{{ h.bookable === false ? $t('hotels.list.notBookableNow') : $t('hotels.list.perNightRef') }}</span>
              <span v-if="fromPrice(h)" class="text-right"><span class="text-lg font-bold text-ink tabular">{{ currency.formatKRW(fromPrice(h)!) }}</span><span class="text-xs text-ink-subtle">~</span></span>
            </div>
          </div>
        </NuxtLink>
      </div>
    </section>

    <!-- Activities -->
    <section v-if="activityState !== 'ready' || activities.length" class="mx-auto mt-16 max-w-7xl px-4 lg:px-6" aria-labelledby="h-act">
      <div class="mb-5 flex items-end justify-between gap-4">
        <h2 id="h-act" class="text-2xl font-bold tracking-tight text-ink">{{ $t('home.actTitle') }}</h2>
        <NuxtLink :to="$localePath('/things-to-do')" class="flex shrink-0 items-center gap-1 text-sm font-semibold text-primary hover:underline">{{ $t('home.viewAll') }}<AppIcon name="chevron-right" :size="16" /></NuxtLink>
      </div>
      <div v-if="activityState === 'loading'" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div v-for="n in 4" :key="n" class="h-28 animate-pulse rounded-card bg-surface-sunken" />
      </div>
      <div v-else-if="activityState === 'error'" class="rounded-card border border-dashed border-line-strong p-6 text-center text-sm">
        <span class="text-ink-muted">{{ $t('home.actFail') }}</span>
        <button type="button" class="ml-2 font-semibold text-primary" @click="loadActivities">{{ $t('common.retry') }}</button>
      </div>
      <div v-else class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <NuxtLink v-for="a in activities" :key="a.id" :to="$localePath(`/things-to-do/detail/${a.id}`)" class="group flex gap-3 rounded-card bg-surface p-3 shadow-card transition-shadow hover:shadow-pop">
          <SmartImg :src="a.thumbnail_url" :alt="a.title" icon="ticket" img-class="h-24 w-24 shrink-0 rounded-xl object-cover" />
          <div class="flex min-w-0 flex-col">
            <p class="text-xs text-ink-subtle">{{ a.city }}</p>
            <h3 class="mt-0.5 line-clamp-2 text-sm font-bold leading-snug text-ink group-hover:text-primary">{{ a.title }}</h3>
            <div class="mt-auto flex items-center gap-2 pt-2">
              <span v-if="a.instant_confirmed" class="flex items-center gap-0.5 text-2xs font-semibold text-success"><AppIcon name="bolt" :size="12" />{{ $t('todo.instant') }}</span>
              <span v-if="Number(a.price_krw) > 0" class="ml-auto text-sm font-bold text-ink tabular">{{ currency.formatKRW(Number(a.price_krw)) }}~</span>
            </div>
          </div>
        </NuxtLink>
      </div>
    </section>

    <!-- Promises (describe how booking actually works) -->
    <section class="mx-auto mt-20 max-w-7xl px-4 lg:px-6" aria-labelledby="h-promise">
      <h2 id="h-promise" class="sr-only">{{ $t('home.promiseTitle') }}</h2>
      <div class="grid gap-px overflow-hidden rounded-card border border-line bg-line md:grid-cols-3">
        <div v-for="p in PROMISES" :key="p.title" class="bg-surface p-6">
          <span class="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-soft text-primary"><AppIcon :name="p.icon" /></span>
          <h3 class="mt-4 font-bold text-ink">{{ p.title }}</h3>
          <p class="mt-1.5 text-sm leading-relaxed text-ink-muted">{{ p.body }}</p>
        </div>
      </div>
    </section>

    <!-- Moments (user posts, only when there are any) -->
    <section v-if="moments.length" class="mx-auto mt-16 max-w-7xl px-4 lg:px-6" aria-labelledby="h-moments">
      <div class="mb-5 flex items-end justify-between gap-4">
        <h2 id="h-moments" class="text-2xl font-bold tracking-tight text-ink">{{ $t('home.momentsTitle') }}</h2>
        <NuxtLink :to="$localePath('/moments')" class="flex shrink-0 items-center gap-1 text-sm font-semibold text-primary hover:underline">{{ $t('home.more') }}<AppIcon name="chevron-right" :size="16" /></NuxtLink>
      </div>
      <div class="grid gap-4 md:grid-cols-3">
        <article v-for="m in moments" :key="m.id" class="rounded-card bg-surface p-5 shadow-card">
          <div class="flex items-center gap-3">
            <img v-if="m.user_avatar" :src="m.user_avatar" alt="" class="h-9 w-9 rounded-full object-cover" />
            <div><p class="text-sm font-semibold text-ink">{{ m.user_name }}</p><p class="text-xs text-ink-subtle">{{ m.city }}</p></div>
          </div>
          <h3 class="mt-3 line-clamp-1 font-bold text-ink">{{ m.title }}</h3>
          <p class="mt-1 line-clamp-2 text-sm text-ink-muted">{{ m.content }}</p>
          <div v-if="photos(m).length" class="mt-3 flex gap-2">
            <img v-for="p in photos(m)" :key="p" :src="p" alt="" loading="lazy" class="h-16 w-20 rounded-lg object-cover" />
          </div>
        </article>
      </div>
    </section>
  </div>
</template>
