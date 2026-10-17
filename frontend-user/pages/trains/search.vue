<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useCurrencyStore } from '~/stores/currency'
import { useApiUrl } from '~/composables/useApi'
import { searchTrainCatalog, type TrainJourney } from '~/data/trainCatalog'

const route = useRoute()
const currencyStore = useCurrencyStore()

const depStation = ref(route.query.dep as string || '서울역 (Seoul)')
const arrStation = ref(route.query.arr as string || '부산역 (Busan)')
const travelDate = ref(route.query.date as string || new Date().toISOString().slice(0, 10))

// Facet Filter States
const selectedTrainType = ref<string>('ALL')
const selectedTimeSlot = ref<string>('ALL')
const selectedSeatClass = ref<string>('ALL')

// Strict synchronous search initialization: 0 foreign route pollution
const trains = ref<TrainJourney[]>(searchTrainCatalog({
  depStation: depStation.value,
  arrStation: arrStation.value,
  date: travelDate.value,
  trainType: selectedTrainType.value,
  seatClass: selectedSeatClass.value
}))
const loading = ref(false)

const fetchTrains = async () => {
  loading.value = true
  try {
    const res = await fetch(`${useApiUrl('/trains')}?dep=${encodeURIComponent(depStation.value)}&arr=${encodeURIComponent(arrStation.value)}`, { signal: AbortSignal.timeout(1500) })
    if (res.ok) {
      const json = await res.json()
      if (Array.isArray(json.data) && json.data.length > 0) {
        trains.value = json.data
        loading.value = false
        return
      }
    }
  } catch (e) {
    // Fall back to verified strict train catalog
  }

  // Strict route matching (Never mix Tokyo Shinkansen with Seoul KTX)
  trains.value = searchTrainCatalog({
    depStation: depStation.value,
    arrStation: arrStation.value,
    date: travelDate.value,
    trainType: selectedTrainType.value,
    seatClass: selectedSeatClass.value
  })
  loading.value = false
}

const showMobileFilter = ref(false)

const activeFilterCount = computed(() => {
  let count = 0
  if (selectedTrainType.value !== 'ALL') count++
  if (selectedSeatClass.value !== 'ALL') count++
  return count
})

const filteredTrains = computed(() => {
  let list = [...trains.value]
  if (selectedTrainType.value !== 'ALL') {
    list = list.filter(t => t.train_type?.includes(selectedTrainType.value))
  }
  if (selectedSeatClass.value !== 'ALL') {
    list = list.filter(t => t.seat_class === selectedSeatClass.value)
  }
  return list
})

watch([depStation, arrStation, selectedTrainType, selectedSeatClass], () => {
  fetchTrains()
})

onMounted(() => {
  fetchTrains()
})
</script>

