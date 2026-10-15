<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import { useCurrencyStore } from '~/stores/currency'
import { useApiUrl } from '~/composables/useApi'

const route = useRoute()
const currencyStore = useCurrencyStore()

const airport = ref(route.query.airport as string || '인천국제공항 (ICN)')
const destination = ref(route.query.destination as string || '서울 명동')
const date = ref(route.query.date as string || '2026-11-01')
const passengers = ref(Number(route.query.passengers) || 2)

// Facet Filter States (Airport Transfers standard)
const selectedTier = ref<string>('ALL') // ALL, ECONOMY_SEDAN, COMFORT_SEDAN, BUSINESS_VAN, LUXURY_FIRST
const minBags = ref(0)
const sortBy = ref<'recommended' | 'price_asc' | 'capacity_desc'>('recommended')

const vehicles = ref<any[]>([])
const loading = ref(false)

const fallbackTransfers = [
  {
    id: 'tf_icn_van_01',
    airport_code: 'ICN',
    airport_name: '인천국제공항 T1/T2',
    destination_zone: '서울 도심 (명동/중구/강남) 전역',
    vehicle_tier: 'BUSINESS_VAN',
    vehicle_name: '비즈니스 밴 (Business Van)',
    vehicle_model_example: '현대 스타리아 라운지 리무진 / 기아 카니발 하이리무진',
    max_passengers: 6,
    max_luggage: 6,
    price_krw: 120000,
    free_waiting_mins: 60,
    flight_tracking: true,
    meet_and_greet: true,
    free_cancellation_hours: 24,
    image_url: 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?w=800'
  },
  {
    id: 'tf_icn_sedan_01',
    airport_code: 'ICN',
    airport_name: '인천국제공항 T1/T2',
    destination_zone: '서울 도심 (명동/중구/강남) 전역',
    vehicle_tier: 'COMFORT_SEDAN',
    vehicle_name: '컴포트 세단 (Comfort Sedan)',
    vehicle_model_example: '현대 그랜저 GN7 / 기아 K8',
    max_passengers: 3,
    max_luggage: 3,
    price_krw: 85000,
    free_waiting_mins: 60,
    flight_tracking: true,
    meet_and_greet: true,
    free_cancellation_hours: 24,
    image_url: 'https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=800'
  },
  {
    id: 'tf_icn_luxury_01',
    airport_code: 'ICN',
    airport_name: '인천국제공항 T1/T2',
    destination_zone: '서울 도심 전역',
    vehicle_tier: 'LUXURY_FIRST',
    vehicle_name: 'VIP 럭셔리 퍼스트 (First Class)',
    vehicle_model_example: '제네시스 G90 / 메르세데스 벤츠 S-Class',
    max_passengers: 3,
    max_luggage: 3,
    price_krw: 220000,
    free_waiting_mins: 90,
    flight_tracking: true,
    meet_and_greet: true,
    free_cancellation_hours: 24,
    image_url: 'https://images.unsplash.com/photo-1563720223185-11003d516935?w=800'
  }
]

const fetchTransfers = async () => {
  loading.value = true
  try {
    const res = await fetch(useApiUrl('/transfers'))
    const json = await res.json()
    vehicles.value = json.data && json.data.length ? json.data : fallbackTransfers
  } catch (e) {
    vehicles.value = fallbackTransfers
  } finally {
    loading.value = false
  }
}

const filteredVehicles = computed(() => {
  let list = [...vehicles.value]

  if (selectedTier.value !== 'ALL') {
    list = list.filter(v => v.vehicle_tier === selectedTier.value)
  }
  if (minBags.value > 0) {
    list = list.filter(v => v.max_luggage >= minBags.value)
  }

  if (sortBy.value === 'price_asc') {
    list.sort((a, b) => a.price_krw - b.price_krw)
  } else if (sortBy.value === 'capacity_desc') {
    list.sort((a, b) => b.max_passengers - a.max_passengers)
  }

  return list
})

onMounted(() => {
  fetchTransfers()
})
</script>

