<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useCatalogDetail, jsonLdScript } from '~/composables/useCatalogDetail'

const route = useRoute()
const id = String(route.params.id || route.query.id || '')
const { item: f, state, reload } = useCatalogDetail('/flights', id)

const CABIN_KO: Record<string, string> = { ECONOMY: '일반석', PREMIUM_ECONOMY: '프리미엄 일반석', BUSINESS: '비즈니스석', FIRST: '일등석' }
const hm = (m: number) => `${Math.floor(m / 60)}시간${m % 60 ? ` ${m % 60}분` : ''}`

const facts = computed(() => {
  const x = f.value
  if (!x) return []
  return ([
    ['구간', `${x.departure_city || x.departure_airport} → ${x.arrival_city || x.arrival_airport}`],
    ['출발 / 도착 (현지 시각)', x.departure_time && x.arrival_time ? `${x.departure_time} → ${x.arrival_time}` : null],
    ['소요 시간', x.duration_minutes ? hm(Number(x.duration_minutes)) : null],
    ['경유', x.stops === 0 ? '직항' : x.stops ? `${x.stops}회 경유` : null],
    ['좌석 등급', CABIN_KO[x.cabin_class] || x.cabin_class],
    ['무료 위탁 수하물', x.free_baggage_kg ? `${x.free_baggage_kg}kg` : null],
    ['잔여 좌석(참고)', Number.isFinite(x.available_seats) ? `${x.available_seats}석` : null]
  ] as [string, string | null][]).filter(([, v]) => v)
})

useHead(() => {
  const x = f.value
  if (!x) return { title: '항공권' }
  return {
    title: `${x.airline_name} ${x.flight_number} ${x.departure_airport}→${x.arrival_airport}`,
    script: [jsonLdScript({
      '@context': 'https://schema.org',
      '@type': 'Flight',
      flightNumber: x.flight_number,
      provider: { '@type': 'Airline', name: x.airline_name, ...(x.airline_code ? { iataCode: x.airline_code } : {}) },
      departureAirport: { '@type': 'Airport', iataCode: x.departure_airport },
      arrivalAirport: { '@type': 'Airport', iataCode: x.arrival_airport }
    })]
  }
})
</script>

<template>
  <DetailShell :state="state" list-path="/flights" list-label="항공권 검색으로" @retry="reload">
    <div v-if="f" class="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div class="min-w-0 space-y-8">
        <DetailHero :crumbs="[{ label: '홈', to: '/' }, { label: '항공권', to: '/flights' }, { label: f.flight_number }]" :eyebrow="f.airline_name + ' · ' + f.flight_number" :title="f.departure_airport + ' → ' + f.arrival_airport" :facts="facts" testid="flight-detail">
          <p class="mt-5 rounded-2xl bg-surface-sunken p-4 text-sm text-ink-muted">발권 후에는 환불할 수 없는 운임이에요. 예약 단계에서 탑승객 전원의 여권 정보(영문 성명·여권번호·만료일)가 필요해요. 왕복은 항공권 검색에서 가는 편과 오는 편을 차례로 고르면 한 번에 예약돼요.</p>
        </DetailHero>
        <ReviewsSection domain="FLIGHT" :target-id="f.id" />
      </div>
      <DetailBookingCard :item="f" domain="FLIGHT" :price-krw="f.base_price_krw" unit-label="성인 1명 편도" cancellation="NON_REFUNDABLE" start-label="가는 날" people :alert-label="f.departure_airport + '-' + f.arrival_airport + ' ' + f.flight_number" />
    </div>
  </DetailShell>
</template>
