<script setup lang="ts">
/**
 * Hotel detail (design system "Horizon").
 * Stay dates and guests come from the URL (carried over from the results page) and are passed to
 * checkout, where the server prices the stay. Only catalogue facts are shown: no default check-in
 * times, invented facilities or cancellation deadlines. Rates are offered only after the live API answers.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useCurrencyStore } from '~/stores/currency'
import { useApiUrl } from '~/composables/useApi'
import { getHotelById } from '~/data/hotelCatalog'
import { generatedFallback } from '~/composables/useGeneratedCatalog'
import { aggregateRatingOf, breadcrumbLd, jsonLdScript, offerLd } from '~/composables/useJsonLd'
import { canonicalHref, hreflangLinks, ogMeta, useActiveLocaleContext } from '~/composables/useSeoPage'
import { useRecentlyViewed } from '~/composables/useRecentlyViewed'
import { useCartStore } from '~/stores/cart'

const route = useRoute()
const router = useRouter()
const currency = useCurrencyStore()
const recent = useRecentlyViewed()
const { t, locale } = useI18n()
const LOCALE_TAG: Record<string, string> = { ko: 'ko-KR', en: 'en-US', ja: 'ja-JP', zh: 'zh-CN', 'zh-hant': 'zh-Hant' }
const displayTitle = computed(() => {
  const h = hotel.value
  if (!h) return ''
  return locale.value === 'ko' ? (h.name_ko || h.name) : (h.name_en || h.name_ko || h.name)
})
const secondaryTitle = computed(() => {
  const h = hotel.value
  if (!h) return ''
  return locale.value === 'ko' ? (h.name_en || '') : (h.name_ko && h.name_ko !== displayTitle.value ? h.name_ko : '')
})

const hotelId = String(route.params.id || route.query.hotelId || route.query.id || '')
// Static catalogue is only a first paint (and SEO); never substitute a different hotel for an unknown id.
const hotel = ref<any>(hotelId ? getHotelById(hotelId) || generatedFallback('HOTEL', hotelId) : null)
const loading = ref(!hotel.value)
const notFound = ref(false)
// Rate plans (price, meal, cancellation) only come from the live API.
const ratesState = ref<'loading' | 'ok' | 'unavailable'>('loading')

// ------------------------------------------------------------------ stay (URL state)
const str = (v: unknown) => (typeof v === 'string' ? v : '')
const int = (v: unknown, d: number, lo: number, hi: number) => { const n = parseInt(str(v), 10); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d }
const ISO = /^\d{4}-\d{2}-\d{2}$/
const stay = ref({ checkIn: '', checkOut: '', adults: 2, children: 0, rooms: 1 })
function readStay() {
  const r = route.query
  const checkIn = ISO.test(str(r.checkIn)) ? str(r.checkIn) : ''
  const checkOut = checkIn && ISO.test(str(r.checkOut)) && str(r.checkOut) > checkIn ? str(r.checkOut) : ''
  stay.value = { checkIn: checkOut ? checkIn : '', checkOut, adults: int(r.adults, 2, 1, 9), children: int(r.children, 0, 0, 8), rooms: int(r.rooms, 1, 1, 5) }
}
readStay()
// Guard both directions: while navigating away (e.g. to /checkout) this page is still mounted and must
// neither re-read nor rewrite the next page's query.
const selfPath = route.path
watch(() => route.query, () => { if (route.path === selfPath) readStay() })
watch(stay, (s) => {
  if (route.path !== selfPath) return
  const query: Record<string, string> = { adults: String(s.adults), rooms: String(s.rooms) }
  if (s.checkIn && s.checkOut) { query.checkIn = s.checkIn; query.checkOut = s.checkOut }
  if (s.children) query.children = String(s.children)
  if (JSON.stringify(query) !== JSON.stringify(route.query)) router.replace({ query })
}, { deep: true })

const today = ref('')
const nights = computed(() => (stay.value.checkIn && stay.value.checkOut ? Math.round((Date.parse(stay.value.checkOut) - Date.parse(stay.value.checkIn)) / 86400000) : 0))
const guests = computed(() => stay.value.adults + stay.value.children)
const WEEKDAYS: Record<string, string[]> = {
  ko: ['일', '월', '화', '수', '목', '금', '토'],
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  ja: ['日', '月', '火', '水', '木', '金', '土'],
  zh: ['日', '一', '二', '三', '四', '五', '六'],
  'zh-hant': ['日', '一', '二', '三', '四', '五', '六'],
}
const lightboxIdx = ref<number | null>(null)
function onLightboxKey(e: KeyboardEvent) {
  if (lightboxIdx.value === null) return
  if (e.key === 'Escape') lightboxIdx.value = null
  else if (e.key === 'ArrowRight') lightboxIdx.value = (lightboxIdx.value + 1) % gallery.value.length
  else if (e.key === 'ArrowLeft') lightboxIdx.value = (lightboxIdx.value - 1 + gallery.value.length) % gallery.value.length
}
const hasCoords = computed(() => Number.isFinite(Number(hotel.value?.latitude)) && Number.isFinite(Number(hotel.value?.longitude)) && Number(hotel.value?.latitude) !== 0)
const googleMapsUrl = computed(() => hasCoords.value ? `https://www.google.com/maps/search/?api=1&query=${hotel.value.latitude},${hotel.value.longitude}` : '')
const naverMapsUrl = computed(() => hasCoords.value ? `https://map.naver.com/p/search/${encodeURIComponent(hotel.value?.name_ko || hotel.value?.address || '')}` : '')
function fmt(s: string) { const [y = NaN, m = NaN, d = NaN] = s.split('-').map(Number); const wk = (WEEKDAYS[locale.value] || WEEKDAYS.ko || [])[new Date(y, m - 1, d).getDay()] ?? ''; return t('hotels.detail.fmtDay', { m, d, w: wk }) }
/**
 * Mirrors the server rule (worker/src/domain/pricing.ts cancellationPolicyFor): free until 24h before
 * 00:00 UTC of the check-in date. Shown in the viewer's local time; checkout shows the binding deadline.
 */