<template>
  <div class="max-w-7xl mx-auto px-4 py-8 space-y-6">
    <!-- 상단 브레드크럼 & 검색 요약 바 -->
    <div class="bg-white rounded-2xl border border-slate-200 p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
      <div class="flex items-center gap-4">
        <div class="w-10 h-10 rounded-xl bg-cyan-50 text-cyan-600 flex items-center justify-center font-black text-xl">
          🚐
        </div>
        <div>
          <div class="flex items-center gap-2 text-xs text-slate-400">
            <NuxtLink to="/" class="hover:underline">홈</NuxtLink> <span>›</span>
            <NuxtLink to="/transfers" class="hover:underline">공항픽업</NuxtLink> <span>›</span>
            <span class="text-slate-800 font-bold">차량 검색</span>
          </div>
          <div class="text-base font-black text-slate-900 mt-0.5">
            {{ airport }} → {{ destination }} ({{ date }})
          </div>
        </div>
      </div>

      <NuxtLink
        to="/transfers"
        class="px-4 py-2 border border-slate-200 hover:border-cyan-500 rounded-xl text-xs font-bold text-slate-700 transition"
      >
        일정 / 목적지 재설정
      </NuxtLink>
    </div>

    <!-- 메인 레이아웃 (좌측 필터 + 우측 차량 목록) -->
    <div class="flex flex-col lg:flex-row gap-8 items-start">
      <!-- 1. 패싯 필터 사이드바 -->
      <aside class="w-full lg:w-64 bg-white rounded-2xl border border-slate-200 p-5 space-y-6 flex-shrink-0 shadow-sm">
        <div class="flex items-center justify-between pb-4 border-b border-slate-100">
          <span class="font-black text-sm text-slate-900">차량 등급 필터</span>
          <button
            @click="selectedTier = 'ALL'; minBags = 0;"
            class="text-xs text-cyan-600 hover:underline font-bold"
          >
            초기화
          </button>
        </div>

        <div class="space-y-2.5">
          <label class="text-xs font-black text-slate-700 block">차량 등급 (Vehicle Class)</label>
          <div class="space-y-1.5 text-xs text-slate-600">
            <label class="flex items-center gap-2 cursor-pointer hover:text-slate-900">
              <input type="radio" value="ALL" v-model="selectedTier" class="text-cyan-600 focus:ring-0" />
              <span>전체 차량</span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer hover:text-slate-900">
              <input type="radio" value="COMFORT_SEDAN" v-model="selectedTier" class="text-cyan-600 focus:ring-0" />
              <span>컴포트 세단 (3인/3수하물)</span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer hover:text-slate-900">
              <input type="radio" value="BUSINESS_VAN" v-model="selectedTier" class="text-cyan-600 focus:ring-0" />
              <span>비즈니스 밴 (6인/6수하물)</span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer hover:text-slate-900">
              <input type="radio" value="LUXURY_FIRST" v-model="selectedTier" class="text-cyan-600 focus:ring-0" />
              <span>VIP 럭셔리 퍼스트</span>
            </label>
          </div>
        </div>

        <!-- 혜택 확인 -->
        <div class="space-y-2 pt-4 border-t border-slate-100 text-xs text-slate-600">
          <div class="flex items-center gap-2 text-emerald-700 font-bold">
            <span>✓ 항공편 지연 무료 대기</span>
          </div>
          <div class="flex items-center gap-2 text-cyan-700 font-bold">
            <span>✓ 입국장 피켓 네임보드 영접</span>
          </div>
          <div class="flex items-center gap-2 text-slate-600">
            <span>✓ 통행료/유류비 일체 포함</span>
          </div>
        </div>
      </aside>

      <!-- 2. 우측 픽업 차량 목록 -->
      <main class="flex-1 space-y-4 w-full">
        <!-- 정렬 바 -->
        <div class="bg-white rounded-2xl border border-slate-200 p-3.5 flex items-center justify-between text-xs shadow-sm">
          <span class="font-bold text-slate-600">
            이용 가능한 차량 <strong class="text-cyan-600">{{ filteredVehicles.length }}</strong>대
          </span>

          <div class="flex items-center gap-1">
            <button
              @click="sortBy = 'recommended'"
              :class="['px-3 py-1.5 rounded-lg font-bold transition', sortBy === 'recommended' ? 'bg-cyan-50 text-cyan-600' : 'text-slate-500 hover:bg-slate-50']"
            >
              추천순
            </button>
            <button
              @click="sortBy = 'price_asc'"
              :class="['px-3 py-1.5 rounded-lg font-bold transition', sortBy === 'price_asc' ? 'bg-cyan-50 text-cyan-600' : 'text-slate-500 hover:bg-slate-50']"
            >
              최저가순
            </button>
            <button
              @click="sortBy = 'capacity_desc'"
              :class="['px-3 py-1.5 rounded-lg font-bold transition', sortBy === 'capacity_desc' ? 'bg-cyan-50 text-cyan-600' : 'text-slate-500 hover:bg-slate-50']"
            >
              탑승정원순
            </button>
          </div>
        </div>

        <!-- 차량 카드 목록 -->
        <div
          v-for="v in filteredVehicles"
          :key="v.id"
          class="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm hover:shadow-lg transition flex flex-col md:flex-row items-center justify-between gap-6"
        >
          <div class="flex flex-col sm:flex-row items-center gap-6 w-full md:w-auto">
            <img :src="v.image_url" class="w-44 h-32 object-cover rounded-2xl border border-slate-100 flex-shrink-0" />
            <div class="space-y-2 text-center sm:text-left">
              <span class="px-2 py-0.5 bg-cyan-50 text-cyan-700 text-xs font-bold rounded">
                {{ v.vehicle_name || '프라이빗 픽업 전용' }}
              </span>
              <h3 class="text-lg font-black text-slate-900">{{ v.vehicle_model_example }}</h3>
              
              <div class="flex flex-wrap items-center justify-center sm:justify-start gap-2.5 text-xs text-slate-600">
                <span class="bg-slate-100 px-2.5 py-0.5 rounded font-medium">👥 최대 {{ v.max_passengers }}명</span>
                <span class="bg-slate-100 px-2.5 py-0.5 rounded font-medium">🧳 수하물 {{ v.max_luggage }}개</span>
                <span class="bg-slate-100 px-2.5 py-0.5 rounded font-medium">⏱️ {{ v.free_waiting_mins }}분 무료 대기</span>
              </div>

              <div class="flex items-center justify-center sm:justify-start gap-2 text-xs">
                <span class="text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded">
                  ✓ 항공편 실시간 추적 포함
                </span>
                <span class="text-blue-700 font-bold bg-blue-50 px-2 py-0.5 rounded">
                  기사 피켓 영접 포함
                </span>
              </div>
            </div>
          </div>

          <!-- 요금 및 버튼 -->
          <div class="text-right flex items-center justify-between md:justify-end gap-3 w-full md:w-auto pt-4 md:pt-0 border-t md:border-t-0 border-slate-100">
            <div>
              <span class="text-[11px] text-slate-400">차량 1대당 확정 요금</span>
              <div class="text-2xl font-black text-cyan-600 font-mono">
                {{ currencyStore.formatKRW(v.price_krw) }}
              </div>
              <div class="text-[10px] text-slate-400">통행료/유류비 일체 포함</div>
            </div>

            <div class="flex items-center gap-2">
              <NuxtLink
                :to="`/transfers/detail/${v.id}`"
                class="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl transition whitespace-nowrap"
              >
                상세 정보
              </NuxtLink>
              <NuxtLink
                :to="`/transfers/booking?vehicleId=${v.id}&price=${v.price_krw}`"
                class="px-5 py-2.5 bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-black rounded-xl shadow-md transition whitespace-nowrap"
              >
                예약하기
              </NuxtLink>
            </div>
          </div>
        </div>
      </main>
    </div>
  </div>
</template>

