<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useCurrencyStore } from '~/stores/currency'
import { useApiUrl } from '~/composables/useApi'

const currencyStore = useCurrencyStore()
const activities = ref<any[]>([])
const loading = ref(false)

onMounted(async () => {
  loading.value = true
  try {
    const res = await fetch(useApiUrl('/activities'))
    const json = await res.json()
    activities.value = json.data || []
  } catch (e) {
    console.error(e)
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="max-w-6xl mx-auto px-4 py-8 space-y-6">
    <div>
      <h1 class="text-3xl font-black text-slate-900 tracking-tight">투어 & 명소 티켓 & 5G eSIM</h1>
      <p class="text-sm text-slate-500 mt-1">도쿄 디즈니랜드, USJ 입장권, 일일 투어 및 즉시 개통되는 글로벌 eSIM</p>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div v-for="a in activities" :key="a.id" class="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-xl transition group">
        <div class="h-44 relative">
          <img :src="a.thumbnail_url" class="w-full h-full object-cover group-hover:scale-105 transition duration-500" />
          <span class="absolute top-3 left-3 bg-trip-navy/80 backdrop-blur-md text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
            {{ a.category }}
          </span>
          <span class="absolute bottom-3 right-3 bg-trip-blue text-white text-[11px] font-black px-2 py-0.5 rounded-lg">
            ★ {{ a.review_score }}
          </span>
        </div>

        <div class="p-5 space-y-3">
          <div class="text-[11px] text-slate-400 font-semibold">{{ a.city }}, {{ a.country }}</div>
          <h3 class="font-black text-slate-900 text-sm line-clamp-2 group-hover:text-trip-blue transition">
            {{ a.title }}
          </h3>
          <p class="text-xs text-slate-500 line-clamp-2 leading-relaxed">{{ a.description }}</p>

          <div class="pt-3 border-t border-slate-100 flex items-center justify-between">
            <span class="text-xs text-emerald-600 font-bold">✓ 전자 바우처 즉시 발급</span>
            <div class="text-right">
              <div class="text-xl font-black text-trip-blue">{{ currencyStore.formatKRW(a.price_krw) }}</div>
            </div>
          </div>

          <NuxtLink :to="`/hotels/booking?activityId=${a.id}`" class="w-full py-2.5 bg-trip-blue hover:bg-trip-hover text-white text-xs font-bold rounded-xl block text-center shadow-md">
            바우처 구매하기
          </NuxtLink>
        </div>
      </div>
    </div>
  </div>
</template>
