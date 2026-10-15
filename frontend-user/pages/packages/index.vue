<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useCurrencyStore } from '~/stores/currency'
import { useApiUrl } from '~/composables/useApi'

const router = useRouter()
const currencyStore = useCurrencyStore()

const origin = ref('인천국제공항 (ICN)')
const destination = ref('도쿄 (Tokyo)')
const departDate = ref('2026-11-01')
const returnDate = ref('2026-11-05')
const guests = ref({ adults: 2, rooms: 1 })

const packages = ref<any[]>([])
const loading = ref(false)

const handleSearch = () => {
  router.push({
    path: '/packages/list',
    query: {
      origin: origin.value,
      city: destination.value,
      depDate: departDate.value,
      retDate: returnDate.value,
      adults: guests.value.adults,
      rooms: guests.value.rooms
    }
  })
}

const fallbackPackages = [
  {
    id: 'pkg_tokyo_4d3n',
    title: '[항공+호텔 결합] 도쿄 롯폰기 하얏트 럭셔리 에어텔 4일 (대한항공 직항 왕복 + 5성급 3박)',
    package_discount_rate: 18,
    thumbnail_url: 'https://images.unsplash.com/photo-1503899036084-c55cdd92da26?w=800',
    total_original_krw: 1400000,
    total_package_krw: 1150000,
    flight: { airline_name: '대한항공 (KE)', departure_city: '서울/인천', arrival_city: '도쿄/나리타' },
    hotel: { name_ko: '그랜드 하얏트 도쿄 롯폰기 힐스', city: '도쿄' }
  },
  {
    id: 'pkg_osaka_3d2n',
    title: '[인기 에어텔] 오사카 난바 스위소텔 올인원 3일 (아시아나 직항 + 5성급 2박)',
    package_discount_rate: 20,
    thumbnail_url: 'https://images.unsplash.com/photo-1590559899731-a372a146979d?w=800',
    total_original_krw: 920000,
    total_package_krw: 750000,
    flight: { airline_name: '아시아나항공 (OZ)', departure_city: '서울/인천', arrival_city: '오사카/간사이' },
    hotel: { name_ko: '스위소텔 난카이 오사카', city: '오사카' }
  }
]

