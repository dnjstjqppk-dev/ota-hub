<script setup lang="ts">
import { ref, onMounted, watch, computed } from 'vue'
import { useRoute } from 'vue-router'
import { useCurrencyStore } from '~/stores/currency'
import { useApiUrl } from '~/composables/useApi'
import SearchAutocomplete from '~/components/SearchAutocomplete.vue'

const route = useRoute()
const currencyStore = useCurrencyStore()

const city = ref((route.query.city || route.query.searchWord || '') as string)
const selectedStar = ref(Number(route.query.star || route.query.starRating || 0))
const selectedScore = ref(0)
const selectedPropertyType = ref('ALL')
const maxPrice = ref(1000000)
const freeCancel = ref(route.query.freeCancel === 'true')
const breakfast = ref(route.query.breakfast === 'true')
const sortBy = ref<'recommended' | 'price_asc' | 'score_desc'>((route.query.sortBy as any) || 'recommended')
const mapView = ref(false)
const showMobileFilter = ref(false)

const activeFilterCount = computed(() => {
  let count = 0
  if (selectedStar.value > 0) count++
  if (selectedScore.value > 0) count++
  if (selectedPropertyType.value !== 'ALL') count++
  if (maxPrice.value < 1000000) count++
  if (freeCancel.value) count++
  if (breakfast.value) count++
  return count
})

import { searchHotelCatalog } from '~/data/hotelCatalog'

const hotels = ref<any[]>(searchHotelCatalog({
  city: city.value,
  star: selectedStar.value,
  minScore: selectedScore.value,
  maxPrice: maxPrice.value,
  freeCancel: freeCancel.value,
  breakfast: breakfast.value,
  propertyType: selectedPropertyType.value,
  sortBy: sortBy.value
}))
const loading = ref(false)

const fetchHotels = async () => {
  loading.value = true
  try {
    // 1. Try Live API if available
    const params = new URLSearchParams()
    if (city.value) params.append('city', city.value)
    if (selectedStar.value > 0) params.append('star', String(selectedStar.value))
    if (maxPrice.value < 1000000) params.append('maxPrice', String(maxPrice.value))
    if (freeCancel.value) params.append('freeCancel', 'true')
    if (breakfast.value) params.append('breakfast', 'true')

    const res = await fetch(`${useApiUrl('/hotels')}?${params.toString()}`, { signal: AbortSignal.timeout(1500) })
    if (res.ok) {
      const json = await res.json()
      if (Array.isArray(json.data) && json.data.length > 0) {
        let data: any[] = json.data
        if (selectedScore.value > 0) data = data.filter(h => h.review_score >= selectedScore.value)
        if (selectedPropertyType.value !== 'ALL') data = data.filter(h => (h.property_type || 'HOTEL') === selectedPropertyType.value)
        if (sortBy.value === 'price_asc') {
          data.sort((a, b) => (a.rooms?.[0]?.base_price_krw || 9999999) - (b.rooms?.[0]?.base_price_krw || 9999999))
        } else if (sortBy.value === 'score_desc') {
          data.sort((a, b) => b.review_score - a.review_score)
        }
        hotels.value = data
        loading.value = false
        return
      }
    }
  } catch (e) {
    // Fall back cleanly to client master catalog
  }

  // 2. Strict client-side search across verified catalog (Zero false fallbacks)
  const catalogResults = searchHotelCatalog({
    city: city.value,
    star: selectedStar.value,
    minScore: selectedScore.value,
    maxPrice: maxPrice.value,
    freeCancel: freeCancel.value,
    breakfast: breakfast.value,
    propertyType: selectedPropertyType.value,
    sortBy: sortBy.value
  })

  hotels.value = catalogResults
  loading.value = false
}

watch([city, selectedStar, selectedScore, selectedPropertyType, maxPrice, freeCancel, breakfast, sortBy], () => {
  fetchHotels()
})

watch(() => route.query.city, (newCity) => {
  if (newCity !== undefined) {
    city.value = (newCity as string) || ''
    fetchHotels()
  }
})

onMounted(() => {
  fetchHotels()
})
</script>

