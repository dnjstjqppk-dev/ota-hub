<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useCatalogDetail, jsonLdScript } from '~/composables/useCatalogDetail'

const route = useRoute()
const id = String(route.params.id || route.query.id || '')
const { item: t, state, reload } = useCatalogDetail('/transfers', id)

const facts = computed(() => {
  const x = t.value
  if (!x) return []
  return ([
    ['출발 공항', x.airport_code],
    ['도착 지역', x.destination_area],
    ['차량 등급', x.vehicle_class],
    ['최대 탑승 인원', x.max_passengers ? `${x.max_passengers}명` : null],
    ['최대 수하물', x.max_luggage ? `${x.max_luggage}개` : null],
    ['항공편 추적', x.flight_tracking ? '지원 (예약 시 항공편명 입력)' : null]
  ] as [string, string | null][]).filter(([, v]) => v)
})

useHead(() => {
  const x = t.value
  if (!x) return { title: '공항 이동' }
  return {
    title: `${x.airport_code} → ${x.destination_area} · ${x.service_title}`,
    script: [jsonLdScript({
      '@context': 'https://schema.org',
      '@type': 'TaxiService',
      name: x.service_title,
      areaServed: x.destination_area,
      ...(x.image_url ? { image: x.image_url } : {})
    })]
  }
})
</script>

<template>
  <DetailShell :state="state" list-path="/transfers" list-label="공항 이동 검색으로" @retry="reload">
    <template v-if="t">
      <nav class="mb-3 text-xs text-slate-400"><NuxtLink to="/" class="hover:underline">홈</NuxtLink> › <NuxtLink to="/transfers" class="hover:underline">공항 이동</NuxtLink> › {{ t.service_title }}</nav>
      <div class="grid gap-6 md:grid-cols-[1fr_320px]">
        <div class="space-y-6">
          <section class="overflow-hidden rounded-3xl border border-slate-200 bg-white" data-testid="transfer-detail">
            <img v-if="t.image_url" :src="t.image_url" :alt="t.service_title" class="h-64 w-full object-cover" />
            <div class="p-6 md:p-8">
              <div class="text-xs font-semibold text-slate-500">{{ t.vehicle_class }}</div>
              <h1 class="mt-1 text-2xl font-black text-slate-900">{{ t.service_title }}</h1>
              <dl class="mt-5 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                <div v-for="[k, v] in facts" :key="k"><dt class="text-xs text-slate-500">{{ k }}</dt><dd class="font-semibold text-slate-900">{{ v }}</dd></div>
              </dl>
              <p class="mt-5 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">차량 1대 편도 요금입니다. 탑승 인원이 최대 인원을 넘으면 예약할 수 없습니다.</p>
            </div>
          </section>
          <ReviewsSection domain="TRANSFER" :target-id="t.id" />
        </div>
        <DetailBookingCard :item="t" domain="TRANSFER" :price-krw="t.price_krw" unit-label="차량 1대 편도" cancellation="FREE" :alert-label="`${t.airport_code} ${t.service_title}`" />
      </div>
    </template>
  </DetailShell>
</template>
