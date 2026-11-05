<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useCatalogDetail, jsonLdScript } from '~/composables/useCatalogDetail'

const route = useRoute()
const id = String(route.params.id || route.query.id || '')
const { item: c, state, reload } = useCatalogDetail('/cars', id)

const TYPE_KO: Record<string, string> = { SEDAN: '세단', SUV: 'SUV', VAN: '승합/밴', COMPACT: '소형', LUXURY: '고급', EV: '전기차' }
const facts = computed(() => {
  const x = c.value
  if (!x) return []
  return ([
    ['렌터카 회사', x.company_name],
    ['차종', TYPE_KO[x.vehicle_type] || x.vehicle_type],
    ['승차 정원', x.seats ? `${x.seats}인승` : null],
    ['변속기', x.transmission === 'AUTO' ? '자동' : x.transmission === 'MANUAL' ? '수동' : x.transmission],
    ['인수 장소', x.pickup_location],
    ['보험', x.insurance_included ? '기본 보험 포함' : '보험 불포함 (현장 가입 필요 여부는 렌터카 회사 규정을 따름)']
  ] as [string, string | null][]).filter(([, v]) => v)
})

useHead(() => {
  const x = c.value
  if (!x) return { title: '렌터카' }
  return {
    title: `${x.vehicle_model} · ${x.company_name}`,
    script: [jsonLdScript({
      '@context': 'https://schema.org',
      '@type': 'Car',
      name: x.vehicle_model,
      ...(x.image_url ? { image: x.image_url } : {}),
      ...(x.seats ? { seatingCapacity: Number(x.seats) } : {}),
      brand: { '@type': 'Organization', name: x.company_name }
    })]
  }
})
</script>

<template>
  <DetailShell :state="state" list-path="/cars" list-label="렌터카 검색으로" @retry="reload">
    <template v-if="c">
      <nav class="mb-3 text-xs text-slate-400"><NuxtLink to="/" class="hover:underline">홈</NuxtLink> › <NuxtLink to="/cars" class="hover:underline">렌터카</NuxtLink> › {{ c.vehicle_model }}</nav>
      <div class="grid gap-6 md:grid-cols-[1fr_320px]">
        <div class="space-y-6">
          <section class="overflow-hidden rounded-3xl border border-slate-200 bg-white" data-testid="car-detail">
            <img v-if="c.image_url" :src="c.image_url" :alt="c.vehicle_model" class="h-64 w-full object-cover" />
            <div class="p-6 md:p-8">
              <div class="text-xs font-semibold text-slate-500">{{ c.company_name }}</div>
              <h1 class="mt-1 text-2xl font-black text-slate-900">{{ c.vehicle_model }}</h1>
              <dl class="mt-5 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                <div v-for="[k, v] in facts" :key="k"><dt class="text-xs text-slate-500">{{ k }}</dt><dd class="font-semibold text-slate-900">{{ v }}</dd></div>
              </dl>
              <p class="mt-5 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">대여일과 반납일은 예약 단계에서 선택합니다. 요금은 대여 일수 × 1일 요금에 세금이 더해져 계산됩니다.</p>
            </div>
          </section>
          <ReviewsSection domain="CAR" :target-id="c.id" />
        </div>
        <DetailBookingCard :item="c" domain="CAR" :price-krw="c.daily_price_krw" unit-label="1일" cancellation="FREE" :alert-label="`${c.company_name} ${c.vehicle_model}`" />
      </div>
    </template>
  </DetailShell>
</template>
