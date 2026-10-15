<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useCurrencyStore } from '~/stores/currency'
import { useApiUrl } from '~/composables/useApi'
import SearchAutocomplete from '~/components/SearchAutocomplete.vue'

const router = useRouter()
const currencyStore = useCurrencyStore()

const city = ref('도쿄')
const checkIn = ref('2026-11-01')
const checkOut = ref('2026-11-03')
const guests = ref({ adults: 2, rooms: 1 })
const selectedQuickFilter = ref<string>('ALL')

const DEFAULT_FEATURED_HOTELS = [
  {
    id: 'htl_tokyo_01',
    name: '그랜드 하얏트 도쿄 롯폰기 힐스',
    city: '도쿄',
    neighborhood: '롯폰기 힐스 쇼핑가',
    description: '도쿄 타워 전망과 최고급 스파, 롯폰기역 지하 직결 프리미엄 5성급 럭셔리 호텔',
    price_krw: 385000,
    rating: 4.9,
    star_rating: 5,
    image_url: 'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=800',
    free_cancellation: true,
    free_breakfast: true
  },
  {
    id: 'htl_seoul_01',
    name: '시그니엘 서울 롯데월드타워',
    city: '서울',
    neighborhood: '잠실 롯데월드몰',
    description: '국내 최고층 롯데월드타워 76-101층에서 즐기는 환상적인 서울 파노라마 스카이뷰',
    price_krw: 520000,
    rating: 4.9,
    star_rating: 5,
    image_url: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800',
    free_cancellation: true,
    free_breakfast: true
  },
  {
    id: 'htl_osaka_01',
    name: '스위소텔 난카이 오사카',
    city: '오사카',
    neighborhood: '난바역 직결 / 도톤보리 도보 5분',
    description: '간사이 공항 라피트 직결 난바역 바로 위, 도톤보리 쇼핑과 미식을 완벽히 누리는 특급 호텔',
    price_krw: 275000,
    rating: 4.8,
    star_rating: 5,
    image_url: 'https://images.unsplash.com/photo-1590559899731-a372a146979d?w=800',
    free_cancellation: true,
    free_breakfast: false
  }
]

const featuredHotels = ref<any[]>(DEFAULT_FEATURED_HOTELS)
const loading = ref(false)

const handleSearch = () => {
  router.push({
    path: '/hotels/list',
    query: {
      city: city.value,
      checkIn: checkIn.value,
      checkOut: checkOut.value,
      adults: guests.value.adults,
      rooms: guests.value.rooms,
      filter: selectedQuickFilter.value !== 'ALL' ? selectedQuickFilter.value : undefined
    }
  })
}

const quickFilters = [
  { id: 'ALL', label: '전체 보기', icon: '✨' },
  { id: 'LUXURY_5STAR', label: '5성급 럭셔리', icon: '👑' },
  { id: 'FREE_BREAKFAST', label: '무료 조식', icon: '🍳' },
  { id: 'SWIMMING_POOL', label: '수영장/인피니티풀', icon: '🏊' },
  { id: 'FREE_CANCEL', label: '무료 취소 가능', icon: '🛡️' },
  { id: 'TOP_RATED', label: '평점 4.8+ 우수', icon: '⭐' }
]

const popularDestinations = [
  { name: '도쿄', en: 'Tokyo', count: '2,480개 숙소', img: 'https://images.unsplash.com/photo-1503899036084-c55cdd92da26?w=600' },
  { name: '오사카', en: 'Osaka', count: '1,850개 숙소', img: 'https://images.unsplash.com/photo-1590559899731-a372a146979d?w=600' },
  { name: '서울', en: 'Seoul', count: '1,320개 숙소', img: 'https://images.unsplash.com/photo-1534274988757-a28bf1a57c17?w=600' },
  { name: '방콕', en: 'Bangkok', count: '2,100개 숙소', img: 'https://images.unsplash.com/photo-1508009603885-50cf7c579365?w=600' },
  { name: '후쿠오카', en: 'Fukuoka', count: '760개 숙소', img: 'https://images.unsplash.com/photo-1570077188670-e3a8d69ac5ff?w=600' },
  { name: '파리', en: 'Paris', count: '1,450개 숙소', img: 'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=600' }
]

