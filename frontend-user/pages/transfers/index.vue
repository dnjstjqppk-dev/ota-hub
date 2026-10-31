<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useCurrencyStore } from '~/stores/currency'
import { useApiUrl } from '~/composables/useApi'
import { MASTER_TRANSFER_CATALOG } from '~/data/transferCatalog'
import SearchAutocomplete from '~/components/SearchAutocomplete.vue'

const router = useRouter()
const currencyStore = useCurrencyStore()

type TransferMode = 'PICKUP' | 'DROPOFF'
const mode = ref<TransferMode>('PICKUP')

const airport = ref('인천국제공항 (ICN) T1/T2')
const destination = ref('서울 명동 롯데호텔')
const flightNumber = ref('KE703')
const pickupDate = ref('2026-11-01')
const pickupTime = ref('14:30')
const passengers = ref(2)
const luggage = ref(2)

const transferVehicles = ref<any[]>(MASTER_TRANSFER_CATALOG.slice(0, 3).map(t => ({
  id: t.id,
  vehicle_class: t.vehicle_class,
  model_name: t.vehicle_model_example,
  capacity: t.max_passengers,
  luggage: t.max_luggage,
  price_krw: t.price_krw,
  image_url: t.image_url,
  features: t.features
})))
const loading = ref(false)

const handleSearch = () => {
  router.push({
    path: '/transfers/list',
    query: {
      airport: airport.value,
      destination: destination.value,
      date: pickupDate.value,
      time: pickupTime.value,
      passengers: passengers.value,
      luggage: luggage.value,
      flight: flightNumber.value,
      mode: mode.value
    }
  })
}

const bookVehicle = (vehicle: any) => {
  router.push({
    path: '/transfers/booking',
    query: {
      vehicleId: vehicle.id,
      mode: mode.value,
      airport: airport.value,
      dest: destination.value,
      flight: flightNumber.value,
      date: pickupDate.value,
      time: pickupTime.value,
      passengers: passengers.value,
      price: vehicle.price_krw
    }
  })
}

onMounted(async () => {
  try {
    const res = await fetch(useApiUrl('/transfers'))
    if (res.ok) {
      const json = await res.json()
      if (json.data && json.data.length > 0) {
        transferVehicles.value = json.data
      }
    }
  } catch (e) {
    // Keep fallback
  }
})
</script>