const freeCancelLabel = computed(() => {
  if (!stay.value.checkIn) return t('hotels.detail.freeUntilTbd')
  const dt = new Date(Date.parse(`${stay.value.checkIn}T00:00:00Z`) - 86400000)
  return t('hotels.detail.freeUntilDt', { d: t('hotels.detail.md', { m: dt.getMonth() + 1, d: dt.getDate() }), time: `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}` })
})

// ------------------------------------------------------------------ derived catalogue facts
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null)
const score = computed(() => num(Number(hotel.value?.review_score)) ?? num(hotel.value?.score_overall))
const SUB_KEYS = ['clean', 'loc', 'service', 'fac'] as const
const SUB_COLS = ['score_cleanliness', 'score_location', 'score_service', 'score_facilities'] as const
const subScores = computed(() =>
  SUB_KEYS.map((k, i) => ({ label: t(`hotels.detail.sub_${k}`), value: num(hotel.value?.[SUB_COLS[i]!]) }))
    .filter((x): x is { label: string; value: number } => x.value !== null)
)
const minRoomPrice = computed(() => {
  const prices = (hotel.value?.rooms || []).map((r: any) => Number(r.base_price_krw)).filter((n: number) => n > 0)
  return prices.length ? Math.min(...prices) : null
})
const gallery = computed<string[]>(() => {
  const h = hotel.value
  if (!h) return []
  const list = [h.thumbnail_url || h.image_url, ...(Array.isArray(h.images) ? h.images : [])].filter(Boolean)
  return [...new Set(list)] as string[]
})
const TYPE_IDS = ['HOTEL', 'RESORT', 'APARTMENT'] as const
const typeLabel = (id: string) => ((TYPE_IDS as readonly string[]).includes(id) ? t(`hotels.list.type_${id}`) : '')
const location = computed(() => [hotel.value?.neighborhood, hotel.value?.subway_nearby].filter(Boolean) as string[])

function roomFits(room: any) { const max = Number(room.max_occupancy || room.max_guests) || 0; return !max || guests.value <= max * stay.value.rooms }
function roomsNeeded(room: any) { const max = Number(room.max_occupancy || room.max_guests) || 0; return max ? Math.ceil(guests.value / max) : 1 }

function checkoutLink(room: any, plan: any) {
  const s = stay.value
  return {
    path: '/checkout',
    query: {
      domain: 'HOTEL', itemId: hotel.value.id, unitId: room.id, ratePlanId: plan.id,
      startDate: s.checkIn, endDate: s.checkOut, rooms: String(s.rooms), adults: String(s.adults),
      ...(s.children ? { children: String(s.children) } : {})
    }
  }
}
const cart = useCartStore()
const addedRoom = ref('')
async function addRoomToCart(room: any, plan: any) {
  const s = stay.value
  const ok = await cart.add({
    domain: 'HOTEL', itemId: hotel.value.id, unitId: room.id, ratePlanId: plan.id,
    startDate: s.checkIn, endDate: s.checkOut, rooms: s.rooms, adults: s.adults, children: s.children,
    title: `${hotel.value.name_ko || hotel.value.name} · ${room.name_ko || room.name}`,
  })
  if (ok) { addedRoom.value = room.id; setTimeout(() => (addedRoom.value = ''), 2500) }
}
const stayPanel = ref<HTMLElement | null>(null)
const needDates = ref(false)
function askForDates() {
  needDates.value = true
  stayPanel.value?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  setTimeout(() => stayPanel.value?.querySelector<HTMLElement>('button')?.focus(), 350)
}
watch(nights, (n) => { if (n) needDates.value = false })

