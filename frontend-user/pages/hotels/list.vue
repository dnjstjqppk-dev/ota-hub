<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useCurrencyStore } from '~/stores/currency'
import { useApiUrl } from '~/composables/useApi'
import SearchAutocomplete from '~/components/SearchAutocomplete.vue'

const route = useRoute()
const currencyStore = useCurrencyStore()

const city = ref(route.query.city as string || '')
const selectedStar = ref(0)
const selectedScore = ref(0)
const selectedPropertyType = ref('ALL')
const maxPrice = ref(1000000)
const freeCancel = ref(false)
const breakfast = ref(false)
const sortBy = ref<'recommended' | 'price_asc' | 'score_desc'>('recommended')
const mapView = ref(false)

const fallbackHotels = [
  {
    id: 'htl_tokyo_01',
    name_ko: '그랜드 하얏트 도쿄 롯폰기 힐스',
    name_en: 'Grand Hyatt Tokyo Roppongi Hills',
    city: '도쿄',
    country: '일본',
    address: '도쿄도 미나토구 롯폰기 6-10-3',
    star_rating: 5,
    review_score: 4.9,
    review_count: 2180,
    neighborhood: '롯폰기 힐스 쇼핑가',
    subway_nearby: '지하철 롯폰기역 도보 3분',
    property_type: 'HOTEL',
    free_cancellation: true,
    free_breakfast: true,
    thumbnail_url: 'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=800',
    rooms: [
      { id: 'rm_01', name: '디럭스 킹 룸 (시티뷰)', base_price_krw: 385000, free_cancellation: true, breakfast_included: true }
    ]
  },
  {
    id: 'htl_seoul_01',
    name_ko: '시그니엘 서울 롯데월드타워',
    name_en: 'Signiel Seoul Lotte World Tower',
    city: '서울',
    country: '대한민국',
    address: '서울특별시 송파구 올림픽로 300',
    star_rating: 5,
    review_score: 4.9,
    review_count: 3450,
    neighborhood: '잠실 롯데월드몰',
    subway_nearby: '잠실역 도보 1분',
    property_type: 'HOTEL',
    free_cancellation: true,
    free_breakfast: true,
    thumbnail_url: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800',
    rooms: [
      { id: 'rm_02', name: '그랜드 디럭스 더블룸', base_price_krw: 550000, free_cancellation: true, breakfast_included: true }
    ]
  },
  {
    id: 'htl_osaka_01',
    name_ko: '스위소텔 난카이 오사카',
    name_en: 'Swissotel Nankai Osaka',
    city: '오사카',
    country: '일본',
    address: '오사카부 오사카시 주오구 난바 5-1-60',
    star_rating: 5,
    review_score: 4.8,
    review_count: 1890,
    neighborhood: '도톤보리 / 난바역 직결',
    subway_nearby: '난카이 난바역 직결',
    property_type: 'HOTEL',
    free_cancellation: true,
    free_breakfast: false,
    thumbnail_url: 'https://images.unsplash.com/photo-1590559899731-a372a146979d?w=800',
    rooms: [
      { id: 'rm_03', name: '스위스 셀렉트 킹룸', base_price_krw: 275000, free_cancellation: true, breakfast_included: false }
    ]
  }
]

const hotels = ref<any[]>(fallbackHotels)
const loading = ref(false)

const fetchHotels = async () => {
  try {
    const params = new URLSearchParams()
    if (city.value) params.append('city', city.value)
    if (selectedStar.value > 0) params.append('star', String(selectedStar.value))
    if (maxPrice.value < 1000000) params.append('maxPrice', String(maxPrice.value))
    if (freeCancel.value) params.append('freeCancel', 'true')
    if (breakfast.value) params.append('breakfast', 'true')

    const res = await fetch(`${useApiUrl('/hotels')}?${params.toString()}`)
    const json = await res.json()
    let data: any[] = json.data || []

    // Client-side faceted filter
    if (selectedScore.value > 0) {
      data = data.filter(h => h.review_score >= selectedScore.value)
    }
    if (selectedPropertyType.value !== 'ALL') {
      data = data.filter(h => (h.property_type || 'HOTEL') === selectedPropertyType.value)
    }

    // Client-side sorting
    if (sortBy.value === 'price_asc') {
      data.sort((a, b) => {
        const pa = a.rooms?.[0]?.base_price_krw || 9999999
        const pb = b.rooms?.[0]?.base_price_krw || 9999999
        return pa - pb
      })
    } else if (sortBy.value === 'score_desc') {
      data.sort((a, b) => b.review_score - a.review_score)
    }

    if (data.length > 0) {
      hotels.value = data
    } else {
      hotels.value = fallbackHotels
    }
  } catch (e) {
    console.error(e)
    hotels.value = fallbackHotels
  } finally {
    loading.value = false
  }
}

watch([city, selectedStar, selectedScore, selectedPropertyType, maxPrice, freeCancel, breakfast, sortBy], () => {
  fetchHotels()
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

    <!-- 메인 레이아웃: 필터 사이드바 + 호텔 목록 -->
    <div class="grid grid-cols-1 lg:grid-cols-4 gap-6">
      <!-- 12개 다중 조건 필터 사이드바 (Trip-style) -->
      <aside class="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm h-fit space-y-6">
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
    </div>
  </div>
</template>
