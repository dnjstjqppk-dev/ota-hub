<!-- frontend-user/pages/booking/complete.vue -->
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useCurrencyStore } from '~/stores/currency'
import { useAuthStore } from '~/stores/auth'
import { useApiUrl } from '~/composables/useApi'

const route = useRoute()
const currencyStore = useCurrencyStore()
const authStore = useAuthStore()

const bookingId = ref((route.query.bookingId as string) || (route.query.orderId as string) || '')
const domainType = ref((route.query.domain as string) || 'HOTEL')
const paidAmount = ref(Number(route.query.amount) || 320000)
const primaryContact = ref((route.query.contact as string) || '예약 고객')
const title = ref((route.query.title as string) || 'getfortrip 여행 예약 상품')
const schedule = ref((route.query.schedule as string) || '예약 일정 확인')
const voucherCode = ref<string | null>((route.query.voucher as string) || null)
const paymentMethod = ref((route.query.paymentMethod as string) || '제휴사 S2S 웹훅 검증 / 신용카드')
const status = ref((route.query.status as string) || 'PENDING_PAYMENT')
const isCopied = ref(false)

onMounted(async () => {
  if (route.query.bookingId) {
    try {
      const url = useApiUrl(`/bookings/${route.query.bookingId}`)
      const res = await $fetch<any>(url, {
        headers: authStore.token ? { Authorization: `Bearer ${authStore.token}` } : {}
      })
      const b = res?.booking || res?.data
      if (b) {
        title.value = b.title || title.value
        paidAmount.value = b.total_price || b.final_amount_krw || paidAmount.value
        voucherCode.value = b.voucher_code || b.confirmation_number || null
        status.value = b.status || 'PENDING_PAYMENT'
        primaryContact.value = b.customer_name || b.primary_contact_name || primaryContact.value
      }
    } catch (e) {
      // Keep query state without fabricating voucher code
    }
  }
})

const copyVoucher = async () => {
  if (!voucherCode.value) return
  try {
    await navigator.clipboard.writeText(voucherCode.value)
    isCopied.value = true
    setTimeout(() => {
      isCopied.value = false
    }, 2000)
  } catch (e) {}
}

const printVoucher = () => {
  if (typeof window !== 'undefined') window.print()
}
</script>

