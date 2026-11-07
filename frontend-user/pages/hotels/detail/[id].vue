<script setup lang="ts">
/**
 * Hotel detail (design system "Horizon").
 * Stay dates and guests come from the URL (carried over from the results page) and are passed to
 * checkout, where the server prices the stay. Only catalogue facts are shown: no default check-in
 * times, invented facilities or cancellation deadlines. Rates are offered only after the live API answers.
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useCurrencyStore } from '~/stores/currency'
import { useApiUrl } from '~/composables/useApi'
import { getHotelById } from '~/data/hotelCatalog'

const route = useRoute()
const router = useRouter()
const currency = useCurrencyStore()

const hotelId = String(route.params.id || route.query.hotelId || route.query.id || '')
// Static catalogue is only a first paint (and SEO); never substitute a different hotel for an unknown id.
const hotel = ref<any>(hotelId ? getHotelById(hotelId) || null : null)
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
const WEEK = ['일', '월', '화', '수', '목', '금', '토']
function fmt(s: string) { const [y, m, d] = s.split('-').map(Number); return `${m}월 ${d}일 (${WEEK[new Date(y, m - 1, d).getDay()]})` }
/**
 * Mirrors the server rule (worker/src/domain/pricing.ts cancellationPolicyFor): free until 24h before
 * 00:00 UTC of the check-in date. Shown in the viewer's local time; checkout shows the binding deadline.
 */
const freeCancelLabel = computed(() => {
  if (!stay.value.checkIn) return '체크인 전날까지 무료 취소'
  const t = new Date(Date.parse(`${stay.value.checkIn}T00:00:00Z`) - 86400000)
  return `${t.getMonth() + 1}월 ${t.getDate()}일 ${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}까지 무료 취소`
})

// ------------------------------------------------------------------ derived catalogue facts
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null)
const score = computed(() => num(Number(hotel.value?.review_score)) ?? num(hotel.value?.score_overall))
const subScores = computed(() =>
  [['청결도', 'score_cleanliness'], ['위치', 'score_location'], ['서비스', 'score_service'], ['부대시설', 'score_facilities']]
    .map(([label, k]) => ({ label, value: num(hotel.value?.[k]) }))
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
const TYPE_LABEL: Record<string, string> = { HOTEL: '호텔', RESORT: '리조트', APARTMENT: '레지던스' }
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
const stayPanel = ref<HTMLElement | null>(null)
const needDates = ref(false)
function askForDates() {
  needDates.value = true
  stayPanel.value?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  setTimeout(() => stayPanel.value?.querySelector<HTMLElement>('button')?.focus(), 350)
}
watch(nights, (n) => { if (n) needDates.value = false })

// ------------------------------------------------------------------ SEO (catalogue facts only; ratings must come from verified reviews)
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
    ...(minRoomPrice.value ? { priceRange: `₩${minRoomPrice.value.toLocaleString('ko-KR')}~ (1박, 세금 별도)` } : {}),
  }
  return {
    title: h.name_ko || h.name,
    meta: [{ name: 'description', content: [h.name_ko, h.city, h.neighborhood, '객실과 요금을 비교하고 예약하세요.'].filter(Boolean).join(' · ') }],
    script: [{ type: 'application/ld+json', innerHTML: JSON.stringify(ld).replace(/</g, '\\u003c') }],
  }
})

