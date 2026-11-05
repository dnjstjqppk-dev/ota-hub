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
    <template v-if="f">
      <nav class="mb-3 text-xs text-slate-400"><NuxtLink to="/" class="hover:underline">홈</NuxtLink> › <NuxtLink to="/flights" class="hover:underline">항공권</NuxtLink> › {{ f.flight_number }}</nav>
      <div class="grid gap-6 md:grid-cols-[1fr_320px]">
        <div class="space-y-6">
          <section class="rounded-3xl border border-slate-200 bg-white p-6 md:p-8" data-testid="flight-detail">
            <div class="text-xs font-semibold text-slate-500">{{ f.airline_name }} · {{ f.flight_number }}</div>
            <h1 class="mt-1 text-2xl font-black text-slate-900">{{ f.departure_airport }} → {{ f.arrival_airport }}</h1>
            <dl class="mt-5 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <div v-for="[k, v] in facts" :key="k"><dt class="text-xs text-slate-500">{{ k }}</dt><dd class="font-semibold text-slate-900">{{ v }}</dd></div>
            </dl>
            <p class="mt-5 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">항공권은 발권 후 환불이 불가한 운임입니다. 여권 정보(영문 성명·여권번호·만료일)가 예약 단계에서 필요합니다. 왕복은 항공권 검색에서 가는 편과 오는 편을 차례로 선택하세요.</p>
          </section>
          <ReviewsSection domain="FLIGHT" :target-id="f.id" />
        </div>
        <DetailBookingCard :item="f" domain="FLIGHT" :price-krw="f.base_price_krw" unit-label="성인 1인 편도" cancellation="NON_REFUNDABLE" :alert-label="`${f.departure_airport}-${f.arrival_airport} ${f.flight_number}`" />
      </div>
    </template>
  </DetailShell>
</template>
