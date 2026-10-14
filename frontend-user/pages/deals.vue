<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useApiUrl } from '~/composables/useApi'

const promotions = ref<any[]>([])

onMounted(async () => {
  try {
    const res = await fetch(useApiUrl('/promotions'))
    const json = await res.json()
    promotions.value = json.data || []
  } catch (e) {
    console.error(e)
  }
})
</script>

<template>
  <div class="max-w-6xl mx-auto px-4 py-8 space-y-6">
    <div class="bg-gradient-to-r from-orange-500 to-amber-500 rounded-3xl p-8 text-white space-y-2 shadow-xl">
      <span class="px-3 py-1 bg-black/20 rounded-full text-xs font-black uppercase tracking-wider">
        🎁 트립닷컴 글로벌 프로모션 센터
      </span>
      <h1 class="text-3xl font-black">진행 중인 모든 할인 쿠폰을 다운로드하세요!</h1>
      <p class="text-xs text-orange-100 font-medium">결제 시 쿠폰 코드를 입력하면 즉시 할인이 적용됩니다.</p>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div v-for="p in promotions" :key="p.id" class="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm flex justify-between items-center">
        <div class="space-y-1">
          <span class="px-2.5 py-0.5 bg-orange-50 text-orange-600 rounded-full text-[11px] font-bold">
            {{ p.discount_type }}
          </span>
          <h3 class="font-black text-slate-900 text-lg">{{ p.title }}</h3>
          <p class="text-xs text-slate-500">
            최소 주문금액 ₩{{ p.min_order_amount_krw.toLocaleString() }} · 최대 ₩{{ p.max_discount_krw.toLocaleString() }} 할인
          </p>
          <div class="text-[11px] font-mono text-slate-400">
            유효기간: ~ {{ new Date(p.valid_until).toLocaleDateString() }}
          </div>
        </div>

        <div class="text-center space-y-2">
          <div class="px-4 py-2 bg-slate-100 border border-dashed border-slate-300 rounded-xl font-mono font-bold text-trip-blue text-sm">
            {{ p.code }}
          </div>
          <button @click="alert(`쿠폰 코드 [${p.code}]가 복사되었습니다.`)" class="text-xs text-slate-500 hover:text-trip-blue font-bold">
            코드 복사
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
