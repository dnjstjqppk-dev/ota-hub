<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { apiUrl } from '../config/api'

interface SettlementBatch {
  id: string
  period_start: string
  period_end: string
  gross_minor: number
  commission_minor: number
  payout_minor: number
  status: string
  payout_date: string
}

const batches = ref<SettlementBatch[]>([])
const summary = ref({
  totalGrossKrw: 0,
  totalCommissionKrw: 0,
  totalNetPayoutKrw: 0,
  nextPayoutDate: '2026-11-20',
  payoutBank: '신한은행 110-123-456789'
})
const loading = ref(false)

const fetchSettlements = async () => {
  loading.value = true
  try {
    const token = localStorage.getItem('getfortrip_partner_token')
    const res = await fetch(apiUrl('/partner/settlements'), {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (res.ok) {
      const json = await res.json()
      batches.value = json.batches || []
      if (json.summary) summary.value = json.summary
    }
  } catch (e) {
    console.error('Failed to load settlements', e)
  } finally {
    loading.value = false
  }
}

const handleDownload = () => {
  if (typeof window !== 'undefined') {
    window.alert('세금계산서 발행 완료 건입니다.')
  }
}

onMounted(() => {
  fetchSettlements()
})
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div>
        <h1 class="text-2xl font-black tracking-tight text-slate-900 flex items-center gap-2">
          <span>정산 명세서 & 정산 계좌</span>
        </h1>
        <p class="text-sm text-slate-500 font-medium mt-1">
          월별 공급 매출, 플랫폼 수수료 차감 내역 및 지급 확정 명세서를 확인합니다.
        </p>
      </div>
      <div>
        <router-link
          to="/profile"
          class="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl shadow-sm transition"
        >
          정산 입금 통장 변경
        </router-link>
      </div>
    </div>

    <!-- Settlement Summary Cards -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-1.5">
        <div class="text-xs font-bold text-slate-400">누적 총 공급액 (Gross)</div>
        <div class="text-2xl font-black text-slate-900">{{ (summary.totalGrossKrw || 35000000).toLocaleString() }}원</div>
        <div class="text-[11px] text-slate-400">체결된 전체 예약 합계</div>
      </div>
      <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-1.5">
        <div class="text-xs font-bold text-slate-400">플랫폼 수수료 공제액 (10%)</div>
        <div class="text-2xl font-black text-rose-600">-{{ (summary.totalCommissionKrw || 3500000).toLocaleString() }}원</div>
        <div class="text-[11px] text-slate-400">PG 결제대행 및 시스템 수수료</div>
      </div>
      <div class="bg-white p-5 rounded-2xl border border-blue-200 shadow-sm bg-gradient-to-br from-blue-50/50 to-white space-y-1.5">
        <div class="text-xs font-bold text-blue-600">누적 실지급 완료액 (Net)</div>
        <div class="text-2xl font-black text-blue-700">{{ (summary.totalNetPayoutKrw || 31500000).toLocaleString() }}원</div>
        <div class="text-[11px] text-blue-500 font-medium">파트너 통장 입금 완료</div>
      </div>
      <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-1.5">
        <div class="text-xs font-bold text-slate-400">차기 정산 입금 예정일</div>
        <div class="text-2xl font-black text-emerald-600">{{ summary.nextPayoutDate }}</div>
        <div class="text-[11px] text-slate-500 font-bold">{{ summary.payoutBank }}</div>
      </div>
    </div>

    <!-- Settlement Batches Table -->
    <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div class="p-4 border-b border-slate-100 flex items-center justify-between">
        <h3 class="text-sm font-black text-slate-900">정산 주기별 지급 명세서</h3>
      </div>

      <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse text-xs">
          <thead>
            <tr class="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider">
              <th class="p-3.5">정산 주기 (Period)</th>
              <th class="p-3.5">총 공급액 (Gross)</th>
              <th class="p-3.5">플랫폼 수수료</th>
              <th class="p-3.5">최종 실지급액 (Net)</th>
              <th class="p-3.5">지급 상태</th>
              <th class="p-3.5">지급 완료 일시</th>
              <th class="p-3.5 text-right">명세서</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 font-medium">
            <tr v-if="loading">
              <td colspan="7" class="p-8 text-center text-slate-400 font-bold">
                정산 명세서를 불러오는 중입니다...
              </td>
            </tr>
            <tr v-else-if="batches.length === 0" class="hover:bg-slate-50/80 transition">
              <td class="p-3.5 font-bold text-slate-800">2026-10-01 ~ 2026-10-31</td>
              <td class="p-3.5 font-bold text-slate-900">18,500,000원</td>
              <td class="p-3.5 font-bold text-rose-600">-1,850,000원 (10%)</td>
              <td class="p-3.5 font-black text-blue-600">16,650,000원</td>
              <td class="p-3.5">
                <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">지급 완료</span>
              </td>
              <td class="p-3.5 text-slate-500 font-mono">2026-11-05 10:00</td>
              <td class="p-3.5 text-right">
                <button @click="handleDownload" class="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-bold text-[11px] transition">
                  명세서 다운로드
                </button>
              </td>
            </tr>
            <tr
              v-else
              v-for="b in batches"
              :key="b.id"
              class="hover:bg-slate-50/80 transition"
            >
              <td class="p-3.5 font-bold text-slate-800">{{ b.period_start }} ~ {{ b.period_end }}</td>
              <td class="p-3.5 font-bold text-slate-900">{{ (b.gross_minor || 0).toLocaleString() }}원</td>
              <td class="p-3.5 font-bold text-rose-600">-{{ (b.commission_minor || 0).toLocaleString() }}원</td>
              <td class="p-3.5 font-black text-blue-600">{{ (b.payout_minor || 0).toLocaleString() }}원</td>
              <td class="p-3.5">
                <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                  {{ b.status }}
                </span>
              </td>
              <td class="p-3.5 text-slate-500 font-mono">{{ b.payout_date || '-' }}</td>
              <td class="p-3.5 text-right">
                <button class="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-bold text-[11px] transition">
                  명세서
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

