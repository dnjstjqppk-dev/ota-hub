<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useCurrencyStore } from '~/stores/currency'
import { useApiUrl } from '~/composables/useApi'

const route = useRoute()
const currencyStore = useCurrencyStore()

const city = ref(route.query.city as string || '')
const selectedStar = ref(0)
const maxPrice = ref(1000000)
const freeCancel = ref(false)
const breakfast = ref(false)
const mapView = ref(false)

const hotels = ref<any[]>([])
const loading = ref(false)

const fetchHotels = async () => {
  loading.value = true
  try {
    const params = new URLSearchParams()
    if (city.value) params.append('city', city.value)
    if (selectedStar.value > 0) params.append('star', String(selectedStar.value))
    if (maxPrice.value < 1000000) params.append('maxPrice', String(maxPrice.value))
    if (freeCancel.value) params.append('freeCancel', 'true')
    if (breakfast.value) params.append('breakfast', 'true')

    const res = await fetch(`${useApiUrl('/hotels')}?${params.toString()}`)
    const json = await res.json()
    hotels.value = json.data || []
  } catch (e) {
    console.error(e)
  } finally {
    loading.value = false
  }
}

watch([city, selectedStar, maxPrice, freeCancel, breakfast], () => {
  fetchHotels()
})

onMounted(() => {
  fetchHotels()
})
</script>

