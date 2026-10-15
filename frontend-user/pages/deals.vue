<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useApiUrl } from '~/composables/useApi'

const DEFAULT_PROMOTIONS = [
  {
    id: 'promo_welcome',
    code: 'WELCOME2026',
    title: '신규 회원 첫 예약 10% 웰컴 특별 할인',
    discount_type: 'PERCENTAGE',
    discount_value: 10,
    min_order_amount_krw: 100000,
    max_discount_krw: 30000,
    valid_until: '2026-12-31T23:59:59Z'
  },
  {
    id: 'promo_hotel50',
    code: 'HOTEL50000',
    title: '5성급 럭셔리 호텔 ₩50,000 즉시 할인',
    discount_type: 'FIXED_AMOUNT',
    discount_value: 50000,
    min_order_amount_krw: 300000,
    max_discount_krw: 50000,
    valid_until: '2026-12-31T23:59:59Z'
  },
  {
    id: 'promo_flight20',
    code: 'FLIGHT20000',
    title: '전 세계 국제선 항공권 ₩20,000 안심 할인',
    discount_type: 'FIXED_AMOUNT',
    discount_value: 20000,
    min_order_amount_krw: 200000,
    max_discount_krw: 20000,
    valid_until: '2026-12-31T23:59:59Z'
  },
  {
    id: 'promo_global10',
    code: 'GLOBAL10',
    title: '동적 패키지 / 렌터카 / 공항픽업 10% 메가 할인',
    discount_type: 'PERCENTAGE',
    discount_value: 10,
    min_order_amount_krw: 80000,
    max_discount_krw: 40000,
    valid_until: '2026-12-31T23:59:59Z'
  }
]

const promotions = ref<any[]>(DEFAULT_PROMOTIONS)

onMounted(async () => {
  try {
    const res = await fetch(useApiUrl('/promotions'))
    if (res.ok) {
      const json = await res.json()
      if (json.data && json.data.length > 0) {
        promotions.value = json.data
      }
    }
  } catch (e) {
    // Keep DEFAULT_PROMOTIONS
  }
})
</script>

<template>
  <div class="max-w-6xl mx-auto px-4 py-8 space-y-6">
    <div class="bg-gradient-to-r from-orange-500 to-amber-500 rounded-3xl p-8 text-white space-y-2 shadow-xl">
      <span class="px-3 py-1 bg-black/20 rounded-full text-xs font-black uppercase tracking-wider">
        🎁 getfortrip 글로벌 프로모션 센터
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