onMounted(async () => {
  try {
    const res = await fetch(useApiUrl('/hotels'))
    if (res.ok) {
      const json = await res.json()
      if (json.data && json.data.length > 0) {
        featuredHotels.value = json.data.map((h: any) => ({
          id: h.id,
          name: h.name_ko || h.name,
          city: h.city,
          neighborhood: h.neighborhood || '도심 중심가',
          description: h.description || `${h.city} 중심에 위치한 최고 평점 인기 호텔`,
          price_krw: h.rooms?.[0]?.base_price_krw || h.price_krw || 300000,
          rating: h.review_score || h.rating || 4.8,
          star_rating: h.star_rating || 5,
          image_url: h.thumbnail_url || h.image_url || 'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=800',
          free_cancellation: h.free_cancellation ?? true,
          free_breakfast: h.free_breakfast ?? true
        }))
      }
    }
  } catch (e) {
    // Keep DEFAULT_FEATURED_HOTELS
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="space-y-12 pb-16">
    <!-- 히어로 배너 & 호텔 검색 바 -->
    <div class="relative bg-gradient-to-r from-blue-900 via-trip-navy to-indigo-950 text-white pt-12 pb-24 px-4 overflow-hidden">
      <div class="absolute -top-32 -right-32 w-80 h-80 bg-trip-blue/30 rounded-full blur-3xl pointer-events-none"></div>

      <div class="max-w-6xl mx-auto space-y-6 relative z-10">
        <div class="space-y-2">
          <span class="inline-block px-3 py-1 bg-white/10 backdrop-blur-md rounded-full text-xs font-bold text-blue-200 border border-white/20">
            🏨 전 세계 200만+ 개 호텔 최저가 보장
          </span>
          <h1 class="text-3xl md:text-5xl font-black tracking-tight">
            완벽한 여행의 시작, getfortrip 호텔
          </h1>
          <p class="text-sm md:text-base text-blue-100 font-medium">
            전 세계 특급 호텔부터 감성 료칸, 리조트까지 실시간 최저가 비교 & 즉시 확정
          </p>
        </div>

        <!-- 호텔 전용 검색 카드 -->
        <div class="bg-white rounded-3xl p-6 shadow-2xl text-slate-800 border border-slate-100 space-y-4">
          <div class="grid grid-cols-1 md:grid-cols-12 gap-4">
            <!-- 여행지/호텔명 자동완성 -->
            <div class="md:col-span-5 space-y-1">
              <label class="text-xs font-bold text-slate-400">목적지 / 호텔명</label>
              <SearchAutocomplete
                v-model="city"
                type="hotels"
                placeholder="도시명, 지역 또는 호텔명을 입력하세요"
              />
            </div>

            <!-- 체크인/체크아웃 -->
            <div class="md:col-span-4 space-y-1">
              <label class="text-xs font-bold text-slate-400">체크인 — 체크아웃</label>
              <div class="grid grid-cols-2 gap-2">
                <input
                  v-model="checkIn"
                  type="date"
                  class="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-trip-blue"
                />
                <input
                  v-model="checkOut"
                  type="date"
                  class="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-trip-blue"
                />
              </div>
            </div>

            <!-- 투숙객 / 객실 -->
            <div class="md:col-span-3 space-y-1">
              <label class="text-xs font-bold text-slate-400">인원 및 객실</label>
              <div class="flex items-center gap-2">
                <div class="flex-1 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 flex items-center justify-between">
                  <span>성인 {{ guests.adults }}명, 객실 {{ guests.rooms }}개</span>
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

          <!-- 테마별 퀵 필터 칩 -->
          <div class="pt-3 border-t border-slate-100 flex items-center gap-2 overflow-x-auto no-scrollbar">
            <span class="text-xs font-bold text-slate-400 whitespace-nowrap">테마 필터:</span>
            <button
              v-for="qf in quickFilters"
              :key="qf.id"
              @click="selectedQuickFilter = qf.id"
              :class="[
                'px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition flex items-center gap-1.5',
                selectedQuickFilter === qf.id
                  ? 'bg-blue-50 text-trip-blue border border-blue-200 shadow-sm'
                  : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'
              ]"
            >
              <span>{{ qf.icon }}</span>
              <span>{{ qf.label }}</span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 인기 여행지 그리드 -->
    <div class="max-w-6xl mx-auto px-4 space-y-6">
      <div class="flex items-end justify-between">
        <div>
          <h2 class="text-2xl font-black text-trip-navy tracking-tight">인기 호텔 여행지</h2>
          <p class="text-xs text-slate-500 mt-1">한국 여행자가 가장 많이 찾는 인기 도시 호텔</p>
        </div>
      </div>

      <div class="grid grid-cols-2 md:grid-cols-6 gap-4">
        <NuxtLink
          v-for="d in popularDestinations"
          :key="d.name"
          :to="`/hotels/list?city=${d.name}`"
          class="group relative h-56 rounded-2xl overflow-hidden shadow-md"
        >
          <img :src="d.img" class="w-full h-full object-cover group-hover:scale-110 transition duration-500" />
          <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent flex flex-col justify-end p-3.5 text-white">
            <span class="text-base font-black">{{ d.name }}</span>
            <span class="text-[11px] text-slate-300 font-mono">{{ d.en }}</span>
            <span class="text-[10px] text-emerald-300 font-bold mt-1">{{ d.count }}</span>
          </div>
        </NuxtLink>
      </div>
    </div>

    <!-- getfortrip 추천 인기 호텔 컬렉션 -->
    <div class="max-w-6xl mx-auto px-4 space-y-6">
      <div class="flex items-end justify-between">
        <div>
          <div class="flex items-center gap-2">
            <span class="px-2 py-0.5 bg-blue-100 text-trip-blue rounded text-[11px] font-black">TOP PICKS</span>
            <h2 class="text-2xl font-black text-trip-navy tracking-tight">getfortrip 추천 호텔</h2>
          </div>
          <p class="text-xs text-slate-500 mt-1">고객 평점 4.5 이상 & 위치 만족도 최우수 호텔</p>
        </div>
        <NuxtLink to="/hotels/list" class="text-xs font-bold text-trip-blue hover:underline">
          호텔 전체 보기 →
        </NuxtLink>
      </div>

      <div v-if="loading" class="p-16 text-center text-slate-400 font-bold">호텔 목록 불러오는 중...</div>

      <div v-else class="grid grid-cols-1 md:grid-cols-3 gap-6">
        <NuxtLink
          v-for="h in featuredHotels"
          :key="h.id"
          :to="`/hotels/detail/${h.id}`"
          class="group bg-white rounded-3xl border border-slate-200/80 overflow-hidden shadow-sm hover:shadow-xl transition flex flex-col"
        >
          <div class="relative h-52 overflow-hidden bg-slate-100">
            <img :src="h.image_url" class="w-full h-full object-cover group-hover:scale-105 transition duration-500" />
            <div class="absolute top-3 left-3 flex gap-1.5">
              <span class="px-2 py-1 bg-black/60 backdrop-blur-md text-white text-[10px] font-black rounded-lg">
                {{ h.star_rating }}성급
              </span>
              <span v-if="h.free_cancellation" class="px-2 py-1 bg-emerald-500/90 text-white text-[10px] font-black rounded-lg">
                무료 취소
              </span>
            </div>
            <div class="absolute bottom-3 right-3 bg-trip-blue text-white px-2.5 py-1 rounded-xl text-xs font-black shadow-lg flex items-center gap-1">
              <span>⭐</span>
              <span>{{ h.rating?.toFixed(1) || '4.8' }}</span>
            </div>
          </div>

          <div class="p-5 flex-1 flex flex-col justify-between space-y-4">
            <div>
              <span class="text-[11px] font-bold text-slate-400">{{ h.city }} · {{ h.neighborhood || '도심 중심가' }}</span>
              <h3 class="text-base font-black text-slate-900 group-hover:text-trip-blue transition line-clamp-1">
                {{ h.name }}
              </h3>
              <p class="text-xs text-slate-500 mt-1 line-clamp-2">{{ h.description }}</p>
            </div>

            <div class="pt-3 border-t border-slate-100 flex items-end justify-between">
              <div class="text-[11px] text-slate-400">
                <span>1박 최저가</span>
                <div v-if="h.free_breakfast" class="text-emerald-600 font-bold text-[10px]">🍳 조식 포함 플랜 있음</div>
              </div>
              <div class="text-right">
                <div class="text-2xl font-black text-trip-blue font-mono">
                  {{ currencyStore.formatKRW(h.price_krw) }}
                </div>
                <div class="text-[10px] text-slate-400">세금 및 봉사료 포함</div>
              </div>
            </div>
          </div>
        </NuxtLink>
      </div>
    </div>

    <!-- 안심 예약 보장 배너 -->
    <div class="max-w-6xl mx-auto px-4">
      <div class="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-3xl p-8 grid grid-cols-1 md:grid-cols-3 gap-6">
        <div class="flex items-start gap-4">
          <div class="w-12 h-12 rounded-2xl bg-white shadow-sm border border-blue-100 flex items-center justify-center text-2xl flex-shrink-0">
            🏷️
          </div>
          <div>
            <h4 class="font-black text-slate-900 text-sm">최저가 보장제</h4>
            <p class="text-xs text-slate-500 mt-1">동일 조건 더 저렴한 가격 발견 시 차액 100% 보상</p>
          </div>
        </div>

        <div class="flex items-start gap-4">
          <div class="w-12 h-12 rounded-2xl bg-white shadow-sm border border-blue-100 flex items-center justify-center text-2xl flex-shrink-0">
            ⚡
          </div>
          <div>
            <h4 class="font-black text-slate-900 text-sm">즉시 확정 & 무제한 지원</h4>
            <p class="text-xs text-slate-500 mt-1">대기 없는 실시간 예약 확정 및 체크인 즉시 보증</p>
          </div>
        </div>

        <div class="flex items-start gap-4">
          <div class="w-12 h-12 rounded-2xl bg-white shadow-sm border border-blue-100 flex items-center justify-center text-2xl flex-shrink-0">
            💬
          </div>
          <div>
            <h4 class="font-black text-slate-900 text-sm">24/7 한국어 고객센터</h4>
            <p class="text-xs text-slate-500 mt-1">해외에서도 연중무휴 24시간 실시간 고객 상담 지원</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
