<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useCurrencyStore } from '~/stores/currency'
import { useApiUrl } from '~/composables/useApi'

const currencyStore = useCurrencyStore()
const cars = ref<any[]>([])
const transfers = ref<any[]>([])

onMounted(async () => {
  try {
    const [carRes, tfRes] = await Promise.all([
      fetch(useApiUrl('/cars')),
      fetch(useApiUrl('/transfers'))
    ])
    const carJson = await carRes.json()
    const tfJson = await tfRes.json()
    cars.value = carJson.data || []
    transfers.value = tfJson.data || []
  } catch (e) {
    console.error(e)
  }
})
</script>

<template>
  <div class="max-w-6xl mx-auto px-4 py-8 space-y-10">
    <!-- 렌터카 섹션 -->
    <div class="space-y-6">
      <div>
        <h1 class="text-3xl font-black text-slate-900 tracking-tight">전 세계 렌터카 가격 비교</h1>
        <p class="text-sm text-slate-500 mt-1">제주, 도쿄, 파리 등 주요 공항 인수 및 완전자차 보험 옵션</p>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div v-for="c in cars" :key="c.id" class="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-lg transition">
          <img :src="c.image_url" class="w-full h-44 object-cover" />
          <div class="p-5 space-y-3">
            <div>
              <span class="text-xs font-bold text-slate-400">{{ c.company_name }}</span>
              <h3 class="font-black text-slate-900 text-base">{{ c.vehicle_model }}</h3>
            </div>
            <div class="flex items-center gap-3 text-xs text-slate-600">
              <span>👥 {{ c.seats }}인승</span>
              <span>⚙️ {{ c.transmission }}</span>
              <span class="text-emerald-600 font-bold">✓ 자차보험 포함</span>
            </div>
            <div class="pt-3 border-t border-slate-100 flex items-center justify-between">
              <div>
                <span class="text-[11px] text-slate-400">1일 대여료</span>
                <div class="text-xl font-black text-trip-blue">{{ currencyStore.formatKRW(c.daily_price_krw) }}</div>
              </div>
              <NuxtLink
                :to="`/cars/booking?carId=${c.id}`"
                class="px-4 py-2 bg-trip-blue hover:bg-blue-600 text-white text-xs font-bold rounded-xl shadow-md transition"
              >
                대여 예약
              </NuxtLink>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 공항 픽업/샌딩 섹션 -->
    <div class="space-y-6 border-t border-slate-200 pt-10">
      <div>
        <h2 class="text-2xl font-black text-slate-900 tracking-tight">공항 프라이빗 픽업 & 샌딩</h2>
        <p class="text-sm text-slate-500 mt-1">항공편명 연동 실시간 지연 추적 및 기사 피켓 미팅 서비스</p>
      </div>

      <div class="space-y-4">
        <div v-for="t in transfers" :key="t.id" class="bg-white p-6 rounded-2xl border border-slate-200 flex flex-col md:flex-row items-center justify-between gap-6 shadow-sm">
          <div class="space-y-1">
            <span class="px-2 py-0.5 bg-blue-50 text-trip-blue text-xs font-bold rounded">{{ t.vehicle_class }}</span>
            <h4 class="font-bold text-slate-900 text-base">{{ t.service_title }}</h4>
            <div class="text-xs text-slate-500">최대 승객 {{ t.max_passengers }}인 · 수하물 {{ t.max_luggage }}개 · 항공편 지연 무료 대기</div>
          </div>
          <div class="text-right flex items-center gap-4">
            <div class="text-2xl font-black text-trip-blue">{{ currencyStore.formatKRW(t.price_krw) }}</div>
            <NuxtLink
              to="/transfers"
              class="px-5 py-2.5 bg-trip-blue hover:bg-blue-600 text-white text-xs font-bold rounded-xl shadow-md transition"
            >
              픽업 예약
            </NuxtLink>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
