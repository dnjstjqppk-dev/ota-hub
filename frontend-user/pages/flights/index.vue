<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useCurrencyStore } from '~/stores/currency'
import SearchAutocomplete from '~/components/SearchAutocomplete.vue'

const router = useRouter()
const currencyStore = useCurrencyStore()

type TripType = 'ROUND_TRIP' | 'ONE_WAY' | 'MULTI_CITY'
const tripType = ref<TripType>('ROUND_TRIP')

const origin = ref('인천국제공항 (ICN)')
const dest = ref('도쿄 나리타 (NRT)')
const departDate = ref('2026-11-01')
const returnDate = ref('2026-11-08')
const cabinClass = ref('ECONOMY')
const passengers = ref({ adults: 1, children: 0 })

const handleSearch = () => {
  router.push({
    path: '/flights/search',
    query: {
      origin: origin.value,
      dest: dest.value,
      date: departDate.value,
      returnDate: tripType.value === 'ROUND_TRIP' ? returnDate.value : undefined,
      tripType: tripType.value,
      cabin: cabinClass.value,
      adults: passengers.value.adults
    }
  })
}

const popularRoutes = [
  { from: '서울/인천 (ICN)', to: '도쿄/나리타 (NRT)', price: 218000, img: 'https://images.unsplash.com/photo-1503899036084-c55cdd92da26?w=600', time: '2시간 20분' },
  { from: '서울/인천 (ICN)', to: '오사카/간사이 (KIX)', price: 189000, img: 'https://images.unsplash.com/photo-1590559899731-a372a146979d?w=600', time: '1시간 45분' },
  { from: '서울/인천 (ICN)', to: '방콕/수완나품 (BKK)', price: 345000, img: 'https://images.unsplash.com/photo-1508009603885-50cf7c579365?w=600', time: '5시간 40분' },
  { from: '서울/김포 (GMP)', to: '제주 (CJU)', price: 42000, img: 'https://images.unsplash.com/photo-1548115184-bc6544d06a58?w=600', time: '1시간 10분' },
  { from: '서울/인천 (ICN)', to: '후쿠오카 (FUK)', price: 145000, img: 'https://images.unsplash.com/photo-1570077188670-e3a8d69ac5ff?w=600', time: '1시간 25분' },
  { from: '서울/인천 (ICN)', to: '다낭 (DAD)', price: 289000, img: 'https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=600', time: '4시간 30분' }
]
</script>

