<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useCurrencyStore } from '~/stores/currency'
import { useApiUrl } from '~/composables/useApi'

const route = useRoute()
const currencyStore = useCurrencyStore()

// High-fidelity fallback flight data
const fallbackFlight = {
  id: 'flt_ke703',
  flight_number: 'KE703',
  airline_name: '대한항공 (Korean Air)',
  airline_code: 'KE',
  airline_logo: 'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=100',
  aircraft_type: 'Airbus A330-300 (광동체 대형기)',
  departure_airport: 'ICN (서울/인천 제2여객터미널)',
  arrival_airport: 'NRT (도쿄/나리타 제1터미널)',
  departure_city: '서울',
  arrival_city: '도쿄',
  departure_time: '2026-11-01T10:10:00+09:00',
  arrival_time: '2026-11-01T12:35:00+09:00',
  duration_minutes: 145,
  stops: 0,
  cabin_class: 'ECONOMY',
  base_price_krw: 245000,
  tax_fuel_krw: 48000,
  free_baggage_kg: 23,
  free_carryon_kg: 10,
  seat_pitch_inch: 32,
  available_seats: 7,
  amenities: ['개인 모니터 AVOD', '기내 기내식 제공', 'USB 충전 포트', '기내 Wi-Fi 지원'],
  fare_tiers: [
    {
      id: 'standard',
      name: '이코노미 스탠다드 (Standard)',
      badge: '가장 알뜰한 요금',
      price_krw: 245000,
      baggage_checked: '위탁수하물 1개 (23kg)',
      baggage_carryon: '기내수하물 1개 (10kg)',
      seat_selection: '체크인 시 무료 좌석 선택',
      change_policy: '출발 전 변경 수수료 40,000원',
      refund_policy: '취소 환불 위약금 60,000원',
      mileage: '마일리지 70% 적립'
    },
    {
      id: 'flex',
      name: '이코노미 플렉스 (Flex)',
      badge: '일정 변경 안심',
      price_krw: 285000,
      baggage_checked: '위탁수하물 1개 (23kg)',
      baggage_carryon: '기내수하물 1개 (10kg)',
      seat_selection: '예약 즉시 사전 무료 좌석 선택',
      change_policy: '출발 24시간 전 무료 1회 변경',
      refund_policy: '취소 환불 위약금 30,000원',
      mileage: '마일리지 100% 적립'
    },
    {
      id: 'business',
      name: '프레스티지 비즈니스 (Business)',
      badge: '최상의 편안함',
      price_krw: 590000,
      baggage_checked: '위탁수하물 2개 (각 32kg)',
      baggage_carryon: '기내수하물 2개 (각 18kg)',
      seat_selection: '180도 풀플랫 침대형 좌석',
      change_policy: '언제든 무료 변경 가능',
      refund_policy: '출발 전 전액 무료 환불',
      mileage: '마일리지 125% 적립 + 공항 라운지 이용'
    }
  ]
}

const flight = ref<any>(fallbackFlight)
const selectedFare = ref<'standard' | 'flex' | 'business'>('standard')
const loading = ref(false)