<template>
  <div class="max-w-7xl mx-auto px-4 py-8">
    <!-- 검색 상단 바 & 지도 뷰 토글 -->
    <div class="flex flex-col md:flex-row items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm mb-6">
      <div class="flex items-center gap-3 w-full md:w-auto">
        <input
          v-model="city"
          type="text"
          class="p-2.5 border border-slate-300 rounded-xl text-sm font-bold text-trip-navy outline-none w-64"
          placeholder="목적지 검색 (예: 서울, 도쿄...)"
        />
        <span class="text-xs text-slate-500 font-medium">검색 결과: <strong class="text-trip-blue">{{ hotels.length }}</strong>개 호텔</span>
      </div>

      <div class="flex items-center gap-2">
        <button
          @click="mapView = !mapView"
          :class="[
            'px-4 py-2 rounded-xl text-xs font-bold border transition flex items-center gap-1.5',
            mapView ? 'bg-trip-blue text-white border-trip-blue' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
          ]"
        >
          <span>🗺️</span>
          <span>{{ mapView ? '지도 닫기' : '지도 보기 (Map View)' }}</span>
        </button>
      </div>
    </div>

    <!-- 메인 레이아웃: 필터 사이드바 + 호텔 목록 -->
    <div class="grid grid-cols-1 lg:grid-cols-4 gap-6">
      <!-- 12개 다중 조건 필터 사이드바 -->
      <aside class="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm h-fit space-y-6">
        <div>
          <h3 class="font-bold text-sm text-slate-900 mb-3">호텔 등급 (성급)</h3>
          <div class="space-y-2">
            <label v-for="s in [5, 4, 3]" :key="s" class="flex items-center gap-2 text-xs font-semibold cursor-pointer">
              <input
                type="radio"
                name="star"
                :value="s"
                :checked="selectedStar === s"
                @change="selectedStar = selectedStar === s ? 0 : s"
                class="accent-trip-blue"
              />
              <span>★ {{ s }}성급 이상</span>
            </label>
            <label class="flex items-center gap-2 text-xs font-semibold cursor-pointer">
              <input type="radio" name="star" :value="0" :checked="selectedStar === 0" @change="selectedStar = 0" class="accent-trip-blue" />
              <span>전체 등급</span>
            </label>
          </div>
        </div>

        <div class="border-t border-slate-100 pt-5">
          <h3 class="font-bold text-sm text-slate-900 mb-2">1박 요금 상한선</h3>
          <div class="text-xs font-bold text-trip-blue mb-2">{{ currencyStore.formatKRW(maxPrice) }} 이하</div>
          <input v-model="maxPrice" type="range" min="100000" max="1000000" step="50000" class="w-full accent-trip-blue" />
        </div>

        <div class="border-t border-slate-100 pt-5 space-y-2">
          <h3 class="font-bold text-sm text-slate-900 mb-3">인기 혜택 필터</h3>
          <label class="flex items-center gap-2 text-xs font-semibold cursor-pointer">
            <input v-model="freeCancel" type="checkbox" class="rounded accent-trip-blue" />
            <span>무료 취소 가능</span>
          </label>
          <label class="flex items-center gap-2 text-xs font-semibold cursor-pointer">
            <input v-model="breakfast" type="checkbox" class="rounded accent-trip-blue" />
            <span>조식 포함</span>
          </label>
        </div>
      </aside>

      <!-- 호텔 리스트 영역 -->
      <div :class="[mapView ? 'lg:col-span-2' : 'lg:col-span-3', 'space-y-4']">
        <div v-if="loading" class="p-16 text-center text-slate-400 font-bold">호텔 목록 검색 중...</div>

        <div v-else-if="hotels.length === 0" class="bg-white p-12 text-center rounded-2xl border border-slate-200">
          <div class="text-3xl mb-2">🏨</div>
          <h4 class="font-bold text-slate-700">조건에 맞는 호텔이 없습니다.</h4>
          <p class="text-xs text-slate-400 mt-1">필터를 초기화하거나 도시명을 다시 확인해주세요.</p>
        </div>

        <!-- 호텔 카드 -->
        <div
          v-for="h in hotels"
          :key="h.id"
          class="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm hover:shadow-lg transition flex flex-col md:flex-row gap-5"
        >
          <img :src="h.thumbnail_url" class="w-full md:w-64 h-48 rounded-xl object-cover flex-shrink-0" />

          <div class="flex-1 flex flex-col justify-between">
            <div>
              <div class="flex items-center gap-2 text-xs text-slate-400 font-semibold mb-1">
                <span>{{ h.city }}, {{ h.country }}</span>
                <span>•</span>
                <span class="text-amber-500 font-bold">★ {{ h.star_rating }}성급</span>
              </div>

              <h3 class="text-lg font-black text-slate-900 group-hover:text-trip-blue">
                {{ h.name_ko }}
              </h3>
              <p class="text-xs text-slate-400 font-medium mb-3">{{ h.name_en }}</p>

              <div class="flex items-center gap-2 mb-3">
                <span class="px-2 py-0.5 bg-trip-blue text-white text-xs font-black rounded-lg">
                  {{ h.review_score }}
                </span>
                <span class="text-xs text-slate-600 font-bold">아주 좋음</span>
                <span class="text-xs text-slate-400">({{ h.review_count }}개 이용 후기)</span>
              </div>

              <div class="flex gap-1.5 flex-wrap">
                <span v-for="tag in h.tags" :key="tag" class="px-2 py-0.5 bg-blue-50 text-trip-blue rounded text-[11px] font-bold">
                  {{ tag }}
                </span>
              </div>
            </div>

            <div class="flex items-end justify-between pt-4 border-t border-slate-100 mt-4">
              <div>
                <span class="text-[11px] text-emerald-600 font-bold">무료 취소 혜택 적용 가능</span>
              </div>
              <div class="text-right">
                <div class="text-[11px] text-slate-400">1박 최저</div>
                <div class="text-2xl font-black text-trip-blue">
                  {{ currencyStore.formatKRW(h.rooms?.[0]?.base_price_krw || 350000) }}
                </div>
                <NuxtLink
                  :to="`/hotels/${h.id}`"
                  class="mt-1 inline-block px-5 py-2 bg-trip-blue hover:bg-trip-hover text-white text-xs font-bold rounded-xl transition shadow-md shadow-blue-500/20"
                >
                  객실 선택하기 →
                </NuxtLink>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 지도 뷰 분할 패널 -->
      <div v-if="mapView" class="hidden lg:block lg:col-span-1 bg-slate-200 rounded-2xl overflow-hidden border border-slate-300 relative">
        <div class="absolute inset-0 flex flex-col items-center justify-center p-6 text-center text-slate-600">
          <div class="text-4xl mb-2">📍</div>
          <div class="font-bold text-sm">인터랙티브 호텔 지도 (Map View)</div>
          <div class="text-xs text-slate-400 mt-1">호텔 {{ hotels.length }}개 위치 핀 표시 활성화됨</div>
        </div>
      </div>
    </div>
  </div>
</template>
