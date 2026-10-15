<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useCurrencyStore } from '~/stores/currency'
import { useApiUrl } from '~/composables/useApi'

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

const transferVehicles = ref<any[]>([])
const loading = ref(false)

const handleSearch = () => {
  // Filters or scrolls to vehicles
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
  loading.value = true
  try {
    const res = await fetch(useApiUrl('/transfers'))
    const json = await res.json()
    transferVehicles.value = json.data || []
    if (transferVehicles.value.length === 0) {
      // High-quality defaults
      transferVehicles.value = [
        {
          id: 'tf-sedan',
          vehicle_class: '이코노미 세단 (Economy Sedan)',
          model_name: '현대 쏘나타 / 도요타 캠리 동급',
          capacity: 4,
          luggage: 2,
          price_krw: 75000,
          image_url: 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?w=600',
          features: ['에어컨 완비', '생수 무료 제공', '무료 60분 대기']
        },
        {
          id: 'tf-van',
          vehicle_class: '비즈니스 대형 밴 (Business MPV)',
          model_name: '현대 스타리아 / 도요타 알파드 동급',
          capacity: 7,
          luggage: 5,
          price_krw: 120000,
          image_url: 'https://images.unsplash.com/photo-1570125909232-eb263c188f7e?w=600',
          features: ['대형 수하물 넉넉한 수납', '가족/소그룹 최적', '기사 네임보드 영접']
        },
        {
          id: 'tf-luxury',
          vehicle_class: '럭셔리 VIP 세단 (Luxury First)',
          model_name: '제네시스 G80 / 벤츠 E-Class 동급',
          capacity: 3,
          luggage: 3,
          price_krw: 165000,
          image_url: 'https://images.unsplash.com/photo-1555353540-64580b51c258?w=600',
          features: ['정장 의전 기사', 'VIP 영접 서비스', '고속도로 톨게이트 전액 포함']
        }
      ]
    }
  } catch (e) {
    console.error(e)
  } finally {
    loading.value = false
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
                <input
                  v-model="airport"
                  type="text"
                  class="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-trip-blue"
                />
              </div>
              <div class="space-y-1">
                <label class="text-xs font-bold text-slate-400">{{ mode === 'PICKUP' ? '목적지 호텔/주소' : '도착 공항' }}</label>
                <input
                  v-model="destination"
                  type="text"
                  class="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-trip-blue"
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
              <button
                @click="bookVehicle(v)"
                class="px-5 py-2.5 bg-trip-blue hover:bg-blue-600 text-white font-black text-xs rounded-xl shadow-md transition"
              >
                예약하기
              </button>
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
