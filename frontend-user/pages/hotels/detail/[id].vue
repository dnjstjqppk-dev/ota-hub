<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useCurrencyStore } from '~/stores/currency'
import { useApiUrl } from '~/composables/useApi'

const route = useRoute()
const currencyStore = useCurrencyStore()

import { getHotelById } from '~/data/hotelCatalog'

const hotelId = String(route.params.id || route.query.hotelId || route.query.id || '')
// Static catalog is only a first paint; never substitute a different hotel for an unknown id.
const hotel = ref<any>(hotelId ? getHotelById(hotelId) || null : null)
const loading = ref(!hotel.value)
const notFound = ref(false)
// Rate plans (price, meal, cancellation) only come from the live API.
const ratesState = ref<'loading' | 'ok' | 'unavailable'>('loading')

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null)
const overallScore = computed(() => num(hotel.value?.score_overall) ?? num(hotel.value?.rating))
const subScores = computed(() =>
  [['청결도', 'score_cleanliness'], ['위치', 'score_location'], ['서비스', 'score_service'], ['부대시설', 'score_facilities']]
    .map(([label, k]) => ({ label, value: num(hotel.value?.[k]) }))
    .filter((x): x is { label: string; value: number } => x.value !== null)
)
const minRoomPrice = computed(() => {
  const prices = (hotel.value?.rooms || []).map((r: any) => Number(r.base_price_krw)).filter((n: number) => n > 0)
  return prices.length ? Math.min(...prices) : null
})

// Structured data for search engines. Only catalog facts; no ratings (those must come from real, verified reviews).
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
    script: [{ type: 'application/ld+json', innerHTML: JSON.stringify(ld).replace(/</g, '\\u003c') }],
  }
})

onMounted(async () => {
  if (!hotelId) { loading.value = false; notFound.value = true; return }
  try {
    const res = await fetch(useApiUrl(`/hotels/${encodeURIComponent(hotelId)}`), { signal: AbortSignal.timeout(5000) })
    if (res.ok) {
      const json = await res.json()
      if (json.data) {
        hotel.value = { ...(hotel.value || {}), ...json.data }
        ratesState.value = 'ok'
      }
    } else if (res.status === 404) {
      hotel.value = null
      notFound.value = true
    }
  } catch (e) {
    // Network failure: keep the static first paint but do not offer bookable rates.
  }
  if (ratesState.value !== 'ok') ratesState.value = 'unavailable'
  if (!hotel.value) notFound.value = true
  loading.value = false
})
</script>