<template>
  <div class="max-w-7xl mx-auto px-4 py-8 space-y-6">
    <!-- 상단 브레드크럼 & 검색 요약 바 -->
    <div class="bg-white rounded-2xl border border-slate-200 p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
      <div class="flex items-center gap-4">
        <div class="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-black text-xl">
          🚅
        </div>
        <div>
          <div class="flex items-center gap-2 text-xs text-slate-400">
            <NuxtLink to="/trains" class="hover:underline">기차표</NuxtLink> <span>›</span>
            <span>시간표 검색</span>
          </div>
          <h1 class="text-lg font-black text-slate-900 mt-0.5">
            {{ depStation }} → {{ arrStation }}
            <span class="text-xs font-normal text-slate-500 ml-2">({{ travelDate }})</span>
          </h1>
        </div>
      </div>

      <NuxtLink to="/trains" class="px-4 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-bold border border-slate-200 transition text-center">
        일정 / 노선 재검색
      </NuxtLink>
    </div>

    <!-- 모바일 전용 퀵 필터 칩 바 (Trip-style) -->
    <div class="lg:hidden flex items-center gap-2 overflow-x-auto scrollbar-none pb-1">
      <button
        @click="showMobileFilter = true"
        :class="[
          'px-3.5 py-2 rounded-xl text-xs font-bold border flex items-center gap-1.5 whitespace-nowrap shadow-sm',
          activeFilterCount > 0 ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-700 border-slate-300'
        ]"
      >
        <span>⚡ 열차 필터</span>
        <span v-if="activeFilterCount > 0" class="w-4 h-4 rounded-full bg-white text-emerald-600 text-[10px] flex items-center justify-center font-black">
          {{ activeFilterCount }}
        </span>
      </button>

      <button
        @click="selectedTrainType = selectedTrainType === 'KTX' ? 'ALL' : 'KTX'"
        :class="['px-3 py-2 rounded-xl text-xs font-bold border whitespace-nowrap transition', selectedTrainType === 'KTX' ? 'bg-emerald-50 text-emerald-700 border-emerald-600' : 'bg-white text-slate-600 border-slate-200']"
      >
        KTX/산천
      </button>

      <button
        @click="selectedTrainType = selectedTrainType === 'SRT' ? 'ALL' : 'SRT'"
        :class="['px-3 py-2 rounded-xl text-xs font-bold border whitespace-nowrap transition', selectedTrainType === 'SRT' ? 'bg-emerald-50 text-emerald-700 border-emerald-600' : 'bg-white text-slate-600 border-slate-200']"
      >
        SRT
      </button>

      <button
        @click="selectedSeatClass = selectedSeatClass === 'FIRST' ? 'ALL' : 'FIRST'"
        :class="['px-3 py-2 rounded-xl text-xs font-bold border whitespace-nowrap transition', selectedSeatClass === 'FIRST' ? 'bg-emerald-50 text-emerald-700 border-emerald-600' : 'bg-white text-slate-600 border-slate-200']"
      >
        특실 / 1등석
      </button>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
      <!-- 좌측: 필터 사이드바 -->
      <aside class="hidden lg:block lg:col-span-3 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-6">
        <div>
          <h4 class="font-bold text-xs text-slate-900 mb-2.5">열차 종류</h4>
          <div class="space-y-2 text-xs">
            <label v-for="t in [{ id: 'ALL', label: '전체 열차' }, { id: 'KTX', label: 'KTX / KTX-산천' }, { id: 'SRT', label: 'SRT 고속열차' }, { id: '신칸센', label: '신칸센 (Shinkansen)' }, { id: '유로스타', label: '유로스타 (Eurostar)' }]" :key="t.id" class="flex items-center gap-2 cursor-pointer font-medium text-slate-700">
              <input type="radio" v-model="selectedTrainType" :value="t.id" name="ttype" class="accent-emerald-600" />
              <span>{{ t.label }}</span>
            </label>
          </div>
        </div>

        <div class="border-t border-slate-100 pt-5">
          <h4 class="font-bold text-xs text-slate-900 mb-2.5">좌석 등급</h4>
          <div class="space-y-2 text-xs">
            <label v-for="c in [{ id: 'ALL', label: '전체 등급' }, { id: 'STANDARD', label: '일반실 (Standard)' }, { id: 'FIRST', label: '특실 / 1등석 (First)' }]" :key="c.id" class="flex items-center gap-2 cursor-pointer font-medium text-slate-700">
              <input type="radio" v-model="selectedSeatClass" :value="c.id" name="sclass" class="accent-emerald-600" />
              <span>{{ c.label }}</span>
            </label>
          </div>
        </div>

        <div class="p-4 bg-emerald-50 rounded-xl border border-emerald-100 text-[11px] text-emerald-800 space-y-1">
          <div class="font-bold">⚡ 모바일 QR 즉시 발권</div>
          <div>결제 즉시 스마트폰으로 모바일 승차권이 발급되며 매표소 방문 없이 바로 탑승 가능합니다.</div>
        </div>
      </aside>

      <!-- 우측: 열차 시간표 카드 목록 -->
      <main class="lg:col-span-9 space-y-4">
        <div v-if="loading" class="p-16 text-center text-slate-400 font-bold bg-white rounded-2xl border border-slate-200">
          실시간 고속철도 좌석 및 시간표를 조회 중입니다...
        </div>

        <div v-else-if="filteredTrains.length === 0" class="p-16 text-center text-slate-400 bg-white rounded-2xl border border-slate-200">
          선택하신 조건에 운행하는 열차가 없습니다.
        </div>

        <div v-else class="space-y-4">
          <div
            v-for="tr in filteredTrains"
            :key="tr.id"
            class="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-lg transition flex flex-col md:flex-row items-center justify-between gap-6"
          >
            <!-- 열차 번호 및 시간 -->
            <div class="flex items-center gap-8 w-full md:w-auto">
              <div>
                <span class="px-2.5 py-0.5 bg-emerald-50 text-emerald-700 rounded-md text-xs font-bold">{{ tr.train_type }}</span>
                <div class="font-black text-slate-900 text-base mt-1">{{ tr.train_number }}</div>
              </div>

              <div class="flex items-center gap-6 text-center flex-1">
                <div>
                  <div class="text-xl font-black text-slate-900 font-mono">
                    {{ new Date(tr.departure_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}
                  </div>
                  <div class="text-xs text-slate-600 font-bold">{{ tr.departure_station }}</div>
                </div>

                <div class="space-y-1">
                  <div class="text-[11px] text-slate-400 font-semibold">{{ tr.duration_minutes }}분 소요</div>
                  <div class="w-24 h-0.5 bg-emerald-300 relative">
                    <div class="w-2 h-2 rounded-full bg-emerald-600 absolute right-0 -top-0.5"></div>
                  </div>
                </div>

                <div>
                  <div class="text-xl font-black text-slate-900 font-mono">
                    {{ new Date(tr.arrival_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}
                  </div>
                  <div class="text-xs text-slate-600 font-bold">{{ tr.arrival_station }}</div>
                </div>
              </div>

              <div class="hidden lg:block text-xs text-slate-500 space-y-0.5">
                <div>좌석: <strong class="text-slate-800">{{ tr.seat_class }}</strong></div>
                <div class="text-emerald-600 font-bold">잔여 {{ tr.available_seats }}석</div>
              </div>
            </div>

            <!-- 가격 및 예매 버튼 -->
            <div class="text-right flex items-center justify-between md:justify-end gap-4 w-full md:w-auto pt-3 md:pt-0 border-t md:border-t-0 border-slate-100">
              <div>
                <div class="text-2xl font-black text-trip-blue font-mono">
                  {{ currencyStore.formatKRW(tr.price_krw) }}
                </div>
                <div class="text-[10px] text-slate-400">발권 수수료 0원</div>
              </div>

              <div class="flex items-center gap-2">
                <NuxtLink
                  :to="`/trains/detail/${tr.id}`"
                  class="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-xl transition whitespace-nowrap"
                >
                  정차역 / 상세
                </NuxtLink>
                <NuxtLink
                  :to="`/trains/booking?trainId=${tr.id}`"
                  class="px-5 py-2.5 bg-trip-blue hover:bg-blue-600 text-white font-bold text-xs rounded-xl shadow-md transition whitespace-nowrap"
                >
                  승차권 예매
                </NuxtLink>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>

    <!-- 모바일 필터 바텀시트 / 모달 -->
    <Teleport to="body">
      <div v-if="showMobileFilter" class="fixed inset-0 z-50 flex flex-col justify-end bg-black/60 backdrop-blur-sm lg:hidden">
        <div class="bg-white rounded-t-3xl max-h-[85vh] flex flex-col overflow-hidden shadow-2xl">
          <div class="flex items-center justify-between p-4 border-b border-slate-100">
            <h3 class="font-black text-base text-slate-900">열차 상세 필터</h3>
            <button @click="showMobileFilter = false" class="text-slate-400 p-1 hover:text-slate-700 text-xl font-bold">✕</button>
          </div>
          
          <div class="overflow-y-auto p-5 space-y-6">
            <!-- 열차 종류 -->
            <div>
              <h4 class="font-bold text-xs text-slate-900 mb-2.5">열차 종류</h4>
              <div class="space-y-2 text-xs">
                <label v-for="t in [{ id: 'ALL', label: '전체 열차' }, { id: 'KTX', label: 'KTX / KTX-산천' }, { id: 'SRT', label: 'SRT 고속열차' }, { id: '신칸센', label: '신칸센 (Shinkansen)' }, { id: '유로스타', label: '유로스타 (Eurostar)' }]" :key="t.id" class="flex items-center gap-2 cursor-pointer font-medium text-slate-700">
                  <input type="radio" v-model="selectedTrainType" :value="t.id" name="m_ttype" class="accent-emerald-600" />
                  <span>{{ t.label }}</span>
                </label>
              </div>
            </div>

            <!-- 좌석 등급 -->
            <div class="border-t border-slate-100 pt-4">
              <h4 class="font-bold text-xs text-slate-900 mb-2.5">좌석 등급</h4>
              <div class="space-y-2 text-xs">
                <label v-for="c in [{ id: 'ALL', label: '전체 등급' }, { id: 'STANDARD', label: '일반실 (Standard)' }, { id: 'FIRST', label: '특실 / 1등석 (First)' }]" :key="c.id" class="flex items-center gap-2 cursor-pointer font-medium text-slate-700">
                  <input type="radio" v-model="selectedSeatClass" :value="c.id" name="m_sclass" class="accent-emerald-600" />
                  <span>{{ c.label }}</span>
                </label>
              </div>
            </div>
          </div>

          <div class="p-4 border-t border-slate-100 bg-slate-50 flex items-center gap-3">
            <button
              @click="selectedTrainType = 'ALL'; selectedSeatClass = 'ALL'"
              class="w-1/3 py-3 rounded-xl border border-slate-300 font-bold text-xs text-slate-700 bg-white"
            >
              초기화
            </button>
            <button
              @click="showMobileFilter = false"
              class="w-2/3 py-3 rounded-xl bg-emerald-600 text-white font-black text-xs shadow-lg shadow-emerald-500/30"
            >
              적용하기 ({{ filteredTrains.length }}개 열차)
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
