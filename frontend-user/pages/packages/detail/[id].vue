<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { formatKrw } from '~/composables/useApi'
import { useCatalogDetail, jsonLdScript } from '~/composables/useCatalogDetail'

const route = useRoute()
const id = String(route.params.id || route.query.id || '')
const { item: p, state, reload } = useCatalogDetail('/packages', id)

const details = computed<any>(() => {
  try { return JSON.parse(p.value?.details_json || '{}') || {} } catch { return {} }
})
const features = computed<string[]>(() => (Array.isArray(details.value.features) ? details.value.features.filter((f: unknown) => typeof f === 'string') : []))
const price = computed(() => Number(p.value?.bundle_price_krw ?? p.value?.total_package_krw) || null)
const original = computed(() => Number(p.value?.original_price_krw ?? p.value?.total_original_krw) || null)

useHead(() => {
  const x = p.value
  if (!x) return { title: '항공+호텔' }
  return {
    title: x.title,
    script: [jsonLdScript({
      '@context': 'https://schema.org',
      '@type': 'TouristTrip',
      name: x.title,
      ...(x.hero_image_url || x.thumbnail_url ? { image: x.hero_image_url || x.thumbnail_url } : {}),
      ...(x.destination_city ? { itinerary: { '@type': 'Place', name: x.destination_city } } : {})
    })]
  }
})
</script>

<template>
  <DetailShell :state="state" list-path="/packages" list-label="항공+호텔 둘러보기" @retry="reload">
    <template v-if="p">
      <nav class="mb-3 text-xs text-slate-400"><NuxtLink to="/" class="hover:underline">홈</NuxtLink> › <NuxtLink to="/packages" class="hover:underline">항공+호텔</NuxtLink> › {{ p.destination_city }}</nav>
      <div class="grid gap-6 md:grid-cols-[1fr_320px]">
        <div class="space-y-6">
          <section class="overflow-hidden rounded-3xl border border-slate-200 bg-white" data-testid="package-detail">
            <img v-if="p.hero_image_url || p.thumbnail_url" :src="p.hero_image_url || p.thumbnail_url" :alt="p.title" class="h-64 w-full object-cover md:h-80" />
            <div class="p-6 md:p-8">
              <span v-if="p.badge" class="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700">{{ p.badge }}</span>
              <h1 class="mt-2 text-2xl font-black text-slate-900">{{ p.title }}</h1>
              <p class="mt-1 text-sm text-slate-600">목적지 {{ p.destination_city }}</p>
              <p v-if="original && price && original > price" class="mt-3 text-sm text-slate-600">
                개별 정가 합계 <span class="line-through">{{ formatKrw(original) }}</span> → 패키지가 <strong class="text-slate-900">{{ formatKrw(price) }}</strong>
                <span v-if="p.savings_percentage" class="font-semibold text-rose-600"> ({{ p.savings_percentage }}% 할인, 공급사 제공 정가 기준)</span>
              </p>
              <div v-if="features.length" class="mt-6">
                <h2 class="text-sm font-bold text-slate-900">포함 구성</h2>
                <ul class="mt-2 space-y-1 text-sm text-slate-700"><li v-for="f in features" :key="f">✓ {{ f }}</li></ul>
              </div>
              <div v-if="p.flight_id || p.hotel_id" class="mt-6 flex flex-wrap gap-2 text-xs">
                <NuxtLink v-if="p.flight_id" :to="`/flights/detail/${p.flight_id}`" class="rounded-lg border border-slate-300 px-3 py-1.5 font-semibold">포함 항공편 보기</NuxtLink>
                <NuxtLink v-if="p.hotel_id" :to="`/hotels/detail/${p.hotel_id}`" class="rounded-lg border border-slate-300 px-3 py-1.5 font-semibold">포함 호텔 보기</NuxtLink>
              </div>
              <p class="mt-6 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">1인 기준 요금이며 출발일과 인원은 예약 단계에서 선택합니다. 패키지는 환불 불가 상품이며, 여행자 전원의 영문 성명이 필요합니다.</p>
            </div>
          </section>
          <ReviewsSection domain="PACKAGE" :target-id="p.id" />
        </div>
        <DetailBookingCard :item="p" domain="PACKAGE" :price-krw="price" unit-label="1인" cancellation="NON_REFUNDABLE" :alert-label="p.title" />
      </div>
    </template>
  </DetailShell>
</template>