onMounted(async () => {
  loading.value = true
  try {
    const res = await fetch(useApiUrl('/packages'))
    const json = await res.json()
    packages.value = json.data && json.data.length ? json.data : fallbackPackages
  } catch (e) {
    packages.value = fallbackPackages
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="space-y-12 pb-16">
    <!-- 히어로 배너 & 패키지 검색 바 -->
    <div class="relative bg-gradient-to-r from-indigo-950 via-trip-navy to-blue-900 text-white pt-12 pb-24 px-4 overflow-hidden">
      <div class="absolute -top-32 -right-32 w-80 h-80 bg-rose-500/20 rounded-full blur-3xl pointer-events-none"></div>

      <div class="max-w-6xl mx-auto space-y-6 relative z-10">
        <div class="space-y-2">
          <span class="inline-block px-3 py-1 bg-white/10 backdrop-blur-md rounded-full text-xs font-bold text-rose-200 border border-white/20">
            🏖️ 항공+호텔 결합 번들 특가 (최대 30% 절약)
          </span>
          <h1 class="text-3xl md:text-5xl font-black tracking-tight">
            항공과 호텔을 한 번에, getfortrip 패키지
          </h1>
          <p class="text-sm md:text-base text-blue-100 font-medium">
            따로 예약하는 것보다 최대 30% 저렴한 번들 할인 가격으로 전 세계 인기 휴양지로 떠나세요.
          </p>
        </div>

        <!-- 항공+호텔 검색 위젯 -->
        <div class="bg-white rounded-3xl p-6 shadow-2xl text-slate-800 border border-slate-100 space-y-4">
          <div class="grid grid-cols-1 md:grid-cols-12 gap-4">
            <!-- 출발지 & 도착지 -->
            <div class="md:col-span-5 grid grid-cols-2 gap-2">
              <div class="space-y-1">
                <label class="text-xs font-bold text-slate-400">출발 도시/공항</label>
                <input
                  v-model="origin"
                  type="text"
                  class="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-trip-blue"
                />
              </div>
              <div class="space-y-1">
                <label class="text-xs font-bold text-slate-400">여행 목적지</label>
                <input
                  v-model="destination"
                  type="text"
                  class="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-trip-blue"
                />
              </div>
            </div>

            <!-- 가는 날 & 오는 날 -->
            <div class="md:col-span-4 space-y-1">
              <label class="text-xs font-bold text-slate-400">여행 일정 (가는 날 — 오는 날)</label>
              <div class="grid grid-cols-2 gap-2">
                <input
                  v-model="departDate"
                  type="date"
                  class="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-trip-blue"
                />
                <input
                  v-model="returnDate"
                  type="date"
                  class="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-trip-blue"
                />
              </div>
            </div>

            <!-- 인원 및 검색 버튼 -->
            <div class="md:col-span-3 space-y-1">
              <label class="text-xs font-bold text-slate-400">인원 / 객실</label>
              <div class="flex items-center gap-2">
                <div class="flex-1 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800">
                  <span>성인 {{ guests.adults }}명, 객실 {{ guests.rooms }}개</span>
                </div>
                <button
                  @click="handleSearch"
                  class="px-6 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-black text-sm rounded-xl shadow-md transition whitespace-nowrap"
                >
                  패키지 검색
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 추천 결합 패키지 리스트 -->
    <div class="max-w-6xl mx-auto px-4 space-y-6">
      <div class="flex items-end justify-between">
        <div>
          <div class="flex items-center gap-2">
            <span class="px-2 py-0.5 bg-rose-100 text-rose-700 rounded text-[11px] font-black">SUPER SAVER</span>
            <h2 class="text-2xl font-black text-trip-navy tracking-tight">이달의 추천 결합 패키지</h2>
          </div>
          <p class="text-xs text-slate-500 mt-1">왕복 항공권 + 특급 호텔 + 무료 조식 혜택까지 한 번에</p>
        </div>
        <NuxtLink to="/packages/builder" class="text-xs font-bold text-trip-blue hover:underline">
          나만의 맞춤 패키지 만들기 →
        </NuxtLink>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div
          v-for="pkg in packages"
          :key="pkg.id"
          class="bg-white rounded-3xl border border-slate-200/90 overflow-hidden shadow-sm hover:shadow-xl transition flex flex-col justify-between"
        >
          <div class="h-60 relative overflow-hidden bg-slate-100">
            <img :src="pkg.thumbnail_url" class="w-full h-full object-cover hover:scale-105 transition duration-500" />
            <span class="absolute top-4 right-4 bg-rose-600 text-white text-xs font-black px-3.5 py-1.5 rounded-full shadow-lg">
              {{ pkg.package_discount_rate }}% 번들 특별 할인
            </span>
          </div>

          <div class="p-6 space-y-4 flex-1 flex flex-col justify-between">
            <div class="space-y-3">
              <h3 class="font-black text-slate-900 text-xl">{{ pkg.title }}</h3>

              <div class="space-y-2 text-xs text-slate-600 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                <div class="flex items-center gap-2">
                  <span>✈️</span>
                  <span><strong>항공:</strong> {{ pkg.flight?.airline_name }} ({{ pkg.flight?.departure_city }} ↔ {{ pkg.flight?.arrival_city }})</span>
                </div>
                <div class="flex items-center gap-2">
                  <span>🏨</span>
                  <span><strong>숙소:</strong> {{ pkg.hotel?.name_ko }} ({{ pkg.hotel?.city }})</span>
                </div>
                <div class="flex items-center gap-2 text-emerald-700 font-bold">
                  <span>🎁</span>
                  <span>혜택: 2인 조식 무료 뷔페 + 늦은 퇴실 (Late Check-out) 보장</span>
                </div>
              </div>
            </div>

            <div class="pt-4 border-t border-slate-100 flex items-center justify-between">
              <div>
                <div class="text-xs text-slate-400 line-through">
                  개별 예약 시 {{ currencyStore.formatKRW(pkg.total_original_krw) }}
                </div>
                <div class="text-2xl font-black text-rose-600 font-mono">
                  {{ currencyStore.formatKRW(pkg.total_package_krw) }}
                </div>
                <div class="text-[10px] text-slate-400">1인 기준 (항공 왕복+숙박+세금 포함)</div>
              </div>

              <div class="flex items-center gap-2">
                <NuxtLink
                  :to="`/packages/detail/${pkg.id || 'pkg_tokyo_4d3n'}`"
                  class="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-xl transition whitespace-nowrap"
                >
                  패키지 상세
                </NuxtLink>
                <NuxtLink
                  :to="`/packages/booking?packageId=${pkg.id || 'pkg_tokyo_4d3n'}`"
                  class="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-black text-xs rounded-xl shadow-md transition whitespace-nowrap"
                >
                  결합 예약
                </NuxtLink>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
