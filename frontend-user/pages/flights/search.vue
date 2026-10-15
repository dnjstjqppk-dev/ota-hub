<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useCurrencyStore } from '~/stores/currency'
import { useApiUrl } from '~/composables/useApi'
import SearchAutocomplete from '~/components/SearchAutocomplete.vue'

const route = useRoute()
const currencyStore = useCurrencyStore()

const origin = ref(route.query.origin as string || '인천국제공항 (ICN)')
const dest = ref(route.query.dest as string || '도쿄 나리타 (NRT)')
const flights = ref<any[]>([])
const loading = ref(false)

const fetchFlights = async () => {
  loading.value = true
  try {
    // Extract 3-letter IATA code if in parentheses e.g. "인천 (ICN)" -> "ICN"
    const parseCode = (val: string) => {
      const match = val.match(/\b([A-Z]{3})\b/)
      return match ? match[1] : val
    }
    const o = parseCode(origin.value)
    const d = parseCode(dest.value)

    const res = await fetch(`${useApiUrl('/flights')}?origin=${encodeURIComponent(o)}&dest=${encodeURIComponent(d)}`)
    const json = await res.json()
    flights.value = json.data || []
  } catch (e) {
    console.error(e)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  fetchFlights()
})
</script>

<template>
  <div class="max-w-6xl mx-auto px-4 py-8 space-y-6">
    <!-- 검색 상단 바 (getfortrip 인터랙티브 바) -->
    <div class="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
      <div class="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
        <div class="w-full sm:w-64">
          <label class="text-[10px] font-bold text-slate-400 block mb-1">출발지 (공항/도시)</label>
          <SearchAutocomplete
            v-model="origin"
            domain="flights"
            placeholder="출발 공항 / 도시"
            icon="plane"
            inputClass="w-full pl-9 pr-6 py-2 text-xs font-bold text-slate-900 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
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
            inputClass="w-full pl-9 pr-6 py-2 text-xs font-bold text-slate-900 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>

        <button
          @click="fetchFlights"
          type="button"
          class="w-full sm:w-auto px-5 py-2 mt-0 sm:mt-4 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md transition-colors whitespace-nowrap"
        >
          항공편 재검색
        </button>
      </div>

      <span class="text-xs font-bold text-blue-600 flex-shrink-0">조회된 항공편 {{ flights.length }}개</span>
    </div>

    <!-- 7일 전후 최저가 캘린더 바 -->
    <div class="grid grid-cols-7 gap-2 bg-white p-3 rounded-2xl border border-slate-200 text-center text-xs">
      <div v-for="(day, i) in ['10/29', '10/30', '10/31', '11/01 (오늘)', '11/02', '11/03', '11/04']" :key="day" :class="['p-2 rounded-xl transition cursor-pointer', i === 3 ? 'bg-blue-50 border border-trip-blue font-bold text-trip-blue' : 'hover:bg-slate-50 text-slate-600']">
        <div>{{ day }}</div>
        <div class="font-mono mt-1 font-bold">{{ currencyStore.formatKRW(330000 + i * 5000) }}</div>
      </div>
    </div>

    <!-- 항공편 목록 -->
    <div class="space-y-4">
      <div v-if="loading" class="p-16 text-center text-slate-400 font-bold">항공편 실시간 조회 중...</div>
      
      <div v-for="f in flights" :key="f.id" class="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm hover:shadow-lg transition flex flex-col md:flex-row items-center justify-between gap-6">
        <!-- 항공사 & 시간 정보 -->
        <div class="flex items-center gap-8">
          <div>
            <div class="font-black text-slate-900 text-sm">{{ f.airline_name }}</div>
            <div class="text-[11px] font-mono text-slate-400">{{ f.flight_number }}</div>
          </div>

          <div class="flex items-center gap-6 text-center">
            <div>
              <div class="text-xl font-black text-slate-900 font-mono">{{ new Date(f.departure_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}</div>
              <div class="text-xs text-slate-400 font-bold">{{ f.departure_airport }}</div>
            </div>

            <div class="space-y-1">
              <span class="text-[10px] text-slate-400 font-semibold">{{ Math.floor(f.duration_minutes / 60) }}시간 {{ f.duration_minutes % 60 }}분</span>
              <div class="w-24 h-0.5 bg-slate-300 relative">
                <div class="w-1.5 h-1.5 rounded-full bg-trip-blue absolute right-0 -top-0.5"></div>
              </div>
              <span class="text-[10px] text-emerald-600 font-bold">직항</span>
            </div>

            <div>
              <div class="text-xl font-black text-slate-900 font-mono">{{ new Date(f.arrival_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}</div>
              <div class="text-xs text-slate-400 font-bold">{{ f.arrival_airport }}</div>
            </div>
          </div>

          <div class="hidden lg:block text-xs text-slate-500">
            <div>🧳 무료 위탁수하물 {{ f.free_baggage_kg }}kg</div>
            <div class="text-[11px] text-emerald-600 font-bold">잔여 {{ f.available_seats }}석</div>
          </div>
        </div>

        <!-- 가격 & 선택 버튼 -->
        <div class="text-right flex items-center gap-4">
          <div>
            <div class="text-2xl font-black text-trip-blue">
              {{ currencyStore.formatKRW(f.base_price_krw) }}
            </div>
            <div class="text-[10px] text-slate-400">유류할증료/세금 포함 전</div>
          </div>
          <NuxtLink :to="`/hotels/booking?flightId=${f.id}`" class="px-6 py-3 bg-trip-blue hover:bg-trip-hover text-white text-xs font-black rounded-xl shadow-md">
            예약하기
          </NuxtLink>
        </div>
      </div>
    </div>
  </div>
</template>
