<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { apiFetch } from '~/composables/useApi'

useHead({
  title: '진행 중인 할인 쿠폰',
  meta: [{ name: 'description', content: 'getfortrip 진행 중인 할인 쿠폰과 프로모션 코드 모음' }]
})

interface Promotion {
  id: string
  code: string
  title: string
  discount_type: string
  discount_value: number
  min_order_amount_krw: number
  max_discount_krw: number
  valid_until: string
}

const promotions = ref<Promotion[]>([])
const state = ref<'loading' | 'ready' | 'error'>('loading')
const copiedCode = ref<string | null>(null)

const copyCouponCode = async (code: string) => {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(code)
    }
    copiedCode.value = code
    setTimeout(() => {
      if (copiedCode.value === code) copiedCode.value = null
    }, 2000)
  } catch (e) {
    console.warn('Clipboard write failed', e)
  }
}

const fetchPromotions = async () => {
  state.value = 'loading'
  const r = await apiFetch('/promotions')
  if (r.ok && Array.isArray((r.data as any).promotions)) {
    promotions.value = (r.data as any).promotions
    state.value = 'ready'
  } else {
    state.value = 'error'
  }
}

onMounted(() => {
  fetchPromotions()
})
</script>

<template>
  <div class="max-w-6xl mx-auto px-4 py-8 space-y-6">
    <div class="bg-gradient-to-r from-orange-500 to-amber-500 rounded-3xl p-8 text-white space-y-2 shadow-xl">
      <span class="inline-flex items-center gap-1.5 px-3 py-1 bg-black/20 rounded-full text-xs font-black uppercase tracking-wider">
        <AppIcon name="gift" :size="14" /> getfortrip 글로벌 프로모션 센터
      </span>
      <h1 class="text-3xl font-black">진행 중인 모든 할인 쿠폰을 다운로드하세요!</h1>
      <p class="text-xs text-orange-100 font-medium">결제 시 쿠폰 코드를 입력하면 즉시 할인이 적용됩니다.</p>
    </div>

    <ResultsState
      :state="state"
      :count="promotions.length"
      icon="gift"
      empty-title="진행 중인 쿠폰이 없어요"
      empty-hint="새 프로모션이 등록되면 이곳에 표시됩니다."
      error-title="쿠폰을 불러오지 못했어요"
      @retry="fetchPromotions"
    >
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div v-for="p in promotions" :key="p.id" class="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm flex justify-between items-center gap-4">
          <div class="space-y-1">
            <span class="px-2.5 py-0.5 bg-orange-50 text-orange-600 rounded-full text-[11px] font-bold">
              {{ p.discount_type }}
            </span>
            <h3 class="font-black text-slate-900 text-lg">{{ p.title }}</h3>
            <p class="text-xs text-slate-500">
              최소 주문금액 ₩{{ Number(p.min_order_amount_krw || 0).toLocaleString() }} · 최대 ₩{{ Number(p.max_discount_krw || 0).toLocaleString() }} 할인
            </p>
            <div class="text-[11px] font-mono text-slate-400">
              유효기간: ~ {{ p.valid_until ? new Date(p.valid_until).toLocaleDateString() : '-' }}
            </div>
          </div>

          <div class="text-center space-y-2 shrink-0">
            <div class="px-4 py-2 bg-slate-100 border border-dashed border-slate-300 rounded-xl font-mono font-bold text-trip-blue text-sm">
              {{ p.code }}
            </div>
            <button type="button" @click="copyCouponCode(p.code)" class="text-xs text-slate-500 hover:text-trip-blue font-bold cursor-pointer">
              {{ copiedCode === p.code ? '✓ 복사완료' : '코드 복사' }}
            </button>
          </div>
        </div>
      </div>
    </ResultsState>
  </div>
</template>
