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
    <div v-if="c" class="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div class="min-w-0 space-y-8">
        <DetailHero :crumbs="[{ label: '홈', to: '/' }, { label: '렌터카', to: '/cars' }, { label: c.vehicle_model }]" :eyebrow="c.company_name" :title="c.vehicle_model" :image="c.image_url || null" image-icon="car" :facts="facts" testid="car-detail">
          <p class="mt-5 rounded-2xl bg-surface-sunken p-4 text-sm text-ink-muted">요금은 대여 일수 × 1일 요금에 세금 10%가 더해져 계산돼요. 운전자 자격과 현장 보증금은 렌터카 회사 규정을 따라요.</p>
        </DetailHero>
        <ReviewsSection domain="CAR" :target-id="c.id" />
      </div>
      <DetailBookingCard :item="c" domain="CAR" :price-krw="c.daily_price_krw" unit-label="1일" cancellation="FREE" date-mode="range" start-label="인수일" end-label="반납일" :alert-label="c.company_name + ' ' + c.vehicle_model" />
    </div>
  </DetailShell>
</template>
