<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useCurrencyStore } from '~/stores/currency'
import { useApiUrl } from '~/composables/useApi'

const DEFAULT_BEST_HOTELS = [
  {
    id: 'htl_tokyo_01',
    name_ko: '그랜드 하얏트 도쿄 롯폰기 힐스',
    city: '도쿄',
    country: '일본',
    star_rating: 5,
    review_score: 4.9,
    review_count: 2180,
    thumbnail_url: 'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=800',
    rooms: [{ base_price_krw: 385000 }]
  },
  {
    id: 'htl_seoul_01',
    name_ko: '시그니엘 서울 롯데월드타워',
    city: '서울',
    country: '대한민국',
    star_rating: 5,
    review_score: 4.9,
    review_count: 3450,
    thumbnail_url: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800',
    rooms: [{ base_price_krw: 550000 }]
  },
  {
    id: 'htl_osaka_01',
    name_ko: '스위소텔 난카이 오사카',
    city: '오사카',
    country: '일본',
    star_rating: 5,
    review_score: 4.8,
    review_count: 1890,
    thumbnail_url: 'https://images.unsplash.com/photo-1590559899731-a372a146979d?w=800',
    rooms: [{ base_price_krw: 275000 }]
  },
  {
    id: 'htl_singapore_01',
    name_ko: '마리나 베이 샌즈 싱가포르',
    city: '싱가포르',
    country: '싱가포르',
    star_rating: 5,
    review_score: 4.9,
    review_count: 5120,
    thumbnail_url: 'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=800',
    rooms: [{ base_price_krw: 690000 }]
  }
]

const currencyStore = useCurrencyStore()
const hotels = ref<any[]>(DEFAULT_BEST_HOTELS)

onMounted(async () => {
  try {
    const res = await fetch(useApiUrl('/hotels'))
    if (res.ok) {
      const json = await res.json()
      if (json.data && json.data.length > 0) {
        hotels.value = json.data
      }
    }
  } catch (e) {
    // Keep DEFAULT_BEST_HOTELS
  }
})
</script>

<template>
  <div class="max-w-6xl mx-auto px-4 py-8 space-y-8">
    <div class="bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 rounded-3xl p-8 text-white space-y-2 shadow-xl">
      <span class="px-3 py-1 bg-black/20 rounded-full text-xs font-black uppercase tracking-wider">
        🏆 getfortrip Best 2026 연간 랭킹
      </span>
      <h1 class="text-3xl font-black">수백만 실제 여행자 리뷰 기반 최고의 호텔 랭킹</h1>
      <p class="text-xs text-amber-100 font-medium">검증된 평점, 룸 퀄리티 및 가성비를 종합 평가한 글로벌 어워드 수상 숙소</p>
    </div>

    <div class="space-y-4">
      <div v-for="(h, idx) in hotels" :key="h.id" class="bg-white rounded-3xl border border-slate-200 p-6 flex flex-col md:flex-row items-center justify-between gap-6 shadow-sm hover:shadow-xl transition">
        <div class="flex items-center gap-6">
          <div :class="['w-12 h-12 rounded-2xl flex items-center justify-center font-black text-xl text-white shadow-md', idx === 0 ? 'bg-amber-500' : idx === 1 ? 'bg-slate-400' : 'bg-amber-700']">
            {{ idx + 1 }}
          </div>
          <img :src="h.thumbnail_url" class="w-28 h-20 rounded-2xl object-cover" />
          <div>
            <div class="text-xs text-slate-400 font-semibold">{{ h.city }}, {{ h.country }}</div>
            <h3 class="text-lg font-black text-slate-900">{{ h.name_ko }}</h3>
            <div class="flex items-center gap-2 mt-1">
              <span class="px-2 py-0.5 bg-trip-blue text-white rounded text-[11px] font-bold">{{ h.review_score }}점</span>
              <span class="text-xs text-slate-500 font-medium">({{ h.review_count }}개 리뷰)</span>
            </div>
          </div>
        </div>

        <div class="text-right flex items-center gap-4">
          <div>
            <div class="text-xs text-slate-400">1박 최저가</div>
            <div class="text-2xl font-black text-trip-blue">{{ currencyStore.formatKRW(h.rooms?.[0]?.base_price_krw || 300000) }}</div>
          </div>
          <NuxtLink :to="`/hotels/detail/${h.id}`" class="px-5 py-2.5 bg-trip-blue text-white text-xs font-bold rounded-xl shadow-md">
            상세 보기
          </NuxtLink>
        </div>
      </div>
    </div>
  </div>
</template>
