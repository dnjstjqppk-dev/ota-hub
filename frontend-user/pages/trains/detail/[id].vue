<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useCatalogDetail, jsonLdScript } from '~/composables/useCatalogDetail'

const route = useRoute()
const id = String(route.params.id || route.query.id || '')
const { item: t, state, reload } = useCatalogDetail('/trains', id)
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
    <template v-if="t">
      <nav class="mb-3 text-xs text-slate-400"><NuxtLink to="/" class="hover:underline">홈</NuxtLink> › <NuxtLink to="/trains" class="hover:underline">기차</NuxtLink> › {{ t.train_number }}</nav>
      <div class="grid gap-6 md:grid-cols-[1fr_320px]">
        <div class="space-y-6">
          <section class="rounded-3xl border border-slate-200 bg-white p-6 md:p-8" data-testid="train-detail">
            <div class="text-xs font-semibold text-slate-500">{{ t.train_type }} · {{ t.train_number }}</div>
            <h1 class="mt-1 text-2xl font-black text-slate-900">{{ t.departure_station }} → {{ t.arrival_station }}</h1>
            <dl class="mt-5 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <div v-for="[k, v] in facts" :key="k"><dt class="text-xs text-slate-500">{{ k }}</dt><dd class="font-semibold text-slate-900">{{ v }}</dd></div>
            </dl>
            <p class="mt-5 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">이 열차는 {{ t.seat_class }} 좌석으로 판매됩니다. 아동도 성인과 같은 요금이 적용되며, 탑승자 전원의 영문 성명이 예약 단계에서 필요합니다.</p>
          </section>
          <ReviewsSection domain="TRAIN" :target-id="t.id" />
        </div>
        <DetailBookingCard :item="t" domain="TRAIN" :price-krw="t.price_krw" unit-label="1인 편도" cancellation="FREE" :alert-label="`${t.departure_station}-${t.arrival_station} ${t.train_number}`" />
      </div>
    </template>
  </DetailShell>
</template>
