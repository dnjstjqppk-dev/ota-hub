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
    <div v-if="p" class="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div class="min-w-0 space-y-8">
        <DetailHero :crumbs="[{ label: '홈', to: '/' }, { label: '항공+호텔', to: '/packages' }, { label: p.destination_city || p.title }]" :title="p.title" :subtitle="p.destination_city ? '목적지 ' + p.destination_city : ''" :image="p.hero_image_url || p.thumbnail_url || null" image-icon="package" :facts="[]" testid="package-detail" :wishlist="{ domain: 'PACKAGE', itemId: p.id, title: p.title, priceKrw: price, thumbnailUrl: p.hero_image_url || p.thumbnail_url || null, targetUrl: $route.fullPath }">
          <template #badges><span v-if="p.badge" class="mt-3 inline-block rounded-full bg-primary-soft px-2.5 py-1 text-xs font-semibold text-primary">{{ p.badge }}</span></template>
          <p v-if="original && price && original > price" class="mt-4 text-sm text-ink-muted">
            개별 정가 합계 <span class="line-through">{{ formatKrw(original) }}</span> → 패키지가 <strong class="text-ink">{{ formatKrw(price) }}</strong>
            <span v-if="p.savings_percentage" class="font-semibold text-accent"> ({{ p.savings_percentage }}% 할인, 공급사 제공 정가 기준)</span>
          </p>
          <div v-if="features.length" class="mt-6">
            <h2 class="text-sm font-bold text-ink">포함 구성</h2>
            <ul class="mt-2 space-y-1.5 text-sm text-ink"><li v-for="x in features" :key="x" class="flex items-center gap-2"><AppIcon name="check" :size="16" class="text-primary" />{{ x }}</li></ul>
          </div>
          <div v-if="p.flight_id || p.hotel_id" class="mt-6 flex flex-wrap gap-2">
            <NuxtLink v-if="p.flight_id" :to="'/flights/detail/' + p.flight_id" class="btn-secondary px-3.5 py-2"><AppIcon name="flight" :size="16" />포함 항공편 보기</NuxtLink>
            <NuxtLink v-if="p.hotel_id" :to="'/hotels/detail/' + p.hotel_id" class="btn-secondary px-3.5 py-2"><AppIcon name="hotel" :size="16" />포함 호텔 보기</NuxtLink>
          </div>
          <p class="mt-6 rounded-2xl bg-surface-sunken p-4 text-sm text-ink-muted">1인 기준 요금이에요. 패키지는 환불할 수 없는 상품이고, 예약 단계에서 여행자 전원의 영문 성명이 필요해요.</p>
        </DetailHero>
        <ReviewsSection domain="PACKAGE" :target-id="p.id" />
      </div>
      <DetailBookingCard :item="p" domain="PACKAGE" :price-krw="price" unit-label="1인" cancellation="NON_REFUNDABLE" start-label="출발일" people :alert-label="p.title" />
    </div>
  </DetailShell>
</template>
