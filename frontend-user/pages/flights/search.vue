<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useCurrencyStore } from '~/stores/currency'
import { useApiUrl } from '~/composables/useApi'
import SearchAutocomplete from '~/components/SearchAutocomplete.vue'

const route = useRoute()
const currencyStore = useCurrencyStore()

const origin = ref(route.query.origin as string || '인천국제공항 (ICN)')
const dest = ref(route.query.dest as string || '도쿄 나리타 (NRT)')

// Facet Filter States (Trip-style)
const selectedStops = ref<number | null>(null) // null: 전체, 0: 직항, 1: 1회 경유
const selectedAirlines = ref<string[]>([])
const selectedTimeSlot = ref<string>('ALL')
const baggageOnly = ref(false)
const sortBy = ref<'cheapest' | 'fastest' | 'recommended'>('cheapest')

const flights = ref<any[]>([])
const loading = ref(false)

const fetchFlights = async () => {
  loading.value = true
  try {
    const parseCode = (val: string) => {
      const match = val.match(/\b([A-Z]{3})\b/)
      return match ? match[1] : val
    }
    const o = parseCode(origin.value)
    const d = parseCode(dest.value)

    const res = await fetch(`${useApiUrl('/flights')}?origin=${encodeURIComponent(o)}&dest=${encodeURIComponent(d)}`)
    const json = await res.json()
    flights.value = json.data || []
    if (flights.value.length === 0) {
      flights.value = [
        {
          id: 'flt_ke703',
          airline_name: '대한항공',
          flight_number: 'KE703',
          cabin_class: 'ECONOMY',
          departure_time: '2026-11-01T10:10:00+09:00',
          arrival_time: '2026-11-01T12:35:00+09:00',
          departure_airport: 'ICN (서울/인천)',
          arrival_airport: 'NRT (도쿄/나리타)',
          duration_minutes: 145,
          stops: 0,
          departure_time_slot: 'MORNING',
          free_baggage_kg: 23,
          available_seats: 7,
          base_price_krw: 245000
        },
        {
          id: 'flt_oz102',
          airline_name: '아시아나항공',
          flight_number: 'OZ102',
          cabin_class: 'ECONOMY',
          departure_time: '2026-11-01T09:00:00+09:00',
          arrival_time: '2026-11-01T11:20:00+09:00',
          departure_airport: 'ICN (서울/인천)',
          arrival_airport: 'NRT (도쿄/나리타)',
          duration_minutes: 140,
          stops: 0,
          departure_time_slot: 'MORNING',
          free_baggage_kg: 23,
          available_seats: 5,
          base_price_krw: 238000
        },
        {
          id: 'flt_7c1102',
          airline_name: '제주항공',
          flight_number: '7C1102',
          cabin_class: 'ECONOMY',
          departure_time: '2026-11-01T14:30:00+09:00',
          arrival_time: '2026-11-01T16:55:00+09:00',
          departure_airport: 'ICN (서울/인천)',
          arrival_airport: 'NRT (도쿄/나리타)',
          duration_minutes: 145,
          stops: 0,
          departure_time_slot: 'AFTERNOON',
          free_baggage_kg: 15,
          available_seats: 12,
          base_price_krw: 189000
        }
      ]
    }
  } catch (e) {
    console.error(e)
    flights.value = [
      {
        id: 'flt_ke703',
        airline_name: '대한항공',
        flight_number: 'KE703',
        cabin_class: 'ECONOMY',
        departure_time: '2026-11-01T10:10:00+09:00',
        arrival_time: '2026-11-01T12:35:00+09:00',
        departure_airport: 'ICN (서울/인천)',
        arrival_airport: 'NRT (도쿄/나리타)',
        duration_minutes: 145,
        stops: 0,
        departure_time_slot: 'MORNING',
        free_baggage_kg: 23,
        available_seats: 7,
        base_price_krw: 245000
      },
      {
        id: 'flt_oz102',
        airline_name: '아시아나항공',
        flight_number: 'OZ102',
        cabin_class: 'ECONOMY',
        departure_time: '2026-11-01T09:00:00+09:00',
        arrival_time: '2026-11-01T11:20:00+09:00',
        departure_airport: 'ICN (서울/인천)',
        arrival_airport: 'NRT (도쿄/나리타)',
        duration_minutes: 140,
        stops: 0,
        departure_time_slot: 'MORNING',
        free_baggage_kg: 23,
        available_seats: 5,
        base_price_krw: 238000
      }
    ]
  } finally {
    loading.value = false
  }
}

