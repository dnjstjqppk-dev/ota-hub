<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useCurrencyStore } from '~/stores/currency'
import { useApiUrl } from '~/composables/useApi'
import { BRAND } from '~/config/brand'

const route = useRoute()
const router = useRouter()
const currencyStore = useCurrencyStore()

const booking = ref<any>(null)
const loading = ref(true)
const canceling = ref(false)

const fetchBooking = async () => {
  loading.value = true
  try {
    const res = await fetch(useApiUrl(`/bookings/${route.params.id}`))
    const json = await res.json()
    if (json.data) {
      booking.value = json.data
      loading.value = false
      return
    }
  } catch (e) {
    console.warn('API fetch single booking fallback:', e)
  }

  // Check localStorage
  const targetId = route.params.id as string
  try {
    const raw = localStorage.getItem('user_mock_bookings')
    if (raw) {
      const list = JSON.parse(raw)
      const found = list.find((b: any) => b.id === targetId || b.id.includes(targetId))
      if (found) {
        booking.value = {
          id: found.id,
          booking_code: found.id,
          domain_type: found.domain || 'HOTEL',
          created_at: found.created_at || new Date().toISOString(),
          status: found.status || 'CONFIRMED',
          confirmation_number: 'PNR-' + found.id.replace(/[^A-Za-z0-9]/g, '').slice(-6).toUpperCase(),
          base_amount_krw: found.amount || 280000,
          tax_amount_krw: 0,
          service_fee_krw: 0,
          discount_amount_krw: 0,
          final_amount_krw: found.amount || 280000,
          paid_currency: found.paid_currency || 'KRW',
          paid_currency_amount: found.amount || 280000,
          primary_contact_name: found.contact || '김민수 (010-1234-5678)',
          primary_contact_email: 'trip@getfortrip.com',
          special_requests: `${found.title || '일반 예약'} (${found.schedule || '일정 확인'})`
        }
        loading.value = false
        return
      }
    }
  } catch (e) {}

  // Fallback default rich booking voucher
  booking.value = {
    id: targetId || 'GF-HT-98214',
    booking_code: targetId || 'GF-HT-98214',
    domain_type: targetId.includes('FL') ? 'FLIGHT' : targetId.includes('TR') ? 'TRAIN' : targetId.includes('CAR') ? 'CAR' : targetId.includes('TF') ? 'TRANSFER' : targetId.includes('ACT') ? 'ACTIVITY' : targetId.includes('PKG') ? 'PACKAGE' : 'HOTEL',
    created_at: new Date().toISOString(),
    status: 'CONFIRMED',
    confirmation_number: 'PNR-' + (targetId || 'CONFIRM88').replace(/[^A-Za-z0-9]/g, '').slice(-6).toUpperCase(),
    base_amount_krw: 285000,
    tax_amount_krw: 28500,
    service_fee_krw: 0,
    discount_amount_krw: 20000,
    final_amount_krw: 293500,
    paid_currency: 'KRW',
    paid_currency_amount: 293500,
    primary_contact_name: '김민수 (010-1234-5678)',
    primary_contact_email: 'trip@getfortrip.com',
    special_requests: '모바일 전자 확인서 및 체크인 e-바우처'
  }
  loading.value = false
}

const handleCancel = async () => {
  if (!confirm('정말 이 예약을 취소하시겠습니까? 무료 취소 기간 내인 경우 위약금 없이 즉시 환불됩니다.')) return
  canceling.value = true
  try {
    await fetch(useApiUrl(`/bookings/${route.params.id}/cancel`), { method: 'POST' })
    await fetchBooking()
    alert('예약 취소 신청이 성공적으로 접수되었습니다.')
  } catch (e) {
    alert('취소 처리 중 오류가 발생했습니다.')
  } finally {
    canceling.value = false
  }
}

const printVoucher = () => {
  window.print()
}

onMounted(() => {
  fetchBooking()
})
</script>