<template>
  <div v-if="loading" class="max-w-6xl mx-auto px-4 py-24 text-center text-slate-400 font-bold">
    호텔 상세 정보를 실시간으로 불러오는 중입니다...
  </div>

  <div v-else-if="hotel" class="max-w-7xl mx-auto px-4 py-8 space-y-8">
    <!-- 1. 상단 브레드크럼 & 호텔 헤더 (Trip-style) -->
    <div>
      <div class="flex items-center gap-2 text-xs text-slate-400 mb-2">
        <NuxtLink to="/" class="hover:underline">홈</NuxtLink> <span>›</span>
        <NuxtLink to="/hotels/list" class="hover:underline">호텔 목록</NuxtLink> <span>›</span>
        <span>{{ hotel.city }}</span> <span>›</span>
        <span class="text-slate-800 font-bold truncate max-w-xs">{{ hotel.name_ko || hotel.name }}</span>
      </div>

      <div class="flex flex-wrap items-center gap-2 mb-2">
        <span class="text-amber-500 font-black text-sm">★ {{ hotel.star_rating }}성급 {{ hotel.property_type || 'HOTEL' }}</span>
        <span class="text-slate-400 text-xs">• {{ hotel.city }}, {{ hotel.country }}</span>
        <span class="px-2 py-0.5 bg-blue-50 text-blue-700 text-[10px] font-bold rounded">
          📍 {{ hotel.neighborhood || '도심 중심' }}
        </span>
      </div>

      <h1 class="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">{{ hotel.name_ko || hotel.name }}</h1>
      <p class="text-xs md:text-sm text-slate-400 font-medium mt-1">{{ hotel.name_en }} · {{ hotel.address }}</p>
      <div class="mt-3">
        <PriceAlertButton domain="HOTEL" :item-id="hotel.id" :label="hotel.name_ko || hotel.name" :current-price="minRoomPrice" />
      </div>
    </div>

    <!-- 2. 모자이크 사진 갤러리 그리드 (Trip-style 1+2 레이아웃) -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-3 h-80 md:h-96 rounded-3xl overflow-hidden shadow-sm">
      <img :src="hotel.thumbnail_url || hotel.image_url" class="md:col-span-2 w-full h-full object-cover" />
      <div class="hidden md:grid grid-rows-2 gap-3 h-full">
        <img v-for="(img, idx) in (hotel.images?.length ? hotel.images.slice(0, 2) : [hotel.thumbnail_url || hotel.image_url])" :key="idx" :src="img" class="w-full h-full object-cover" />
      </div>
    </div>

    <!-- 3. 평점 카드: 카탈로그 값이 있을 때만 표시 (임의 기본값·가상 후기 문구 없음) -->
    <div v-if="overallScore !== null" class="bg-white rounded-3xl border border-slate-200/90 p-6 shadow-sm flex flex-col md:flex-row items-center justify-between gap-6">
      <div class="flex items-center gap-6">
        <div class="w-20 h-20 bg-trip-blue text-white rounded-2xl flex flex-col items-center justify-center font-black shadow-md flex-shrink-0">
          <span class="text-3xl font-mono">{{ overallScore.toFixed(1) }}</span>
          <span class="text-[10px] tracking-wider text-blue-100">/ 5.0</span>
        </div>
        <div>
          <div class="text-base font-black text-slate-900">종합 평점</div>
          <div v-if="hotel.review_count" class="text-xs text-slate-500 mt-1">평가 {{ Number(hotel.review_count).toLocaleString('ko-KR') }}건 기준</div>
        </div>
      </div>
      <div v-if="subScores.length" class="grid grid-cols-2 sm:grid-cols-4 gap-4 w-full md:w-auto text-center border-t md:border-t-0 md:border-l border-slate-100 pt-4 md:pt-0 md:pl-6">
        <div v-for="sc in subScores" :key="sc.label" class="space-y-1">
          <div class="text-xs text-slate-400 font-bold">{{ sc.label }}</div>
          <div class="text-sm font-black text-slate-800 font-mono">⭐ {{ sc.value.toFixed(1) }}</div>
        </div>
      </div>
    </div>

    <!-- 4. 객실 및 요금 플랜 매트릭스 (Sub-rate plan Matrix) -->
    <div class="space-y-4">
      <h2 class="text-2xl font-black text-slate-900 tracking-tight">객실 선택 및 요금제 비교</h2>

      <div class="space-y-6">
        <div
          v-for="room in hotel.rooms"
          :key="room.id"
          class="bg-white rounded-3xl border border-slate-200/90 overflow-hidden shadow-sm hover:shadow-md transition grid grid-cols-1 lg:grid-cols-12"
        >
          <!-- 객실 사진 & 스펙 -->
          <div class="lg:col-span-4 p-6 border-b lg:border-b-0 lg:border-r border-slate-100 space-y-4">
            <img :src="room.image_url" class="w-full h-48 object-cover rounded-2xl" />
            <div>
              <h3 class="text-lg font-black text-slate-900">{{ room.name }}</h3>
              <div class="mt-2 flex flex-wrap gap-2 text-xs text-slate-500 font-medium">
                <span class="px-2 py-0.5 bg-slate-100 rounded">🛏️ {{ room.bed_type }}</span>
                <span class="px-2 py-0.5 bg-slate-100 rounded">👥 최대 {{ room.max_guests }}인</span>
                <span class="px-2 py-0.5 bg-slate-100 rounded">📐 32m²</span>
              </div>
            </div>
          </div>

          <!-- 하위 요금제 매트릭스 테이블 (Trip-style) -->
          <div class="lg:col-span-8 p-6 flex flex-col justify-between space-y-4">
            <div class="space-y-3">
              <div class="text-xs font-bold text-slate-400">선택 가능한 요금제 옵션</div>

              <!-- 요금제는 서버 카탈로그(rate_plans)가 정의한 것만 노출. 가격·식사·취소 조건 모두 서버 값. -->
              <p v-if="ratesState !== 'ok'" class="p-4 rounded-2xl bg-slate-50 text-xs text-slate-500">
                {{ ratesState === 'loading' ? '실시간 요금을 확인하고 있습니다…' : '지금은 실시간 요금을 확인할 수 없습니다. 잠시 후 다시 시도해주세요.' }}
              </p>
              <div
                v-for="plan in (ratesState === 'ok' ? room.rate_plans || [] : [])"
                :key="plan.id"
                class="p-4 rounded-2xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50/50"
                :data-testid="`rate-plan-${room.id}-${plan.id}`"
              >
                <div class="space-y-1">
                  <div class="font-bold text-sm text-slate-800">{{ plan.name_ko }}</div>
                  <div class="text-xs text-slate-500 space-y-0.5">
                    <div>• {{ plan.meal === 'BREAKFAST' ? '조식 포함' : '식사 불포함' }}</div>
                    <div v-if="plan.free_cancellation" class="text-emerald-600 font-semibold">• 무료 취소 가능 (정확한 기한은 예약 단계에서 확인)</div>
                    <div v-else class="text-rose-600 font-semibold">• 환불 불가</div>
                  </div>
                </div>

                <div class="text-right flex items-center justify-between sm:justify-end gap-4">
                  <div>
                    <div class="text-xl font-black text-slate-900 font-mono">
                      {{ currencyStore.formatKRW(plan.price_krw) }}
                    </div>
                    <div class="text-[10px] text-slate-400">1박 · 세금 별도</div>
                  </div>
                  <NuxtLink
                    :to="{ path: '/checkout', query: { domain: 'HOTEL', itemId: hotel.id, unitId: room.id, ratePlanId: plan.id } }"
                    class="px-5 py-2.5 bg-trip-blue hover:bg-blue-600 text-white text-xs font-black rounded-xl shadow-md transition whitespace-nowrap"
                  >
                    예약하기
                  </NuxtLink>
                </div>
              </div>
            </div>

            <div class="text-xs text-slate-400 flex items-center gap-2 pt-2">
              <span>최종 결제 금액은 예약 단계에서 서버가 계산합니다 (세금 10% 포함)</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <ReviewsSection domain="HOTEL" :target-id="hotel.id" />

    <!-- 5. 호텔 정책 & 부대시설 안내 -->
    <div class="bg-white rounded-3xl border border-slate-200/90 p-8 space-y-6">
      <h3 class="text-xl font-black text-slate-900 tracking-tight">호텔 이용 안내 및 정책</h3>
      
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs text-slate-600">
        <div class="space-y-2 p-4 bg-slate-50 rounded-2xl">
          <div class="font-bold text-slate-900 text-sm">🕒 체크인 / 체크아웃</div>
          <div>• 체크인: 15:00 이후</div>
          <div>• 체크아웃: 11:00 이전</div>
          <div class="text-slate-400">• 얼리 체크인은 당일 객실 현황에 따라 현장에서 요청 가능합니다.</div>
        </div>

        <div class="space-y-2 p-4 bg-slate-50 rounded-2xl">
          <div class="font-bold text-slate-900 text-sm">🛡️ 무료 취소 규정</div>
          <div class="text-emerald-700 font-bold">• 체크인 2일 전 18:00까지 전액 무료 취소</div>
          <div>• 기한 이후 취소 또는 노쇼 시 첫 1박 요금 부과</div>
          <div class="text-slate-400">• 마이페이지에서 셀프서비스로 즉시 취소 가능합니다.</div>
        </div>

        <div class="space-y-2 p-4 bg-slate-50 rounded-2xl">
          <div class="font-bold text-slate-900 text-sm">🏊 주요 부대시설</div>
          <div>• 실내/야외 인피니티 온수풀 (투숙객 무료)</div>
          <div>• 24시간 피트니스 센터 & 비즈니스 라운지</div>
          <div>• 전 객실 초고속 무료 Wi-Fi</div>
        </div>
      </div>
    </div>
  </div>
  <div v-else-if="notFound" class="max-w-xl mx-auto px-4 py-24 text-center">
    <p class="text-sm font-semibold text-slate-700">요청하신 호텔을 찾을 수 없습니다.</p>
    <NuxtLink to="/hotels/list" class="mt-4 inline-block rounded-xl bg-trip-blue px-4 py-2.5 text-sm font-semibold text-white">호텔 목록으로</NuxtLink>
  </div>
</template>