// ------------------------------------------------------------------ SEO (catalogue facts only; ratings must come from verified reviews)
const seoSite = `https://${useRuntimeConfig().public.brandDomain}`
const localeCtx = useActiveLocaleContext()
// S4: markdown fact sheet alternate for LLMs (hub serves it; same-origin on apex).
useHead(() => ({ link: [{ rel: 'alternate', type: 'text/markdown', href: `/api/v1/seo/md/HOTEL/${String(route.params.id || '')}` }] }))
useHead(() => {
  const h = hotel.value
  if (!h) return {}
  const ld: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Hotel',
    name: h.name_ko || h.name,
    ...(h.name_en ? { alternateName: h.name_en } : {}),
    ...(h.address ? { address: { '@type': 'PostalAddress', streetAddress: h.address, ...(h.city ? { addressLocality: h.city } : {}) } } : {}),
    ...(h.thumbnail_url || h.image_url ? { image: h.thumbnail_url || h.image_url } : {}),
    ...(Number(h.star_rating) > 0 ? { starRating: { '@type': 'Rating', ratingValue: Number(h.star_rating) } } : {}),
    ...(h.updated_at ? { dateModified: String(h.updated_at) } : {}),
    ...(minRoomPrice.value ? { priceRange: t('hotels.detail.priceRange', { v: minRoomPrice.value.toLocaleString(LOCALE_TAG[locale.value] || 'ko-KR') }) } : {}),
  }
  const detailPath = `/hotels/detail/${hotelId}`
  // S7: offers/rating only from live rates — static first paint must never mint prices.
  const liveOffers = ratesState.value === 'ok'
  const offer = liveOffers ? offerLd(seoSite, detailPath, minRoomPrice.value, (h.rooms || []).some((r: any) => (r.rate_plans || []).length > 0), null) : null
  const rating = liveOffers ? aggregateRatingOf(h.review_score, h.review_count) : null
  if (offer) ld.offers = offer
  if (rating) ld.aggregateRating = rating
  return {
    title: h.name_ko || h.name,
    meta: [
      { name: 'description', content: [h.name_ko, h.city, h.neighborhood, t('hotels.detail.seoSuffix')].filter(Boolean).join(' · ') },
      ...ogMeta(seoSite, detailPath, (h as any).thumbnail_url || (h as any).image_url || null, localeCtx.value.locale, localeCtx.value.sub),
    ],
    link: [{ rel: 'canonical', href: canonicalHref(detailPath, { sub: localeCtx.value.sub, locale: localeCtx.value.locale }) }, ...hreflangLinks(seoSite, detailPath)],
    script: [
      { type: 'application/ld+json', innerHTML: JSON.stringify(ld).replace(/</g, '\\u003c') },
      jsonLdScript(breadcrumbLd(seoSite, [{ name: t('common.home'), path: '/' }, { name: t('nav.hotels'), path: '/hotels' }, { name: h.name_ko || h.name, path: detailPath }])),
    ],
  }
})

async function loadLive() {
  if (!hotelId) { loading.value = false; notFound.value = true; return }
  try {
    const qp = new URLSearchParams()
    if (stay.value.checkIn && stay.value.checkOut) {
      qp.set('checkIn', stay.value.checkIn)
      qp.set('checkOut', stay.value.checkOut)
      qp.set('rooms', String(stay.value.rooms))
    }
    const qs = qp.toString()
    const res = await fetch(useApiUrl(`/hotels/${encodeURIComponent(hotelId)}${qs ? `?${qs}` : ''}`), { signal: AbortSignal.timeout(8000) })
    if (res.ok) {
      const json = await res.json()
      if (json.data) { hotel.value = { ...(hotel.value || {}), ...json.data }; ratesState.value = 'ok' }
    } else if (res.status === 404) {
      hotel.value = null
      notFound.value = true
    }
  } catch {
    // Network failure: keep the static first paint but do not offer bookable rates.
  }
  if (ratesState.value !== 'ok') ratesState.value = 'unavailable'
  if (!hotel.value) notFound.value = true
  loading.value = false
}
// TG-15: SSR the first paint (ISR caches it). Server-side misses 404 and
// server-side failures 503 — a stale shell must never bake into the edge cache.
await useSsrLoad(`tg15-hotel-${hotelId}`, loadLive, { hotel, notFound, ratesState, loading })
if (import.meta.server) {
  if (notFound.value) throw createError({ statusCode: 404, statusMessage: 'Product not found' })
  if (ratesState.value !== 'ok') throw createError({ statusCode: 503, statusMessage: 'Catalog temporarily unavailable' })
}
watch(() => [stay.value.checkIn, stay.value.checkOut, stay.value.rooms], () => {
  if (import.meta.client && stay.value.checkIn && stay.value.checkOut) void loadLive()
})
onMounted(() => {
  const d = new Date(); today.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  window.addEventListener('keydown', onLightboxKey)
  if (hotel.value?.id) {
    recent.record({
      domain: 'HOTEL',
      id: hotel.value.id,
      title: displayTitle.value || hotel.value.name_ko || hotel.value.name,
      subtitle: [hotel.value.city, hotel.value.country].filter(Boolean).join(', '),
      image: gallery.value[0] || null,
      priceKrw: minRoomPrice.value || hotel.value.base_price_krw || null,
      path: `/hotels/detail/${hotel.value.id}`,
    })
  }
})
onBeforeUnmount(() => { if (import.meta.client) window.removeEventListener('keydown', onLightboxKey) })

const backToList = computed(() => ({ path: '/hotels/list', query: { ...(hotel.value?.city ? { city: hotel.value.city } : {}), ...route.query } }))
</script>

