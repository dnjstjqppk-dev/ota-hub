<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useCurrencyStore } from '~/stores/currency'
import { useApiUrl } from '~/composables/useApi'

const currencyStore = useCurrencyStore()
const trains = ref<any[]>([])
const loading = ref(false)

onMounted(async () => {
  loading.value = true
  try {
    const res = await fetch(useApiUrl('/trains'))
    const json = await res.json()
    trains.value = json.data || []
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
      <h1 class="text-3xl font-black text-slate-900 tracking-tight">글로벌 고속철도 (KTX / 신칸센 / 유로스타)</h1>
      <p class="text-sm text-slate-500 mt-1">한국 KTX, 일본 신칸센, 유럽 전 구간 실시간 좌석 확인 및 즉시 QR 발권</p>
    </div>

    <div class="space-y-4">
      <div v-for="tr in trains" :key="tr.id" class="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-6">
        <div class="flex items-center gap-8">
          <div>
            <span class="px-2 py-0.5 bg-blue-50 text-blue-600 rounded text-xs font-bold">{{ tr.train_type }}</span>
            <div class="font-black text-slate-900 text-sm mt-1">{{ tr.train_number }}</div>
          </div>

          <div class="flex items-center gap-6 text-center">
            <div>
              <div class="text-xl font-black text-slate-900 font-mono">{{ new Date(tr.departure_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}</div>
              <div class="text-xs text-slate-600 font-bold">{{ tr.departure_station }}</div>
            </div>
            <div class="text-xs text-slate-400">→ {{ tr.duration_minutes }}분 소요 →</div>
            <div>
              <div class="text-xl font-black text-slate-900 font-mono">{{ new Date(tr.arrival_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}</div>
              <div class="text-xs text-slate-600 font-bold">{{ tr.arrival_station }}</div>
            </div>
          </div>

          <div class="text-xs text-slate-500">
            <div>좌석 등급: <strong class="text-slate-800">{{ tr.seat_class }}</strong></div>
            <div class="text-emerald-600 font-bold">잔여 {{ tr.available_seats }}석</div>
          </div>
        </div>

        <div class="text-right flex items-center gap-4">
          <div class="text-2xl font-black text-trip-blue">
            {{ currencyStore.formatKRW(tr.price_krw) }}
          </div>
          <button class="px-6 py-2.5 bg-trip-blue text-white text-xs font-bold rounded-xl shadow-md">
            승차권 예매
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
