<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useCurrencyStore } from '~/stores/currency'
import { useApiUrl } from '~/composables/useApi'

const route = useRoute()
const currencyStore = useCurrencyStore()

const city = ref(route.query.city as string || '')
const selectedCategory = ref(route.query.category as string || 'ALL')
const freeCancelOnly = ref(false)
const instantOnly = ref(false)
const selectedDuration = ref('')
const selectedLanguage = ref('')
const maxPrice = ref(200000)
const sortBy = ref<'recommended' | 'price_asc' | 'rating_desc'>('recommended')

const activities = ref<any[]>([])
const loading = ref(false)

const categories = [
  { id: 'ALL', label: '전체 보기' },
  { id: 'THEME_PARK', label: '테마파크 / 놀이공원' },
  { id: 'TICKET', label: '명소 / 전망대 티켓' },
  { id: 'DAY_TOUR', label: '당일 버스 / 밴 투어' },
  { id: 'DOCENT_TOUR', label: '미술관 / 가이드 도슨트' },
  { id: 'PASS', label: '교통 패스' },
  { id: 'ESIM', label: '해외 유심 / eSIM' },
]

const fetchActivities = async () => {
  loading.value = true
  try {
    const params = new URLSearchParams()
    if (city.value) params.append('city', city.value)
    if (selectedCategory.value && selectedCategory.value !== 'ALL') {
      params.append('category', selectedCategory.value)
    }
    if (freeCancelOnly.value) params.append('freeCancel', 'true')
    if (instantOnly.value) params.append('instant', 'true')
    if (selectedDuration.value) params.append('duration', selectedDuration.value)
    if (maxPrice.value < 200000) params.append('maxPrice', String(maxPrice.value))

    const res = await fetch(`${useApiUrl('/activities')}?${params.toString()}`)
    const json = await res.json()
    let data: any[] = json.data || []

    // Client-side sorting
    if (sortBy.value === 'price_asc') {
      data.sort((a, b) => a.price_krw - b.price_krw)
    } else if (sortBy.value === 'rating_desc') {
      data.sort((a, b) => b.review_score - a.review_score)
    }

    activities.value = data
  } catch (e) {
    console.error(e)
    activities.value = []
  } finally {
    loading.value = false
  }
}

watch([city, selectedCategory, freeCancelOnly, instantOnly, selectedDuration, maxPrice, sortBy], () => {
  fetchActivities()
})

onMounted(() => {
  fetchActivities()
})
</script>