// Client-side faceted filtering & sorting
const filteredFlights = computed(() => {
  let list = [...flights.value]

  if (selectedStops.value !== null) {
    list = list.filter(f => (f.stops || 0) === selectedStops.value)
  }

  if (selectedAirlines.value.length > 0) {
    list = list.filter(f => selectedAirlines.value.includes(f.airline_name))
  }

  if (selectedTimeSlot.value !== 'ALL') {
    list = list.filter(f => (f.departure_time_slot || 'MORNING') === selectedTimeSlot.value)
  }

  if (baggageOnly.value) {
    list = list.filter(f => (f.free_baggage_kg || 0) >= 20)
  }

  // Sort
  if (sortBy.value === 'cheapest') {
    list.sort((a, b) => a.base_price_krw - b.base_price_krw)
  } else if (sortBy.value === 'fastest') {
    list.sort((a, b) => a.duration_minutes - b.duration_minutes)
  }

  return list
})

const availableAirlines = computed(() => {
  const set = new Set<string>()
  flights.value.forEach(f => {
    if (f.airline_name) set.add(f.airline_name)
  })
  return Array.from(set)
})

const toggleAirline = (name: string) => {
  const idx = selectedAirlines.value.indexOf(name)
  if (idx >= 0) {
    selectedAirlines.value.splice(idx, 1)
  } else {
    selectedAirlines.value.push(name)
  }
}

watch([origin, dest], () => {
  fetchFlights()
})

onMounted(() => {
  fetchFlights()
})
</script>