<template>
  <div class="space-y-12 pb-16">
    <!-- 히어로 배너 & 픽업 검색 바 -->
    <div class="relative bg-gradient-to-r from-slate-900 via-trip-navy to-indigo-950 text-white pt-12 pb-24 px-4 overflow-hidden">
      <div class="absolute -top-32 -right-32 w-80 h-80 bg-blue-500/20 rounded-full blur-3xl pointer-events-none"></div>

      <div class="max-w-6xl mx-auto space-y-6 relative z-10">
        <div class="space-y-2">
          <span class="inline-block px-3 py-1 bg-white/10 backdrop-blur-md rounded-full text-xs font-bold text-blue-200 border border-white/20">
            🚖 전 세계 300+ 공항 픽업/샌딩 안심 서비스
          </span>
          <h1 class="text-3xl md:text-5xl font-black tracking-tight">
            공항 픽업 & 기사 의전 서비스
          </h1>
          <p class="text-sm md:text-base text-blue-100 font-medium">
            항공편 지연 자동 추적, 입국장 네임보드 피켓팅, 통행료/주차비 100% 포함 정액 요금제
          </p>
        </div>

        <!-- 픽업 검색 위젯 -->
        <div class="bg-white rounded-3xl p-6 shadow-2xl text-slate-800 border border-slate-100 space-y-4">
          <!-- 픽업 vs 샌딩 탭 -->
          <div class="flex items-center gap-6 border-b border-slate-100 pb-3 text-xs font-bold">
            <button
              @click="mode = 'PICKUP'"
              :class="['transition pb-1 flex items-center gap-1.5', mode === 'PICKUP' ? 'text-trip-blue border-b-2 border-trip-blue' : 'text-slate-400 hover:text-slate-700']"
            >
              <span>🛬 공항 픽업 (공항 → 호텔)</span>
            </button>
            <button
              @click="mode = 'DROPOFF'"
              :class="['transition pb-1 flex items-center gap-1.5', mode === 'DROPOFF' ? 'text-trip-blue border-b-2 border-trip-blue' : 'text-slate-400 hover:text-slate-700']"
            >
              <span>🛫 공항 샌딩 (호텔 → 공항)</span>
            </button>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-12 gap-4">
            <!-- 공항 & 목적지 -->
            <div class="md:col-span-5 grid grid-cols-2 gap-2">
              <div class="space-y-1">
                <label class="text-xs font-bold text-slate-400">{{ mode === 'PICKUP' ? '도착 공항' : '출발 호텔/주소' }}</label>
                <SearchAutocomplete
                  v-model="airport"
                  :domain="mode === 'PICKUP' ? 'flights' : 'hotels'"
                  :icon="mode === 'PICKUP' ? 'plane' : 'search'"
                  inputClass="w-full pl-10 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-trip-blue"
                />
              </div>
              <div class="space-y-1">
                <label class="text-xs font-bold text-slate-400">{{ mode === 'PICKUP' ? '목적지 호텔/주소' : '도착 공항' }}</label>
                <SearchAutocomplete
                  v-model="destination"
                  :domain="mode === 'PICKUP' ? 'hotels' : 'flights'"
                  :icon="mode === 'PICKUP' ? 'search' : 'plane'"
                  inputClass="w-full pl-10 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-trip-blue"
                />
              </div>
            </div>

            <!-- 항공편명 & 탑승일시 -->
            <div class="md:col-span-4 grid grid-cols-2 gap-2">
              <div class="space-y-1">
                <label class="text-xs font-bold text-slate-400">항공편명 (지연 추적용)</label>
                <input
                  v-model="flightNumber"
                  type="text"
                  placeholder="예: KE703"
                  class="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono uppercase font-bold text-slate-800 focus:outline-none focus:border-trip-blue"
                />
              </div>
              <div class="space-y-1">
                <label class="text-xs font-bold text-slate-400">픽업 일자</label>
                <input
                  v-model="pickupDate"
                  type="date"
                  class="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-trip-blue"
                />
              </div>
            </div>

            <!-- 인원 및 차량 조회 버튼 -->
            <div class="md:col-span-3 space-y-1">
              <label class="text-xs font-bold text-slate-400">승객 / 수하물</label>
              <div class="flex items-center gap-2">
                <div class="flex-1 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800">
                  <span>승객 {{ passengers }}명 · 가방 {{ luggage }}개</span>
                </div>
                <button
                  @click="handleSearch"
                  class="px-6 py-2.5 bg-trip-blue hover:bg-blue-600 text-white font-black text-sm rounded-xl shadow-md transition whitespace-nowrap"
                >
                  차량 조회
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 차량 카테고리 선택 리스트 -->
    <div class="max-w-6xl mx-auto px-4 space-y-6">
      <div class="flex items-end justify-between">
        <div>
          <h2 class="text-2xl font-black text-trip-navy tracking-tight">선택 가능한 전용 차량</h2>
          <p class="text-xs text-slate-500 mt-1">인원과 수하물 수량에 알맞은 맞춤형 전용 차량을 선택하세요</p>
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div
          v-for="v in transferVehicles"
          :key="v.id"
          class="bg-white rounded-3xl border border-slate-200/90 overflow-hidden shadow-sm hover:shadow-xl transition flex flex-col justify-between"
        >
          <div class="relative h-48 overflow-hidden bg-slate-100">
            <img :src="v.image_url" class="w-full h-full object-cover" />
            <div class="absolute top-3 left-3 bg-slate-900/80 backdrop-blur-md text-white text-[10px] font-bold px-2.5 py-1 rounded-lg">
              {{ v.vehicle_class }}
            </div>
          </div>

          <div class="p-6 space-y-4 flex-1 flex flex-col justify-between">
            <div>
              <h3 class="text-lg font-black text-slate-900">{{ v.model_name }}</h3>
              <div class="flex items-center gap-3 text-xs text-slate-500 font-semibold mt-1">
                <span>👥 최대 {{ v.capacity }}인승</span>
                <span>•</span>
                <span>🧳 수하물 {{ v.luggage }}개 적재</span>
              </div>

              <div class="mt-4 space-y-1.5 text-xs text-slate-600">
                <div v-for="f in v.features" :key="f" class="flex items-center gap-2">
                  <span class="text-emerald-600 font-bold">✓</span>
                  <span>{{ f }}</span>
                </div>
              </div>
            </div>

            <div class="pt-4 border-t border-slate-100 flex items-center justify-between">
              <div>
                <span class="text-[10px] text-slate-400">통행료/유류비 일체 포함</span>
                <div class="text-2xl font-black text-trip-blue font-mono">
                  {{ currencyStore.formatKRW(v.price_krw) }}
                </div>
              </div>
              <div class="flex items-center gap-1.5">
                <NuxtLink
                  :to="`/transfers/detail/${v.id}`"
                  class="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl transition"
                >
                  상세
                </NuxtLink>
                <button
                  @click="bookVehicle(v)"
                  class="px-4 py-2 bg-trip-blue hover:bg-blue-600 text-white font-black text-xs rounded-xl shadow-md transition"
                >
                  예약하기
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 픽업 보장 서비스 4대 혜택 -->
    <div class="max-w-6xl mx-auto px-4">
      <div class="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-3xl p-8 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
        <div class="space-y-1.5">
          <div class="text-2xl">✈️</div>
          <h4 class="font-black text-slate-900 text-sm">항공편 자동 추적</h4>
          <p class="text-xs text-slate-500 leading-relaxed">비행기가 조기 착륙하거나 지연되어도 기사가 도착 시간에 맞춰 대기합니다.</p>
        </div>

        <div class="space-y-1.5">
          <div class="text-2xl">⏳</div>
          <h4 class="font-black text-slate-900 text-sm">무료 60분 대기</h4>
          <p class="text-xs text-slate-500 leading-relaxed">입국 심사 및 수하물 수취 지연을 고려하여 착륙 후 60분간 무료 대기합니다.</p>
        </div>

        <div class="space-y-1.5">
          <div class="text-2xl">💳</div>
          <h4 class="font-black text-slate-900 text-sm">추가 요금 없는 확정가</h4>
          <p class="text-xs text-slate-500 leading-relaxed">고속도로 톨게이트 비용, 주차비, 심야 할증이 전액 포함된 최종 요금입니다.</p>
        </div>

        <div class="space-y-1.5">
          <div class="text-2xl">🛡️</div>
          <h4 class="font-black text-slate-900 text-sm">24시간 전 무료 취소</h4>
          <p class="text-xs text-slate-500 leading-relaxed">갑작스러운 일정 변경 시 픽업 24시간 전까지 100% 위약금 없이 전액 환불됩니다.</p>
        </div>
      </div>
    </div>
  </div>
</template>
