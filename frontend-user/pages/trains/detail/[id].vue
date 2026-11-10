<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useCatalogDetail, jsonLdScript } from '~/composables/useCatalogDetail'
import { generatedFallback } from '~/composables/useGeneratedCatalog'

const route = useRoute()
const id = String(route.params.id || route.query.id || '')
const { item: t, state, reload } = useCatalogDetail('/trains', id, generatedFallback('TRAIN', id))
const hm = (m: number) => `${Math.floor(m / 60)}시간${m % 60 ? ` ${m % 60}분` : ''}`

const facts = computed(() => {
  const x = t.value
  if (!x) return []
  return ([
    ['구간', `${x.departure_station} → ${x.arrival_station}`],
    ['출발 / 도착', x.departure_time && x.arrival_time ? `${x.departure_time} → ${x.arrival_time}` : null],
    ['소요 시간', x.duration_minutes ? hm(Number(x.duration_minutes)) : null],
    ['좌석 등급', x.seat_class],
    ['잔여 좌석(참고)', Number.isFinite(x.available_seats) ? `${x.available_seats}석` : null]
  ] as [string, string | null][]).filter(([, v]) => v)
})

useHead(() => {
  const x = t.value
  if (!x) return { title: '기차' }
  return {
    title: `${x.train_type} ${x.train_number} ${x.departure_station}→${x.arrival_station}`,
    script: [jsonLdScript({
      '@context': 'https://schema.org',
      '@type': 'TrainTrip',
      trainNumber: x.train_number,
      trainName: x.train_type,
      departureStation: { '@type': 'TrainStation', name: x.departure_station },
      arrivalStation: { '@type': 'TrainStation', name: x.arrival_station }
    })]
  }
})
</script>

<template>
  <DetailShell :state="state" list-path="/trains" list-label="기차표 검색으로" @retry="reload">
    <div v-if="t" class="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div class="min-w-0 space-y-8">
        <DetailHero :crumbs="[{ label: '홈', to: '/' }, { label: '기차', to: '/trains' }, { label: t.train_number }]" :eyebrow="t.train_type + ' · ' + t.train_number" :title="t.departure_station + ' → ' + t.arrival_station" :facts="facts" testid="train-detail" :wishlist="{ domain: 'TRAIN', itemId: t.id, title: `${t.departure_station} → ${t.arrival_station} ${t.train_number}`, priceKrw: t.price_krw, thumbnailUrl: null, targetUrl: $route.fullPath }">
          <p class="mt-5 rounded-2xl bg-surface-sunken p-4 text-sm text-ink-muted">{{ t.seat_class }} 좌석으로 판매돼요. 아동도 성인과 같은 요금이 적용되고, 예약 단계에서 탑승객 전원의 영문 성명이 필요해요.</p>
        </DetailHero>
        <ReviewsSection domain="TRAIN" :target-id="t.id" />
      </div>
      <DetailBookingCard :item="t" domain="TRAIN" :price-krw="t.price_krw" unit-label="1인 편도" cancellation="FREE" start-label="탑승일" people :alert-label="t.departure_station + '-' + t.arrival_station + ' ' + t.train_number" />
    </div>
  </DetailShell>
</template>
