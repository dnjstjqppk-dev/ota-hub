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
    <div v-if="t" class="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div class="min-w-0 space-y-8">
        <DetailHero :crumbs="[{ label: '홈', to: '/' }, { label: '공항 이동', to: '/transfers' }, { label: t.service_title }]" :eyebrow="t.vehicle_class" :title="t.service_title" :image="t.image_url || null" image-icon="transfer" :facts="facts" testid="transfer-detail">
          <p class="mt-5 rounded-2xl bg-surface-sunken p-4 text-sm text-ink-muted">차량 1대 편도 요금이에요. 탑승 인원이 최대 인원을 넘으면 예약할 수 없어요.</p>
        </DetailHero>
        <ReviewsSection domain="TRANSFER" :target-id="t.id" />
      </div>
      <DetailBookingCard :item="t" domain="TRANSFER" :price-krw="t.price_krw" unit-label="차량 1대 편도" cancellation="FREE" people :max-people="Number(t.max_passengers) || 9" :alert-label="t.airport_code + ' ' + t.service_title" />
    </div>
  </DetailShell>
</template>
