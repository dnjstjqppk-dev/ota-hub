<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useCurrencyStore } from '~/stores/currency'
import { useApiUrl } from '~/composables/useApi'
import SearchAutocomplete from '~/components/SearchAutocomplete.vue'

const route = useRoute()
const currencyStore = useCurrencyStore()

const city = ref((route.query.city || route.query.loc || route.query.location || '제주') as string)
const pickupDate = ref(route.query.pickupDate as string || '2026-11-01')
const returnDate = ref(route.query.returnDate as string || '2026-11-03')

// Faceted Filters (Car Rental standard)
const selectedCategory = ref<string>('ALL') // ALL, COMPACT, SEDAN, SUV, VAN, ELECTRIC
const selectedTransmission = ref<string>('ALL') // ALL, AUTO, MANUAL
const selectedCompany = ref<string>('ALL')
const superCdwOnly = ref(false)
const freeCancelOnly = ref(false)
const sortBy = ref<'recommended' | 'price_asc' | 'seats_desc'>('recommended')
const showMobileFilter = ref(false)

const activeFilterCount = computed(() => {
  let count = 0
  if (selectedCategory.value !== 'ALL') count++
  if (selectedTransmission.value !== 'ALL') count++
  if (superCdwOnly.value) count++
  if (freeCancelOnly.value) count++
  return count
})

const cars = ref<any[]>([])
const loading = ref(false)

const fallbackCars = [
  {
    id: 'car_avante_01',
    company_name: '롯데렌터카 (Lotte Rent-a-Car)',
    vehicle_model: '현대 더 뉴 아반떼 (2025/2026)',
    vehicle_category: 'SEDAN',
    seats: 5,
    luggage_large: 2,
    luggage_small: 2,
    transmission: 'AUTO',
    fuel_type: 'GASOLINE',
    pickup_city: '제주',
    pickup_location_name: '제주국제공항 렌터카하우스 셔틀 1구역',
    daily_price_krw: 48000,
    insurance_super_cdw: true,
    unlimited_mileage: true,
    free_cancellation_hours: 48,
    min_driver_age: 21,
    image_url: 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?w=800'
  },
  {
    id: 'car_yaris_01',
    company_name: 'Times Car Rental Japan',
    vehicle_model: 'Toyota Yaris Hybrid',
    vehicle_category: 'COMPACT',
    seats: 5,
    luggage_large: 2,
    luggage_small: 1,
    transmission: 'AUTO',
    fuel_type: 'HYBRID',
    pickup_city: '도쿄',
    pickup_location_name: '도쿄 나리타 국제공항 제1터미널 카운터',
    daily_price_krw: 62000,
    insurance_super_cdw: true,
    unlimited_mileage: true,
    free_cancellation_hours: 48,
    min_driver_age: 21,
    image_url: 'https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=800'
  },
  {
    id: 'car_tucson_01',
    company_name: 'SK렌터카 (SK Rent-a-Car)',
    vehicle_model: '현대 디 올 뉴 투싼 1.6T',
    vehicle_category: 'SUV',
    seats: 5,
    luggage_large: 3,
    luggage_small: 2,
    transmission: 'AUTO',
    fuel_type: 'GASOLINE',
    pickup_city: '제주',
    pickup_location_name: '제주국제공항 셔틀 탑승장 2구역',
    daily_price_krw: 65000,
    insurance_super_cdw: true,
    unlimited_mileage: true,
    free_cancellation_hours: 48,
    min_driver_age: 21,
    image_url: 'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=800'
  },
  {
    id: 'car_carnival_01',
    company_name: '롯데렌터카 (Lotte Rent-a-Car)',
    vehicle_model: '기아 더 뉴 카니발 9인승',
    vehicle_category: 'VAN',
    seats: 9,
    luggage_large: 4,
    luggage_small: 4,
    transmission: 'AUTO',
    fuel_type: 'DIESEL',
    pickup_city: '제주',
    pickup_location_name: '제주공항 지점',
    daily_price_krw: 95000,
    insurance_super_cdw: true,
    unlimited_mileage: true,
    free_cancellation_hours: 48,
    min_driver_age: 26,
    image_url: 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?w=800'
  }
]

