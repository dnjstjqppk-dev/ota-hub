<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useCurrencyStore } from '~/stores/currency'
import { useApiUrl } from '~/composables/useApi'

const router = useRouter()
const currencyStore = useCurrencyStore()

// Search Bar State
const pickupCity = ref('제주')
const returnDifferent = ref(false)
const returnCity = ref('제주')
const pickupDate = ref('2026-11-01')
const pickupTime = ref('10:00')
const returnDate = ref('2026-11-03')
const returnTime = ref('10:00')
const isDriverOver26 = ref(true)

const fallbackCars = [
  {
    id: 'car_avante_01',
    company_name: '롯데렌터카 (Lotte Rent-a-Car)',
    vehicle_model: '현대 더 뉴 아반떼 (2025/2026)',
    vehicle_category: '준중형 세단',
    seats: 5,
    luggage_large: 2,
    transmission: '오토',
    fuel_type: '가솔린',
    pickup_city: '제주',
    pickup_location_name: '제주국제공항 렌터카하우스 셔틀 1구역',
    daily_price_krw: 48000,
    insurance_super_cdw: true,
    free_cancellation_hours: 48,
    image_url: 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?w=800'
  },
  {
    id: 'car_yaris_01',
    company_name: 'Times Car Rental Japan',
    vehicle_model: 'Toyota Yaris Hybrid',
    vehicle_category: '소형 해치백',
    seats: 5,
    luggage_large: 2,
    transmission: '오토',
    fuel_type: '하이브리드',
    pickup_city: '도쿄',
    pickup_location_name: '도쿄 나리타 국제공항 제1터미널 카운터',
    daily_price_krw: 62000,
    insurance_super_cdw: true,
    free_cancellation_hours: 48,
    image_url: 'https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=800'
  },
  {
    id: 'car_tucson_01',
    company_name: 'SK렌터카 (SK Rent-a-Car)',
    vehicle_model: '현대 디 올 뉴 투싼 1.6T',
    vehicle_category: 'SUV',
    seats: 5,
    luggage_large: 3,
    transmission: '오토',
    fuel_type: '가솔린',
    pickup_city: '제주',
    pickup_location_name: '제주국제공항 셔틀 탑승장 2구역',
    daily_price_krw: 65000,
    insurance_super_cdw: true,
    free_cancellation_hours: 48,
    image_url: 'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=800'
  },
  {
    id: 'car_carnival_01',
    company_name: '롯데렌터카 (Lotte Rent-a-Car)',
    vehicle_model: '기아 더 뉴 카니발 9인승',
    vehicle_category: '대형 밴 (VAN)',
    seats: 9,
    luggage_large: 4,
    transmission: '오토',
    fuel_type: '디젤',
    pickup_city: '제주',
    pickup_location_name: '제주공항 지점',
    daily_price_krw: 95000,
    insurance_super_cdw: true,
    free_cancellation_hours: 48,
    image_url: 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?w=800'
  }
]

const cars = ref<any[]>([])

const handleSearch = () => {
  router.push({
    path: '/cars/list',
    query: {
      city: pickupCity.value,
      returnCity: returnDifferent.value ? returnCity.value : pickupCity.value,
      pickupDate: pickupDate.value,
      pickupTime: pickupTime.value,
      returnDate: returnDate.value,
      returnTime: returnTime.value
    }
  })
}

onMounted(async () => {
  try {
    const res = await fetch(useApiUrl('/cars'))
    if (res.ok) {
      const json = await res.json()
      if (json.data && json.data.length > 0) {
        cars.value = json.data
      }
    }
  } catch (e) {
    // Keep fallback
  }
})
</script>

