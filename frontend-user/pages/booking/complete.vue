<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import { useCurrencyStore } from '~/stores/currency'
import { useApiUrl } from '~/composables/useApi'

const route = useRoute()
const currencyStore = useCurrencyStore()

const bookingId = ref((route.query.bookingId as string) || (route.query.orderId as string) || `GFT-20261018-${Math.floor(1000 + Math.random() * 9000)}`)
const domainType = ref((route.query.domain as string) || 'HOTEL')
const paidAmount = ref(Number(route.query.amount) || 320000)
const primaryContact = ref((route.query.contact as string) || '김여행 (010-****-5678)')
const title = ref((route.query.title as string) || '신라호텔 서울 (The Shilla Seoul) - 디럭스 더블룸')
const schedule = ref((route.query.schedule as string) || '2026년 11월 01일 ~ 2026년 11월 03일 (2박 3일)')
const voucherCode = ref((route.query.voucher as string) || `VCHR-${Math.random().toString(36).substring(2, 8).toUpperCase()}`)
const paymentMethod = ref((route.query.paymentMethod as string) || '제휴사 연동 즉시 확정 / 신용카드')
const status = ref('CONFIRMED')
const isCopied = ref(false)

onMounted(async () => {
  if (route.query.bookingId) {
    try {
      const url = useApiUrl(`/bookings/${route.query.bookingId}`)
      const res = await $fetch<any>(url)
      if (res && res.booking) {
        title.value = res.booking.title || title.value
        paidAmount.value = res.booking.total_price || paidAmount.value
        voucherCode.value = res.booking.voucher_code || voucherCode.value
        status.value = res.booking.status || status.value
        primaryContact.value = res.booking.customer_name || primaryContact.value
      }
    } catch (e) {
      // Fallback to query parameters
    }
  }
})

const copyVoucher = async () => {
  try {
    await navigator.clipboard.writeText(voucherCode.value)
    isCopied.value = true
    setTimeout(() => {
      isCopied.value = false
    }, 2000)
  } catch (e) {}
}

const printVoucher = () => {
  window.print()
}
</script>