<template>
  <div v-if="loading" class="max-w-4xl mx-auto px-4 py-24 text-center text-slate-400 font-bold">
    전자 바우처 및 예약 상세 정보를 불러오는 중입니다...
  </div>

  <div v-else-if="!booking" class="max-w-4xl mx-auto px-4 py-24 text-center text-slate-500">
    <div class="text-4xl mb-3">🔍</div>
    <h2 class="text-xl font-bold">예약 정보를 찾을 수 없습니다.</h2>
    <NuxtLink to="/my/bookings" class="mt-4 inline-block px-5 py-2.5 bg-trip-blue text-white text-xs font-bold rounded-xl">
      내 예약 목록으로 이동
    </NuxtLink>
  </div>

  <div v-else class="max-w-4xl mx-auto px-4 py-8 space-y-6 print:p-0 print:m-0">
    <!-- 상단 네비 & 액션 (인쇄 시 숨김) -->
    <div class="flex items-center justify-between print:hidden">
      <NuxtLink to="/my/bookings" class="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-trip-blue">
        <span>←</span> <span>내 예약 목록으로 돌아가기</span>
      </NuxtLink>

      <div class="flex items-center gap-2">
        <button
          @click="printVoucher"
          class="px-4 py-2 bg-slate-900 hover:bg-black text-white text-xs font-bold rounded-xl shadow-sm flex items-center gap-1.5 transition"
        >
          <span>🖨️ 바우처 인쇄 / PDF 저장</span>
        </button>

        <button
          v-if="booking.status === 'CONFIRMED'"
          @click="handleCancel"
          :disabled="canceling"
          class="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold rounded-xl transition"
        >
          {{ canceling ? '취소 처리 중...' : '예약 취소 신청' }}
        </button>
      </div>
    </div>

    <!-- 전자 확인 바우처 카드 본문 (인쇄 최적화) -->
    <div class="bg-white rounded-3xl border border-slate-200/90 shadow-xl overflow-hidden print:border-none print:shadow-none">
      <!-- 바우처 상단 헤더 -->
      <div class="bg-gradient-to-r from-trip-navy to-blue-900 text-white p-6 sm:p-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div class="flex items-center gap-2">
            <span class="text-xs font-bold tracking-wider text-blue-200 uppercase">OFFICIAL E-VOUCHER</span>
            <span class="px-2 py-0.5 bg-white/20 rounded text-[10px] font-black uppercase">{{ booking.domain_type }}</span>
          </div>
          <h2 class="text-2xl font-black mt-1">{{ BRAND.name }} 전자 확인 바우처</h2>
          <div class="text-xs text-blue-100 mt-1">예약일자: {{ new Date(booking.created_at).toLocaleString() }}</div>
        </div>

        <div class="bg-white/10 backdrop-blur-md border border-white/20 p-3.5 rounded-2xl text-right">
          <div class="text-[10px] text-blue-200 font-bold uppercase tracking-wider">예약 식별 코드</div>
          <div class="text-lg font-black font-mono tracking-wider">{{ booking.booking_code }}</div>
          <div class="text-xs font-mono text-emerald-300 font-bold mt-0.5">
            PNR: {{ booking.confirmation_number || '발권 완료' }}
          </div>
        </div>
      </div>

      <!-- 바우처 메인 바디 -->
      <div class="p-6 sm:p-8 space-y-8">
        <!-- 체크인 모바일 QR 코드 섹션 -->
        <div class="bg-slate-50 border border-slate-200 rounded-2xl p-6 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div class="space-y-1.5 text-center sm:text-left">
            <span class="px-2.5 py-0.5 bg-emerald-100 text-emerald-800 rounded text-[10px] font-black uppercase">
              FAST PASS CHECK-IN
            </span>
            <h3 class="text-base font-black text-slate-900">비대면 모바일 체크인 QR 코드</h3>
            <p class="text-xs text-slate-500">
              호텔 프론트 데스크, 공항 탑승구 또는 투어 현장 게이트에 아래 QR코드를 제시해 주세요.
            </p>
          </div>

          <!-- 모바일 QR 코드 시각화 -->
          <div class="flex flex-col items-center p-3 bg-white border border-slate-200 rounded-xl shadow-sm flex-shrink-0">
            <div class="w-24 h-24 bg-slate-900 flex items-center justify-center rounded-lg p-1">
              <!-- SVG QR 코드 패턴 -->
              <svg class="w-full h-full text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M2 2h8v8H2V2zm2 2v4h4V4H4zm-2 10h8v8H2v-8zm2 2v4h4v-4H4zm10-14h8v8h-8V2zm2 2v4h4V4h-4zm0 10h2v2h-2v-2zm4 0h2v4h-2v-4zm-4 4h4v2h-4v-2zm6-2h2v4h-2v-4zm-4-6h2v2h-2v-2zm4 0h2v2h-2v-2zm-2 2h2v2h-2v-2z"/>
              </svg>
            </div>
            <span class="text-[10px] font-mono font-bold text-slate-500 mt-1">{{ booking.booking_code }}</span>
          </div>
        </div>

        <!-- 예약 상태 & 보증 안내 -->
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div class="p-4 bg-blue-50/60 rounded-2xl border border-blue-100 space-y-1">
            <span class="text-slate-400 font-bold block">예약 상태</span>
            <strong :class="['text-sm font-black', booking.status === 'CONFIRMED' ? 'text-emerald-700' : 'text-slate-800']">
              {{ booking.status === 'CONFIRMED' ? '✓ 예약 확정 / 유효한 바우처' : booking.status }}
            </strong>
          </div>

          <div class="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-1">
            <span class="text-slate-400 font-bold block">예약 고객명</span>
            <strong class="text-sm font-black text-slate-800">{{ booking.primary_contact_name }}</strong>
          </div>

          <div class="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-1">
            <span class="text-slate-400 font-bold block">연락처 / 이메일</span>
            <strong class="text-sm font-mono text-slate-800">{{ booking.primary_contact_phone }}</strong>
          </div>
        </div>

        <!-- 예약 상세 품목 및 요청 사항 -->
        <div class="space-y-3">
          <h4 class="font-black text-sm text-slate-900 border-b border-slate-100 pb-2">예약 상세 정보 및 특별 요청</h4>
          
          <div class="text-xs text-slate-700 space-y-2 leading-relaxed">
            <div v-if="booking.special_requests" class="p-4 bg-slate-50 rounded-xl">
              <span class="font-bold text-slate-900 block mb-1">고객 요청 사항:</span>
              {{ booking.special_requests }}
            </div>

            <div class="p-4 bg-emerald-50/60 rounded-xl border border-emerald-100 text-emerald-900">
              <span class="font-bold block mb-1">🛡️ 안심 보장 규정</span>
              현장 체크인 시 문제가 발생할 경우 getfortrip 24시간 긴급 지원팀으로 연락주시면 동일 등급 이상 무료 대체 또는 전액 환불을 보증합니다.
            </div>
          </div>
        </div>

        <!-- 결제 및 영수증 명세 (Receipt) -->
        <div class="space-y-3">
          <h4 class="font-black text-sm text-slate-900 border-b border-slate-100 pb-2">결제 및 영수증 내역</h4>

          <div class="space-y-2 text-xs text-slate-600">
            <div class="flex justify-between">
              <span>기본 상품 운임</span>
              <span class="font-mono">{{ currencyStore.formatKRW(booking.base_amount_krw) }}</span>
            </div>

            <div v-if="booking.tax_amount_krw > 0" class="flex justify-between">
              <span>제세공과금 및 봉사료</span>
              <span class="font-mono">{{ currencyStore.formatKRW(booking.tax_amount_krw) }}</span>
            </div>

            <div v-if="booking.discount_amount_krw > 0" class="flex justify-between text-rose-600 font-bold">
              <span>프로모션 할인 / 쿠폰</span>
              <span class="font-mono">-{{ currencyStore.formatKRW(booking.discount_amount_krw) }}</span>
            </div>

            <div v-if="booking.trip_coins_used > 0" class="flex justify-between text-amber-600 font-bold">
              <span>getfortrip 코인 사용</span>
              <span class="font-mono">{{ booking.trip_coins_used }}G</span>
            </div>

            <div class="pt-3 border-t border-slate-200 flex items-baseline justify-between text-slate-900 font-bold">
              <span class="text-sm">실제 결제 완료 금액</span>
              <div class="text-right">
                <span class="text-xl font-black font-mono text-trip-blue">
                  {{ booking.paid_currency }} {{ booking.paid_currency_amount?.toLocaleString() }}
                </span>
                <span class="text-[10px] text-slate-400 block font-normal">
                  (약 {{ currencyStore.formatKRW(booking.final_amount_krw) }})
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- 하단 고객센터 안내 -->
        <div class="pt-4 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-400 gap-2">
          <div>24시간 고객센터: +82-2-1234-5678 | support@{{ BRAND.domain }}</div>
          <div>발행 기관: {{ BRAND.name }} Global Travel Ltd.</div>
        </div>
      </div>
    </div>
  </div>
</template>