<template>
  <div class="max-w-7xl mx-auto px-4 py-8 space-y-6">
    <!-- 상단 타이틀 & 카테고리 탭 (Trip-style) -->
    <div>
      <div class="flex items-center gap-2 text-xs text-slate-400 mb-1">
        <span>홈</span> <span>›</span> <span class="text-slate-800 font-bold">투어 & 액티비티</span>
      </div>
      <h1 class="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">전 세계 투어 & 액티비티 & 입장권</h1>
      <p class="text-xs md:text-sm text-slate-500 mt-1">유니버설 스튜디오, 디즈니랜드, 박물관 도슨트 및 즉시 개통되는 글로벌 eSIM</p>
    </div>

    <!-- 가로 스크롤 카테고리 퀵 바 -->
    <div class="flex items-center gap-2 overflow-x-auto pb-2 border-b border-slate-200">
      <button
        v-for="cat in categories"
        :key="cat.id"
        @click="selectedCategory = cat.id"
        :class="[
          'px-4 py-2 rounded-full text-xs font-bold transition whitespace-nowrap',
          selectedCategory === cat.id
            ? 'bg-blue-600 text-white shadow-sm'
            : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
        ]"
      >
        {{ cat.label }}
      </button>
    </div>

    <!-- 메인 레이아웃: 좌측 패싯 필터 사이드바 + 우측 카드 리스트 -->
    <div class="grid grid-cols-1 lg:grid-cols-4 gap-6">
      <!-- 1. 패싯 필터 사이드바 (Trip-style 12개 다중 조건) -->
      <aside class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm h-fit space-y-6">
        <div class="flex items-center justify-between pb-3 border-b border-slate-100">
          <span class="font-black text-sm text-slate-900">상세 필터 검색</span>
          <button
            @click="selectedCategory = 'ALL'; freeCancelOnly = false; instantOnly = false; selectedDuration = ''; maxPrice = 200000"
            class="text-[11px] text-blue-600 font-bold hover:underline"
          >
            초기화
          </button>
        </div>

        <!-- 예약 & 확정 옵션 -->
        <div>
          <h4 class="font-bold text-xs text-slate-900 mb-2">예약 및 바우처 혜택</h4>
          <div class="space-y-2 text-xs">
            <label class="flex items-center gap-2 cursor-pointer font-medium text-slate-700">
              <input v-model="instantOnly" type="checkbox" class="w-4 h-4 rounded text-blue-600 focus:ring-blue-500" />
              <span>⚡ 즉시 확정 (모바일 QR 즉시 발권)</span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer font-medium text-slate-700">
              <input v-model="freeCancelOnly" type="checkbox" class="w-4 h-4 rounded text-blue-600 focus:ring-blue-500" />
              <span>✓ 무료 취소 가능</span>
            </label>
          </div>
        </div>

        <!-- 소요 시간 필터 -->
        <div>
          <h4 class="font-bold text-xs text-slate-900 mb-2">소요 시간</h4>
          <div class="space-y-2 text-xs">
            <label class="flex items-center gap-2 cursor-pointer font-medium text-slate-700">
              <input type="radio" v-model="selectedDuration" value="" name="dur" class="accent-blue-600" />
              <span>전체 소요시간</span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer font-medium text-slate-700">
              <input type="radio" v-model="selectedDuration" value="UNDER_2H" name="dur" class="accent-blue-600" />
              <span>2시간 미만 (전망대/간편 입장)</span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer font-medium text-slate-700">
              <input type="radio" v-model="selectedDuration" value="HALF_DAY" name="dur" class="accent-blue-600" />
              <span>반일 투어 (2~4시간)</span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer font-medium text-slate-700">
              <input type="radio" v-model="selectedDuration" value="FULL_DAY" name="dur" class="accent-blue-600" />
              <span>종일 투어 (테마파크/1일 투어)</span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer font-medium text-slate-700">
              <input type="radio" v-model="selectedDuration" value="MULTI_DAY" name="dur" class="accent-blue-600" />
              <span>다일권 / 유심 (3일 이상)</span>
            </label>
          </div>
        </div>

        <!-- 가격대 슬라이더 -->
        <div>
          <div class="flex justify-between items-center mb-1">
            <h4 class="font-bold text-xs text-slate-900">최대 가격</h4>
            <span class="font-mono text-xs font-bold text-blue-600">{{ currencyStore.formatKRW(maxPrice) }}</span>
          </div>
          <input
            v-model.number="maxPrice"
            type="range"
            min="5000"
            max="200000"
            step="5000"
            class="w-full accent-blue-600 cursor-pointer"
          />
        </div>

        <!-- 가이드 언어 -->
        <div>
          <h4 class="font-bold text-xs text-slate-900 mb-2">가이드 언어</h4>
          <div class="space-y-1 text-xs">
            <label class="flex items-center gap-2 cursor-pointer font-medium text-slate-700">
              <input type="checkbox" checked disabled class="rounded text-blue-600" />
              <span>🇰🇷 한국어 가이드 / 한국어 지원</span>
            </label>
          </div>
        </div>
      </aside>

      <!-- 2. 우측 상품 리스트 & 정렬 탭 -->
      <main class="lg:col-span-3 space-y-4">
        <!-- 정렬 탭 및 개수 표시 -->
        <div class="flex items-center justify-between bg-white p-4 rounded-2xl border border-slate-200 shadow-sm text-xs">
          <span class="text-slate-500 font-medium">
            총 <strong class="text-blue-600 font-bold">{{ activities.length }}</strong>개의 투어 & 티켓
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
              @click="sortBy = 'rating_desc'"
              :class="['px-3 py-1.5 rounded-lg font-bold transition', sortBy === 'rating_desc' ? 'bg-blue-50 text-blue-600' : 'text-slate-500 hover:bg-slate-50']"
            >
              평점 높은순
            </button>
          </div>
        </div>

        <!-- 로딩 -->
        <div v-if="loading" class="p-20 bg-white rounded-2xl border border-slate-200 text-center text-slate-400 font-bold">
          투어 및 티켓 데이터를 실시간 조회 중입니다...
        </div>

        <!-- 상품이 없을 때 -->
        <div v-else-if="activities.length === 0" class="p-20 bg-white rounded-2xl border border-slate-200 text-center text-slate-400">
          선택한 필터 조건에 부합하는 상품이 없습니다. 필터를 초기화해 보세요.
        </div>

        <!-- Trip-style 가로형 카드 리스트 -->
        <div v-else class="space-y-4">
          <div
            v-for="a in activities"
            :key="a.id"
            class="bg-white rounded-2xl border border-slate-200/90 overflow-hidden shadow-sm hover:shadow-lg transition flex flex-col md:flex-row group"
          >
            <!-- 썸네일 & 배지 -->
            <div class="md:w-64 h-48 md:h-auto relative flex-shrink-0 overflow-hidden">
              <img
                :src="a.thumbnail_url"
                :alt="a.title"
                class="w-full h-full object-cover group-hover:scale-105 transition duration-500"
              />
              <span class="absolute top-3 left-3 bg-slate-900/80 backdrop-blur-md text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                {{ a.category }}
              </span>
              <span v-if="a.free_cancellation" class="absolute bottom-3 left-3 bg-emerald-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-md shadow">
                무료 취소 가능
              </span>
            </div>

            <!-- 본문 정보 -->
            <div class="p-5 flex-1 flex flex-col justify-between space-y-3">
              <div>
                <div class="flex items-center justify-between text-[11px] text-slate-400 font-semibold mb-1">
                  <span>📍 {{ a.city }}, {{ a.country }}</span>
                  <span class="text-amber-500 font-bold">★ {{ a.review_score }} ({{ a.review_count?.toLocaleString() }} 후기)</span>
                </div>

                <NuxtLink :to="`/things-to-do/detail/${a.id}`">
                  <h3 class="font-black text-slate-900 text-base group-hover:text-blue-600 transition line-clamp-2">
                    {{ a.title }}
                  </h3>
                </NuxtLink>

                <p class="text-xs text-slate-500 mt-1.5 line-clamp-2 leading-relaxed">
                  {{ a.description }}
                </p>

                <!-- 핵심 특장점 태그 (Highlights) -->
                <div class="flex flex-wrap gap-1.5 mt-2.5">
                  <span
                    v-for="(h, idx) in a.highlights?.slice(0, 3)"
                    :key="idx"
                    class="px-2 py-0.5 bg-blue-50 text-blue-700 text-[10px] font-semibold rounded-md"
                  >
                    ✓ {{ h }}
                  </span>
                </div>
              </div>

              <!-- 하단 가격 & CTA -->
              <div class="pt-3 border-t border-slate-100 flex items-center justify-between">
                <div class="text-xs">
                  <span class="text-emerald-600 font-bold">⚡ 모바일 QR 즉시 발권</span>
                  <div class="text-[10px] text-slate-400">현장 대기 없이 빠른 입장</div>
                </div>

                <div class="flex items-center gap-3">
                  <div class="text-right">
                    <div class="text-[10px] text-slate-400">1인 기준 최저가</div>
                    <div class="text-xl font-black text-blue-600 font-mono">
                      {{ currencyStore.formatKRW(a.price_krw) }}
                    </div>
                  </div>

                  <NuxtLink
                    :to="`/things-to-do/detail/${a.id}`"
                    class="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md transition whitespace-nowrap"
                  >
                    상세보기 / 예약
                  </NuxtLink>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  </div>
</template>
