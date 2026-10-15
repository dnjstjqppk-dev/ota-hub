<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { usePartnerStore } from '~/stores/partner'

const router = useRouter()
const partnerStore = usePartnerStore()

onMounted(() => {
  if (!partnerStore.isLoggedIn) {
    router.replace('/partner/login')
  }
})

const settlementCycles = ref([
  {
    id: 'stl-2026-10-1',
    period: '2026-10-01 ~ 2026-10-15',
    payoutDate: '2026-10-25',
    ordersCount: 18,
    grossKrw: 8450000,
    feeKrw: 845000,
    netPayoutKrw: 7605000,
    status: 'SCHEDULED', // SCHEDULED, PAID
    taxInvoice: 'ISSUED'
  },
  {
    id: 'stl-2026-09-2',
    period: '2026-09-16 ~ 2026-09-30',
    payoutDate: '2026-10-10',
    ordersCount: 24,
    grossKrw: 12200000,
    feeKrw: 1220000,
    netPayoutKrw: 10980000,
    status: 'PAID',
    taxInvoice: 'COMPLETED'
  },
  {
    id: 'stl-2026-09-1',
    period: '2026-09-01 ~ 2026-09-15',
    payoutDate: '2026-09-25',
    ordersCount: 20,
    grossKrw: 9800000,
    feeKrw: 980000,
    netPayoutKrw: 8820000,
    status: 'PAID',
    taxInvoice: 'COMPLETED'
  }
])

const bankAccount = ref({
  bankName: '신한은행',
  accountNumber: '110-882-990142',
  holderName: '(주)하얏트 코리아 호스피탈리티'
})

const downloadReport = (id: string) => {
  alert(`[${id}] 정산 명세서(Excel) 다운로드가 시작되었습니다.`)
}
</script>

