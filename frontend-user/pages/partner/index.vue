<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { usePartnerStore } from '~/stores/partner'
import { useCurrencyStore } from '~/stores/currency'

definePageMeta({
  middleware: 'partner-auth'
})

const router = useRouter()
const partnerStore = usePartnerStore()
const currencyStore = useCurrencyStore()

onMounted(() => {
  if (!partnerStore.isLoggedIn || !partnerStore.partner) {
    router.replace('/partner/login')
  }
})

const stats = ref({
  monthlyGrossKrw: 18450000,
  monthlyNetKrw: 16605000,
  pendingBookingsCount: 4,
  activeProductsCount: 12,
  averageRating: 4.9,
  commissionRatePercent: 10
})

const recentBookings = ref([
  {
    id: 'b-001',
    bookingCode: 'GF-HT-98214',
    guestName: '김** (성인 2명)',
    productName: '디럭스 킹 룸 (시티뷰 조식 포함)',
    checkInDate: '2026-11-01',
    nights: 2,
    amountKrw: 320000,
    payoutKrw: 288000,
    status: 'CONFIRMED',
    actionRequired: false
  },
  {
    id: 'b-008',
    bookingCode: 'GF-HT-99302',
    guestName: '박** (성인 2명, 아동 1명)',
    productName: '프리미어 이그제큐티브 스위트',
    checkInDate: '2026-11-03',
    nights: 3,
    amountKrw: 680000,
    payoutKrw: 612000,
    status: 'PENDING_CONFIRMATION',
    actionRequired: true
  },
  {
    id: 'b-009',
    bookingCode: 'GF-HT-99411',
    guestName: '정** (성인 1명)',
    productName: '스탠다드 퀸 룸 (얼리버드)',
    checkInDate: '2026-11-05',
    nights: 1,
    amountKrw: 185000,
    payoutKrw: 166500,
    status: 'PENDING_CONFIRMATION',
    actionRequired: true
  },
  {
    id: 'b-010',
    bookingCode: 'GF-HT-98774',
    guestName: 'M. C*** (미국)',
    productName: '클럽 라운지 엑세스 킹룸',
    checkInDate: '2026-11-08',
    nights: 4,
    amountKrw: 920000,
    payoutKrw: 828000,
    status: 'CONFIRMED',
    actionRequired: false
  }
])

const confirmBooking = (idx: number) => {
  recentBookings.value[idx].status = 'CONFIRMED'
  recentBookings.value[idx].actionRequired = false
  stats.value.pendingBookingsCount = Math.max(0, stats.value.pendingBookingsCount - 1)
  alert('예약이 성공적으로 확정 승인되었습니다. 고객에게 전자 바우처가 발송됩니다.')
}

const handleLogout = () => {
  partnerStore.logout()
  router.push('/partner/login')
}
</script>