<template>
  <div class="max-w-7xl mx-auto px-4 py-8 space-y-6">
    <!-- 1. 검색 상단 바 (Trip-style 인터랙티브 바) -->
    <div class="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
      <div class="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
        <div class="w-full sm:w-64">
          <label class="text-[10px] font-bold text-slate-400 block mb-1">출발지 (공항/도시)</label>
          <SearchAutocomplete
            v-model="origin"
            domain="flights"
            placeholder="출발 공항 / 도시"
            icon="plane"
            inputClass="w-full pl-9 pr-6 py-2.5 text-xs font-bold text-slate-900 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>

        <span class="text-slate-400 hidden sm:inline text-lg mt-4">✈️</span>

        <div class="w-full sm:w-64">
          <label class="text-[10px] font-bold text-slate-400 block mb-1">도착지 (공항/도시)</label>
          <SearchAutocomplete
            v-model="dest"
            domain="flights"
            placeholder="도착 공항 / 도시"
            icon="plane"
            inputClass="w-full pl-9 pr-6 py-2.5 text-xs font-bold text-slate-900 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>

        <button
          @click="fetchFlights"
          type="button"
          class="w-full sm:w-auto px-6 py-2.5 mt-0 sm:mt-4 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md transition whitespace-nowrap"
        >
          항공편 재검색
        </button>
      </div>

      <span class="text-xs font-bold text-blue-600 flex-shrink-0">조회된 항공편 {{ flights.length }}개</span>
    </div>

    <!-- 2. 7일 전후 최저가 캘린더 바 (Trip-style) -->
    <div class="grid grid-cols-7 gap-2 bg-white p-3 rounded-2xl border border-slate-200 text-center text-xs">
      <div
        v-for="(day, i) in ['10/29', '10/30', '10/31', '11/01 (오늘)', '11/02', '11/03', '11/04']"
        :key="day"
        :class="['p-2 rounded-xl transition cursor-pointer', i === 3 ? 'bg-blue-50 border border-blue-600 font-bold text-blue-600' : 'hover:bg-slate-50 text-slate-600']"
      >
        <div>{{ day }}</div>
        <div class="font-mono mt-1 font-bold">{{ currencyStore.formatKRW(330000 + i * 5000) }}</div>
      </div>
    </div>

    <!-- 3. 메인 그리드: 좌측 패싯 필터 사이드바 + 우측 항공권 리스트 -->
    <div class="grid grid-cols-1 lg:grid-cols-4 gap-6">
      <!-- 좌측 패싯 필터 사이드바 (Trip-style) -->
      <aside class="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm h-fit space-y-6">
        <div class="flex items-center justify-between pb-3 border-b border-slate-100">
          <h3 class="font-black text-sm text-slate-900">항공권 필터</h3>
          <button
            @click="selectedStops = null; selectedAirlines = []; selectedTimeSlot = 'ALL'; baggageOnly = false"
            class="text-[11px] text-blue-600 font-bold hover:underline"
          >
            초기화
          </button>
        </div>

        <!-- 경유 여부 (Stops) -->
        <div>
          <h4 class="font-bold text-xs text-slate-900 mb-2.5">경유 횟수</h4>
          <div class="space-y-2 text-xs">
            <label class="flex items-center gap-2 cursor-pointer font-medium text-slate-700">
              <input type="radio" :checked="selectedStops === null" @change="selectedStops = null" name="stops" class="accent-blue-600" />
              <span>전체 구간</span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer font-medium text-slate-700">
              <input type="radio" :checked="selectedStops === 0" @change="selectedStops = 0" name="stops" class="accent-blue-600" />
              <span>직항만 보기 (Non-stop)</span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer font-medium text-slate-700">
              <input type="radio" :checked="selectedStops === 1" @change="selectedStops = 1" name="stops" class="accent-blue-600" />
              <span>1회 경유</span>
            </label>
          </div>
        </div>

        <!-- 출발 시간대 필터 -->
        <div class="border-t border-slate-100 pt-5">
          <h4 class="font-bold text-xs text-slate-900 mb-2.5">출발 시간대</h4>
          <div class="grid grid-cols-2 gap-2 text-xs">
            <button
              v-for="slot in [
                { id: 'ALL', label: '전체 시간' },
                { id: 'MORNING', label: '오전 (06~12시)' },
                { id: 'AFTERNOON', label: '오후 (12~18시)' },
                { id: 'EVENING', label: '야간 (18~24시)' }
              ]"
              :key="slot.id"
              @click="selectedTimeSlot = slot.id"
              :class="[
                'p-2 rounded-xl font-bold border transition text-[11px] text-center',
                selectedTimeSlot === slot.id ? 'bg-blue-600 text-white border-blue-600' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
              ]"
            >
              {{ slot.label }}
            </button>
          </div>
        </div>

        <!-- 항공사 필터 -->
        <div v-if="availableAirlines.length" class="border-t border-slate-100 pt-5">
          <h4 class="font-bold text-xs text-slate-900 mb-2.5">항공사 선택</h4>
          <div class="space-y-2 text-xs">
            <label
              v-for="airline in availableAirlines"
              :key="airline"
              class="flex items-center gap-2 cursor-pointer font-medium text-slate-700"
            >
              <input
                type="checkbox"
                :checked="selectedAirlines.includes(airline)"
                @change="toggleAirline(airline)"
                class="rounded text-blue-600 focus:ring-blue-500"
              />
              <span>{{ airline }}</span>
            </label>
          </div>
        </div>

        <!-- 수하물 필터 -->
        <div class="border-t border-slate-100 pt-5">
          <h4 class="font-bold text-xs text-slate-900 mb-2.5">수하물 규정</h4>
          <label class="flex items-center gap-2 text-xs font-semibold cursor-pointer text-slate-700">
            <input v-model="baggageOnly" type="checkbox" class="rounded text-blue-600 focus:ring-blue-500" />
            <span>🧳 무료 위탁수하물 포함만 (20kg+)</span>
          </label>
        </div>
      </aside>

      <!-- 우측 항공편 리스트 영역 -->
      <main class="lg:col-span-3 space-y-4">
        <!-- 정렬 탭 -->
        <div class="flex items-center justify-between bg-white p-4 rounded-2xl border border-slate-200 shadow-sm text-xs">
          <span class="text-slate-500 font-medium">
            총 <strong class="text-blue-600 font-bold">{{ filteredFlights.length }}</strong>개의 운항편
          </span>

          <div class="flex items-center gap-1">
            <button
              @click="sortBy = 'cheapest'"
              :class="['px-3 py-1.5 rounded-lg font-bold transition', sortBy === 'cheapest' ? 'bg-blue-50 text-blue-600' : 'text-slate-500 hover:bg-slate-50']"
            >
              최저가순
            </button>
            <button
              @click="sortBy = 'fastest'"
              :class="['px-3 py-1.5 rounded-lg font-bold transition', sortBy === 'fastest' ? 'bg-blue-50 text-blue-600' : 'text-slate-500 hover:bg-slate-50']"
            >
              최단 비행시간순
            </button>
            <button
              @click="sortBy = 'recommended'"
              :class="['px-3 py-1.5 rounded-lg font-bold transition', sortBy === 'recommended' ? 'bg-blue-50 text-blue-600' : 'text-slate-500 hover:bg-slate-50']"
            >
              추천순
            </button>
          </div>
        </div>

        <div v-if="loading" class="p-16 text-center text-slate-400 font-bold bg-white rounded-2xl border border-slate-200">
          항공편을 실시간으로 조회 중입니다...
        </div>

        <div v-else-if="filteredFlights.length === 0" class="p-16 bg-white rounded-2xl border border-slate-200 text-center text-slate-400">
          선택한 필터 조건에 부합하는 항공편이 없습니다.
        </div>

        <!-- Trip-style 항공편 카드 -->
        <div
          v-for="f in filteredFlights"
          :key="f.id"
          class="bg-white p-6 rounded-2xl border border-slate-200/90 shadow-sm hover:shadow-lg transition flex flex-col md:flex-row items-center justify-between gap-6"
        >
          <!-- 항공사 & 시간 정보 -->
          <div class="flex items-center gap-8 w-full md:w-auto">
            <div class="w-24">
              <div class="font-black text-slate-900 text-sm">{{ f.airline_name }}</div>
              <div class="text-[11px] font-mono text-slate-400">{{ f.flight_number }}</div>
              <span class="px-2 py-0.5 bg-blue-50 text-blue-700 text-[10px] font-bold rounded">
                {{ f.cabin_class }}
              </span>
            </div>

            <div class="flex items-center gap-6 text-center flex-1">
              <div>
                <div class="text-xl font-black text-slate-900 font-mono">
                  {{ new Date(f.departure_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}
                </div>
                <div class="text-xs text-slate-500 font-bold">{{ f.departure_airport }}</div>
              </div>

              <div class="space-y-1">
                <span class="text-[10px] text-slate-400 font-semibold">
                  {{ Math.floor(f.duration_minutes / 60) }}시간 {{ f.duration_minutes % 60 }}분
                </span>
                <div class="w-24 h-0.5 bg-slate-300 relative">
                  <div class="w-2 h-2 rounded-full bg-blue-600 absolute right-0 -top-0.5"></div>
                </div>
                <span :class="['text-[10px] font-bold', (f.stops || 0) === 0 ? 'text-emerald-600' : 'text-amber-600']">
                  {{ (f.stops || 0) === 0 ? '직항' : (f.stops || 1) + '회 경유' }}
                </span>
              </div>

              <div>
                <div class="text-xl font-black text-slate-900 font-mono">
                  {{ new Date(f.arrival_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}
                </div>
                <div class="text-xs text-slate-500 font-bold">{{ f.arrival_airport }}</div>
              </div>
            </div>

            <div class="hidden lg:block text-xs text-slate-500 space-y-0.5">
              <div>🧳 무료 위탁수하물 {{ f.free_baggage_kg || 23 }}kg</div>
              <div class="text-[11px] text-emerald-600 font-bold">잔여 {{ f.available_seats }}석</div>
            </div>
          </div>

          <!-- 가격 & 선택 버튼 -->
          <div class="text-right flex items-center justify-between md:justify-end gap-4 w-full md:w-auto pt-3 md:pt-0 border-t md:border-t-0 border-slate-100">
            <div>
              <div class="text-2xl font-black text-blue-600 font-mono">
                {{ currencyStore.formatKRW(f.base_price_krw) }}
              </div>
              <div class="text-[10px] text-slate-400">유류할증료/세금 포함</div>
            </div>
            <div class="flex items-center gap-2">
              <NuxtLink
                :to="`/flights/detail/${f.id}`"
                class="px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl transition whitespace-nowrap"
              >
                상세 / 운임선택
              </NuxtLink>
              <NuxtLink
                :to="`/flights/booking?flightId=${f.id}`"
                class="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white text-xs font-black rounded-xl shadow-md transition whitespace-nowrap"
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