<template>
  <div class="space-y-12 pb-16">
    <!-- 히어로 배너 & 항공권 검색 바 -->
    <div class="relative bg-gradient-to-r from-sky-900 via-trip-navy to-blue-950 text-white pt-12 pb-24 px-4 overflow-hidden">
      <div class="absolute -top-32 -right-32 w-80 h-80 bg-sky-400/20 rounded-full blur-3xl pointer-events-none"></div>

      <div class="max-w-6xl mx-auto space-y-6 relative z-10">
        <div class="space-y-2">
          <span class="inline-block px-3 py-1 bg-white/10 backdrop-blur-md rounded-full text-xs font-bold text-sky-200 border border-white/20">
            ✈️ 국내외 주요 항공사 실시간 운임 비교
          </span>
          <h1 class="text-3xl md:text-5xl font-black tracking-tight">
            가장 스마트한 항공권 예약, getfortrip
          </h1>
          <p class="text-sm md:text-base text-sky-100 font-medium">
            발권 수수료 투명 공개, 7일 요금 캘린더, 실시간 전자항공권(e-Ticket) 즉시 발권
          </p>
        </div>

        <!-- 항공권 전용 검색 위젯 -->
        <div class="bg-white rounded-3xl p-6 shadow-2xl text-slate-800 border border-slate-100 space-y-4">
          <!-- 여정 타입 탭 -->
          <div class="flex items-center gap-6 border-b border-slate-100 pb-3 text-xs font-bold">
            <button
              @click="tripType = 'ROUND_TRIP'"
              :class="['transition pb-1 flex items-center gap-1.5', tripType === 'ROUND_TRIP' ? 'text-trip-blue border-b-2 border-trip-blue' : 'text-slate-400 hover:text-slate-700']"
            >
              <span>왕복</span>
            </button>
            <button
              @click="tripType = 'ONE_WAY'"
              :class="['transition pb-1 flex items-center gap-1.5', tripType === 'ONE_WAY' ? 'text-trip-blue border-b-2 border-trip-blue' : 'text-slate-400 hover:text-slate-700']"
            >
              <span>편도</span>
            </button>
            <button
              @click="tripType = 'MULTI_CITY'"
              :class="['transition pb-1 flex items-center gap-1.5', tripType === 'MULTI_CITY' ? 'text-trip-blue border-b-2 border-trip-blue' : 'text-slate-400 hover:text-slate-700']"
            >
              <span>다구간</span>
            </button>

            <div class="ml-auto flex items-center gap-4 text-xs font-semibold text-slate-500">
              <select v-model="cabinClass" class="bg-transparent border-none text-slate-700 font-bold focus:outline-none cursor-pointer">
                <option value="ECONOMY">일반석 (Economy)</option>
                <option value="PREMIUM_ECONOMY">프리미엄 일반석</option>
                <option value="BUSINESS">비즈니스석 (Business)</option>
                <option value="FIRST">일등석 (First)</option>
              </select>
            </div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-12 gap-4">
            <!-- 출발지 & 도착지 -->
            <div class="md:col-span-5 grid grid-cols-2 gap-2 relative">
              <div class="space-y-1">
                <label class="text-xs font-bold text-slate-400">출발지</label>
                <SearchAutocomplete v-model="origin" domain="flights" placeholder="출발 공항" />
              </div>
              <div class="space-y-1">
                <label class="text-xs font-bold text-slate-400">도착지</label>
                <SearchAutocomplete v-model="dest" domain="flights" placeholder="도착 공항" />
              </div>
            </div>

            <!-- 날짜 선택 -->
            <div class="md:col-span-4 space-y-1">
              <label class="text-xs font-bold text-slate-400">
                {{ tripType === 'ROUND_TRIP' ? '가는 날 — 오는 날' : '탑승일' }}
              </label>
              <div :class="['grid gap-2', tripType === 'ROUND_TRIP' ? 'grid-cols-2' : 'grid-cols-1']">
                <input
                  v-model="departDate"
                  type="date"
                  class="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-trip-blue"
                />
                <input
                  v-if="tripType === 'ROUND_TRIP'"
                  v-model="returnDate"
                  type="date"
                  class="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-trip-blue"
                />
              </div>
            </div>

            <!-- 탑승객 및 검색 버튼 -->
            <div class="md:col-span-3 space-y-1">
              <label class="text-xs font-bold text-slate-400">승객수</label>
              <div class="flex items-center gap-2">
                <div class="flex-1 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800">
                  <span>성인 {{ passengers.adults }}명</span>
                </div>
                <button
                  @click="handleSearch"
                  class="px-6 py-2.5 bg-trip-blue hover:bg-blue-600 text-white font-black text-sm rounded-xl shadow-md transition"
                >
                  검색
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 인기 항공 노선 특가 그리드 -->
    <div class="max-w-6xl mx-auto px-4 space-y-6">
      <div class="flex items-end justify-between">
        <div>
          <div class="flex items-center gap-2">
            <span class="px-2 py-0.5 bg-blue-100 text-trip-blue rounded text-[11px] font-black">POPULAR ROUTES</span>
            <h2 class="text-2xl font-black text-trip-navy tracking-tight">인기 항공 노선 실시간 특가</h2>
          </div>
          <p class="text-xs text-slate-500 mt-1">지금 가장 저렴하게 떠날 수 있는 왕복/편도 최저가 노선</p>
        </div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
        <NuxtLink
          v-for="r in popularRoutes"
          :key="r.to"
          :to="`/flights/search?origin=${encodeURIComponent(r.from)}&dest=${encodeURIComponent(r.to)}`"
          class="group bg-white rounded-3xl border border-slate-200/90 overflow-hidden shadow-sm hover:shadow-xl transition flex flex-col"
        >
          <div class="relative h-44 overflow-hidden bg-slate-100">
            <img :src="r.img" class="w-full h-full object-cover group-hover:scale-105 transition duration-500" />
            <div class="absolute top-3 right-3 bg-black/60 backdrop-blur-md text-white text-[10px] font-bold px-2 py-1 rounded-lg">
              직항 약 {{ r.time }}
            </div>
          </div>

          <div class="p-5 flex-1 flex flex-col justify-between space-y-3">
            <div>
              <div class="text-xs text-slate-400 font-semibold">{{ r.from }}</div>
              <div class="text-lg font-black text-slate-900 group-hover:text-trip-blue transition flex items-center gap-2 mt-0.5">
                <span>✈️ {{ r.to }}</span>
              </div>
            </div>

            <div class="pt-3 border-t border-slate-100 flex items-end justify-between">
              <span class="text-[11px] text-slate-400">편도 총액 운임</span>
              <div class="text-right">
                <div class="text-xl font-black text-trip-blue font-mono">
                  {{ currencyStore.formatKRW(r.price) }}~
                </div>
                <div class="text-[10px] text-slate-400">유류할증료/공항세 포함</div>
              </div>
            </div>
          </div>
        </NuxtLink>
      </div>
    </div>

    <!-- 7일 최저가 캘린더 안내 배너 -->
    <div class="max-w-6xl mx-auto px-4">
      <div class="bg-gradient-to-r from-sky-50 via-blue-50 to-indigo-50 border border-sky-100 rounded-3xl p-8 flex flex-col md:flex-row items-center justify-between gap-6">
        <div class="space-y-2">
          <span class="px-2.5 py-0.5 bg-blue-600 text-white rounded-md text-[10px] font-black uppercase">스마트 검색 기능</span>
          <h3 class="text-2xl font-black text-slate-900">7일 최저가 매트릭스로 가장 저렴한 날 떠나세요</h3>
          <p class="text-xs text-slate-600 max-w-xl">
            원하는 목적지만 선택하면 앞뒤 3일간의 실시간 항공 요금을 한눈에 비교하여 최대 40% 이상 저렴한 날짜를 자동으로 찾아드립니다.
          </p>
        </div>

        <NuxtLink
          to="/flights/search"
          class="px-6 py-3.5 bg-trip-blue hover:bg-blue-600 text-white font-black text-xs rounded-2xl shadow-lg transition whitespace-nowrap"
        >
          최저가 캘린더 검색 시작 →
        </NuxtLink>
      </div>
    </div>
  </div>
</template>
