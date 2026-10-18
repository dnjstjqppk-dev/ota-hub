<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import { useCurrencyStore } from '~/stores/currency'

const route = useRoute()
const currencyStore = useCurrencyStore()

// Query Params or Default Fallback
const bookingId = ref((route.query.bookingId as string) || `GF-20261015-${Math.floor(1000 + Math.random() * 9000)}`)
const domainType = ref((route.query.domain as string) || 'HOTEL') // HOTEL, FLIGHT, TRAIN, CAR, TRANSFER, ACTIVITY, PACKAGE
const paidAmount = ref(Number(route.query.amount) || 285000)
const primaryContact = ref((route.query.contact as string) || '예약자 정보 확인 완료')
const title = ref((route.query.title as string) || '')
const schedule = ref((route.query.schedule as string) || '')

const domainDetails = computed(() => {
  const d = domainType.value.toUpperCase()
  if (d.includes('FLIGHT') || d === 'FLIGHT') {
    return {
      name: '항공권',
      icon: '✈️',
      badgeClass: 'bg-blue-50 text-blue-600 border-blue-200',
      defaultTitle: title.value || '대한항공 KE703 (서울/인천 → 도쿄/나리타)',
      defaultSchedule: schedule.value || '2026년 11월 01일 (일) 10:10 출발 (직항)',
      docLabel: '전자 항공권 (E-Ticket Itinerary Receipt)'
    }
  } else if (d.includes('TRAIN') || d === 'TRAIN') {
    return {
      name: '기차표',
      icon: '🚅',
      badgeClass: 'bg-emerald-50 text-emerald-600 border-emerald-200',
      defaultTitle: title.value || 'KTX 021 (서울역 → 부산역) 일반실',
      defaultSchedule: schedule.value || '2026년 11월 01일 (일) 08:30 ~ 11:05 (3호차 12A)',
      docLabel: '모바일 열차 승차권 (Mobile Ticket)'
    }
  } else if (d.includes('CAR') || d === 'CAR') {
    return {
      name: '렌터카',
      icon: '🚗',
      badgeClass: 'bg-amber-50 text-amber-600 border-amber-200',
      defaultTitle: title.value || '현대 더 뉴 아반떼 (2025/2026 신차급, 완전자차)',
      defaultSchedule: schedule.value || '2026.11.01 10:00 ~ 2026.11.03 10:00 (제주공항 셔틀 1구역)',
      docLabel: '렌터카 전자 임대차 계약서 & 인수 바우처'
    }
  } else if (d.includes('TRANSFER') || d === 'TRANSFER') {
    return {
      name: '공항픽업',
      icon: '🚖',
      badgeClass: 'bg-cyan-50 text-cyan-600 border-cyan-200',
      defaultTitle: title.value || '인천공항 T1/T2 → 서울 도심 비즈니스 밴 리무진',
      defaultSchedule: schedule.value || '2026년 11월 01일 (일) 14:30 픽업 (기사 피켓 영접)',
      docLabel: '공항 의전 픽업 확인서 (Meet & Greet Voucher)'
    }
  } else if (d.includes('ACTIVITY') || d.includes('THINGS') || d === 'ACTIVITY') {
    return {
      name: '투어·티켓',
      icon: '🎟️',
      badgeClass: 'bg-purple-50 text-purple-600 border-purple-200',
      defaultTitle: title.value || '도쿄 디즈니랜드 1일 e-티켓 (모바일 QR 즉시 입장)',
      defaultSchedule: schedule.value || '2026년 11월 02일 (월) 1일 종일 자유 이용',
      docLabel: '모바일 입장권 바우처 (Mobile QR Voucher)'
    }
  } else if (d.includes('PACKAGE') || d === 'PACKAGE') {
    return {
      name: '항공+호텔',
      icon: '🎁',
      badgeClass: 'bg-rose-50 text-rose-600 border-rose-200',
      defaultTitle: title.value || '[에어텔 특가] 도쿄 롯폰기 하얏트 4일 (대한항공 + 5성급 3박)',
      defaultSchedule: schedule.value || '2026.11.01 ~ 2026.11.04 (3박 4일)',
      docLabel: '에어텔 결합 여행 바우처 패키지'
    }
  } else {
    return {
      name: '호텔',
      icon: '🏨',
      badgeClass: 'bg-blue-50 text-blue-600 border-blue-200',
      defaultTitle: title.value || '그랜드 하얏트 도쿄 롯폰기 힐스 (디럭스 킹 룸)',
      defaultSchedule: schedule.value || '2026.11.01 (체크인 15:00) ~ 2026.11.03 (체크아웃 11:00)',
      docLabel: '호텔 투숙 예약 확인서 (Hotel Booking Voucher)'
    }
  }
})

const printVoucher = () => {
  if (typeof window !== 'undefined') {
    window.print()
  }
}

onMounted(() => {
  // If stored in localStorage from booking step
  if (typeof window !== 'undefined') {
    try {
      const lastBooking = localStorage.getItem('last_getfortrip_booking')
      if (lastBooking) {
        const parsed = JSON.parse(lastBooking)
        if (parsed.id) bookingId.value = parsed.id
        if (parsed.domain) domainType.value = parsed.domain
        if (parsed.amount) paidAmount.value = parsed.amount
        if (parsed.title) title.value = parsed.title
        if (parsed.schedule) schedule.value = parsed.schedule
        if (parsed.contact) primaryContact.value = parsed.contact
      }
    } catch (e) {
      // Ignore
    }
  }
})
</script>