<template>
  <div class="min-h-screen bg-slate-100">
    <header class="bg-slate-900 text-white border-b border-slate-800 sticky top-0 z-40">
      <div class="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        <div class="flex items-center gap-6">
          <NuxtLink to="/partner" class="flex items-center gap-2">
            <img src="/logo-white.svg" alt="getfortrip" class="h-7 w-auto" />
            <span class="px-2 py-0.5 rounded text-[10px] font-black bg-blue-600 text-white uppercase tracking-wider">
              Partner Hub
            </span>
          </NuxtLink>
          <nav class="hidden md:flex items-center gap-1 text-xs font-bold text-slate-300">
            <NuxtLink to="/partner" class="px-3 py-2 rounded-xl hover:bg-slate-800 hover:text-white transition">대시보드</NuxtLink>
            <NuxtLink to="/partner/products" class="px-3 py-2 rounded-xl hover:bg-slate-800 hover:text-white transition">상품 및 재고 관리</NuxtLink>
            <NuxtLink to="/partner/bookings" class="px-3 py-2 rounded-xl hover:bg-slate-800 hover:text-white transition">예약·바우처 관리</NuxtLink>
            <NuxtLink to="/partner/settlement" class="px-3 py-2 rounded-xl bg-slate-800 text-white">정산 및 수수료</NuxtLink>
            <NuxtLink to="/partner/settings" class="px-3 py-2 rounded-xl hover:bg-slate-800 hover:text-white transition">연동 API/설정</NuxtLink>
          </nav>
        </div>
        <div class="flex items-center gap-4 text-xs">
          <span class="font-bold text-slate-300">{{ partnerStore.partner.companyName }}</span>
          <button @click="partnerStore.logout(); router.push('/partner/login')" class="text-rose-400 font-bold">로그아웃</button>
        </div>
      </div>
    </header>

    <main class="max-w-7xl mx-auto px-4 py-8 space-y-6">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 class="text-2xl font-black text-slate-900">정산 및 수수료 명세서</h1>
          <p class="text-xs text-slate-500 mt-1">월 2회 자동 정산 주기(10일/25일)에 따른 판매 대금 입금 내역 및 전자세금계산서 현황입니다.</p>
        </div>
        <div class="p-3 bg-white border border-slate-200 rounded-2xl flex items-center gap-3 text-xs shadow-sm">
          <span class="p-2 rounded-xl bg-blue-50 text-blue-600 font-bold">🏦 정산 계좌</span>
          <div>
            <div class="font-bold text-slate-900">{{ bankAccount.bankName }} {{ bankAccount.accountNumber }}</div>
            <div class="text-[11px] text-slate-400">예금주: {{ bankAccount.holderName }}</div>
          </div>
        </div>
      </div>

      <!-- 정산 요약 카드 -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div class="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-1">
          <div class="text-xs text-slate-400 font-bold">차기 정산 확정액 (10월 25일 지급 예정)</div>
          <div class="text-3xl font-black text-emerald-600 font-mono">₩7,605,000</div>
          <div class="text-[11px] text-slate-500 font-medium pt-1">주문 18건 완료 기준 (10% 플랫폼 수수료 차감 후)</div>
        </div>

        <div class="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-1">
          <div class="text-xs text-slate-400 font-bold">2026년 누적 정산 지급 총액</div>
          <div class="text-3xl font-black text-slate-900 font-mono">₩148,250,000</div>
          <div class="text-[11px] text-blue-600 font-bold pt-1">정산 지급 지연율 0.0% (당일 입금 보장)</div>
        </div>

        <div class="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-1">
          <div class="text-xs text-slate-400 font-bold">파트너 수수료 우대 등급</div>
          <div class="text-3xl font-black text-amber-500 font-mono">10.0% <span class="text-xs font-normal text-slate-400">(표준 15% 대비 우대)</span></div>
          <div class="text-[11px] text-slate-500 font-medium pt-1">연간 거래액 1억원 이상 최우수 등급 적용</div>
        </div>
      </div>

      <!-- 정산 내역 테이블 -->
      <div class="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div class="p-5 border-b border-slate-100 flex items-center justify-between">
          <h2 class="text-base font-black text-slate-900">회차별 정산 내역서</h2>
          <span class="text-xs text-slate-400">모든 금액은 부가세(VAT) 포함 기준입니다.</span>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs">
            <thead class="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
              <tr>
                <th class="py-3.5 px-4">정산 회차 코드</th>
                <th class="py-3.5 px-4">집계 정산 기간</th>
                <th class="py-3.5 px-4">지급 예정일</th>
                <th class="py-3.5 px-4">주문 건수</th>
                <th class="py-3.5 px-4">판매 총액 (Gross)</th>
                <th class="py-3.5 px-4">중개 수수료 (10%)</th>
                <th class="py-3.5 px-4">최종 지급액 (Net)</th>
                <th class="py-3.5 px-4 text-center">지급 상태</th>
                <th class="py-3.5 px-4 text-center">명세서</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              <tr v-for="c in settlementCycles" :key="c.id" class="hover:bg-slate-50/80 transition">
                <td class="py-3.5 px-4 font-mono font-bold text-slate-900">{{ c.id }}</td>
                <td class="py-3.5 px-4 text-slate-600 font-medium">{{ c.period }}</td>
                <td class="py-3.5 px-4 font-mono font-bold text-slate-900">{{ c.payoutDate }}</td>
                <td class="py-3.5 px-4 font-mono">{{ c.ordersCount }}건</td>
                <td class="py-3.5 px-4 font-black text-slate-900">₩{{ c.grossKrw.toLocaleString() }}</td>
                <td class="py-3.5 px-4 font-bold text-rose-500">-₩{{ c.feeKrw.toLocaleString() }}</td>
                <td class="py-3.5 px-4 font-black text-emerald-600 text-sm">₩{{ c.netPayoutKrw.toLocaleString() }}</td>
                <td class="py-3.5 px-4 text-center">
                  <span
                    :class="[
                      'px-2.5 py-0.5 rounded-full text-[10px] font-black',
                      c.status === 'PAID' ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : 'bg-blue-50 text-blue-600 border border-blue-200'
                    ]"
                  >
                    {{ c.status === 'PAID' ? '지급 완료' : '지급 대기 중' }}
                  </span>
                </td>
                <td class="py-3.5 px-4 text-center">
                  <button
                    @click="downloadReport(c.id)"
                    class="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] transition"
                  >
                    Excel 다운로드
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </main>
  </div>
</template>

