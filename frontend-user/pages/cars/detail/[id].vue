<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useCurrencyStore } from '~/stores/currency'
import { useApiUrl } from '~/composables/useApi'

const route = useRoute()
const currencyStore = useCurrencyStore()

import { getCarById } from '~/data/carCatalog'

const carId = (route.params.id || route.query.id || 'car_avante_01') as string
const car = ref<any>(getCarById(carId) || getCarById('car_avante_01'))
const selectedInsurance = ref<'super' | 'standard'>('super')
const loading = ref(false)

onMounted(async () => {
  const currentId = (route.params.id || route.query.id || 'car_avante_01') as string
  const catalogCar = getCarById(currentId) || getCarById('car_avante_01')
  car.value = catalogCar

  try {
    const res = await fetch(useApiUrl(`/cars/${currentId}`), { signal: AbortSignal.timeout(1500) })
    if (res.ok) {
      const json = await res.json()
      if (json.data) car.value = { ...catalogCar, ...json.data }
    }
  } catch (e) {
    // Keep verified catalog data
  }
})
</script>

<template>
  <div v-if="loading" class="max-w-6xl mx-auto px-4 py-24 text-center text-slate-400 font-bold">
    차량 상세 스펙 및 보험 규정을 불러오는 중입니다...
  </div>

  <div v-else-if="car" class="max-w-6xl mx-auto px-4 py-8 space-y-8">
    <!-- 상단 브레드크럼 -->
    <div>
      <div class="flex items-center gap-2 text-xs text-slate-400 mb-2">
        <NuxtLink to="/" class="hover:underline">홈</NuxtLink> <span>›</span>
        <NuxtLink to="/cars" class="hover:underline">렌터카</NuxtLink> <span>›</span>
        <NuxtLink to="/cars/list" class="hover:underline">차량 목록</NuxtLink> <span>›</span>
        <span class="text-slate-800 font-bold">{{ car.vehicle_model }}</span>
      </div>

      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div class="flex items-center gap-2 mb-1">
            <span class="px-2.5 py-0.5 bg-blue-50 text-blue-700 text-xs font-bold rounded">
              {{ car.company_name }}
            </span>
            <span class="text-xs text-slate-500 font-medium">• {{ car.vehicle_category }}</span>
          </div>
          <h1 class="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">
            {{ car.vehicle_model }}
          </h1>
        </div>

        <div class="text-right">
          <span class="text-xs text-slate-400">1일 대여료</span>
          <div class="text-3xl font-black text-blue-600 font-mono">
            {{ currencyStore.formatKRW(car.daily_price_krw) }}
          </div>
          <div class="text-[11px] text-slate-400">자차보험 & 세금 포함</div>
        </div>
      </div>
    </div>

    <!-- 사진 갤러리 & 주요 제원 매트릭스 -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
      <div class="space-y-4">
        <img :src="car.image_url" class="w-full h-80 object-cover rounded-3xl border border-slate-200 shadow-md" />
        <div class="grid grid-cols-3 gap-3">
          <img
            v-for="(img, idx) in car.gallery"
            :key="idx"
            :src="img"
            class="h-24 w-full object-cover rounded-2xl border border-slate-200"
          />
        </div>
      </div>

      <!-- 차량 사양 카드 -->
      <div class="bg-white rounded-3xl border border-slate-200 p-6 md:p-8 shadow-sm space-y-6">
        <h2 class="text-lg font-black text-slate-900">차량 기본 사양 & 편의 정보</h2>
        
        <div class="grid grid-cols-2 gap-4 text-xs">
          <div class="p-3 bg-slate-50 rounded-xl space-y-1">
            <span class="text-slate-400 block">탑승 정원</span>
            <span class="font-black text-slate-800 text-sm">👥 {{ car.seats }}인승</span>
          </div>
          <div class="p-3 bg-slate-50 rounded-xl space-y-1">
            <span class="text-slate-400 block">변속기</span>
            <span class="font-black text-slate-800 text-sm">⚙️ {{ car.transmission }}</span>
          </div>
          <div class="p-3 bg-slate-50 rounded-xl space-y-1">
            <span class="text-slate-400 block">연료 종류</span>
            <span class="font-black text-slate-800 text-sm">⛽ {{ car.fuel_type }}</span>
          </div>
          <div class="p-3 bg-slate-50 rounded-xl space-y-1">
            <span class="text-slate-400 block">수하물 적재</span>
            <span class="font-black text-slate-800 text-sm">🧳 대형 {{ car.luggage_large }}개 / 소형 {{ car.luggage_small }}개</span>
          </div>
          <div class="p-3 bg-slate-50 rounded-xl space-y-1">
            <span class="text-slate-400 block">주행거리 규정</span>
            <span class="font-black text-emerald-600 text-sm">✓ 무제한 주행거리</span>
          </div>
          <div class="p-3 bg-slate-50 rounded-xl space-y-1">
            <span class="text-slate-400 block">무료 취소 기한</span>
            <span class="font-black text-blue-600 text-sm">인수 {{ car.free_cancellation_hours }}시간 전 무료</span>
          </div>
        </div>

        <!-- 인수 장소 안내 -->
        <div class="p-4 bg-blue-50 border border-blue-200 rounded-2xl text-xs space-y-1.5">
          <span class="font-bold text-blue-900 flex items-center gap-1.5">
            📍 인수 및 반납 장소
          </span>
          <p class="text-slate-700 leading-relaxed">{{ car.pickup_location_name }}</p>
          <span class="text-[11px] text-blue-600 font-medium">공항 도착 후 전용 무료 셔틀버스 상시 운행</span>
        </div>
      </div>
    </div>

    <!-- 보험 옵션 선택 (Car Insurance Tiers) -->
    <div class="space-y-4">
      <h2 class="text-xl font-black text-slate-900">보험 보장 플랜 선택</h2>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div
          v-for="plan in car.insurance_plans"
          :key="plan.id"
          :class="[
            'bg-white rounded-3xl p-6 border-2 transition-all space-y-4 flex flex-col justify-between',
            selectedInsurance === plan.id ? 'border-blue-600 shadow-xl' : 'border-slate-200'
          ]"
        >
          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold px-2 py-0.5 bg-blue-50 text-blue-700 rounded">{{ plan.badge }}</span>
              <input type="radio" :value="plan.id" v-model="selectedInsurance" class="w-4 h-4 text-blue-600 focus:ring-0" />
            </div>
            <h3 class="text-lg font-black text-slate-900">{{ plan.name }}</h3>
            <p class="text-xs text-slate-600 leading-relaxed">{{ plan.description }}</p>
          </div>

          <div class="pt-4 border-t border-slate-100 flex items-center justify-between">
            <span class="text-xs text-slate-500">자기부담금(면책금)</span>
            <span class="font-mono font-black text-sm text-slate-900">
              {{ plan.deductible_krw === 0 ? '0원 (면책)' : currencyStore.formatKRW(plan.deductible_krw) }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- 예약 CTA 버튼 바 -->
    <div class="bg-white rounded-3xl border border-slate-200 p-6 flex items-center justify-between gap-4 shadow-sm">
      <div>
        <span class="text-xs text-slate-400">총 렌트 요금</span>
        <div class="text-2xl md:text-3xl font-black text-blue-600 font-mono">
          {{ currencyStore.formatKRW(car.daily_price_krw) }}
        </div>
      </div>
      <NuxtLink
        :to="`/cars/booking?carId=${car.id}&insurance=${selectedInsurance}`"
        class="px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white font-black text-sm rounded-2xl shadow-lg transition"
      >
        이 차량 예약하기 →
      </NuxtLink>
    </div>
  </div>
</template>

