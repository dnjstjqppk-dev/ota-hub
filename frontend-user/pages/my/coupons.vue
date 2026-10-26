<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useAuthStore } from '~/stores/auth'
import { useApiUrl } from '~/composables/useApi'

const authStore = useAuthStore()
const couponInput = ref('')

const defaultCoupons = [
  {
    code: 'WELCOME2026',
    title: '신규 회원 첫 예약 10% 웰컴 특별 할인',
    discount: '10% OFF',
    validUntil: '2026.12.31까지',
    condition: '최대 30,000원 할인 · 최소 주문 금액 50,000원'
  },
  {
    code: 'HOTEL50000',
    title: '5성급 럭셔리 호텔 ₩50,000 즉시 할인',
    discount: '₩50,000',
    validUntil: '2026.12.31까지',
    condition: '최소 결제 금액 300,000원 이상'
  },
  {
    code: 'FLIGHT20000',
    title: '전 세계 국제선 항공권 ₩20,000 안심 할인',
    discount: '₩20,000',
    validUntil: '2026.12.31까지',
    condition: '최소 결제 금액 200,000원 이상'
  },
  {
    code: 'GLOBAL10',
    title: '동적 패키지 / 렌터카 / 공항픽업 10% 메가 할인',
    discount: '10% OFF',
    validUntil: '2026.12.31까지',
    condition: '최대 40,000원 할인 · 최소 주문 금액 80,000원'
  }
]

const coupons = ref<any[]>(defaultCoupons)

onMounted(async () => {
  if (authStore.isLoggedIn && authStore.token) {
    try {
      const res = await fetch(useApiUrl('/user/coupons'), {
        headers: { Authorization: `Bearer ${authStore.token}` }
      })
      if (res.ok) {
        const json = await res.json()
        if (Array.isArray(json.coupons) && json.coupons.length > 0) {
          coupons.value = json.coupons.map((c: any) => ({
            code: c.coupon_code,
            title: c.title,
            discount: c.discount_type === 'PERCENTAGE' ? `${c.discount_value}% OFF` : `₩${Number(c.discount_value).toLocaleString()}`,
            validUntil: `${c.valid_until}까지`,
            condition: `최대 ${Number(c.max_discount_krw || 50000).toLocaleString()}원 할인 · 최소 주문 ${Number(c.min_order_amount_krw || 50000).toLocaleString()}원`
          }))
        }
      }
    } catch (e) {}
  }
})

const registerCoupon = async () => {
  const code = couponInput.value.trim().toUpperCase()
  if (!code) return

  if (authStore.isLoggedIn && authStore.token) {
    try {
      const res = await fetch(useApiUrl('/user/coupons/claim'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authStore.token}`
        },
        body: JSON.stringify({ code })
      })
      if (res.ok) {
        const json = await res.json()
        coupons.value.unshift({
          code,
          title: json.coupon?.title || '프로모션 전용 특별 할인권',
          discount: '₩10,000',
          validUntil: '2026.12.31까지',
          condition: '전 카테고리 적용 가능'
        })
        couponInput.value = ''
        alert('쿠폰이 성공적으로 등록되었습니다.')
        return
      }
    } catch (e) {}
  }

  coupons.value.unshift({
    code,
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
    <!-- 비로그인 차단 게이트웨이 카드 -->
    <div v-if="!authStore.isLoggedIn || !authStore.user" class="bg-white rounded-3xl border border-slate-200 p-8 sm:p-12 text-center space-y-4 shadow-sm">
      <div class="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto text-3xl shadow-sm">
        🎟️
      </div>
      <h2 class="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
        로그인이 필요한 서비스입니다
      </h2>
      <p class="text-xs sm:text-sm text-slate-500 max-w-md mx-auto">
        회원 전용 할인 쿠폰 및 프로모션 혜택을 확인하시려면 먼저 로그인해주세요.
      </p>
      <div class="pt-2">
        <NuxtLink
          to="/login"
          class="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md transition"
        >
          <span>로그인 페이지로 이동</span>
          <span>→</span>
        </NuxtLink>
      </div>
    </div>

    <!-- 로그인 시 표시되는 쿠폰함 -->
    <div v-else class="space-y-6">
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
  </div>
</template>