onMounted(async () => {
  try {
    const flightId = route.params.id || route.query.id || 'flt_ke703'
    const res = await fetch(useApiUrl(`/flights/${flightId}`))
    if (res.ok) {
      const json = await res.json()
      if (json.data) {
        flight.value = { ...fallbackFlight, ...json.data }
      } else {
        flight.value = fallbackFlight
      }
    } else {
      flight.value = fallbackFlight
    }
  } catch (e) {
    flight.value = fallbackFlight
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div v-if="loading" class="max-w-6xl mx-auto px-4 py-24 text-center text-slate-400 font-bold">
    항공권 상세 여정 및 운임 규정을 불러오는 중입니다...
  </div>

  <div v-else-if="flight" class="max-w-6xl mx-auto px-4 py-8 space-y-8">
    <!-- 1. 상단 브레드크럼 & 항공편 요약 -->
    <div>
      <div class="flex items-center gap-2 text-xs text-slate-400 mb-2">
        <NuxtLink to="/" class="hover:underline">홈</NuxtLink> <span>›</span>
        <NuxtLink to="/flights" class="hover:underline">항공권</NuxtLink> <span>›</span>
        <NuxtLink to="/flights/search" class="hover:underline">검색 결과</NuxtLink> <span>›</span>
        <span class="text-slate-800 font-bold">{{ flight.departure_city }} → {{ flight.arrival_city }}</span>
      </div>

      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div class="flex items-center gap-2 mb-1">
            <span class="px-2.5 py-0.5 bg-blue-50 text-blue-700 text-xs font-bold rounded">
              {{ flight.airline_name }}
            </span>
            <span class="font-mono text-xs text-slate-500 font-bold">{{ flight.flight_number }}</span>
            <span class="text-xs text-slate-400">• {{ flight.aircraft_type }}</span>
          </div>
          <h1 class="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">
            {{ flight.departure_city }} ({{ flight.departure_airport.slice(0, 3) }}) → {{ flight.arrival_city }} ({{ flight.arrival_airport.slice(0, 3) }})
          </h1>
        </div>

        <div class="text-right">
          <span class="text-xs text-slate-400">1인 최저 편도 총액</span>
          <div class="text-3xl font-black text-blue-600 font-mono">
            {{ currencyStore.formatKRW(flight.base_price_krw) }}
          </div>
          <div class="text-[11px] text-slate-400">유류할증료 및 제세공과금 포함</div>
        </div>
      </div>
    </div>

    <!-- 2. 여정 타임라인 카드 -->
    <div class="bg-white rounded-3xl border border-slate-200 p-6 md:p-8 shadow-sm space-y-6">
      <h2 class="text-lg font-black text-slate-900 flex items-center gap-2">
        <span>✈️ 운항 상세 스케줄</span>
        <span class="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">
          {{ flight.stops === 0 ? '직항 직항편' : `${flight.stops}회 경유` }}
        </span>
      </h2>

      <div class="flex flex-col md:flex-row items-center justify-between gap-6 p-6 bg-slate-50 rounded-2xl">
        <!-- 출발지 -->
        <div class="text-center md:text-left space-y-1">
          <div class="text-3xl font-black text-slate-900 font-mono">
            {{ new Date(flight.departure_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}
          </div>
          <div class="text-sm font-bold text-slate-800">{{ flight.departure_airport }}</div>
          <div class="text-xs text-slate-400">{{ new Date(flight.departure_time).toLocaleDateString() }}</div>
        </div>

        <!-- 비행 소요시간 게이지 -->
        <div class="flex flex-col items-center space-y-2 flex-1 max-w-xs">
          <span class="text-xs font-bold text-slate-500">
            총 {{ Math.floor(flight.duration_minutes / 60) }}시간 {{ flight.duration_minutes % 60 }}분 소요
          </span>
          <div class="w-full h-1 bg-slate-300 rounded-full relative flex items-center justify-center">
            <div class="w-3 h-3 rounded-full bg-blue-600 absolute"></div>
          </div>
          <span class="text-[11px] text-slate-400 font-mono">{{ flight.aircraft_type }}</span>
        </div>

        <!-- 도착지 -->
        <div class="text-center md:text-right space-y-1">
          <div class="text-3xl font-black text-slate-900 font-mono">
            {{ new Date(flight.arrival_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}
          </div>
          <div class="text-sm font-bold text-slate-800">{{ flight.arrival_airport }}</div>
          <div class="text-xs text-slate-400">{{ new Date(flight.arrival_time).toLocaleDateString() }}</div>
        </div>
      </div>

      <!-- 기내 편의시설 뱃지 -->
      <div class="flex flex-wrap gap-3 pt-2 border-t border-slate-100">
        <span v-for="amenity in flight.amenities" :key="amenity" class="px-3 py-1 bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg">
          ✓ {{ amenity }}
        </span>
      </div>
    </div>

    <!-- 3. 운임 등급 비교 매트릭스 (Fare Tiers) -->
    <div class="space-y-4">
      <div>
        <h2 class="text-xl font-black text-slate-900">운임 등급 선택 (Fare Classes)</h2>
        <p class="text-xs text-slate-500 mt-0.5">수하물 허용량 및 취소/변경 수수료 조건을 확인하고 선택하세요.</p>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div
          v-for="tier in flight.fare_tiers"
          :key="tier.id"
          :class="[
            'bg-white rounded-3xl p-6 border-2 transition-all flex flex-col justify-between space-y-6',
            selectedFare === tier.id ? 'border-blue-600 shadow-xl ring-2 ring-blue-600/20' : 'border-slate-200 hover:border-slate-300 shadow-sm'
          ]"
        >
          <div class="space-y-4">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold px-2.5 py-0.5 bg-blue-50 text-blue-700 rounded-full">
                {{ tier.badge }}
              </span>
              <input
                type="radio"
                :value="tier.id"
                v-model="selectedFare"
                class="w-4 h-4 text-blue-600 focus:ring-0"
              />
            </div>

            <div>
              <h3 class="text-lg font-black text-slate-900">{{ tier.name }}</h3>
              <div class="text-2xl font-black text-blue-600 font-mono mt-1">
                {{ currencyStore.formatKRW(tier.price_krw) }}
              </div>
            </div>

            <!-- 혜택 체크리스트 -->
            <ul class="text-xs space-y-2.5 text-slate-600 pt-2 border-t border-slate-100">
              <li class="flex items-start gap-2">
                <span class="text-emerald-500 font-bold">✓</span>
                <span>🧳 {{ tier.baggage_checked }}</span>
              </li>
              <li class="flex items-start gap-2">
                <span class="text-emerald-500 font-bold">✓</span>
                <span>🎒 {{ tier.baggage_carryon }}</span>
              </li>
              <li class="flex items-start gap-2">
                <span class="text-emerald-500 font-bold">✓</span>
                <span>💺 {{ tier.seat_selection }}</span>
              </li>
              <li class="flex items-start gap-2">
                <span class="text-blue-500 font-bold">ℹ</span>
                <span>{{ tier.change_policy }}</span>
              </li>
              <li class="flex items-start gap-2">
                <span class="text-slate-400 font-bold">•</span>
                <span>{{ tier.refund_policy }}</span>
              </li>
              <li class="flex items-start gap-2">
                <span class="text-amber-500 font-bold">★</span>
                <span>{{ tier.mileage }}</span>
              </li>
            </ul>
          </div>

          <NuxtLink
            :to="`/flights/booking?flightId=${flight.id}&tier=${tier.id}&price=${tier.price_krw}`"
            :class="[
              'w-full py-3 rounded-2xl text-xs font-black text-center transition block shadow-md',
              selectedFare === tier.id ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-800'
            ]"
          >
            이 운임으로 예약하기 →
          </NuxtLink>
        </div>
      </div>
    </div>
  </div>
</template>