<template>
  <div class="max-w-4xl mx-auto px-4 py-8 md:py-12 space-y-6">
    <!-- 1. 헤더 알림 배너 -->
    <div class="bg-emerald-50 border border-emerald-200 rounded-3xl p-6 sm:p-8 text-center space-y-3 shadow-sm">
      <div class="w-16 h-16 bg-emerald-500 text-white rounded-full flex items-center justify-center mx-auto text-3xl shadow-lg shadow-emerald-500/30">
        ✓
      </div>
      <h1 class="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
        여행 예약 및 바우처 발급 완료!
      </h1>
      <p class="text-xs sm:text-sm text-slate-600 max-w-lg mx-auto">
        고객님의 예약이 정상 확정되었습니다. 제휴 공급사 및 현장 체크인 시 제시 가능한 공식 e-바우처가 발급되었습니다.
      </p>
      <div class="inline-flex items-center gap-2 px-4 py-1.5 bg-emerald-100/70 text-emerald-800 rounded-full text-xs font-bold font-mono">
        <span>예약번호: {{ bookingId }}</span>
      </div>
    </div>

    <!-- 2. 전자 바우처 카드 (QR 포함) -->
    <div class="bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden print:border-none print:shadow-none">
      <div class="bg-slate-900 text-white p-6 sm:p-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span class="text-xs font-bold text-blue-400 tracking-wider uppercase block mb-1">Official E-Voucher</span>
          <h2 class="text-xl sm:text-2xl font-black">{{ title }}</h2>
          <p class="text-xs text-slate-400 mt-1">{{ schedule }}</p>
        </div>

        <div class="flex items-center gap-4 bg-slate-800/80 p-3 rounded-2xl border border-slate-700/60 self-start md:self-auto">
          <!-- QR Code (SVG) -->
          <svg class="w-16 h-16 bg-white p-1 rounded-xl shadow-inner" viewBox="0 0 100 100">
            <rect x="0" y="0" width="100" height="100" fill="white" />
            <rect x="10" y="10" width="25" height="25" fill="#0F172A" />
            <rect x="15" y="15" width="15" height="15" fill="white" />
            <rect x="18" y="18" width="9" height="9" fill="#0F172A" />
            <rect x="65" y="10" width="25" height="25" fill="#0F172A" />
            <rect x="70" y="15" width="15" height="15" fill="white" />
            <rect x="73" y="18" width="9" height="9" fill="#0F172A" />
            <rect x="10" y="65" width="25" height="25" fill="#0F172A" />
            <rect x="15" y="70" width="15" height="15" fill="white" />
            <rect x="18" y="73" width="9" height="9" fill="#0F172A" />
            <circle cx="50" cy="50" r="8" fill="#1A6BFF" />
          </svg>

          <div class="text-left">
            <span class="text-[10px] text-slate-400 font-bold block">바우처 코드</span>
            <span class="font-mono font-black text-sm text-amber-400 tracking-wider">{{ voucherCode }}</span>
            <button @click="copyVoucher" class="block text-[11px] text-blue-400 hover:underline mt-0.5 font-bold">
              {{ isCopied ? '복사됨!' : '코드 복사' }}
            </button>
          </div>
        </div>
      </div>

      <!-- 바우처 상세 테이블 -->
      <div class="p-6 sm:p-8 space-y-6 text-xs">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div class="space-y-3">
            <div>
              <span class="text-slate-400 font-bold block mb-0.5">예약자명</span>
              <div class="text-sm font-black text-slate-900">{{ primaryContact }}</div>
            </div>
            <div>
              <span class="text-slate-400 font-bold block mb-0.5">확정 상태</span>
              <span class="inline-block px-2.5 py-1 bg-emerald-50 text-emerald-700 font-bold rounded-lg border border-emerald-200">
                ● 확정 완료 (CONFIRMED)
              </span>
            </div>
            <div>
              <span class="text-slate-400 font-bold block mb-0.5">결제 및 결제 방식</span>
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
            <div class="flex justify-between text-emerald-600 font-bold">
              <span>getforTrip 특가 프로모션 적용</span>
              <span>-{{ currencyStore.formatKRW(15000) }}</span>
            </div>
            <div class="flex justify-between items-baseline pt-3 border-t border-slate-200 text-sm">
              <span class="font-black text-slate-900">최종 승인 금액</span>
              <span class="text-xl font-black text-blue-600 font-mono">
                {{ currencyStore.formatKRW(paidAmount) }}
              </span>
            </div>
          </div>
        </div>

        <!-- 인쇄 버튼 & 안내 -->
        <div class="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-slate-100">
          <p class="text-[11px] text-slate-500">
            * 스마트폰 화면의 QR 코드 또는 인쇄된 바우처를 호텔 프런트 또는 탑승 게이트에 제시하세요.
          </p>
          <button
            @click="printVoucher"
            class="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <span>🖨️</span>
            <span>바우처 인쇄 / PDF 저장</span>
          </button>
        </div>
      </div>
    </div>

    <!-- 3. 하단 CTA 버튼 -->
    <div class="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
      <NuxtLink
        to="/my/bookings"
        class="w-full sm:w-auto px-8 py-3.5 bg-trip-blue hover:bg-blue-600 text-white font-black text-sm rounded-2xl shadow-lg shadow-blue-500/25 transition text-center cursor-pointer"
      >
        내 예약 및 바우처 보관함 확인 →
      </NuxtLink>
      <NuxtLink
        to="/"
        class="w-full sm:w-auto px-8 py-3.5 bg-white hover:bg-slate-50 text-slate-700 font-bold text-sm rounded-2xl border border-slate-200 shadow-sm transition text-center cursor-pointer"
      >
        홈으로 돌아가기
      </NuxtLink>
    </div>
  </div>
</template>