<template>
  <div class="max-w-7xl mx-auto px-4 py-8 space-y-6">
    <!-- 검색 상단 바 & 지도 뷰 토글 (Trip-style) -->
    <div class="flex flex-col md:flex-row items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
      <div class="flex items-center gap-3 w-full md:w-auto">
        <div class="w-72">
          <SearchAutocomplete
            v-model="city"
            domain="hotels"
            placeholder="목적지 / 호텔명 검색"
            icon="search"
            inputClass="w-full pl-10 pr-8 py-2.5 text-xs font-bold text-slate-900 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none shadow-sm"
          />
        </div>
        <span class="text-xs text-slate-500 font-medium">검색 결과: <strong class="text-blue-600 font-bold">{{ hotels.length }}</strong>개 숙소</span>
      </div>

      <div class="flex items-center gap-2">
        <button
          @click="mapView = !mapView"
          :class="[
            'px-4 py-2 rounded-xl text-xs font-bold border transition flex items-center gap-1.5',
            mapView ? 'bg-blue-600 text-white border-blue-600 shadow-sm' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
          ]"
        >
          <span>🗺️</span>
          <span>{{ mapView ? '지도 닫기' : '지도 보기 (Map View)' }}</span>
        </button>
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
        <span>⚡ 상세 필터</span>
        <span v-if="activeFilterCount > 0" class="w-4 h-4 rounded-full bg-white text-blue-600 text-[10px] flex items-center justify-center font-black">
          {{ activeFilterCount }}
        </span>
      </button>

      <button
        @click="selectedStar = selectedStar === 5 ? 0 : 5"
        :class="['px-3 py-2 rounded-xl text-xs font-bold border whitespace-nowrap transition', selectedStar === 5 ? 'bg-blue-50 text-blue-600 border-blue-600' : 'bg-white text-slate-600 border-slate-200']"
      >
        ★ 5성급
      </button>

      <button
        @click="freeCancel = !freeCancel"
        :class="['px-3 py-2 rounded-xl text-xs font-bold border whitespace-nowrap transition', freeCancel ? 'bg-blue-50 text-blue-600 border-blue-600' : 'bg-white text-slate-600 border-slate-200']"
      >
        ✓ 무료 취소
      </button>

      <button
        @click="breakfast = !breakfast"
        :class="['px-3 py-2 rounded-xl text-xs font-bold border whitespace-nowrap transition', breakfast ? 'bg-blue-50 text-blue-600 border-blue-600' : 'bg-white text-slate-600 border-slate-200']"
      >
        🍳 조식 포함
      </button>

      <button
        @click="selectedScore = selectedScore === 4.8 ? 0 : 4.8"
        :class="['px-3 py-2 rounded-xl text-xs font-bold border whitespace-nowrap transition', selectedScore === 4.8 ? 'bg-blue-50 text-blue-600 border-blue-600' : 'bg-white text-slate-600 border-slate-200']"
      >
        4.8+ 평점
      </button>
    </div>

    <!-- 메인 레이아웃: 필터 사이드바 + 호텔 목록 -->
    <div class="grid grid-cols-1 lg:grid-cols-4 gap-6">
      <!-- 12개 다중 조건 필터 사이드바 (Trip-style) -->
      <aside class="hidden lg:block bg-white p-6 rounded-2xl border border-slate-200 shadow-sm h-fit space-y-6">
        <div class="flex items-center justify-between pb-3 border-b border-slate-100">
          <h3 class="font-black text-sm text-slate-900">상세 필터</h3>
          <button
            @click="selectedStar = 0; selectedScore = 0; selectedPropertyType = 'ALL'; maxPrice = 1000000; freeCancel = false; breakfast = false"
            class="text-[11px] text-blue-600 font-bold hover:underline"
          >
            초기화
          </button>
        </div>

        <!-- 성급 필터 -->
        <div>
          <h4 class="font-bold text-xs text-slate-900 mb-2.5">호텔 등급 (성급)</h4>
          <div class="space-y-2 text-xs">
            <label v-for="s in [5, 4, 3]" :key="s" class="flex items-center gap-2 cursor-pointer font-medium text-slate-700">
              <input
                type="radio"
                name="star"
                :value="s"
                :checked="selectedStar === s"
                @change="selectedStar = selectedStar === s ? 0 : s"
                class="accent-blue-600"
              />
              <span>★ {{ s }}성급 이상</span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer font-medium text-slate-700">
              <input type="radio" name="star" :value="0" :checked="selectedStar === 0" @change="selectedStar = 0" class="accent-blue-600" />
              <span>전체 등급</span>
            </label>
          </div>
        </div>

        <!-- 고객 평점 필터 -->
        <div class="border-t border-slate-100 pt-5">
          <h4 class="font-bold text-xs text-slate-900 mb-2.5">고객 평점</h4>
          <div class="grid grid-cols-3 gap-1.5 text-xs">
            <button
              v-for="sc in [{ val: 4.8, label: '4.8+ 최고' }, { val: 4.5, label: '4.5+ 매우만족' }, { val: 4.0, label: '4.0+ 만족' }]"
              :key="sc.val"
              @click="selectedScore = selectedScore === sc.val ? 0 : sc.val"
              :class="[
                'p-2 rounded-xl font-bold border transition text-[11px] text-center',
                selectedScore === sc.val ? 'bg-blue-600 text-white border-blue-600' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
              ]"
            >
              {{ sc.label }}
            </button>
          </div>
        </div>

        <!-- 숙소 유형 필터 -->
        <div class="border-t border-slate-100 pt-5">
          <h4 class="font-bold text-xs text-slate-900 mb-2.5">숙소 유형</h4>
          <div class="space-y-2 text-xs">
            <label v-for="pt in [{ id: 'ALL', label: '모든 숙소 유형' }, { id: 'HOTEL', label: '호텔' }, { id: 'RESORT', label: '리조트' }, { id: 'APARTMENT', label: '레지던스 / 아파트' }]" :key="pt.id" class="flex items-center gap-2 cursor-pointer font-medium text-slate-700">
              <input type="radio" v-model="selectedPropertyType" :value="pt.id" name="ptype" class="accent-blue-600" />
              <span>{{ pt.label }}</span>
            </label>
          </div>
        </div>

        <!-- 1박 요금 상한선 -->
        <div class="border-t border-slate-100 pt-5">
          <div class="flex justify-between items-center mb-1">
            <h4 class="font-bold text-xs text-slate-900">1박 요금 상한선</h4>
            <span class="text-xs font-bold text-blue-600 font-mono">{{ currencyStore.formatKRW(maxPrice) }}</span>
          </div>
          <input v-model="maxPrice" type="range" min="100000" max="1000000" step="50000" class="w-full accent-blue-600 cursor-pointer" />
        </div>

        <!-- 인기 혜택 필터 -->
        <div class="border-t border-slate-100 pt-5 space-y-2">
          <h4 class="font-bold text-xs text-slate-900 mb-2">인기 혜택 필터</h4>
          <label class="flex items-center gap-2 text-xs font-semibold cursor-pointer text-slate-700">
            <input v-model="freeCancel" type="checkbox" class="rounded text-blue-600 focus:ring-blue-500" />
            <span>✓ 무료 취소 가능</span>
          </label>
          <label class="flex items-center gap-2 text-xs font-semibold cursor-pointer text-slate-700">
            <input v-model="breakfast" type="checkbox" class="rounded text-blue-600 focus:ring-blue-500" />
            <span>🍳 조식 포함</span>
          </label>
        </div>
      </aside>

      <!-- 호텔 리스트 영역 & 정렬 바 -->
      <div :class="[mapView ? 'lg:col-span-2' : 'lg:col-span-3', 'space-y-4']">
        <!-- 정렬 탭 -->
        <div class="flex items-center justify-between bg-white p-4 rounded-2xl border border-slate-200 shadow-sm text-xs">
          <span class="text-slate-500 font-medium">정렬 기준</span>
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
              요금 낮은순
            </button>
            <button
              @click="sortBy = 'score_desc'"
              :class="['px-3 py-1.5 rounded-lg font-bold transition', sortBy === 'score_desc' ? 'bg-blue-50 text-blue-600' : 'text-slate-500 hover:bg-slate-50']"
            >
              평점 높은순
            </button>
          </div>
        </div>

        <div v-if="loading" class="p-16 text-center text-slate-400 font-bold bg-white rounded-2xl border border-slate-200">
          호텔 목록을 실시간으로 검색 중입니다...
        </div>

        <div v-else-if="hotels.length === 0" class="bg-white p-12 text-center rounded-2xl border border-slate-200">
          <div class="text-3xl mb-2">🏨</div>
          <h4 class="font-bold text-slate-700">조건에 맞는 호텔이 없습니다.</h4>
          <p class="text-xs text-slate-400 mt-1">필터를 초기화하거나 도시명을 다시 확인해주세요.</p>
        </div>

        <!-- Trip-style 가로형 호텔 카드 -->
        <div
          v-for="h in hotels"
          :key="h.id"
          class="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-sm hover:shadow-xl transition flex flex-col md:flex-row gap-5 group"
        >
          <!-- 썸네일 & 갤러리 프리뷰 -->
          <div class="md:w-64 h-52 md:h-auto rounded-xl overflow-hidden relative flex-shrink-0">
            <img :src="h.thumbnail_url" :alt="h.name_ko" class="w-full h-full object-cover group-hover:scale-105 transition duration-500" />
            <span class="absolute top-2.5 left-2.5 bg-slate-900/80 backdrop-blur-md text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
              ★ {{ h.star_rating }}성급 {{ h.property_type || 'HOTEL' }}
            </span>
          </div>

          <!-- 호텔 상세 정보 -->
          <div class="flex-1 flex flex-col justify-between space-y-2">
            <div>
              <div class="flex items-start justify-between gap-2">
                <div>
                  <NuxtLink :to="`/hotels/detail/${h.id}`">
                    <h3 class="font-black text-lg text-slate-900 group-hover:text-blue-600 transition">
                      {{ h.name_ko }}
                    </h3>
                  </NuxtLink>
                  <p class="text-xs text-slate-400 font-medium">{{ h.name_en }}</p>
                </div>

                <div class="text-right flex-shrink-0">
                  <div class="flex items-center justify-end gap-1.5">
                    <span class="text-xs font-bold text-slate-800">우수함</span>
                    <span class="bg-blue-600 text-white text-xs font-black px-2 py-0.5 rounded-lg shadow-sm">
                      {{ h.review_score }}
                    </span>
                  </div>
                  <span class="text-[10px] text-slate-400">{{ h.review_count?.toLocaleString() }}개 후기</span>
                </div>
              </div>

              <!-- 위치 및 지하철역 안내 태그 -->
              <div class="flex items-center gap-2 text-xs text-slate-500 mt-1">
                <span>📍 {{ h.city }}, {{ h.neighborhood || '도심 중심가' }}</span>
                <span>•</span>
                <span class="text-blue-600 font-semibold">{{ h.subway_nearby || '지하철역 인근' }}</span>
              </div>

              <!-- 편의시설 배지 -->
              <div class="flex flex-wrap gap-1 mt-2.5">
                <span v-for="a in h.amenities?.slice(0, 5)" :key="a" class="px-2 py-0.5 bg-slate-100 text-slate-600 text-[10px] font-medium rounded">
                  ✓ {{ a }}
                </span>
              </div>
            </div>

            <!-- 하단 최저가 및 예약 버튼 -->
            <div class="pt-3 border-t border-slate-100 flex items-center justify-between">
              <div class="text-xs space-y-0.5">
                <div class="text-emerald-600 font-bold">✓ 예약 즉시 확정</div>
                <div class="text-[10px] text-slate-400">{{ h.rooms?.length || 2 }}개 객실 타입 보유</div>
              </div>

              <div class="text-right">
                <div class="text-[10px] text-slate-400">1박 기준 (세금 포함)</div>
                <div class="text-xl font-black text-blue-600 font-mono">
                  {{ currencyStore.formatKRW(h.rooms?.[0]?.base_price_krw || 350000) }}
                </div>
                <NuxtLink
                  :to="`/hotels/detail/${h.id}`"
                  class="mt-1.5 inline-block px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md transition"
                >
                  객실 보기
                </NuxtLink>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 대화형 지도 뷰 패널 (Map View Pane) -->
      <div v-if="mapView" class="hidden lg:flex flex-col col-span-1 sticky top-24 h-[calc(100vh-140px)] bg-slate-100 rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
        <div class="p-3.5 bg-white border-b border-slate-200 flex items-center justify-between">
          <div class="flex items-center gap-1.5 text-xs font-bold text-slate-800">
            <span>📍</span>
            <span>{{ city || '전체 지역' }} 지도 뷰</span>
          </div>
          <span class="text-[11px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">{{ hotels.length }}개 숙소</span>
        </div>
        <!-- 지도 그래픽 / 인터랙티브 핀 맵 -->
        <div class="relative flex-1 bg-gradient-to-br from-blue-50/60 via-slate-100 to-indigo-50/60 p-4 overflow-y-auto space-y-2.5">
          <div class="text-[10px] text-slate-400 text-center pb-1">지도 상의 호텔 핀을 클릭하면 객실 요금을 확인하실 수 있습니다.</div>
          <div
            v-for="(h, idx) in hotels"
            :key="h.id"
            class="bg-white/95 backdrop-blur-sm p-3 rounded-2xl border border-slate-200 shadow-sm hover:border-blue-500 hover:shadow-md transition cursor-pointer group"
          >
            <div class="flex items-start justify-between gap-2">
              <div class="space-y-0.5">
                <span class="inline-block px-1.5 py-0.5 bg-blue-600 text-white rounded text-[10px] font-bold font-mono">
                  #{{ idx + 1 }} {{ h.star_rating }}성급
                </span>
                <div class="font-bold text-slate-900 text-xs group-hover:text-blue-600 transition">{{ h.name_ko || h.name }}</div>
                <div class="text-[10px] text-slate-500 truncate">{{ h.address || h.city }}</div>
              </div>
              <div class="text-right whitespace-nowrap">
                <span class="text-[11px] font-black text-blue-600 font-mono block">₩{{ (h.min_price_krw || 250000).toLocaleString() }}</span>
                <span class="text-[9px] text-slate-400">1박 요금</span>
              </div>
            </div>
            <NuxtLink :to="`/hotels/${h.id}`" class="mt-2 block text-center py-1 bg-slate-50 hover:bg-blue-50 text-blue-600 text-[10px] font-bold rounded-lg transition border border-slate-200 hover:border-blue-300">
              상세 위치 및 객실 보기 →
            </NuxtLink>
          </div>
        </div>
      </div>
    </div>

    <!-- 모바일 필터 바텀시트 / 모달 -->
    <Teleport to="body">
      <div v-if="showMobileFilter" class="fixed inset-0 z-50 flex flex-col justify-end bg-black/60 backdrop-blur-sm lg:hidden">
        <div class="bg-white rounded-t-3xl max-h-[85vh] flex flex-col overflow-hidden shadow-2xl">
          <div class="flex items-center justify-between p-4 border-b border-slate-100">
            <h3 class="font-black text-base text-slate-900">상세 필터</h3>
            <button @click="showMobileFilter = false" class="text-slate-400 p-1 hover:text-slate-700 text-xl font-bold">✕</button>
          </div>
          
          <div class="overflow-y-auto p-5 space-y-6">
            <!-- 성급 필터 -->
            <div>
              <h4 class="font-bold text-xs text-slate-900 mb-2.5">호텔 등급 (성급)</h4>
              <div class="space-y-2 text-xs">
                <label v-for="s in [5, 4, 3]" :key="s" class="flex items-center gap-2 cursor-pointer font-medium text-slate-700">
                  <input
                    type="radio"
                    name="m_star"
                    :value="s"
                    :checked="selectedStar === s"
                    @change="selectedStar = selectedStar === s ? 0 : s"
                    class="accent-blue-600"
                  />
                  <span>★ {{ s }}성급 이상</span>
                </label>
                <label class="flex items-center gap-2 cursor-pointer font-medium text-slate-700">
                  <input type="radio" name="m_star" :value="0" :checked="selectedStar === 0" @change="selectedStar = 0" class="accent-blue-600" />
                  <span>전체 등급</span>
                </label>
              </div>
            </div>

            <!-- 고객 평점 필터 -->
            <div class="border-t border-slate-100 pt-4">
              <h4 class="font-bold text-xs text-slate-900 mb-2.5">고객 평점</h4>
              <div class="grid grid-cols-3 gap-1.5 text-xs">
                <button
                  v-for="sc in [{ val: 4.8, label: '4.8+ 최고' }, { val: 4.5, label: '4.5+ 매우만족' }, { val: 4.0, label: '4.0+ 만족' }]"
                  :key="sc.val"
                  @click="selectedScore = selectedScore === sc.val ? 0 : sc.val"
                  :class="[
                    'p-2 rounded-xl font-bold border transition text-[11px] text-center',
                    selectedScore === sc.val ? 'bg-blue-600 text-white border-blue-600' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                  ]"
                >
                  {{ sc.label }}
                </button>
              </div>
            </div>

            <!-- 숙소 유형 필터 -->
            <div class="border-t border-slate-100 pt-4">
              <h4 class="font-bold text-xs text-slate-900 mb-2.5">숙소 유형</h4>
              <div class="space-y-2 text-xs">
                <label v-for="pt in [{ id: 'ALL', label: '모든 숙소 유형' }, { id: 'HOTEL', label: '호텔' }, { id: 'RESORT', label: '리조트' }, { id: 'APARTMENT', label: '레지던스 / 아파트' }]" :key="pt.id" class="flex items-center gap-2 cursor-pointer font-medium text-slate-700">
                  <input type="radio" v-model="selectedPropertyType" :value="pt.id" name="m_ptype" class="accent-blue-600" />
                  <span>{{ pt.label }}</span>
                </label>
              </div>
            </div>

            <!-- 1박 요금 상한선 -->
            <div class="border-t border-slate-100 pt-4">
              <div class="flex justify-between items-center mb-1">
                <h4 class="font-bold text-xs text-slate-900">1박 요금 상한선</h4>
                <span class="text-xs font-bold text-blue-600 font-mono">{{ currencyStore.formatKRW(maxPrice) }}</span>
              </div>
              <input v-model="maxPrice" type="range" min="100000" max="1000000" step="50000" class="w-full accent-blue-600 cursor-pointer" />
            </div>

            <!-- 인기 혜택 필터 -->
            <div class="border-t border-slate-100 pt-4 space-y-2">
              <h4 class="font-bold text-xs text-slate-900 mb-2">인기 혜택 필터</h4>
              <label class="flex items-center gap-2 text-xs font-semibold cursor-pointer text-slate-700">
                <input v-model="freeCancel" type="checkbox" class="rounded text-blue-600 focus:ring-blue-500" />
                <span>✓ 무료 취소 가능</span>
              </label>
              <label class="flex items-center gap-2 text-xs font-semibold cursor-pointer text-slate-700">
                <input v-model="breakfast" type="checkbox" class="rounded text-blue-600 focus:ring-blue-500" />
                <span>🍳 조식 포함</span>
              </label>
            </div>
          </div>

          <div class="p-4 border-t border-slate-100 bg-slate-50 flex items-center gap-3">
            <button
              @click="selectedStar = 0; selectedScore = 0; selectedPropertyType = 'ALL'; maxPrice = 1000000; freeCancel = false; breakfast = false"
              class="w-1/3 py-3 rounded-xl border border-slate-300 font-bold text-xs text-slate-700 bg-white"
            >
              초기화
            </button>
            <button
              @click="showMobileFilter = false"
              class="w-2/3 py-3 rounded-xl bg-blue-600 text-white font-black text-xs shadow-lg shadow-blue-500/30"
            >
              적용하기 ({{ hotels.length }}개 숙소)
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 모바일 플로팅 필터 플로팅 버튼 (getfortrip 스타일) -->
    <div class="lg:hidden fixed bottom-20 right-4 z-40">
      <button
        @click="showMobileFilter = true"
        class="flex items-center gap-2 px-4 py-3 bg-trip-navy text-white text-xs font-black rounded-full shadow-2xl border border-slate-700/80 active:scale-95 transition-all cursor-pointer"
      >
        <span>⚡ 필터</span>
        <span v-if="activeFilterCount > 0" class="w-4 h-4 rounded-full bg-blue-500 text-white text-[10px] flex items-center justify-center font-black">
          {{ activeFilterCount }}
        </span>
      </button>
    </div>
  </div>
</template>