<template>
  <div v-if="partnerStore.isLoggedIn && partnerStore.partner" class="min-h-screen bg-slate-100">
    <!-- 파트너 포털 전용 상단 네비게이션 바 -->
    <header class="bg-slate-900 text-white border-b border-slate-800 sticky top-0 z-40">
      <div class="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        <div class="flex items-center gap-6">
          <NuxtLink to="/partner" class="flex items-center gap-2">
            <img src="/logo-white.svg" alt="getfortrip" class="h-7 w-auto" />
            <span class="px-2 py-0.5 rounded text-[10px] font-black bg-blue-600 text-white uppercase tracking-wider">
              Partner Hub
            </span>
          </NuxtLink>

          <!-- 상단 탭 네비게이션 -->
          <nav class="hidden md:flex items-center gap-1 text-xs font-bold text-slate-300">
            <NuxtLink to="/partner" class="px-3 py-2 rounded-xl bg-slate-800 text-white">대시보드</NuxtLink>
            <NuxtLink to="/partner/products" class="px-3 py-2 rounded-xl hover:bg-slate-800 hover:text-white transition">상품 및 재고 관리</NuxtLink>
            <NuxtLink to="/partner/bookings" class="px-3 py-2 rounded-xl hover:bg-slate-800 hover:text-white transition">예약·바우처 관리</NuxtLink>
            <NuxtLink to="/partner/settlement" class="px-3 py-2 rounded-xl hover:bg-slate-800 hover:text-white transition">정산 및 수수료</NuxtLink>
            <NuxtLink to="/partner/settings" class="px-3 py-2 rounded-xl hover:bg-slate-800 hover:text-white transition">연동 API/설정</NuxtLink>
          </nav>
        </div>

        <div class="flex items-center gap-4 text-xs">
          <div class="hidden sm:flex flex-col text-right">
            <span class="font-bold text-slate-200">{{ partnerStore.partner?.companyName }}</span>
            <span class="text-[10px] text-slate-400 font-mono">{{ partnerStore.partner?.businessNumber }}</span>
          </div>

          <NuxtLink to="/" class="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-bold transition">
            고객 쇼핑몰 보기 ↗
          </NuxtLink>

          <button
            @click="handleLogout"
            class="px-2.5 py-1.5 rounded-lg bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 font-bold transition text-[11px]"
          >
            로그아웃
          </button>
        </div>
      </div>
    </header>

    <!-- 메인 대시보드 바디 -->
    <main class="max-w-7xl mx-auto px-4 py-8 space-y-8">
      <!-- 웰컴 헤더 배너 -->
      <div class="bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 rounded-3xl p-6 sm:p-8 text-white flex flex-col md:flex-row md:items-center justify-between gap-6 shadow-xl border border-slate-800">
        <div class="space-y-2">
          <div class="flex items-center gap-2">
            <span class="px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-400 text-xs font-bold border border-blue-400/30">
              인증 공급사 파트너
            </span>
            <span class="text-xs text-slate-400">계약 수수료율: {{ stats.commissionRatePercent }}% (정산율 90%)</span>
          </div>
          <h1 class="text-2xl sm:text-3xl font-black tracking-tight">
            {{ partnerStore.partner.companyName }} 파트너 센터
          </h1>
          <p class="text-xs sm:text-sm text-slate-300 max-w-xl">
            실시간 고객 예약 확정 및 재고 요금 변경, 월별 정산 내역을 한눈에 관리하세요.
          </p>
        </div>

        <div class="flex flex-wrap items-center gap-3">
          <NuxtLink
            to="/partner/products"
            class="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold shadow-md transition"
          >
            + 신규 상품 등록
          </NuxtLink>
          <NuxtLink
            to="/partner/bookings"
            class="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold border border-slate-700 transition"
          >
            예약 승인 대기 목록 ({{ stats.pendingBookingsCount }})
          </NuxtLink>
        </div>
      </div>

      <!-- 4대 핵심 KPI 카드 그리드 -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div class="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm space-y-2">
          <div class="flex items-center justify-between text-xs text-slate-500 font-bold">
            <span>당월 총 주문 매출 (Gross)</span>
            <span class="p-1.5 rounded-lg bg-blue-50 text-blue-600">💳</span>
          </div>
          <div class="text-2xl font-black text-slate-900 tracking-tight">
            ₩{{ stats.monthlyGrossKrw.toLocaleString() }}
          </div>
          <div class="text-[11px] text-emerald-600 font-bold flex items-center gap-1">
            <span>↑ 전월 대비 +14.2% 성장</span>
          </div>
        </div>

        <div class="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm space-y-2">
          <div class="flex items-center justify-between text-xs text-slate-500 font-bold">
            <span>차기 정산 예정액 (Net 90%)</span>
            <span class="p-1.5 rounded-lg bg-emerald-50 text-emerald-600">💰</span>
          </div>
          <div class="text-2xl font-black text-emerald-600 tracking-tight">
            ₩{{ stats.monthlyNetKrw.toLocaleString() }}
          </div>
          <div class="text-[11px] text-slate-400 font-medium">
            정산 예정일: 2026-11-15 (신한은행 자동 입금)
          </div>
        </div>

        <div class="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm space-y-2">
          <div class="flex items-center justify-between text-xs text-slate-500 font-bold">
            <span>승인 대기 예약</span>
            <span class="p-1.5 rounded-lg bg-amber-50 text-amber-600">⏳</span>
          </div>
          <div class="text-2xl font-black text-amber-600 tracking-tight">
            {{ stats.pendingBookingsCount }} <span class="text-sm font-normal text-slate-400">건</span>
          </div>
          <div class="text-[11px] text-amber-700 font-bold">
            신속한 확정 처리가 권장됩니다
          </div>
        </div>

        <div class="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm space-y-2">
          <div class="flex items-center justify-between text-xs text-slate-500 font-bold">
            <span>판매 중 인벤토리 & 평점</span>
            <span class="p-1.5 rounded-lg bg-purple-50 text-purple-600">⭐</span>
          </div>
          <div class="text-2xl font-black text-slate-900 tracking-tight">
            {{ stats.activeProductsCount }} <span class="text-sm font-normal text-slate-400">개 활성</span>
          </div>
          <div class="text-[11px] text-purple-700 font-bold">
            고객 평점 {{ stats.averageRating }} / 5.0 (우수 파트너)
          </div>
        </div>
      </div>

      <!-- 최근 접수된 실시간 예약 관리 테이블 -->
      <div class="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div class="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 class="text-base font-black text-slate-900">최근 파트너 접수 예약 피드</h2>
            <p class="text-xs text-slate-400">고객이 getfortrip 플랫폼에서 예약한 최신 주문 내역입니다.</p>
          </div>
          <NuxtLink to="/partner/bookings" class="text-xs font-bold text-blue-600 hover:underline">
            전체 예약 내역 보기 →
          </NuxtLink>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs">
            <thead class="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
              <tr>
                <th class="py-3 px-4">예약 코드</th>
                <th class="py-3 px-4">고객(투숙객)명</th>
                <th class="py-3 px-4">상품명 및 일정</th>
                <th class="py-3 px-4">판매금액</th>
                <th class="py-3 px-4">정산금액 (90%)</th>
                <th class="py-3 px-4">상태</th>
                <th class="py-3 px-4 text-center">작업</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              <tr v-for="(b, idx) in recentBookings" :key="b.id" class="hover:bg-slate-50/80 transition">
                <td class="py-3 px-4 font-mono font-bold text-slate-900">
                  {{ b.bookingCode }}
                </td>
                <td class="py-3 px-4 font-bold text-slate-700">
                  {{ b.guestName }}
                </td>
                <td class="py-3 px-4">
                  <div class="font-bold text-slate-900">{{ b.productName }}</div>
                  <div class="text-[11px] text-slate-400">체크인: {{ b.checkInDate }} ({{ b.nights }}박)</div>
                </td>
                <td class="py-3 px-4 font-bold text-slate-900">
                  ₩{{ b.amountKrw.toLocaleString() }}
                </td>
                <td class="py-3 px-4 font-bold text-emerald-600">
                  ₩{{ b.payoutKrw.toLocaleString() }}
                </td>
                <td class="py-3 px-4">
                  <span
                    :class="[
                      'px-2 py-0.5 rounded-full text-[10px] font-black',
                      b.status === 'CONFIRMED' ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : 'bg-amber-50 text-amber-600 border border-amber-200'
                    ]"
                  >
                    {{ b.status === 'CONFIRMED' ? '예약 확정 완료' : '승인 대기 중' }}
                  </span>
                </td>
                <td class="py-3 px-4 text-center">
                  <button
                    v-if="b.actionRequired"
                    @click="confirmBooking(idx)"
                    class="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold text-[11px] shadow-sm transition"
                  >
                    승인(Confirm)
                  </button>
                  <span v-else class="text-[11px] text-slate-400 font-medium">
                    바우처 발급됨 ✓
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </main>
  </div>

  <div v-else class="min-h-screen bg-slate-100 flex items-center justify-center p-4">
    <div class="bg-white p-8 rounded-3xl shadow-sm border border-slate-200 max-w-md w-full text-center space-y-4">
      <div class="w-14 h-14 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mx-auto text-2xl font-bold">
        🔒
      </div>
      <div>
        <h2 class="text-xl font-black text-slate-900 tracking-tight">파트너 인증 필요</h2>
        <p class="text-xs text-slate-500 mt-1.5 leading-relaxed">
          인가된 공급사(호텔, 항공사, 렌터카사 등) 계정으로 로그인한 후에만 파트너 대시보드 및 예약 데이터에 접근할 수 있습니다.
        </p>
      </div>
      <div class="pt-2">
        <NuxtLink
          to="/partner/login"
          class="w-full inline-block py-3 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs rounded-xl shadow-md transition"
        >
          파트너 로그인 바로가기 →
        </NuxtLink>
      </div>
    </div>
  </div>
</template>

