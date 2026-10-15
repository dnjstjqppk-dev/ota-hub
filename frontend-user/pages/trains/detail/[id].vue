<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useCurrencyStore } from '~/stores/currency'
import { useApiUrl } from '~/composables/useApi'

const route = useRoute()
const currencyStore = useCurrencyStore()

const fallbackTrain = {
  id: 'trn_ktx_01',
  train_number: 'KTX 021',
  train_type: 'KTX-산천 (초고속열차)',
  rail_network: 'KTX_SRT',
  departure_station: '서울역 (Seoul Station)',
  arrival_station: '부산역 (Busan Station)',
  departure_time: '2026-11-01T08:30:00+09:00',
  arrival_time: '2026-11-01T11:05:00+09:00',
  duration_minutes: 155,
  seat_class: '일반실',
  price_krw: 59800,
  first_class_price_krw: 83700,
  available_seats: 42,
  power_outlet: true,
  free_wifi: true,
  luggage_policy: '28인치 대형 캐리어 무료 적재 공간 제공',
  refund_policy: '출발 1시간 전까지 취소 수수료 400원',
  stops_schedule: [
    { station: '서울역', arr: '-', dep: '08:30', platform: '3번' },
    { station: '광명역', arr: '08:44', dep: '08:46', platform: '1번' },
    { station: '천안아산역', arr: '09:08', dep: '09:10', platform: '2번' },
    { station: '오송역', arr: '09:22', dep: '09:24', platform: '1번' },
    { station: '대전역', arr: '09:39', dep: '09:42', platform: '4번' },
    { station: '동대구역', arr: '10:24', dep: '10:27', platform: '5번' },
    { station: '신경주역', arr: '10:44', dep: '10:46', platform: '2번' },
    { station: '울산역', arr: '10:55', dep: '10:57', platform: '1번' },
    { station: '부산역', arr: '11:05', dep: '-', platform: '8번' }
  ]
}

const train = ref<any>(fallbackTrain)
const selectedClass = ref<'standard' | 'first'>('standard')
const loading = ref(false)