<template>
  <div class="max-w-7xl mx-auto px-4 py-8 space-y-12">
    <!-- 1. Hero Search Panel -->
    <div class="bg-gradient-to-r from-blue-700 via-indigo-700 to-blue-900 rounded-3xl p-6 md:p-10 text-white shadow-xl space-y-6">
      <div class="space-y-2">
        <span class="px-3 py-1 bg-white/20 backdrop-blur-md rounded-full text-xs font-black tracking-wider text-blue-100 uppercase">
          Car Rental Price Comparison
        </span>
        <h1 class="text-3xl md:text-4xl font-black tracking-tight">전 세계 렌터카 실시간 최저가 비교</h1>
        <p class="text-sm md:text-base text-blue-100 font-medium">
          공항 인수 직행, 완전자차(면책금 0원) 안심 플랜, 48시간 전 무료 취소
        </p>
      </div>

      <!-- Search Box Card -->
      <div class="bg-white rounded-2xl p-6 text-slate-800 shadow-2xl space-y-5">
        <!-- 탭: 동일 장소 반납 / 다른 장소 반납 -->
        <div class="flex items-center gap-6 border-b border-slate-100 pb-3 text-xs font-black">
          <button
            type="button"
            @click="returnDifferent = false"
            :class="[!returnDifferent ? 'text-blue-600 border-b-2 border-blue-600 pb-2' : 'text-slate-400 hover:text-slate-600']"
          >
            대여 장소와 동일한 위치 반납
          </button>
          <button
            type="button"
            @click="returnDifferent = true"
            :class="[returnDifferent ? 'text-blue-600 border-b-2 border-blue-600 pb-2' : 'text-slate-400 hover:text-slate-600']"
          >
            다른 위치에 편도 반납
          </button>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
          <!-- 인수 장소 -->
          <div class="space-y-1">
            <label class="text-[11px] font-bold text-slate-400">인수 장소 (도시/공항)</label>
            <div class="relative">
              <span class="absolute left-3 top-3 text-slate-400">📍</span>
              <input
                v-model="pickupCity"
                type="text"
                placeholder="예: 제주, 도쿄, 후쿠오카, 오사카"
                class="w-full pl-9 pr-3 py-2.5 text-xs font-bold text-slate-900 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>

          <!-- 반납 장소 (상이할 때) -->
          <div v-if="returnDifferent" class="space-y-1">
            <label class="text-[11px] font-bold text-slate-400">반납 장소</label>
            <div class="relative">
              <span class="absolute left-3 top-3 text-slate-400">🏁</span>
              <input
                v-model="returnCity"
                type="text"
                placeholder="반납 도시 또는 공항"
                class="w-full pl-9 pr-3 py-2.5 text-xs font-bold text-slate-900 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>

          <!-- 대여 일시 -->
          <div :class="[returnDifferent ? 'md:col-span-1' : 'md:col-span-1', 'space-y-1']">
            <label class="text-[11px] font-bold text-slate-400">대여 일시</label>
            <div class="grid grid-cols-2 gap-1.5">
              <input
                v-model="pickupDate"
                type="date"
                class="w-full px-2.5 py-2.5 text-xs font-bold text-slate-900 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
              />
              <input
                v-model="pickupTime"
                type="time"
                class="w-full px-2 py-2.5 text-xs font-bold text-slate-900 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>

          <!-- 반납 일시 -->
          <div :class="[returnDifferent ? 'md:col-span-1' : 'md:col-span-1', 'space-y-1']">
            <label class="text-[11px] font-bold text-slate-400">반납 일시</label>
            <div class="grid grid-cols-2 gap-1.5">
              <input
                v-model="returnDate"
                type="date"
                class="w-full px-2.5 py-2.5 text-xs font-bold text-slate-900 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
              />
              <input
                v-model="returnTime"
                type="time"
                class="w-full px-2 py-2.5 text-xs font-bold text-slate-900 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>

          <!-- 검색 버튼 -->
          <div :class="[returnDifferent ? 'md:col-span-4' : 'md:col-span-1', 'flex items-end']">
            <button
              @click="handleSearch"
              class="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs rounded-xl shadow-lg shadow-blue-500/25 transition flex items-center justify-center gap-2"
            >
              <span>🔍</span>
              <span>렌터카 검색하기</span>
            </button>
          </div>
        </div>

        <div class="flex items-center gap-2 pt-2 text-xs text-slate-500 font-medium">
          <input id="over26" v-model="isDriverOver26" type="checkbox" class="w-4 h-4 rounded text-blue-600" />
          <label for="over26" class="cursor-pointer">운전자 연령 만 26세 이상 (21~25세 청년 운전자는 추가 보험 요건 적용)</label>
        </div>
      </div>
    </div>

    <!-- 2. Trip-style Trust Badges -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center text-xl font-bold">🛡️</div>
        <div>
          <div class="font-bold text-slate-900 text-xs">완전자차 0원 면책금</div>
          <div class="text-[11px] text-slate-400">사고 발생 시 고객 부담금 0원</div>
        </div>
      </div>

      <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-xl font-bold">⏱️</div>
        <div>
          <div class="font-bold text-slate-900 text-xs">48시간 전 무료 취소</div>
          <div class="text-[11px] text-slate-400">일정 변경 시 100% 전액 환불</div>
        </div>
      </div>

      <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center text-xl font-bold">🚘</div>
        <div>
          <div class="font-bold text-slate-900 text-xs">최신 연식 정품 차량</div>
          <div class="text-[11px] text-slate-400">1~3년 이내 신차급 컨디션 보장</div>
        </div>
      </div>

      <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center text-xl font-bold">📞</div>
        <div>
          <div class="font-bold text-slate-900 text-xs">24시간 한국어 케어</div>
          <div class="text-[11px] text-slate-400">해외 사고 시 긴급 출동 지원</div>
        </div>
      </div>
    </div>

    <!-- 3. 인기 렌터카 추천 목록 -->
    <div class="space-y-6">
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-2xl font-black text-slate-900 tracking-tight">인기 추천 렌터카 특가 라인업</h2>
          <p class="text-xs text-slate-500 mt-1">완전자차 보험 포함 특가로 여행을 시작하세요.</p>
        </div>
        <NuxtLink to="/cars/list" class="text-xs font-bold text-blue-600 hover:underline">
          전체 차량 목록 보기 →
        </NuxtLink>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div
          v-for="c in cars"
          :key="c.id"
          class="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col justify-between"
        >
          <div>
            <div class="relative h-44 overflow-hidden bg-slate-100">
              <img :src="c.image_url" :alt="c.vehicle_model" class="w-full h-full object-cover hover:scale-105 transition duration-500" />
              <span class="absolute top-3 left-3 px-2.5 py-1 bg-black/60 backdrop-blur-md text-white text-[10px] font-bold rounded-lg">
                {{ c.pickup_city }} 인수
              </span>
            </div>

            <div class="p-5 space-y-3">
              <div>
                <span class="text-[11px] font-bold text-slate-400 block">{{ c.company_name }}</span>
                <h3 class="font-black text-slate-900 text-base line-clamp-1">{{ c.vehicle_model }}</h3>
              </div>

              <div class="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                <span class="px-2 py-0.5 bg-slate-100 rounded text-[11px] font-medium">👥 {{ c.seats }}인승</span>
                <span class="px-2 py-0.5 bg-slate-100 rounded text-[11px] font-medium">⚙️ {{ c.transmission }}</span>
                <span class="px-2 py-0.5 bg-slate-100 rounded text-[11px] font-medium">⛽ {{ c.fuel_type }}</span>
              </div>

              <div class="p-2.5 bg-emerald-50 rounded-xl text-emerald-700 text-[11px] font-bold flex items-center gap-1.5">
                <span>✓</span>
                <span>완전자차(Super-CDW) 보장 플랜</span>
              </div>
            </div>
          </div>

          <div class="p-5 pt-0 border-t border-slate-100 mt-2">
            <div class="flex items-baseline justify-between pt-3">
              <div>
                <span class="text-[10px] text-slate-400 block">1일 대여 기준</span>
                <div class="text-xl font-black text-blue-600 font-mono">
                  {{ currencyStore.formatKRW(c.daily_price_krw) }}
                </div>
              </div>
              <div class="flex items-center gap-1.5">
                <NuxtLink
                  :to="`/cars/detail/${c.id}`"
                  class="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl transition"
                >
                  상세
                </NuxtLink>
                <NuxtLink
                  :to="`/cars/booking?carId=${c.id}&insurance=super`"
                  class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-md transition"
                >
                  대여 예약
                </NuxtLink>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
