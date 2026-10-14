<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useCurrencyStore } from '~/stores/currency'
import { useApiUrl } from '~/composables/useApi'

const currencyStore = useCurrencyStore()
const packages = ref<any[]>([])

onMounted(async () => {
  try {
    const res = await fetch(useApiUrl('/packages'))
    const json = await res.json()
    packages.value = json.data || []
  } catch (e) {
    console.error(e)
  }
})
</script>

<template>
  <div class="max-w-6xl mx-auto px-4 py-8 space-y-8">
    <div class="bg-gradient-to-r from-blue-700 to-indigo-800 rounded-3xl p-8 text-white space-y-2 shadow-xl">
      <span class="px-3 py-1 bg-white/20 rounded-full text-xs font-bold uppercase tracking-wider">
        🏖️ 다이내믹 패키지 (Flight + Hotel)
      </span>
      <h1 class="text-3xl font-black">항공권과 호텔을 묶어 최대 20% 결합 할인!</h1>
      <p class="text-xs text-blue-100 font-medium">따로 예약할 필요 없이 왕복 항공편과 최고급 호텔을 한 번에 결합 결제하세요.</p>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
      <div v-for="pkg in packages" :key="pkg.id" class="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-xl transition">
        <div class="h-56 relative">
          <img :src="pkg.thumbnail_url" class="w-full h-full object-cover" />
          <span class="absolute top-4 right-4 bg-rose-600 text-white text-xs font-black px-3 py-1.5 rounded-full shadow-lg">
            {{ pkg.package_discount_rate }}% 결합 특별 할인
          </span>
        </div>

        <div class="p-6 space-y-4">
          <h3 class="font-black text-slate-900 text-lg">{{ pkg.title }}</h3>

          <div class="space-y-2 text-xs text-slate-600 bg-slate-50 p-4 rounded-2xl border border-slate-100">
            <div class="flex items-center gap-2">
              <span>✈️</span>
              <span><strong>항공:</strong> {{ pkg.flight?.airline_name }} ({{ pkg.flight?.departure_city }} ↔ {{ pkg.flight?.arrival_city }})</span>
            </div>
            <div class="flex items-center gap-2">
              <span>🏨</span>
              <span><strong>숙소:</strong> {{ pkg.hotel?.name_ko }} ({{ pkg.hotel?.city }})</span>
            </div>
          </div>

          <div class="pt-2 border-t border-slate-100 flex items-center justify-between">
            <div>
              <div class="text-xs text-slate-400 line-through">
                {{ currencyStore.formatKRW(pkg.total_original_krw) }}
              </div>
              <div class="text-2xl font-black text-trip-blue">
                {{ currencyStore.formatKRW(pkg.total_package_krw) }}
              </div>
            </div>

            <NuxtLink :to="`/hotels/booking?packageId=${pkg.id}`" class="px-6 py-3 bg-trip-blue hover:bg-trip-hover text-white text-xs font-black rounded-xl shadow-md">
              패키지 일괄 예약
            </NuxtLink>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
