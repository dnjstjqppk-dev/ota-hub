<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'

type TabType = 'hotels' | 'flights' | 'trains' | 'cars' | 'transfers' | 'activities' | 'packages'
const activeTab = ref<TabType>('hotels')

// 검색 상태값
const hotelCity = ref('서울')
const checkIn = ref('2026-11-01')
const checkOut = ref('2026-11-03')
const guests = ref({ adults: 2, rooms: 1 })

const flightOrigin = ref('ICN')
const flightDest = ref('NRT')
const flightDate = ref('2026-11-01')

const trainDepart = ref('서울역')
const trainArrival = ref('부산역')

const carLocation = ref('제주')
const activityCity = ref('도쿄')

const router = useRouter()

const handleSearch = () => {
  if (activeTab.value === 'hotels') {
    router.push({
      path: '/hotels/list',
      query: {
        city: hotelCity.value,
        checkIn: checkIn.value,
        checkOut: checkOut.value,
        adults: guests.value.adults,
        rooms: guests.value.rooms
      }
    })
  } else if (activeTab.value === 'flights') {
    router.push({
      path: '/flights/search',
      query: { origin: flightOrigin.value, dest: flightDest.value, date: flightDate.value }
    })
  } else if (activeTab.value === 'trains') {
    router.push({
      path: '/trains/search',
      query: { departure: trainDepart.value, arrival: trainArrival.value }
    })
  } else if (activeTab.value === 'cars') {
    router.push({
      path: '/cars/search',
      query: { pickup: carLocation.value }
    })
  } else if (activeTab.value === 'activities') {
    router.push({
      path: '/things-to-do/list',
      query: { city: activityCity.value }
    })
  } else if (activeTab.value === 'packages') {
    router.push('/packages/builder')
  }
}
</script>

<template>
  <div class="max-w-6xl mx-auto -mt-20 relative z-20 px-4">
    <div class="bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-200/80">
      <!-- 7대 도메인 탭 스위처 -->
      <div class="flex border-b border-slate-100 bg-slate-50/80 overflow-x-auto scrollbar-none">
        <button
          v-for="t in [
            { id: 'hotels', label: '숙소', icon: '🏨' },
            { id: 'flights', label: '항공권', icon: '✈️' },
            { id: 'trains', label: '기차표', icon: '🚄' },
            { id: 'cars', label: '렌터카', icon: '🚗' },
            { id: 'transfers', label: '공항픽업', icon: '🚐' },
            { id: 'activities', label: '투어·티켓', icon: '🎟️' },
            { id: 'packages', label: '항공+호텔', icon: '🏖️' }
          ]"
          :key="t.id"
          @click="activeTab = t.id as TabType"
          :class="[
            'flex items-center gap-2 px-6 py-4 font-bold text-sm transition-all whitespace-nowrap',
            activeTab === t.id
              ? 'bg-white text-trip-blue border-b-2 border-trip-blue shadow-sm'
              : 'text-slate-600 hover:text-trip-blue'
          ]"
        >
          <span class="text-base">{{ t.icon }}</span>
          <span>{{ t.label }}</span>
        </button>
      </div>

      <!-- 동적 검색 폼 영역 -->
      <div class="p-6">
        <!-- 1. 숙소 검색 폼 -->
        <div v-if="activeTab === 'hotels'" class="grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
          <div class="border border-slate-200 rounded-2xl p-3 hover:border-trip-blue transition">
            <label class="text-[11px] font-bold text-slate-400 block mb-0.5">목적지 / 숙소명</label>
            <input v-model="hotelCity" type="text" class="w-full font-bold text-trip-navy outline-none text-base bg-transparent" placeholder="도시 또는 호텔명" />
          </div>

          <div class="border border-slate-200 rounded-2xl p-3 hover:border-trip-blue transition">
            <label class="text-[11px] font-bold text-slate-400 block mb-0.5">체크인 - 체크아웃</label>
            <div class="flex items-center gap-2 text-sm font-bold text-trip-navy">
              <input v-model="checkIn" type="date" class="outline-none text-xs font-bold" />
              <span>~</span>
              <input v-model="checkOut" type="date" class="outline-none text-xs font-bold" />
            </div>
          </div>

          <div class="border border-slate-200 rounded-2xl p-3 hover:border-trip-blue transition">
            <label class="text-[11px] font-bold text-slate-400 block mb-0.5">인원 및 객실</label>
            <div class="text-sm font-bold text-trip-navy">
              성인 {{ guests.adults }}명, 객실 {{ guests.rooms }}개
            </div>
          </div>

          <button
            @click="handleSearch"
            class="h-full min-h-[56px] bg-trip-blue hover:bg-trip-hover text-white font-extrabold text-base rounded-2xl flex items-center justify-center gap-2 transition shadow-lg shadow-blue-500/30"
          >
            <span>호텔 검색</span>
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
          </button>
        </div>

        <!-- 2. 항공권 검색 폼 -->
        <div v-else-if="activeTab === 'flights'" class="grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
          <div class="border border-slate-200 rounded-2xl p-3 hover:border-trip-blue transition">
            <label class="text-[11px] font-bold text-slate-400 block mb-0.5">출발지 (공항코드)</label>
            <input v-model="flightOrigin" type="text" class="w-full font-bold text-trip-navy outline-none text-base uppercase bg-transparent" placeholder="ICN (인천)" />
          </div>

          <div class="border border-slate-200 rounded-2xl p-3 hover:border-trip-blue transition">
            <label class="text-[11px] font-bold text-slate-400 block mb-0.5">도착지 (공항코드)</label>
            <input v-model="flightDest" type="text" class="w-full font-bold text-trip-navy outline-none text-base uppercase bg-transparent" placeholder="NRT (도쿄)" />
          </div>

          <div class="border border-slate-200 rounded-2xl p-3 hover:border-trip-blue transition">
            <label class="text-[11px] font-bold text-slate-400 block mb-0.5">출발일</label>
            <input v-model="flightDate" type="date" class="w-full text-sm font-bold outline-none" />
          </div>

          <button
            @click="handleSearch"
            class="h-full min-h-[56px] bg-trip-blue hover:bg-trip-hover text-white font-extrabold text-base rounded-2xl flex items-center justify-center gap-2 transition shadow-lg shadow-blue-500/30"
          >
            <span>항공권 검색</span>
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
          </button>
        </div>

        <!-- 기타 도메인 폼 -->
        <div v-else class="flex items-center justify-between py-2">
          <div class="text-sm font-bold text-slate-700">
            {{ activeTab === 'trains' ? '한국 KTX, 일본 신칸센, 유럽 유로스타 실시간 잔여석 조회' :
               activeTab === 'cars' ? '전 세계 주요 공항 및 도시 렌터카 가격 비교' :
               activeTab === 'activities' ? '도쿄 디즈니랜드, USJ, 5G eSIM 즉시 바우처 발권' : '항공+호텔 결합 할인 다이내믹 패키지 빌더' }}
          </div>
          <button
            @click="handleSearch"
            class="px-8 py-3.5 bg-trip-blue hover:bg-trip-hover text-white font-extrabold text-sm rounded-2xl shadow-lg shadow-blue-500/30"
          >
            바로 조회하기
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