const fetchCars = async () => {
  loading.value = true
  try {
    const params = new URLSearchParams()
    if (city.value) {
      params.append('city', city.value)
      params.append('loc', city.value)
    }
    const res = await fetch(`${useApiUrl('/cars')}?${params.toString()}`)
    const json = await res.json()
    if (Array.isArray(json?.data) && json.data.length > 0) {
      cars.value = json.data.map((c: any) => ({
        ...c,
        vehicle_category: c.vehicle_category || c.vehicle_type || 'SEDAN',
        luggage_large: c.luggage_large ?? (c.vehicle_type === 'VAN' ? 4 : c.vehicle_type === 'SUV' ? 3 : 2),
        luggage_small: c.luggage_small ?? 2,
        insurance_super_cdw: c.insurance_super_cdw ?? (c.insurance_included === 1 || c.insurance_included === true),
        unlimited_mileage: c.unlimited_mileage ?? true,
        free_cancellation_hours: c.free_cancellation_hours ?? 48,
        pickup_location_name: c.pickup_location_name || c.pickup_location || '공항 렌터카 하우스'
      }))
      loading.value = false
      return
    }
  } catch (e) {
    // Keep fallback
  }

  const filteredFallback = fallbackCars.filter(c => {
    if (!city.value) return true
    return c.pickup_city.includes(city.value) || city.value.includes(c.pickup_city) || c.pickup_location_name.includes(city.value)
  })
  cars.value = filteredFallback.length > 0 ? filteredFallback : fallbackCars
  loading.value = false
}

watch(() => [route.query.city, route.query.loc, route.query.location], ([newCity, newLoc, newLocation]) => {
  const val = newCity || newLoc || newLocation
  if (val) {
    city.value = val as string
    fetchCars()
  }
})

watch(city, () => {
  fetchCars()
})

const filteredCars = computed(() => {
  let list = [...cars.value]

  if (selectedCategory.value !== 'ALL') {
    list = list.filter(c => c.vehicle_category === selectedCategory.value)
  }
  if (selectedTransmission.value !== 'ALL') {
    list = list.filter(c => c.transmission === selectedTransmission.value)
  }
  if (superCdwOnly.value) {
    list = list.filter(c => c.insurance_super_cdw)
  }
  if (freeCancelOnly.value) {
    list = list.filter(c => (c.free_cancellation_hours || 0) > 0)
  }

  if (sortBy.value === 'price_asc') {
    list.sort((a, b) => a.daily_price_krw - b.daily_price_krw)
  } else if (sortBy.value === 'seats_desc') {
    list.sort((a, b) => b.seats - a.seats)
  }

  return list
})

onMounted(() => {
  fetchCars()
})
</script>