<template>
  <div class="max-w-4xl mx-auto px-4 py-8 md:py-12 space-y-6">
    <!-- 1. 헤더 상태 배너 (CONFIRMED vs PENDING_PAYMENT 엄격 분리) -->
    <div
      :class="[
        'rounded-3xl p-6 sm:p-8 text-center space-y-3 shadow-sm border',
        status === 'CONFIRMED' ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'
      ]"
    >
      <div
        :class="[
          'w-16 h-16 text-white rounded-full flex items-center justify-center mx-auto text-3xl shadow-lg',
          status === 'CONFIRMED' ? 'bg-emerald-500 shadow-emerald-500/30' : 'bg-amber-500 shadow-amber-500/30'
        ]"
      >
        {{ status === 'CONFIRMED' ? '✓' : '⏳' }}
      </div>
      <h1 class="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
        {{ status === 'CONFIRMED' ? '여행 예약 및 바우처 발급 완료!' : '예약 접수 완료 (결제 및 공급사 확정 대기 중)' }}
      </h1>
      <p class="text-xs sm:text-sm text-slate-600 max-w-lg mx-auto">
        <template v-if="status === 'CONFIRMED'">
          고객님의 예약이 정상 확정되었습니다. 제휴 공급사 및 현장 체크인 시 제시 가능한 공식 e-바우처가 발급되었습니다.
        </template>
        <template v-else>
          가예약(15분 재고 홀딩)이 생성되었습니다. PG 결제 승인 또는 제휴사 S2S 웹훅 확인 즉시 공식 바우처 코드가 발급됩니다.
        </template>
      </p>
      <div v-if="bookingId" class="inline-flex items-center gap-2 px-4 py-1.5 bg-white/80 text-slate-800 rounded-full text-xs font-bold font-mono border border-slate-200">
        <span>예약번호: {{ bookingId }}</span>
      </div>
    </div>

    <!-- 2. 전자 바우처 카드 -->
    <div class="bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden print:border-none print:shadow-none">
      <div class="bg-slate-900 text-white p-6 sm:p-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span class="text-xs font-bold text-blue-400 tracking-wider uppercase block mb-1">Official E-Voucher</span>
          <h2 class="text-xl sm:text-2xl font-black">{{ title }}</h2>
          <p class="text-xs text-slate-400 mt-1">{{ schedule }}</p>
        </div>

        <div v-if="status === 'CONFIRMED' && voucherCode" class="flex items-center gap-4 bg-slate-800/80 p-3 rounded-2xl border border-slate-700/60 self-start md:self-auto">
          <div class="text-left">
            <span class="text-[10px] text-slate-400 font-bold block">공식 바우처 코드</span>
            <span class="font-mono font-black text-sm text-amber-400 tracking-wider">{{ voucherCode }}</span>
            <button @click="copyVoucher" class="block text-[11px] text-blue-400 hover:underline mt-0.5 font-bold">
              {{ isCopied ? '복사됨!' : '코드 복사' }}
            </button>
          </div>
        </div>
        <div v-else class="bg-amber-500/20 border border-amber-400/40 text-amber-300 px-4 py-2.5 rounded-2xl text-xs font-bold">
          🔒 미결제 상태 — 바우처는 결제 확정 후 발급됩니다
        </div>
      </div>

      <div class="p-6 sm:p-8 space-y-6 text-xs">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div class="space-y-3">
            <div>
              <span class="text-slate-400 font-bold block mb-0.5">예약자명</span>
              <div class="text-sm font-black text-slate-900">{{ primaryContact }}</div>
            </div>
            <div>
              <span class="text-slate-400 font-bold block mb-0.5">예약 상태</span>
              <span
                :class="[
                  'inline-block px-2.5 py-1 font-bold rounded-lg border',
                  status === 'CONFIRMED'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-amber-50 text-amber-700 border-amber-200'
                ]"
              >
                ● {{ status === 'CONFIRMED' ? '확정 완료 (CONFIRMED)' : '결제 대기 중 (PENDING_PAYMENT)' }}
              </span>
            </div>
            <div>
              <span class="text-slate-400 font-bold block mb-0.5">결제 방식</span>
              <div class="font-bold text-slate-800">{{ paymentMethod }}</div>
            </div>
          </div>

          <div class="space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-100">
            <div class="flex justify-between">
              <span class="text-slate-500 font-medium">상품 공급가액</span>
              <span class="font-mono font-bold">{{ currencyStore.formatKRW(Math.round(paidAmount * 0.9)) }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-slate-500 font-medium">세금 및 봉사료</span>
              <span class="font-mono font-bold">{{ currencyStore.formatKRW(Math.round(paidAmount * 0.1)) }}</span>
            </div>
            <div class="flex justify-between items-baseline pt-3 border-t border-slate-200 text-sm">
              <span class="font-black text-slate-900">총 예약 금액</span>
              <span class="text-xl font-black text-blue-600 font-mono">
                {{ currencyStore.formatKRW(paidAmount) }}
              </span>
            </div>
          </div>
        </div>

        <div class="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-slate-100">
          <p class="text-[11px] text-slate-500">
            * 확정 완료된 바우처만 현장 프런트 및 게이트에서 유효합니다.
          </p>
          <button
            @click="printVoucher"
            class="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <span>🖨️</span>
            <span>확인서 인쇄 / PDF 저장</span>
          </button>
        </div>
      </div>
    </div>

    <div class="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
      <NuxtLink
        to="/my/bookings"
        class="w-full sm:w-auto px-8 py-3.5 bg-trip-blue hover:bg-blue-600 text-white font-black text-sm rounded-2xl shadow-lg shadow-blue-500/25 transition text-center"
      >
        내 예약 및 바우처 보관함 확인 →
      </NuxtLink>
      <NuxtLink
        to="/"
        class="w-full sm:w-auto px-8 py-3.5 bg-white hover:bg-slate-50 text-slate-700 font-bold text-sm rounded-2xl border border-slate-200 shadow-sm transition text-center"
      >
        홈으로 돌아가기
      </NuxtLink>
    </div>
  </div>
</template>
