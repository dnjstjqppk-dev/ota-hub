<script setup lang="ts">
import { ref } from 'vue'

const couponInput = ref('')

const coupons = ref([
  {
    code: 'WELCOME-HOTEL-10',
    title: '전 세계 5성급 호텔 10% 즉시 할인 쿠폰',
    discount: '10% OFF',
    validUntil: '2026.11.30까지',
    condition: '최대 100,000원 할인 · 최소 주문 금액 200,000원'
  },
  {
    code: 'AIR-INTL-20K',
    title: '국제선 항공권 20,000원 즉시 할인권',
    discount: '₩20,000',
    validUntil: '2026.11.15까지',
    condition: '대한항공/아시아나/외항사 전 노선 적용 가능'
  },
  {
    code: 'RENT-SUPER-CDW',
    title: '국내/해외 렌터카 슈퍼자차(완전자차) 무료 업그레이드권',
    discount: '무료 업그레이드',
    validUntil: '2026.12.31까지',
    condition: '제주/일본/동남아 전 지역 렌터카 대상'
  },
  {
    code: 'VIP-TRANSFER-15',
    title: '공항 픽업 & 샌딩 VIP 리무진 15% 우대 쿠폰',
    discount: '15% OFF',
    validUntil: '2026.12.15까지',
    condition: '인천/간사이/나리타/수완나품 전 공항 적용'
  }
])

const registerCoupon = () => {
  if (!couponInput.value.trim()) return
  coupons.value.unshift({
    code: couponInput.value.trim().toUpperCase(),
    title: '프로모션 전용 특별 할인권',
    discount: '₩10,000',
    validUntil: '2026.12.31까지',
    condition: '전 카테고리 적용 가능'
  })
  couponInput.value = ''
  alert('쿠폰이 성공적으로 등록되었습니다.')
}
</script>

<template>
  <div class="max-w-4xl mx-auto px-4 py-8 space-y-6">
    <div class="flex items-center gap-3 border-b border-slate-200 pb-4">
      <NuxtLink to="/my" class="text-xs font-bold text-slate-400 hover:text-slate-600">‹ 마이 콘솔</NuxtLink>
      <h1 class="text-xl font-black text-slate-900">내 보유 쿠폰함 ({{ coupons.length }}장)</h1>
    </div>

    <!-- 쿠폰 등록 바 -->
    <div class="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-sm flex items-center gap-3">
      <input
        v-model="couponInput"
        type="text"
        placeholder="쿠폰 코드를 입력하세요 (예: SPECIAL2026)"
        class="flex-1 px-4 py-2.5 text-xs font-mono font-bold uppercase border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
      />
      <button
        @click="registerCoupon"
        class="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-sm transition whitespace-nowrap"
      >
        쿠폰 등록
      </button>
    </div>

    <!-- 쿠폰 그리드 -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div
        v-for="c in coupons"
        :key="c.code"
        class="bg-white rounded-3xl p-5 border-2 border-dashed border-blue-200 shadow-sm flex items-start justify-between gap-4"
      >
        <div class="space-y-1.5">
          <div class="flex items-center gap-2">
            <span class="px-2 py-0.5 rounded bg-blue-50 text-blue-600 font-mono font-bold text-xs">{{ c.code }}</span>
            <span class="text-[11px] text-slate-400">{{ c.validUntil }}</span>
          </div>
          <h3 class="text-sm font-black text-slate-900">{{ c.title }}</h3>
          <p class="text-xs text-slate-500 leading-relaxed">{{ c.condition }}</p>
        </div>
        <div class="text-right flex-shrink-0">
          <span class="text-lg font-black text-trip-orange font-mono">{{ c.discount }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