<template>
  <div class="max-w-7xl mx-auto px-4 py-8 space-y-6">
    <!-- 상단 브레드크럼 & 검색 요약 바 -->
    <div class="bg-white rounded-2xl border border-slate-200 p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
      <div class="flex items-center gap-4">
        <div class="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-black text-xl">
          🚗
        </div>
        <div>
          <div class="flex items-center gap-2 text-xs text-slate-400">
            <NuxtLink to="/" class="hover:underline">홈</NuxtLink> <span>›</span>
            <NuxtLink to="/cars" class="hover:underline">렌터카</NuxtLink> <span>›</span>
            <span class="text-slate-800 font-bold">차량 검색</span>
          </div>
          <div class="text-base font-black text-slate-900 mt-0.5">
            {{ city }} 렌터카 예약 ({{ pickupDate }} ~ {{ returnDate }})
          </div>
        </div>
      </div>

      <div class="flex items-center gap-3 w-full md:w-auto">
        <div class="w-64">
          <SearchAutocomplete
            v-model="city"
            domain="cars"
            icon="car"
            placeholder="인수 도시 / 지점 변경"
            inputClass="w-full pl-10 pr-3 py-2 text-xs font-bold text-slate-800 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>
        <NuxtLink
          to="/cars"
          class="px-4 py-2 border border-slate-200 hover:border-blue-500 rounded-xl text-xs font-bold text-slate-700 transition whitespace-nowrap"
        >
          검색 조건 변경
        </NuxtLink>
      </div>
    </div>

    <!-- 모바일 전용 퀵 필터 칩 바 (Trip-style) -->
    <div class="lg:hidden flex items-center gap-2 overflow-x-auto scrollbar-none pb-1">
      <button
        @click="showMobileFilter = true"
        :class="[
          'px-3.5 py-2 rounded-xl text-xs font-bold border flex items-center gap-1.5 whitespace-nowrap shadow-sm',
          activeFilterCount > 0 ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-700 border-slate-300'
        ]"
      >
        <span>⚡ 렌터카 필터</span>
        <span v-if="activeFilterCount > 0" class="w-4 h-4 rounded-full bg-white text-blue-600 text-[10px] flex items-center justify-center font-black">
          {{ activeFilterCount }}
        </span>
      </button>

      <button
        @click="selectedCategory = selectedCategory === 'COMPACT' ? 'ALL' : 'COMPACT'"
        :class="['px-3 py-2 rounded-xl text-xs font-bold border whitespace-nowrap transition', selectedCategory === 'COMPACT' ? 'bg-blue-50 text-blue-600 border-blue-600' : 'bg-white text-slate-600 border-slate-200']"
      >
        경차/소형
      </button>

      <button
        @click="selectedCategory = selectedCategory === 'SEDAN' ? 'ALL' : 'SEDAN'"
        :class="['px-3 py-2 rounded-xl text-xs font-bold border whitespace-nowrap transition', selectedCategory === 'SEDAN' ? 'bg-blue-50 text-blue-600 border-blue-600' : 'bg-white text-slate-600 border-slate-200']"
      >
        세단
      </button>

      <button
        @click="selectedCategory = selectedCategory === 'SUV' ? 'ALL' : 'SUV'"
        :class="['px-3 py-2 rounded-xl text-xs font-bold border whitespace-nowrap transition', selectedCategory === 'SUV' ? 'bg-blue-50 text-blue-600 border-blue-600' : 'bg-white text-slate-600 border-slate-200']"
      >
        SUV
      </button>

      <button
        @click="superCdwOnly = !superCdwOnly"
        :class="['px-3 py-2 rounded-xl text-xs font-bold border whitespace-nowrap transition', superCdwOnly ? 'bg-blue-50 text-blue-600 border-blue-600' : 'bg-white text-slate-600 border-slate-200']"
      >
        완전자차 0원
      </button>

      <button
        @click="freeCancelOnly = !freeCancelOnly"
        :class="['px-3 py-2 rounded-xl text-xs font-bold border whitespace-nowrap transition', freeCancelOnly ? 'bg-blue-50 text-blue-600 border-blue-600' : 'bg-white text-slate-600 border-slate-200']"
      >
        무료 취소
      </button>
    </div>

    <!-- 메인 레이아웃 (좌측 Trip-style 패싯 필터 + 우측 차량 카드 리스트) -->
    <div class="flex flex-col lg:flex-row gap-8 items-start">
      <!-- 1. 패싯 필터 사이드바 -->
      <aside class="hidden lg:block w-full lg:w-64 bg-white rounded-2xl border border-slate-200 p-5 space-y-6 flex-shrink-0 shadow-sm">
        <div class="flex items-center justify-between pb-4 border-b border-slate-100">
          <span class="font-black text-sm text-slate-900">상세 필터</span>
          <button
            @click="selectedCategory = 'ALL'; selectedTransmission = 'ALL'; superCdwOnly = false; freeCancelOnly = false;"
            class="text-xs text-blue-600 hover:underline font-bold"
          >
            초기화
          </button>
        </div>

        <!-- 차종 필터 -->
        <div class="space-y-2.5">
          <label class="text-xs font-black text-slate-700 block">차량 크기 / 차종</label>
          <div class="space-y-1.5 text-xs text-slate-600">
            <label class="flex items-center gap-2 cursor-pointer hover:text-slate-900">
              <input type="radio" value="ALL" v-model="selectedCategory" class="text-blue-600 focus:ring-0" />
              <span>전체 보기</span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer hover:text-slate-900">
              <input type="radio" value="COMPACT" v-model="selectedCategory" class="text-blue-600 focus:ring-0" />
              <span>경차 / 소형차 (Compact)</span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer hover:text-slate-900">
              <input type="radio" value="SEDAN" v-model="selectedCategory" class="text-blue-600 focus:ring-0" />
              <span>준중형 / 중형 세단 (Sedan)</span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer hover:text-slate-900">
              <input type="radio" value="SUV" v-model="selectedCategory" class="text-blue-600 focus:ring-0" />
              <span>SUV / CUV</span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer hover:text-slate-900">
              <input type="radio" value="VAN" v-model="selectedCategory" class="text-blue-600 focus:ring-0" />
              <span>승합 / 패밀리 밴 (Van)</span>
            </label>
          </div>
        </div>

        <!-- 변속기 필터 -->
        <div class="space-y-2.5 pt-4 border-t border-slate-100">
          <label class="text-xs font-black text-slate-700 block">변속기 (기어)</label>
          <div class="space-y-1.5 text-xs text-slate-600">
            <label class="flex items-center gap-2 cursor-pointer hover:text-slate-900">
              <input type="radio" value="ALL" v-model="selectedTransmission" class="text-blue-600 focus:ring-0" />
              <span>전체</span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer hover:text-slate-900">
              <input type="radio" value="AUTO" v-model="selectedTransmission" class="text-blue-600 focus:ring-0" />
              <span>오토 (자동변속기)</span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer hover:text-slate-900">
              <input type="radio" value="MANUAL" v-model="selectedTransmission" class="text-blue-600 focus:ring-0" />
              <span>수동 (수동변속기)</span>
            </label>
          </div>
        </div>

        <!-- 안심 보장 혜택 -->
        <div class="space-y-2.5 pt-4 border-t border-slate-100">
          <label class="text-xs font-black text-slate-700 block">안심 보장 혜택</label>
          <div class="space-y-2 text-xs text-slate-600">
            <label class="flex items-center gap-2 cursor-pointer hover:text-slate-900">
              <input type="checkbox" v-model="superCdwOnly" class="rounded text-blue-600 focus:ring-0" />
              <span class="font-bold text-emerald-700">✓ 완전자차 (면책금 0원)</span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer hover:text-slate-900">
              <input type="checkbox" v-model="freeCancelOnly" class="rounded text-blue-600 focus:ring-0" />
              <span>무료 취소 보장</span>
            </label>
          </div>
        </div>
      </aside>

      <!-- 2. 우측 렌터카 상품 목록 -->
      <main class="flex-1 space-y-4 w-full">
        <!-- 정렬 바 -->
        <div class="bg-white rounded-2xl border border-slate-200 p-3.5 flex items-center justify-between text-xs shadow-sm">
          <span class="font-bold text-slate-600">
            검색 결과 <strong class="text-blue-600">{{ filteredCars.length }}</strong>대
          </span>

          <div class="flex items-center gap-1">
            <button
              @click="sortBy = 'recommended'"
              :class="['px-3 py-1.5 rounded-lg font-bold transition', sortBy === 'recommended' ? 'bg-blue-50 text-blue-600' : 'text-slate-500 hover:bg-slate-50']"
            >
              추천순
            </button>
            <button
              @click="sortBy = 'price_asc'"
              :class="['px-3 py-1.5 rounded-lg font-bold transition', sortBy === 'price_asc' ? 'bg-blue-50 text-blue-600' : 'text-slate-500 hover:bg-slate-50']"
            >
              최저가순
            </button>
            <button
              @click="sortBy = 'seats_desc'"
              :class="['px-3 py-1.5 rounded-lg font-bold transition', sortBy === 'seats_desc' ? 'bg-blue-50 text-blue-600' : 'text-slate-500 hover:bg-slate-50']"
            >
              탑승인원순
            </button>
          </div>
        </div>

        <!-- 렌터카 카드 리스트 -->
        <div
          v-for="car in filteredCars"
          :key="car.id"
          class="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm hover:shadow-lg transition flex flex-col md:flex-row items-center justify-between gap-6"
        >
          <div class="flex flex-col sm:flex-row items-center gap-6 w-full md:w-auto">
            <img :src="car.image_url" class="w-44 h-32 object-cover rounded-2xl border border-slate-100 flex-shrink-0" />
            <div class="space-y-2 text-center sm:text-left">
              <span class="text-xs font-bold text-slate-400">{{ car.company_name }}</span>
              <h3 class="text-lg font-black text-slate-900">{{ car.vehicle_model }}</h3>
              
              <div class="flex flex-wrap items-center justify-center sm:justify-start gap-2.5 text-xs text-slate-600">
                <span class="bg-slate-100 px-2.5 py-0.5 rounded font-medium">👥 {{ car.seats }}인승</span>
                <span class="bg-slate-100 px-2.5 py-0.5 rounded font-medium">⚙️ {{ car.transmission === 'AUTO' ? '자동' : '수동' }}</span>
                <span class="bg-slate-100 px-2.5 py-0.5 rounded font-medium">🧳 대형 {{ car.luggage_large }}개</span>
              </div>

              <div class="flex items-center justify-center sm:justify-start gap-2 text-xs">
                <span class="text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded">
                  ✓ 슈퍼자차 포함 (면책금 0원)
                </span>
                <span class="text-blue-700 font-bold bg-blue-50 px-2 py-0.5 rounded">
                  무제한 주행거리
                </span>
              </div>
            </div>
          </div>

          <!-- 요금 및 상세/예약 버튼 -->
          <div class="text-right flex items-center justify-between md:justify-end gap-3 w-full md:w-auto pt-4 md:pt-0 border-t md:border-t-0 border-slate-100">
            <div>
              <span class="text-[11px] text-slate-400">1일 기준 요금</span>
              <div class="text-2xl font-black text-blue-600 font-mono">
                {{ currencyStore.formatKRW(car.daily_price_krw) }}
              </div>
              <div class="text-[10px] text-slate-400">자차보험 & 세금 포함</div>
            </div>

            <div class="flex items-center gap-2">
              <NuxtLink
                :to="`/cars/detail/${car.id}`"
                class="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl transition whitespace-nowrap"
              >
                차량 상세
              </NuxtLink>
              <NuxtLink
                :to="`/cars/booking?carId=${car.id}`"
                class="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-black rounded-xl shadow-md transition whitespace-nowrap"
              >
                대여 예약
              </NuxtLink>
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
            <h3 class="font-black text-base text-slate-900">렌터카 상세 필터</h3>
            <button @click="showMobileFilter = false" class="text-slate-400 p-1 hover:text-slate-700 text-xl font-bold">✕</button>
          </div>
          
          <div class="overflow-y-auto p-5 space-y-6">
            <!-- 차종 필터 -->
            <div class="space-y-2.5">
              <label class="text-xs font-black text-slate-700 block">차량 크기 / 차종</label>
              <div class="space-y-1.5 text-xs text-slate-600">
                <label v-for="cat in [
                  { id: 'ALL', label: '전체 보기' },
                  { id: 'COMPACT', label: '경차 / 소형차 (Compact)' },
                  { id: 'SEDAN', label: '준중형 / 중형 세단 (Sedan)' },
                  { id: 'SUV', label: 'SUV / CUV' },
                  { id: 'VAN', label: '승합 / 패밀리 밴 (Van)' }
                ]" :key="cat.id" class="flex items-center gap-2 cursor-pointer hover:text-slate-900">
                  <input type="radio" :value="cat.id" v-model="selectedCategory" name="m_car_cat" class="text-blue-600 focus:ring-0" />
                  <span>{{ cat.label }}</span>
                </label>
              </div>
            </div>

            <!-- 보험 및 혜택 옵션 -->
            <div class="space-y-2.5 pt-4 border-t border-slate-100">
              <label class="text-xs font-black text-slate-700 block">보험 및 편의 옵션</label>
              <div class="space-y-2 text-xs text-slate-600">
                <label class="flex items-center gap-2 cursor-pointer hover:text-slate-900">
                  <input type="checkbox" v-model="superCdwOnly" class="rounded text-blue-600 focus:ring-0" />
                  <span>완전자차 보장 포함 (면책금 0원)</span>
                </label>
                <label class="flex items-center gap-2 cursor-pointer hover:text-slate-900">
                  <input type="checkbox" v-model="freeCancelOnly" class="rounded text-blue-600 focus:ring-0" />
                  <span>무료 취소 가능 차량만</span>
                </label>
              </div>
            </div>
          </div>

          <div class="p-4 border-t border-slate-100 bg-slate-50 flex items-center gap-3">
            <button
              @click="selectedCategory = 'ALL'; selectedTransmission = 'ALL'; superCdwOnly = false; freeCancelOnly = false;"
              class="w-1/3 py-3 rounded-xl border border-slate-300 font-bold text-xs text-slate-700 bg-white"
            >
              초기화
            </button>
            <button
              @click="showMobileFilter = false"
              class="w-2/3 py-3 rounded-xl bg-blue-600 text-white font-black text-xs shadow-lg shadow-blue-500/30"
            >
              적용하기 ({{ filteredCars.length }}대 차량)
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

