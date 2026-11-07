<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useCurrencyStore } from '~/stores/currency'
import { apiFetch } from '~/composables/useApi'

useHead({
  title: '평점 높은 호텔 랭킹',
  meta: [{ name: 'description', content: '리뷰 평점 기준으로 정렬한 getfortrip 인기 호텔 랭킹' }]
})

const currencyStore = useCurrencyStore()
const hotels = ref<any[]>([])
const state = ref<'loading' | 'ready' | 'error'>('loading')

function lowestPrice(h: any): number | null {
  if (typeof h.base_price_krw === 'number' && h.base_price_krw > 0) return h.base_price_krw
  const rooms = Array.isArray(h.rooms) ? h.rooms : []
  for (const r of rooms) {
    if (typeof r?.base_price_krw === 'number' && r.base_price_krw > 0) return r.base_price_krw
  }
  return null
}

const fetchBest = async () => {
  state.value = 'loading'
  const r = await apiFetch('/hotels?sortBy=score_desc&limit=10')
  if (r.ok && Array.isArray((r.data as any).data)) {
    hotels.value = (r.data as any).data
    state.value = 'ready'
  } else {
    state.value = 'error'
  }
}

onMounted(() => {
  fetchBest()
})
</script>

<template>
  <div class="max-w-6xl mx-auto px-4 py-8 space-y-8">
    <div class="bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 rounded-3xl p-8 text-white space-y-2 shadow-xl">
      <span class="inline-flex items-center gap-1.5 px-3 py-1 bg-black/20 rounded-full text-xs font-black uppercase tracking-wider">
        <AppIcon name="trophy" :size="14" /> getfortrip Hotel Ranking
      </span>
      <h1 class="text-3xl font-black">리뷰 평점 높은 순 호텔 랭킹</h1>
      <p class="text-xs text-amber-100 font-medium">리뷰 평점과 리뷰 수를 기준으로 정렬한 인기 숙소 목록입니다.</p>
    </div>

    <ResultsState
      :state="state"
      :count="hotels.length"
      icon="trophy"
      empty-title="랭킹에 표시할 호텔이 없어요"
      empty-hint="카탈로그에 호텔이 등록되면 이곳에 표시됩니다."
      error-title="랭킹을 불러오지 못했어요"
      @retry="fetchBest"
    >
      <div class="space-y-4">
        <div v-for="(h, idx) in hotels" :key="h.id" class="bg-white rounded-3xl border border-slate-200 p-6 flex flex-col md:flex-row items-center justify-between gap-6 shadow-sm hover:shadow-xl transition">
          <div class="flex items-center gap-6">
            <div :class="['w-12 h-12 rounded-2xl flex items-center justify-center font-black text-xl text-white shadow-md shrink-0', idx === 0 ? 'bg-amber-500' : idx === 1 ? 'bg-slate-400' : 'bg-amber-700']">
              {{ idx + 1 }}
            </div>
            <SmartImg :src="h.thumbnail_url" class="w-28 h-20 rounded-2xl object-cover" :alt="h.name_ko" />
            <div>
              <div class="text-xs text-slate-400 font-semibold">{{ h.city }}, {{ h.country }}</div>
              <h3 class="text-lg font-black text-slate-900">{{ h.name_ko }}</h3>
              <div class="flex items-center gap-2 mt-1">
                <span v-if="h.review_score != null" class="px-2 py-0.5 bg-trip-blue text-white rounded text-[11px] font-bold">{{ h.review_score }}점</span>
                <span v-else class="px-2 py-0.5 bg-slate-200 text-slate-600 rounded text-[11px] font-bold">리뷰 없음</span>
                <span class="text-xs text-slate-500 font-medium">({{ Number(h.review_count || 0).toLocaleString() }}개 리뷰)</span>
              </div>
            </div>
          </div>

          <div class="text-right flex items-center gap-4">
            <div>
              <div class="text-xs text-slate-400">1박 최저가</div>
              <div class="text-2xl font-black text-trip-blue">{{ lowestPrice(h) == null ? '-' : currencyStore.formatKRW(lowestPrice(h)!) }}</div>
            </div>
            <NuxtLink :to="`/hotels/detail/${h.id}`" class="px-5 py-2.5 bg-trip-blue text-white text-xs font-bold rounded-xl shadow-md">
              상세 보기
            </NuxtLink>
          </div>
        </div>
      </div>
    </ResultsState>
  </div>
</template>