<template>
  <!-- Loading -->
  <div v-if="loading" class="mx-auto max-w-7xl px-4 py-8 lg:px-6" aria-busy="true">
    <div class="h-4 w-40 animate-pulse rounded bg-surface-sunken" />
    <div class="mt-4 h-8 w-2/3 animate-pulse rounded bg-surface-sunken" />
    <div class="mt-6 grid h-72 gap-2 sm:h-96 sm:grid-cols-4 sm:grid-rows-2"><div class="animate-pulse rounded-card bg-surface-sunken sm:col-span-2 sm:row-span-2" /><div class="hidden animate-pulse rounded-card bg-surface-sunken sm:block" /><div class="hidden animate-pulse rounded-card bg-surface-sunken sm:block" /></div>
  </div>

  <div v-else-if="hotel" class="mx-auto max-w-7xl px-4 pb-28 pt-5 lg:px-6 lg:pb-16">
    <!-- Breadcrumb -->
    <nav class="mb-3 flex flex-wrap items-center gap-1 text-xs text-ink-subtle" :aria-label="$t('common.breadcrumb')">
      <NuxtLink :to="$localePath('/')" class="hover:text-ink">{{ $t('common.home') }}</NuxtLink><AppIcon name="chevron-right" :size="12" />
      <NuxtLink :to="$localePath(backToList)" class="hover:text-ink">{{ hotel.city ? $t('hotels.list.h1city', { city: hotel.city }) : $t('hotels.list.stay') }}</NuxtLink><AppIcon name="chevron-right" :size="12" />
      <span class="max-w-[16rem] truncate text-ink-muted">{{ hotel.name_ko || hotel.name }}</span>
    </nav>

    <!-- Header -->
    <header class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div class="min-w-0">
        <p class="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-muted">
          <span v-if="Number(hotel.star_rating) > 0" class="flex items-center text-warning" :aria-label="$t('hotels.list.starAria', { n: hotel.star_rating })">
            <AppIcon v-for="n in Number(hotel.star_rating)" :key="n" name="star" :size="14" stroke="0" class="fill-current" />
          </span>
          <span>{{ typeLabel(hotel.property_type) || $t('hotels.list.stay') }}</span>
          <span v-if="hotel.city" class="text-ink-subtle">· {{ [hotel.city, hotel.country].filter(Boolean).join(', ') }}</span>
        </p>
        <h1 class="mt-1 text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">{{ displayTitle }}</h1>
        <p v-if="secondaryTitle" class="mt-0.5 text-sm text-ink-subtle">{{ secondaryTitle }}</p>
        <p v-if="hotel.address" class="mt-2 flex items-start gap-1 text-sm text-ink-muted"><AppIcon name="map-pin" :size="16" class="mt-0.5 text-ink-subtle" />{{ hotel.address }}</p>
      </div>
      <div class="flex flex-wrap items-center gap-2 sm:shrink-0 sm:flex-nowrap sm:gap-3">
        <div v-if="score" class="flex items-center gap-2">
          <span class="rounded-xl bg-primary px-2.5 py-1.5 text-lg font-bold text-primary-ink tabular">{{ score.toFixed(1) }}</span>
          <span class="text-xs leading-tight text-ink-muted">{{ $t('hotels.detail.outOf5') }}<br /><template v-if="hotel.review_count">{{ $t('hotels.detail.verifiedCount', { n: $n(Number(hotel.review_count)) }) }}</template></span>
        </div>
        <div v-else class="flex items-center gap-2">
          <span class="whitespace-nowrap rounded-xl bg-surface-sunken px-2.5 py-1.5 text-sm font-bold text-ink-muted">{{ $t('hotels.list.newBadge') }}</span>
          <span class="whitespace-nowrap text-xs leading-tight text-ink-muted">{{ $t('hotels.detail.noReviewsYet') }}</span>
        </div>
        <WishlistButton domain="HOTEL" :item-id="hotel.id" :title="hotel.name_ko || hotel.name" :price-krw="minRoomPrice" :thumbnail-url="gallery[0] || null" :target-url="$route.fullPath" />
        <PriceAlertButton domain="HOTEL" :item-id="hotel.id" :label="hotel.name_ko || hotel.name" :current-price="minRoomPrice" />
      </div>
    </header>

    <!-- Gallery (clickable fullscreen lightbox) -->
    <div class="relative mt-5 grid h-64 gap-2 overflow-hidden rounded-card sm:h-[420px] sm:grid-cols-4 sm:grid-rows-2">
      <button type="button" :class="['group relative h-full w-full overflow-hidden text-left', gallery.length > 1 ? 'sm:col-span-2 sm:row-span-2' : 'sm:col-span-4 sm:row-span-2']" @click="gallery.length && (lightboxIdx = 0)">
        <SmartImg :src="gallery[0]" :alt="$t('hotels.detail.mainPhoto', { name: displayTitle })" icon="hotel" img-class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
      </button>
      <button
        v-for="(img, i) in gallery.slice(1, 5)"
        :key="img"
        type="button"
        :class="['group relative hidden h-full w-full overflow-hidden text-left sm:block', gallery.length === 2 ? 'sm:col-span-2 sm:row-span-2' : gallery.length === 3 ? 'sm:col-span-2' : '']"
        @click="lightboxIdx = i + 1"
      >
        <SmartImg :src="img" :alt="$t('hotels.detail.photoN', { name: displayTitle, n: i + 2 })" icon="hotel" img-class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
      </button>
      <button
        v-if="gallery.length > 1"
        type="button"
        class="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-midnight-950/75 px-3.5 py-1.5 text-xs font-bold text-white backdrop-blur-md transition hover:bg-midnight-950"
        @click="lightboxIdx = 0"
      >
        <AppIcon name="camera" :size="14" />{{ $t('hotels.detail.viewAllPhotos', { n: gallery.length }) }}
      </button>
    </div>

    <div class="mt-8 grid gap-8 lg:grid-cols-[1fr_360px]">
      <div class="min-w-0 space-y-10">
        <!-- Highlights -->
        <section aria-labelledby="h-about">
          <h2 id="h-about" class="sr-only">{{ $t('hotels.detail.overview') }}</h2>
          <ul class="grid gap-3 sm:grid-cols-2">
            <li v-for="l in location" :key="l" class="flex items-start gap-3 rounded-2xl border border-line bg-surface p-4 text-sm text-ink"><AppIcon name="map-pin" class="text-primary" />{{ l }}</li>
            <li v-if="hotel.free_cancellation" class="flex items-start gap-3 rounded-2xl border border-line bg-surface p-4 text-sm text-ink"><AppIcon name="refund" class="text-success" /><span><b class="font-semibold">{{ $t('hotels.detail.hasFreeCancel') }}</b><br /><span class="text-ink-muted">{{ $t('hotels.detail.freeCancelBlurb') }}</span></span></li>
            <li v-if="hotel.free_breakfast" class="flex items-start gap-3 rounded-2xl border border-line bg-surface p-4 text-sm text-ink"><AppIcon name="check" class="text-success" /><span><b class="font-semibold">{{ $t('hotels.detail.hasBreakfast') }}</b></span></li>
          </ul>
        </section>

        <p v-if="hotel.updated_at" class="text-xs text-ink-subtle">{{ $t('common.updatedAt', { d: String(hotel.updated_at).slice(0, 10) }) }}</p>

        <SeoAnswer
          :name="hotel.name_ko || hotel.name"
          :location="location.join(', ') || null"
          :free-cancel="hotel.free_cancellation ? true : null"
          :inclusions="[...(Array.isArray(hotel.amenities) ? hotel.amenities : []), ...(hotel.free_breakfast ? [$t('hotels.detail.hasBreakfast')] : [])]"
          :price-label="minRoomPrice ? `${currency.formatKRW(minRoomPrice)} (${$t('hotels.detail.perNightTax')})` : null"
          :path="route.path"
        />

        <!-- Rooms -->
        <section aria-labelledby="h-rooms">
          <div class="mb-4 flex flex-wrap items-end justify-between gap-2">
            <h2 id="h-rooms" class="text-xl font-bold tracking-tight text-ink">{{ $t('hotels.detail.pickRoom') }}</h2>
            <p class="text-xs text-ink-subtle">{{ $t('hotels.detail.roomPriceNote') }}</p>
          </div>

          <p v-if="ratesState === 'loading'" class="rounded-2xl bg-surface-sunken p-4 text-sm text-ink-muted">{{ $t('hotels.detail.checkingRates') }}</p>
          <div v-else-if="ratesState === 'unavailable'" class="rounded-2xl border border-warning/30 bg-warning-soft p-4 text-sm text-ink" role="alert">
            {{ $t('hotels.detail.ratesDown') }}
          </div>
          <p v-else-if="!hotel.rooms?.length" class="rounded-2xl bg-surface-sunken p-4 text-sm text-ink-muted">{{ $t('hotels.detail.noRooms') }}</p>

          <ul v-else class="space-y-4">
            <li v-for="room in hotel.rooms" :key="room.id" class="overflow-hidden rounded-card border border-line bg-surface">
              <div class="border-b border-line p-5">
                <h3 class="text-lg font-bold text-ink">{{ room.name_ko || room.name }}</h3>
                <ul class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-muted">
                  <li v-if="room.bed_type" class="flex items-center gap-1.5"><AppIcon name="hotel" :size="16" class="text-ink-subtle" />{{ room.bed_type }}</li>
                  <li v-if="room.max_occupancy || room.max_guests" class="flex items-center gap-1.5"><AppIcon name="users" :size="16" class="text-ink-subtle" />{{ $t('hotels.detail.maxPax', { n: room.max_occupancy || room.max_guests }) }}</li>
                  <li v-if="Number(room.room_size_sqm) > 0" class="tabular">{{ room.room_size_sqm }}m²</li>
                </ul>
                <p v-if="!roomFits(room)" class="mt-3 flex items-center gap-1.5 rounded-xl bg-warning-soft px-3 py-2 text-sm text-ink">
                  <AppIcon name="users" :size="16" class="text-warning" />{{ $t('hotels.detail.needRooms', { g: guests, n: roomsNeeded(room) }) }}
                  <button type="button" class="ml-auto shrink-0 font-semibold text-primary hover:underline" :disabled="roomsNeeded(room) > Math.min(5, stay.adults)" @click="stay.rooms = roomsNeeded(room)">{{ $t('hotels.detail.setRooms', { n: roomsNeeded(room) }) }}</button>
                </p>
              </div>
              <ul class="divide-y divide-line">
                <li v-for="plan in room.rate_plans || []" :key="plan.id" class="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between" :data-testid="`rate-plan-${room.id}-${plan.id}`">
                  <div class="space-y-1 text-sm">
                    <p class="font-semibold text-ink">{{ plan.name_ko }}</p>
                    <p v-if="plan.name_ko !== (plan.meal === 'BREAKFAST' ? '조식 포함' : '식사 불포함')" class="flex items-center gap-1.5 text-ink-muted"><AppIcon :name="plan.meal === 'BREAKFAST' ? 'check' : 'minus'" :size="14" />{{ plan.meal === 'BREAKFAST' ? $t('hotels.detail.mealYes') : $t('hotels.detail.mealNo') }}</p>
                    <p v-if="plan.free_cancellation" class="flex items-center gap-1.5 font-medium text-success"><AppIcon name="check" :size="14" />{{ freeCancelLabel }}</p>
                    <p v-else class="flex items-center gap-1.5 font-medium text-danger"><AppIcon name="close" :size="14" />{{ $t('hotels.detail.nonRefundable') }}</p>
                  </div>
                  <div class="flex flex-wrap items-center justify-between gap-3 sm:justify-end">
                    <div class="text-left sm:text-right">
                      <p class="text-xl font-extrabold text-ink tabular">{{ currency.formatKRW(plan.price_krw) }}</p>
                      <p class="text-2xs text-ink-subtle tabular">
                        <template v-if="nights">{{ $t('hotels.detail.stayPrice', { n: nights, rooms: stay.rooms, v: currency.formatKRW(plan.price_krw * nights * stay.rooms) }) }}</template>
                        <template v-else>{{ $t('hotels.detail.perNightTax') }}</template>
                      </p>
                    </div>
                    <div class="flex flex-wrap items-center gap-2">
                      <NuxtLink
                        v-if="nights && roomFits(room)"
                        :to="$localePath(checkoutLink(room, plan))"
                        class="btn-primary shrink-0 px-5 py-2.5"
                      >{{ $t('common.bookNow') }}</NuxtLink>
                      <button
                        v-if="nights && roomFits(room)"
                        type="button"
                        :disabled="cart.adding"
                        class="btn-secondary shrink-0 px-4 py-2.5 disabled:opacity-50"
                        data-testid="add-cart"
                        @click="addRoomToCart(room, plan)"
                      >{{ addedRoom === room.id ? $t('hotels.detail.added') : $t('hotels.detail.addCart') }}</button>
                      <button v-else-if="!nights" type="button" class="shrink-0 rounded-field border border-primary px-5 py-2.5 text-sm font-bold text-primary hover:bg-primary-soft" @click="askForDates">{{ $t('trains.search.pickDate') }}</button>
                      <span v-else class="shrink-0 rounded-field bg-surface-sunken px-4 py-2.5 text-sm font-semibold text-ink-subtle">{{ $t('hotels.detail.overCapacity') }}</span>
                    </div>
                  </div>
                </li>
              </ul>
            </li>
          </ul>
        </section>

        <!-- Amenities (catalogue only) -->
        <section v-if="hotel.amenities?.length" aria-labelledby="h-amen">
          <h2 id="h-amen" class="mb-4 text-xl font-bold tracking-tight text-ink">{{ $t('hotels.detail.amenTitle') }}</h2>
          <ul class="grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
            <li v-for="a in hotel.amenities" :key="a" class="flex items-center gap-2 text-sm text-ink"><AppIcon name="check" :size="16" class="text-primary" />{{ a }}</li>
          </ul>
        </section>

        <!-- Location & Map Card (real coordinates, zero third-party iframe overhead) -->
        <section v-if="hasCoords || hotel.address" aria-labelledby="h-loc" class="card overflow-hidden p-5 sm:p-6">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 id="h-loc" class="text-xl font-bold tracking-tight text-ink">{{ $t('hotels.detail.locationTitle') }}</h2>
              <p v-if="hotel.address" class="mt-1 text-sm text-ink-muted">{{ hotel.address }}</p>
            </div>
            <div v-if="hasCoords" class="flex flex-wrap gap-2">
              <a :href="googleMapsUrl" target="_blank" rel="noopener" class="btn-secondary !px-3.5 !py-2 !text-xs"><AppIcon name="map-pin" :size="14" />Google Maps</a>
              <a :href="naverMapsUrl" target="_blank" rel="noopener" class="btn-secondary !px-3.5 !py-2 !text-xs"><AppIcon name="compass" :size="14" />Naver Map</a>
            </div>
          </div>
          <div v-if="hasCoords" class="relative mt-4 flex flex-col items-center justify-center overflow-hidden rounded-2xl border border-line bg-surface-sunken px-6 py-8 text-center">
            <div class="pointer-events-none absolute inset-0 opacity-20" style="background-image: radial-gradient(circle at 1px 1px, rgb(var(--gft-primary)) 1px, transparent 0); background-size: 20px 20px;" aria-hidden="true" />
            <span class="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-ink shadow-card"><AppIcon name="map-pin" :size="22" /></span>
            <p class="relative mt-3 font-bold text-ink">{{ displayTitle }}</p>
            <p class="relative mt-1 font-mono text-xs text-ink-subtle tabular">{{ Number(hotel.latitude).toFixed(5) }}°N, {{ Number(hotel.longitude).toFixed(5) }}°E</p>
            <p v-if="hotel.subway_nearby" class="relative mt-1.5 text-xs font-medium text-primary">{{ hotel.subway_nearby }}</p>
          </div>
        </section>

        <!-- Ratings breakdown (only when the catalogue has it) -->
        <section v-if="subScores.length" aria-labelledby="h-scores">
          <h2 id="h-scores" class="mb-4 text-xl font-bold tracking-tight text-ink">{{ $t('hotels.detail.scoresTitle') }}</h2>
          <dl class="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div v-for="s in subScores" :key="s.label" class="rounded-2xl border border-line bg-surface p-4"><dt class="text-xs text-ink-subtle">{{ s.label }}</dt><dd class="mt-1 text-lg font-bold text-ink tabular">{{ s.value.toFixed(1) }}</dd></div>
          </dl>
        </section>

        <ReviewsSection domain="HOTEL" :target-id="hotel.id" />
        <RecoRail domain="HOTEL" :item-id="hotel.id" />

        <!-- Policies that the platform actually enforces -->
        <section aria-labelledby="h-policy" class="rounded-card border border-line bg-surface p-5 sm:p-6">
          <h2 id="h-policy" class="text-lg font-bold text-ink">{{ $t('hotels.detail.policyTitle') }}</h2>
          <ul class="mt-3 space-y-2 text-sm text-ink-muted">
            <li class="flex gap-2"><AppIcon name="lock" :size="16" class="mt-0.5 text-ink-subtle" />{{ $t('hotels.detail.pol1') }}</li>
            <li class="flex gap-2"><AppIcon name="refund" :size="16" class="mt-0.5 text-ink-subtle" />{{ $t('hotels.detail.pol2') }}</li>
            <li class="flex gap-2"><AppIcon name="check" :size="16" class="mt-0.5 text-ink-subtle" />{{ $t('hotels.detail.pol3') }}</li>
            <li class="flex gap-2"><AppIcon name="support" :size="16" class="mt-0.5 text-ink-subtle" />{{ $t('hotels.detail.pol4') }}</li>
          </ul>
          <PolicyNotice domain="HOTEL" :item-id="hotelId" v-slot="{ policy, loaded, hoursLabel, pct }">
            <ul v-if="policy" class="mt-3 space-y-2 border-t border-line pt-3 text-sm text-ink-muted">
              <li v-if="policy.free_cancel_hours !== null && policy.free_cancel_hours !== undefined" class="flex gap-2"><AppIcon name="check" :size="16" class="mt-0.5 text-success" />{{ $t('hotels.detail.freeHrs', { h: hoursLabel(policy.free_cancel_hours) }) }}</li>
              <li v-for="(t, i) in (policy.tiers || [])" :key="i" class="flex gap-2"><AppIcon name="refund" :size="16" class="mt-0.5 text-ink-subtle" />{{ $t('hotels.detail.tierRow', { h: hoursLabel(t.hours_before), p: pct(t.refund_bps), note: t.note ? ` · ${t.note}` : '' }) }}</li>
              <li v-if="policy.no_show_fee_bps" class="flex gap-2"><AppIcon name="refund" :size="16" class="mt-0.5 text-ink-subtle" />{{ $t('hotels.detail.noshowRow', { p: pct(policy.no_show_fee_bps) }) }}</li>
              <li class="flex gap-2"><AppIcon name="check" :size="16" class="mt-0.5 text-ink-subtle" />{{ $t('hotels.detail.noChange') }}</li>
              <li v-if="policy.note" class="flex gap-2 text-xs text-ink-subtle">{{ policy.note }}</li>
            </ul>
            <p v-else-if="loaded" class="mt-3 border-t border-line pt-3 text-xs text-ink-subtle">{{ $t('hotels.detail.stdPre') }}<NuxtLink :to="$localePath('/refund-policy')" class="underline">{{ $t('hotels.detail.stdLink') }}</NuxtLink>{{ $t('hotels.detail.stdPost') }}</p>
          </PolicyNotice>
        </section>
      </div>

      <!-- Stay panel -->
      <aside class="lg:order-none">
        <div ref="stayPanel" :class="['sticky top-28 space-y-3 rounded-card border bg-surface p-5 shadow-card transition-colors', needDates ? 'border-primary shadow-focus' : 'border-line']">
          <p class="text-sm text-ink-muted">
            <template v-if="minRoomPrice">{{ $t('hotels.detail.sideFrom') }} <span class="text-2xl font-extrabold text-ink tabular">{{ currency.formatKRW(minRoomPrice) }}</span>~</template>
            <template v-else>{{ $t('hotels.detail.sidePickDates') }}</template>
          </p>
          <DateRangePicker v-model:start="stay.checkIn" v-model:end="stay.checkOut" :start-label="$t('checkout.startHotel')" :end-label="$t('checkout.endHotel')" :min="today" :max-range="30" :invalid="needDates" />
          <GuestPicker v-model:adults="stay.adults" v-model:children="stay.children" v-model:rooms="stay.rooms" />
          <p v-if="needDates" class="text-sm font-medium text-primary" role="status">{{ $t('hotels.detail.needDates') }}</p>
          <p v-else-if="nights" class="text-sm text-ink-muted">{{ fmt(stay.checkIn) }} – {{ fmt(stay.checkOut) }} · <b class="text-ink">{{ $t('hotels.detail.nights', { n: nights }) }}</b></p>
          <a href="#h-rooms" class="flex w-full items-center justify-center rounded-xl bg-primary py-3 text-sm font-bold text-primary-ink hover:bg-primary-hover">{{ $t('hotels.detail.viewRooms') }}</a>
        </div>
      </aside>
    </div>

    <!-- Fullscreen Photo Lightbox -->
    <Teleport to="body">
      <div v-if="lightboxIdx !== null && gallery.length" class="fixed inset-0 z-[80] flex flex-col items-center justify-center bg-midnight-950/95 p-4 backdrop-blur-md" role="dialog" aria-modal="true" :aria-label="displayTitle" @click.self="lightboxIdx = null">
        <button type="button" class="absolute right-4 top-4 grid h-11 w-11 place-items-center rounded-full bg-white/15 text-white hover:bg-white/25" :aria-label="$t('common.close')" @click="lightboxIdx = null">✕</button>
        <img :src="gallery[lightboxIdx] || ''" :alt="displayTitle" class="max-h-[78vh] max-w-full rounded-2xl object-contain shadow-pop" />
        <template v-if="gallery.length > 1">
          <button type="button" class="absolute left-4 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/15 text-white hover:bg-white/25" :aria-label="$t('reviews.prevPhoto')" @click="lightboxIdx = (lightboxIdx - 1 + gallery.length) % gallery.length"><AppIcon name="chevron-right" :size="20" class="rotate-180" /></button>
          <button type="button" class="absolute right-4 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/15 text-white hover:bg-white/25" :aria-label="$t('reviews.nextPhoto')" @click="lightboxIdx = (lightboxIdx + 1) % gallery.length"><AppIcon name="chevron-right" :size="20" /></button>
          <p class="mt-3 text-sm font-semibold text-white/80 tabular">{{ lightboxIdx + 1 }} / {{ gallery.length }}</p>
          <div class="mt-3 flex max-w-full gap-2 overflow-x-auto pb-1">
            <button v-for="(img, idx) in gallery" :key="img" type="button" :class="['h-14 w-20 shrink-0 overflow-hidden rounded-lg border-2 transition', idx === lightboxIdx ? 'border-primary' : 'border-transparent opacity-60 hover:opacity-100']" @click="lightboxIdx = idx">
              <img :src="img" alt="" class="h-full w-full object-cover" />
            </button>
          </div>
        </template>
      </div>
    </Teleport>

    <!-- Phone / Tablet bottom bar -->
    <div class="fixed inset-x-0 bottom-[calc(58px+env(safe-area-inset-bottom))] z-30 border-t border-line bg-surface/95 px-4 py-2.5 shadow-pop backdrop-blur-md md:bottom-0 lg:hidden print:hidden">
      <div class="mx-auto flex max-w-7xl items-center justify-between gap-3">
        <div class="min-w-0 text-sm">
          <p v-if="nights" class="truncate font-semibold text-ink">{{ fmt(stay.checkIn) }} · {{ $t('hotels.detail.nights', { n: nights }) }}</p>
          <p v-else class="font-semibold text-ink">{{ $t('hotels.list.whenTbd') }}</p>
          <p v-if="minRoomPrice" class="text-xs text-ink-subtle tabular">{{ $t('hotels.detail.barPrice', { v: currency.formatKRW(minRoomPrice) }) }}</p>
        </div>
        <a href="#h-rooms" class="shrink-0 rounded-xl bg-primary px-6 py-3 text-sm font-bold text-primary-ink">{{ $t('hotels.detail.pickRoom') }}</a>
      </div>
    </div>
  </div>

  <div v-else-if="notFound" class="mx-auto max-w-xl px-4 py-24 text-center">
    <span class="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-sunken text-ink-subtle"><AppIcon name="hotel" /></span>
    <p class="mt-4 font-bold text-ink">{{ $t('hotels.detail.notFoundF') }}</p>
    <p class="mt-1 text-sm text-ink-muted">{{ $t('detail.notFoundHint') }}</p>
    <NuxtLink :to="$localePath('/hotels/list')" class="mt-5 inline-block rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-ink">{{ $t('hotels.detail.findOther') }}</NuxtLink>
  </div>
</template>