onMounted(async () => {
  try {
    const trainId = route.params.id || route.query.id || 'trn_ktx_01'
    const res = await fetch(useApiUrl(`/trains/${trainId}`))
    if (res.ok) {
      const json = await res.json()
      train.value = json.data ? { ...fallbackTrain, ...json.data } : fallbackTrain
    } else {
      train.value = fallbackTrain
    }
  } catch (e) {
    train.value = fallbackTrain
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div v-if="loading" class="max-w-6xl mx-auto px-4 py-24 text-center text-slate-400 font-bold">
    열차 상세 운행 정보 및 정차역을 불러오는 중입니다...
  </div>

  <div v-else-if="train" class="max-w-6xl mx-auto px-4 py-8 space-y-8">
    <!-- 상단 브레드크럼 -->
    <div>
      <div class="flex items-center gap-2 text-xs text-slate-400 mb-2">
        <NuxtLink to="/" class="hover:underline">홈</NuxtLink> <span>›</span>
        <NuxtLink to="/trains" class="hover:underline">기차표</NuxtLink> <span>›</span>
        <NuxtLink to="/trains/search" class="hover:underline">열차 검색</NuxtLink> <span>›</span>
        <span class="text-slate-800 font-bold">{{ train.departure_station }} → {{ train.arrival_station }}</span>
      </div>

      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div class="flex items-center gap-2 mb-1">
            <span class="px-2.5 py-0.5 bg-emerald-50 text-emerald-700 text-xs font-bold rounded">
              {{ train.train_type }}
            </span>
            <span class="font-mono text-xs text-slate-500 font-bold">{{ train.train_number }}</span>
          </div>
          <h1 class="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">
            {{ train.departure_station }} → {{ train.arrival_station }}
          </h1>
        </div>

        <div class="text-right">
          <span class="text-xs text-slate-400">일반실 기준 편도 요금</span>
          <div class="text-3xl font-black text-emerald-600 font-mono">
            {{ currencyStore.formatKRW(train.price_krw) }}
          </div>
          <div class="text-[11px] text-slate-400">발권 수수료 0원 · 즉시 확정 모바일 e-티켓</div>
        </div>
      </div>
    </div>

    <!-- 운행 여정 다이어그램 카드 -->
    <div class="bg-white rounded-3xl border border-slate-200 p-6 md:p-8 shadow-sm space-y-6">
      <div class="flex flex-col md:flex-row items-center justify-between gap-6 p-6 bg-slate-50 rounded-2xl">
        <div class="text-center md:text-left space-y-1">
          <div class="text-3xl font-black text-slate-900 font-mono">
            {{ new Date(train.departure_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}
          </div>
          <div class="text-sm font-bold text-slate-800">{{ train.departure_station }}</div>
        </div>

        <div class="flex flex-col items-center space-y-2 flex-1 max-w-xs">
          <span class="text-xs font-bold text-slate-500">
            총 {{ Math.floor(train.duration_minutes / 60) }}시간 {{ train.duration_minutes % 60 }}분 소요
          </span>
          <div class="w-full h-1 bg-emerald-300 rounded-full relative flex items-center justify-center">
            <div class="w-3 h-3 rounded-full bg-emerald-600 absolute"></div>
          </div>
          <span class="text-[11px] text-emerald-600 font-bold">정시 운행 보장</span>
        </div>

        <div class="text-center md:text-right space-y-1">
          <div class="text-3xl font-black text-slate-900 font-mono">
            {{ new Date(train.arrival_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}
          </div>
          <div class="text-sm font-bold text-slate-800">{{ train.arrival_station }}</div>
        </div>
      </div>

      <!-- 시설 안내 -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-slate-100 text-xs">
        <div class="flex items-center gap-2 text-slate-700 font-medium">
          <span>⚡ 전 좌석 220V 콘센트</span>
        </div>
        <div class="flex items-center gap-2 text-slate-700 font-medium">
          <span>📶 무료 KTX 초고속 Wi-Fi</span>
        </div>
        <div class="flex items-center gap-2 text-slate-700 font-medium">
          <span>🧳 대형 수하물 보관대</span>
        </div>
        <div class="flex items-center gap-2 text-slate-700 font-medium">
          <span>♿ 장애인 편의시설</span>
        </div>
      </div>
    </div>

    <!-- 좌석 등급 선택 (일반실 vs 특실) -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <!-- 일반실 -->
      <div
        :class="[
          'bg-white rounded-3xl p-6 border-2 transition-all space-y-5',
          selectedClass === 'standard' ? 'border-emerald-600 shadow-xl' : 'border-slate-200'
        ]"
      >
        <div class="flex items-center justify-between">
          <div>
            <span class="px-2.5 py-0.5 bg-slate-100 text-slate-700 text-xs font-bold rounded">표준석</span>
            <h3 class="text-xl font-black text-slate-900 mt-1">일반실 (Standard Class)</h3>
          </div>
          <div class="text-2xl font-black text-emerald-600 font-mono">
            {{ currencyStore.formatKRW(train.price_krw) }}
          </div>
        </div>
        <ul class="text-xs space-y-2 text-slate-600">
          <li>✓ 2x2 좌석 배열 및 각도 조절 등받이</li>
          <li>✓ 스마트폰 충전 포트 구비</li>
          <li>✓ 간이 테이블 및 발받침대</li>
        </ul>
        <NuxtLink
          :to="`/trains/booking?trainId=${train.id}&class=standard&price=${train.price_krw}`"
          class="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded-2xl block text-center shadow-md transition"
        >
          일반실 예매하기 →
        </NuxtLink>
      </div>

      <!-- 특실 -->
      <div
        :class="[
          'bg-white rounded-3xl p-6 border-2 transition-all space-y-5',
          selectedClass === 'first' ? 'border-amber-500 shadow-xl' : 'border-slate-200'
        ]"
      >
        <div class="flex items-center justify-between">
          <div>
            <span class="px-2.5 py-0.5 bg-amber-50 text-amber-700 text-xs font-bold rounded">프리미엄</span>
            <h3 class="text-xl font-black text-slate-900 mt-1">특실 (First Class)</h3>
          </div>
          <div class="text-2xl font-black text-amber-600 font-mono">
            {{ currencyStore.formatKRW(train.first_class_price_krw) }}
          </div>
        </div>
        <ul class="text-xs space-y-2 text-slate-600">
          <li>★ 2x1 넓은 독립형 좌석 배열 및 넉넉한 레그룸</li>
          <li>★ 무료 프리미엄 생수, 견과류 간식 패키지 제공</li>
          <li>★ 안대 및 수면용 이어플러그 키트 제공</li>
        </ul>
        <NuxtLink
          :to="`/trains/booking?trainId=${train.id}&class=first&price=${train.first_class_price_krw}`"
          class="w-full py-3 bg-amber-500 hover:bg-amber-600 text-white text-xs font-black rounded-2xl block text-center shadow-md transition"
        >
          특실 예매하기 →
        </NuxtLink>
      </div>
    </div>

    <!-- 정차역 타임테이블 (Train Stops Schedule) -->
    <div class="bg-white rounded-3xl border border-slate-200 p-6 md:p-8 shadow-sm space-y-4">
      <h3 class="text-lg font-black text-slate-900">전체 정차역 및 운행 시각표</h3>
      <div class="overflow-x-auto">
        <table class="w-full text-left text-xs">
          <thead>
            <tr class="border-b border-slate-200 text-slate-400 font-bold">
              <th class="py-2.5">정차역</th>
              <th class="py-2.5">도착 시각</th>
              <th class="py-2.5">출발 시각</th>
              <th class="py-2.5">승강장</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 font-mono">
            <tr v-for="stop in train.stops_schedule" :key="stop.station" class="hover:bg-slate-50 transition">
              <td class="py-3 font-bold font-sans text-slate-800">{{ stop.station }}</td>
              <td class="py-3 text-slate-600">{{ stop.arr }}</td>
              <td class="py-3 text-slate-600">{{ stop.dep }}</td>
              <td class="py-3 text-emerald-600 font-bold font-sans">{{ stop.platform }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
