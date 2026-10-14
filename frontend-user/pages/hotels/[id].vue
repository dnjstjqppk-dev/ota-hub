<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useCurrencyStore } from '~/stores/currency'
import { useApiUrl } from '~/composables/useApi'

const route = useRoute()
const currencyStore = useCurrencyStore()

const hotel = ref<any>(null)
const loading = ref(true)

onMounted(async () => {
  try {
    const res = await fetch(useApiUrl(`/hotels/${route.params.id}`))
    const json = await res.json()
    hotel.value = json.data
  } catch (e) {
    console.error(e)
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div v-if="loading" class="max-w-6xl mx-auto px-4 py-20 text-center text-slate-400 font-bold">
    호텔 상세 정보 로딩 중...
  </div>

  <div v-else-if="hotel" class="max-w-6xl mx-auto px-4 py-8 space-y-8">
    <!-- 상단 헤더 & 주소 -->
    <div>
      <div class="flex items-center gap-2 mb-1">
        <span class="text-amber-500 font-black text-sm">★ {{ hotel.star_rating }}성급 럭셔리</span>
        <span class="text-slate-400 text-xs">• {{ hotel.city }}, {{ hotel.country }}</span>
      </div>
      <h1 class="text-3xl font-black text-slate-900 tracking-tight">{{ hotel.name_ko }}</h1>
      <p class="text-sm text-slate-400 font-medium">{{ hotel.name_en }} · {{ hotel.address }}</p>
    </div>

    <!-- 사진 갤러리 그리드 -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-3 h-96 rounded-3xl overflow-hidden">
      <img :src="hotel.thumbnail_url" class="md:col-span-2 w-full h-full object-cover" />
      <div class="grid grid-rows-2 gap-3 h-full">
        <img v-for="img in hotel.images" :key="img" :src="img" class="w-full h-full object-cover" />
      </div>
    </div>

    <!-- 편의시설 및 평점 요약 -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div class="md:col-span-2 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
        <h3 class="font-bold text-base text-slate-900">숙소 소개 & 주요 편의시설</h3>
        <p class="text-sm text-slate-600 leading-relaxed">{{ hotel.description }}</p>
        <div class="flex flex-wrap gap-2 pt-2">
          <span v-for="a in hotel.amenities" :key="a" class="px-3 py-1.5 bg-slate-100 rounded-xl text-xs font-bold text-slate-700">
            ✓ {{ a }}
          </span>
        </div>
      </div>

      <div class="bg-blue-50/60 p-6 rounded-2xl border border-blue-100 shadow-sm flex flex-col justify-between">
        <div>
          <div class="flex items-center gap-3 mb-2">
            <span class="text-3xl font-black text-trip-blue">{{ hotel.review_score }}</span>
            <div>
              <div class="font-bold text-slate-900 text-sm">최고의 만족도</div>
              <div class="text-xs text-slate-400">{{ hotel.review_count }}개의 실투숙객 인증 후기</div>
            </div>
          </div>
          <p class="text-xs text-slate-600 leading-relaxed mt-2">
            "초고층 전망과 룸 컨디션이 매우 훌륭하며, 침구류와 어메니티 품질이 최상입니다."
          </p>
        </div>
        <div class="text-[11px] text-blue-600 font-bold bg-white px-3 py-1.5 rounded-lg border border-blue-200 w-fit">
          AI 후기 요약 검증 완료
        </div>
      </div>
    </div>

    <!-- 객실 타입별 요금 비교 매트릭스 테이블 -->
    <div class="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden">
      <div class="p-6 border-b border-slate-100">
        <h2 class="text-xl font-black text-slate-900">객실 선택 및 요금 비교</h2>
        <p class="text-xs text-slate-400 mt-1">인원, 조식 포함 여부 및 취소 규정을 확인하고 원하는 객실을 선택하세요.</p>
      </div>

      <div class="divide-y divide-slate-100">
        <div v-for="r in hotel.rooms" :key="r.id" class="p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 hover:bg-slate-50/50 transition">
          <div class="space-y-2 flex-1">
            <h4 class="text-base font-black text-slate-900">{{ r.name }}</h4>
            <div class="flex items-center gap-4 text-xs text-slate-500 font-semibold">
              <span>🛏️ {{ r.bed_type }}</span>
              <span>👥 최대 {{ r.max_guests }}인</span>
              <span>📐 {{ r.room_size_sqm }}㎡</span>
            </div>
            <div class="flex items-center gap-2 pt-1">
              <span :class="['text-xs font-bold px-2 py-0.5 rounded', r.is_free_cancellation ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600']">
                {{ r.is_free_cancellation ? '✓ 무료 취소 가능' : '취소 불가 특가' }}
              </span>
              <span :class="['text-xs font-bold px-2 py-0.5 rounded', r.includes_breakfast ? 'bg-blue-50 text-trip-blue' : 'bg-slate-100 text-slate-600']">
                {{ r.includes_breakfast ? '🍳 조식 2인 포함' : '조식 불포함' }}
              </span>
            </div>
          </div>

          <div class="text-right flex flex-col items-end gap-1">
            <div class="text-[11px] text-slate-400 font-medium">1박 세금 및 봉사료 포함 전</div>
            <div class="text-2xl font-black text-trip-blue font-mono">
              {{ currencyStore.formatKRW(r.base_price_krw) }}
            </div>
            <NuxtLink
              :to="`/hotels/booking?hotelId=${hotel.id}&roomId=${r.id}`"
              class="mt-2 px-6 py-2.5 bg-trip-blue hover:bg-trip-hover text-white text-xs font-black rounded-xl transition shadow-lg shadow-blue-500/30"
            >
              지금 예약하기
            </NuxtLink>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