<template>
  <div class="max-w-4xl mx-auto px-4 py-12 space-y-8">
    <!-- 1. Header Animated Success Banner -->
    <div class="bg-white rounded-3xl border border-slate-200 p-8 md:p-12 text-center shadow-lg space-y-4">
      <div class="w-20 h-20 mx-auto rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-4xl shadow-inner animate-bounce">
        ✓
      </div>

      <div class="space-y-1">
        <span class="inline-block px-3 py-1 bg-emerald-50 text-emerald-700 font-bold text-xs rounded-full border border-emerald-200">
          Payment Confirmed & Auto-Issued
        </span>
        <h1 class="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">
          예약 및 결제가 성공적으로 완료되었습니다!
        </h1>
        <p class="text-xs md:text-sm text-slate-500 font-medium">
          고객님의 예약이 실시간 공급처에 확정 등록되었으며 모바일 e-바우처가 자동 발행되었습니다.
        </p>
      </div>

      <!-- 예약 번호 강조 박스 -->
      <div class="inline-flex items-center gap-3 bg-slate-50 border border-slate-200 px-6 py-3 rounded-2xl">
        <span class="text-xs text-slate-400 font-bold">getforTrip 예약 번호</span>
        <span class="text-base font-black text-slate-900 font-mono tracking-wider">{{ bookingId }}</span>
      </div>
    </div>

    <!-- 2. 예약 상품 상세 명세 카드 -->
    <div class="bg-white rounded-3xl border border-slate-200 p-6 md:p-8 shadow-sm space-y-6">
      <div class="flex items-center justify-between border-b border-slate-100 pb-4">
        <div class="flex items-center gap-2">
          <span class="text-2xl">{{ domainDetails.icon }}</span>
          <span :class="['px-2.5 py-0.5 rounded-lg text-xs font-black border', domainDetails.badgeClass]">
            {{ domainDetails.name }}
          </span>
          <h2 class="text-lg font-black text-slate-900">예약 상품 상세 내역</h2>
        </div>
        <span class="text-xs font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full">
          ● 즉시 확정 완료
        </span>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
        <div class="space-y-3">
          <div>
            <span class="text-slate-400 font-bold block mb-0.5">상품명 / 예약 항목</span>
            <div class="text-sm font-black text-slate-900">{{ domainDetails.defaultTitle }}</div>
          </div>
          <div>
            <span class="text-slate-400 font-bold block mb-0.5">이용 일정</span>
            <div class="font-bold text-slate-800">{{ domainDetails.defaultSchedule }}</div>
          </div>
          <div>
            <span class="text-slate-400 font-bold block mb-0.5">발행 서류 유형</span>
            <div class="font-bold text-blue-600">{{ domainDetails.docLabel }}</div>
          </div>
        </div>

        <div class="space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-100">
          <div>
            <span class="text-slate-400 font-bold block mb-0.5">대표 예약자</span>
            <div class="font-bold text-slate-800">{{ primaryContact }}</div>
          </div>
          <div>
            <span class="text-slate-400 font-bold block mb-0.5">결제 수단</span>
            <div class="font-bold text-slate-800">{{ paymentMethod }}</div>
          </div>
          <div>
            <span class="text-slate-400 font-bold block mb-0.5">결제 승인 일시</span>
            <div class="font-bold text-slate-800 font-mono">{{ new Date().toLocaleString() }}</div>
          </div>
        </div>
      </div>

      <!-- 결제 금액 영수증 명세 -->
      <div class="pt-4 border-t border-slate-100 space-y-2 text-xs">
        <div class="flex justify-between text-slate-500">
          <span>기본 상품 공급가액</span>
          <span class="font-mono">{{ currencyStore.formatKRW(Math.round(paidAmount * 0.9)) }}</span>
        </div>
        <div class="flex justify-between text-slate-500">
          <span>세금 및 유류할증료/봉사료</span>
          <span class="font-mono">{{ currencyStore.formatKRW(Math.round(paidAmount * 0.1)) }}</span>
        </div>
        <div class="flex justify-between text-emerald-600 font-bold">
          <span>getforTrip 웰컴 프로모션 할인</span>
          <span class="font-mono">-{{ currencyStore.formatKRW(15000) }}</span>
        </div>
        <div class="flex justify-between items-baseline pt-3 border-t border-slate-200 text-sm">
          <span class="font-black text-slate-900">최종 결제 승인 금액</span>
          <span class="text-2xl font-black text-blue-600 font-mono">
            {{ currencyStore.formatKRW(paidAmount) }}
          </span>
        </div>
      </div>
    </div>

    <!-- 3. 안심 안내 알림 박스 -->
    <div class="bg-blue-50 border border-blue-200 rounded-3xl p-6 flex flex-col md:flex-row items-center justify-between gap-4">
      <div class="flex items-center gap-3">
        <div class="w-12 h-12 rounded-2xl bg-white text-blue-600 flex items-center justify-center text-2xl shadow-sm">
          📱
        </div>
        <div>
          <h4 class="font-bold text-blue-950 text-sm">모바일 바우처 발송 안내</h4>
          <p class="text-xs text-blue-700 mt-0.5">
            카카오톡 알림톡 및 등록하신 이메일로 e-티켓 바우처와 영수증이 즉시 발송되었습니다.
          </p>
        </div>
      </div>

      <button
        @click="printVoucher"
        class="px-5 py-2.5 bg-white hover:bg-slate-50 text-blue-700 font-bold text-xs rounded-xl border border-blue-200 shadow-sm transition whitespace-nowrap"
      >
        🖨️ 바우처 인쇄 / PDF 저장
      </button>
    </div>

    <!-- 4. 네비게이션 CTA 버튼 바 -->
    <div class="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
      <NuxtLink
        to="/my/bookings"
        class="w-full sm:w-auto px-8 py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-black text-sm rounded-2xl shadow-lg shadow-blue-500/25 transition text-center"
      >
        내 예약 관리 바로가기 →
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