onMounted(async () => {
  const d = new Date(); today.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  if (!hotelId) { loading.value = false; notFound.value = true; return }
  try {
    const res = await fetch(useApiUrl(`/hotels/${encodeURIComponent(hotelId)}`), { signal: AbortSignal.timeout(8000) })
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
})

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
    <nav class="mb-3 flex flex-wrap items-center gap-1 text-xs text-ink-subtle" aria-label="이동 경로">
      <NuxtLink to="/" class="hover:text-ink">홈</NuxtLink><AppIcon name="chevron-right" :size="12" />
      <NuxtLink :to="backToList" class="hover:text-ink">{{ hotel.city ? `${hotel.city} 숙소` : '숙소' }}</NuxtLink><AppIcon name="chevron-right" :size="12" />
      <span class="max-w-[16rem] truncate text-ink-muted">{{ hotel.name_ko || hotel.name }}</span>
    </nav>

    <!-- Header -->
    <header class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div class="min-w-0">
        <p class="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-muted">
          <span v-if="Number(hotel.star_rating) > 0" class="flex items-center text-warning" :aria-label="`${hotel.star_rating}성급`">
            <AppIcon v-for="n in Number(hotel.star_rating)" :key="n" name="star" :size="14" stroke="0" class="fill-current" />
          </span>
          <span>{{ TYPE_LABEL[hotel.property_type] || '숙소' }}</span>
          <span v-if="hotel.city" class="text-ink-subtle">· {{ [hotel.city, hotel.country].filter(Boolean).join(', ') }}</span>
        </p>
        <h1 class="mt-1 text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">{{ hotel.name_ko || hotel.name }}</h1>
        <p v-if="hotel.name_en" class="mt-0.5 text-sm text-ink-subtle">{{ hotel.name_en }}</p>
        <p v-if="hotel.address" class="mt-2 flex items-start gap-1 text-sm text-ink-muted"><AppIcon name="map-pin" :size="16" class="mt-0.5 text-ink-subtle" />{{ hotel.address }}</p>
      </div>
      <div class="flex shrink-0 items-center gap-3">
        <div v-if="score" class="flex items-center gap-2">
          <span class="rounded-xl bg-primary px-2.5 py-1.5 text-lg font-bold text-primary-ink tabular">{{ score.toFixed(1) }}</span>
          <span class="text-xs leading-tight text-ink-muted">5점 만점<br /><template v-if="hotel.review_count">평가 {{ Number(hotel.review_count).toLocaleString('ko-KR') }}건</template></span>
        </div>
        <WishlistButton domain="HOTEL" :item-id="hotel.id" :title="hotel.name_ko || hotel.name" :price-krw="minRoomPrice" :thumbnail-url="gallery[0] || null" :target-url="$route.fullPath" />
        <PriceAlertButton domain="HOTEL" :item-id="hotel.id" :label="hotel.name_ko || hotel.name" :current-price="minRoomPrice" />
      </div>
    </header>

    <!-- Gallery -->
    <div class="mt-5 grid h-64 gap-2 overflow-hidden rounded-card sm:h-[420px] sm:grid-cols-4 sm:grid-rows-2">
      <SmartImg :src="gallery[0]" :alt="`${hotel.name_ko} 대표 사진`" icon="hotel" :img-class="['h-full w-full object-cover', gallery.length > 1 ? 'sm:col-span-2 sm:row-span-2' : 'sm:col-span-4 sm:row-span-2'].join(' ')" />
      <SmartImg v-for="(img, i) in gallery.slice(1, 5)" :key="img" :src="img" :alt="`${hotel.name_ko} 사진 ${i + 2}`" icon="hotel" :img-class="['hidden h-full w-full object-cover sm:block', gallery.length === 2 ? 'sm:col-span-2 sm:row-span-2' : gallery.length === 3 ? 'sm:col-span-2' : ''].join(' ')" />
    </div>

    <div class="mt-8 grid gap-8 lg:grid-cols-[1fr_360px]">
      <div class="min-w-0 space-y-10">
        <!-- Highlights -->
        <section aria-labelledby="h-about">
          <h2 id="h-about" class="sr-only">숙소 개요</h2>
          <ul class="grid gap-3 sm:grid-cols-2">
            <li v-for="l in location" :key="l" class="flex items-start gap-3 rounded-2xl border border-line bg-surface p-4 text-sm text-ink"><AppIcon name="map-pin" class="text-primary" />{{ l }}</li>
            <li v-if="hotel.free_cancellation" class="flex items-start gap-3 rounded-2xl border border-line bg-surface p-4 text-sm text-ink"><AppIcon name="refund" class="text-success" /><span><b class="font-semibold">무료 취소 요금 있음</b><br /><span class="text-ink-muted">체크인 전날까지 수수료 없이 취소</span></span></li>
            <li v-if="hotel.free_breakfast" class="flex items-start gap-3 rounded-2xl border border-line bg-surface p-4 text-sm text-ink"><AppIcon name="check" class="text-success" /><span><b class="font-semibold">조식 포함 요금 있음</b></span></li>
          </ul>
        </section>

        <!-- Rooms -->
        <section aria-labelledby="h-rooms">
          <div class="mb-4 flex flex-wrap items-end justify-between gap-2">
            <h2 id="h-rooms" class="text-xl font-bold tracking-tight text-ink">객실 선택</h2>
            <p class="text-xs text-ink-subtle">요금은 객실 1개·1박 기준이며 세금 10%가 별도로 붙어요.</p>
          </div>

          <p v-if="ratesState === 'loading'" class="rounded-2xl bg-surface-sunken p-4 text-sm text-ink-muted">실시간 요금을 확인하고 있어요…</p>
          <div v-else-if="ratesState === 'unavailable'" class="rounded-2xl border border-warning/30 bg-warning-soft p-4 text-sm text-ink" role="alert">
            지금은 실시간 요금을 확인할 수 없어 예약을 받을 수 없어요. 잠시 후 페이지를 새로고침해 주세요.
          </div>
          <p v-else-if="!hotel.rooms?.length" class="rounded-2xl bg-surface-sunken p-4 text-sm text-ink-muted">예약 가능한 객실 정보가 없어요.</p>

          <ul v-else class="space-y-4">
            <li v-for="room in hotel.rooms" :key="room.id" class="overflow-hidden rounded-card border border-line bg-surface">
              <div class="border-b border-line p-5">
                <h3 class="text-lg font-bold text-ink">{{ room.name_ko || room.name }}</h3>
                <ul class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-muted">
                  <li v-if="room.bed_type" class="flex items-center gap-1.5"><AppIcon name="hotel" :size="16" class="text-ink-subtle" />{{ room.bed_type }}</li>
                  <li v-if="room.max_occupancy || room.max_guests" class="flex items-center gap-1.5"><AppIcon name="users" :size="16" class="text-ink-subtle" />최대 {{ room.max_occupancy || room.max_guests }}인</li>
                  <li v-if="Number(room.room_size_sqm) > 0" class="tabular">{{ room.room_size_sqm }}m²</li>
                </ul>
                <p v-if="!roomFits(room)" class="mt-3 flex items-center gap-1.5 rounded-xl bg-warning-soft px-3 py-2 text-sm text-ink">
                  <AppIcon name="users" :size="16" class="text-warning" />{{ guests }}명이 묵으려면 이 객실이 {{ roomsNeeded(room) }}개 필요해요.
                  <button type="button" class="ml-auto shrink-0 font-semibold text-primary hover:underline" :disabled="roomsNeeded(room) > Math.min(5, stay.adults)" @click="stay.rooms = roomsNeeded(room)">객실 {{ roomsNeeded(room) }}개로 변경</button>
                </p>
              </div>
              <ul class="divide-y divide-line">
                <li v-for="plan in room.rate_plans || []" :key="plan.id" class="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between" :data-testid="`rate-plan-${room.id}-${plan.id}`">
                  <div class="space-y-1 text-sm">
                    <p class="font-semibold text-ink">{{ plan.name_ko }}</p>
                    <p v-if="plan.name_ko !== (plan.meal === 'BREAKFAST' ? '조식 포함' : '식사 불포함')" class="flex items-center gap-1.5 text-ink-muted"><AppIcon :name="plan.meal === 'BREAKFAST' ? 'check' : 'minus'" :size="14" />{{ plan.meal === 'BREAKFAST' ? '조식 포함' : '식사 불포함' }}</p>
                    <p v-if="plan.free_cancellation" class="flex items-center gap-1.5 font-medium text-success"><AppIcon name="check" :size="14" />{{ freeCancelLabel }}</p>
                    <p v-else class="flex items-center gap-1.5 font-medium text-danger"><AppIcon name="close" :size="14" />환불 불가</p>
                  </div>
                  <div class="flex items-center justify-between gap-4 sm:justify-end">
                    <div class="text-right">
                      <p class="text-xl font-extrabold text-ink tabular">{{ currency.formatKRW(plan.price_krw) }}</p>
                      <p class="text-2xs text-ink-subtle tabular">
                        <template v-if="nights">{{ nights }}박 · 객실 {{ stay.rooms }}개 약 {{ currency.formatKRW(plan.price_krw * nights * stay.rooms) }} + 세금</template>
                        <template v-else>1박 · 세금 별도</template>
                      </p>
                    </div>
                    <NuxtLink
                      v-if="nights && roomFits(room)"
                      :to="checkoutLink(room, plan)"
                      class="shrink-0 rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-ink transition-colors hover:bg-primary-hover"
                    >예약하기</NuxtLink>
                    <button v-else-if="!nights" type="button" class="shrink-0 rounded-xl border border-primary px-5 py-3 text-sm font-bold text-primary hover:bg-primary-soft" @click="askForDates">날짜 선택</button>
                    <span v-else class="shrink-0 rounded-xl bg-surface-sunken px-5 py-3 text-sm font-semibold text-ink-subtle">인원 초과</span>
                  </div>
                </li>
              </ul>
            </li>
          </ul>
        </section>

        <!-- Amenities (catalogue only) -->
        <section v-if="hotel.amenities?.length" aria-labelledby="h-amen">
          <h2 id="h-amen" class="mb-4 text-xl font-bold tracking-tight text-ink">시설·서비스</h2>
          <ul class="grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
            <li v-for="a in hotel.amenities" :key="a" class="flex items-center gap-2 text-sm text-ink"><AppIcon name="check" :size="16" class="text-primary" />{{ a }}</li>
          </ul>
        </section>

        <!-- Ratings breakdown (only when the catalogue has it) -->
        <section v-if="subScores.length" aria-labelledby="h-scores">
          <h2 id="h-scores" class="mb-4 text-xl font-bold tracking-tight text-ink">항목별 평점</h2>
          <dl class="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div v-for="s in subScores" :key="s.label" class="rounded-2xl border border-line bg-surface p-4"><dt class="text-xs text-ink-subtle">{{ s.label }}</dt><dd class="mt-1 text-lg font-bold text-ink tabular">{{ s.value.toFixed(1) }}</dd></div>
          </dl>
        </section>

        <ReviewsSection domain="HOTEL" :target-id="hotel.id" />

        <!-- Policies that the platform actually enforces -->
        <section aria-labelledby="h-policy" class="rounded-card border border-line bg-surface p-5 sm:p-6">
          <h2 id="h-policy" class="text-lg font-bold text-ink">예약 전에 확인하세요</h2>
          <ul class="mt-3 space-y-2 text-sm text-ink-muted">
            <li class="flex gap-2"><AppIcon name="lock" :size="16" class="mt-0.5 text-ink-subtle" />최종 결제 금액(세금 포함)은 결제 전 확인 화면에서 확정되며 결제 화면에서 바뀌지 않아요.</li>
            <li class="flex gap-2"><AppIcon name="refund" :size="16" class="mt-0.5 text-ink-subtle" />무료 취소 요금은 체크인 전날까지 수수료 없이 취소할 수 있어요. 정확한 기한은 결제 전 화면에 표시돼요.</li>
            <li class="flex gap-2"><AppIcon name="check" :size="16" class="mt-0.5 text-ink-subtle" />숙소가 예약을 확정한 뒤에 바우처를 발급해요. 확정에 실패하면 결제 금액을 전액 환불해요.</li>
            <li class="flex gap-2"><AppIcon name="support" :size="16" class="mt-0.5 text-ink-subtle" />체크인·체크아웃 시간과 현장 이용 규정은 숙소에 따라 달라요. 바우처에 안내된 내용을 확인해 주세요.</li>
          </ul>
        </section>
      </div>

      <!-- Stay panel -->
      <aside class="lg:order-none">
        <div ref="stayPanel" :class="['sticky top-24 space-y-3 rounded-card border bg-surface p-5 shadow-card transition-colors', needDates ? 'border-primary shadow-focus' : 'border-line']">
          <p class="text-sm text-ink-muted">
            <template v-if="minRoomPrice">1박 참고가 <span class="text-2xl font-extrabold text-ink tabular">{{ currency.formatKRW(minRoomPrice) }}</span>~</template>
            <template v-else>날짜를 선택하고 요금을 확인하세요</template>
          </p>
          <DateRangePicker v-model:start="stay.checkIn" v-model:end="stay.checkOut" start-label="체크인" end-label="체크아웃" :min="today" :max-range="30" :invalid="needDates" />
          <GuestPicker v-model:adults="stay.adults" v-model:children="stay.children" v-model:rooms="stay.rooms" />
          <p v-if="needDates" class="text-sm font-medium text-primary" role="status">체크인·체크아웃 날짜를 먼저 선택해 주세요.</p>
          <p v-else-if="nights" class="text-sm text-ink-muted">{{ fmt(stay.checkIn) }} – {{ fmt(stay.checkOut) }} · <b class="text-ink">{{ nights }}박</b></p>
          <a href="#h-rooms" class="flex w-full items-center justify-center rounded-xl bg-primary py-3 text-sm font-bold text-primary-ink hover:bg-primary-hover">객실 보기</a>
        </div>
      </aside>
    </div>

    <!-- Phone bottom bar -->
    <div class="fixed inset-x-0 bottom-[calc(56px+env(safe-area-inset-bottom))] z-30 md:bottom-0 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur lg:hidden">
      <div class="mx-auto flex max-w-7xl items-center justify-between gap-3">
        <div class="min-w-0 text-sm">
          <p v-if="nights" class="truncate font-semibold text-ink">{{ fmt(stay.checkIn) }} · {{ nights }}박</p>
          <p v-else class="font-semibold text-ink">날짜 미정</p>
          <p v-if="minRoomPrice" class="text-xs text-ink-subtle tabular">1박 {{ currency.formatKRW(minRoomPrice) }}~ · 세금 별도</p>
        </div>
        <a href="#h-rooms" class="shrink-0 rounded-xl bg-primary px-6 py-3 text-sm font-bold text-primary-ink">객실 선택</a>
      </div>
    </div>
  </div>

  <div v-else-if="notFound" class="mx-auto max-w-xl px-4 py-24 text-center">
    <span class="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-sunken text-ink-subtle"><AppIcon name="hotel" /></span>
    <p class="mt-4 font-bold text-ink">요청하신 숙소를 찾을 수 없어요</p>
    <p class="mt-1 text-sm text-ink-muted">판매가 끝났거나 주소가 잘못되었을 수 있어요.</p>
    <NuxtLink to="/hotels/list" class="mt-5 inline-block rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-ink">다른 숙소 찾기</NuxtLink>
  </div>
</template>
