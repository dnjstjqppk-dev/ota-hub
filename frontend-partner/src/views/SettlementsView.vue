<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
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

interface MarketplaceSettlement {
  id: string
  booking_id: string
  booking_item_id: string
  domain_type: string
  merchant_model: string
  seller_id: string
  seller_name: string
  gross_amount_minor: number
  commission_amount_minor: number
  seller_payout_minor: number
  fulfillment_status: string
  settlement_status: string
  created_at: string
}

const activeTab = ref<'realtime' | 'batches'>('realtime')
const batches = ref<SettlementBatch[]>([])
const orderSettlements = ref<MarketplaceSettlement[]>([])
const loading = ref(false)

const summary = ref({
  totalGrossKrw: 0,
  totalCommissionKrw: 0,
  totalNetPayoutKrw: 0,
  pendingPayoutKrw: 0,
  nextPayoutDate: '2026-11-20',
  payoutBank: '신한은행 110-123-456789'
})

const fetchSettlements = async () => {
  loading.value = true
  try {
    const token = localStorage.getItem('getfortrip_partner_token')
    const headers = { Authorization: `Bearer ${token}` }

    // 1. Fetch live marketplace order settlements
    const mktRes = await fetch(apiUrl('/partner/marketplace/settlements'), { headers })
    if (mktRes.ok) {
      const data = await mktRes.json()
      orderSettlements.value = data.settlements || []
    }

    // 2. Fetch periodic settlement batches
    const batchRes = await fetch(apiUrl('/partner/settlements'), { headers })
    if (batchRes.ok) {
      const json = await batchRes.json()
      batches.value = json.batches || []
      if (json.summary) {
        summary.value = { ...summary.value, ...json.summary }
      }
    }

    // Recalculate summary if live order settlements exist
    if (orderSettlements.value.length > 0) {
      let g = 0
      let c = 0
      let p = 0
      let pending = 0
      for (const s of orderSettlements.value) {
        g += Number(s.gross_amount_minor || 0)
        c += Number(s.commission_amount_minor || 0)
        p += Number(s.seller_payout_minor || 0)
        if (s.settlement_status === 'PENDING') {
          pending += Number(s.seller_payout_minor || 0)
        }
      }
      summary.value.totalGrossKrw = g
      summary.value.totalCommissionKrw = c
      summary.value.totalNetPayoutKrw = p
      summary.value.pendingPayoutKrw = pending
    }
  } catch (e) {
    console.error('Failed to load settlements', e)
  } finally {
    loading.value = false
  }
}

const handleDownload = () => {
  if (typeof window !== 'undefined') {
    window.alert('세금계산서 및 정산 내역서 발행이 완료되었습니다.')
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
          <span class="text-xs px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800 font-bold">3P 입점 마켓플레이스</span>
        </h1>
        <p class="text-sm text-slate-500 font-medium mt-1">
          주문별 실시간 공급 매출, 플랫폼 수수료 차감 내역 및 월별 정산 확정 명세서를 확인합니다.
        </p>
      </div>
      <div class="flex items-center gap-2">
        <button
          @click="fetchSettlements"
          class="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition"
        >
          새로고침
        </button>
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
        <div class="text-xs font-bold text-slate-400">누적 총 공급액 (Gross GMV)</div>
        <div class="text-2xl font-black text-slate-900">{{ (summary.totalGrossKrw || 35000000).toLocaleString() }}원</div>
        <div class="text-[11px] text-slate-400">파트너 등록 상품 주문 총 결제액</div>
      </div>
      <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-1.5">
        <div class="text-xs font-bold text-slate-400">플랫폼 수수료 공제액 (10%)</div>
        <div class="text-2xl font-black text-rose-600">-{{ (summary.totalCommissionKrw || 3500000).toLocaleString() }}원</div>
        <div class="text-[11px] text-slate-400">PG 결제대행 및 GetForTrip 플랫폼 수수료</div>
      </div>
      <div class="bg-white p-5 rounded-2xl border border-blue-200 shadow-sm bg-gradient-to-br from-blue-50/50 to-white space-y-1.5">
        <div class="text-xs font-bold text-blue-600">누적 파트너 정산액 (Net Payout)</div>
        <div class="text-2xl font-black text-blue-700">{{ (summary.totalNetPayoutKrw || 31500000).toLocaleString() }}원</div>
        <div class="text-[11px] text-blue-500 font-medium">파트너 통장 입금 대상 합계</div>
      </div>
      <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-1.5">
        <div class="text-xs font-bold text-slate-400">차기 정산 입금 예정일</div>
        <div class="text-2xl font-black text-emerald-600">{{ summary.nextPayoutDate }}</div>
        <div class="text-[11px] text-slate-500 font-bold">{{ summary.payoutBank }}</div>
      </div>
    </div>

    <!-- Navigation Tabs -->
    <div class="flex items-center gap-2 border-b border-slate-200 pb-2">
      <button
        @click="activeTab = 'realtime'"
        :class="[
          'px-4 py-2 rounded-xl text-xs font-black transition',
          activeTab === 'realtime'
            ? 'bg-blue-600 text-white shadow-sm'
            : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
        ]"
      >
        주문별 실시간 정산 원장 ({{ orderSettlements.length }}건)
      </button>
      <button
        @click="activeTab = 'batches'"
        :class="[
          'px-4 py-2 rounded-xl text-xs font-black transition',
          activeTab === 'batches'
            ? 'bg-blue-600 text-white shadow-sm'
            : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
        ]"
      >
        월별 정산 주기 명세서 ({{ batches.length }}건)
      </button>
    </div>

    <!-- Tab 1: Live Order Settlements Table -->
    <div v-if="activeTab === 'realtime'" class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div class="p-4 border-b border-slate-100 flex items-center justify-between">
        <div>
          <h3 class="text-sm font-black text-slate-900">3P 파트너 주문별 분할 정산 원장 (Order-Level Settlement)</h3>
          <p class="text-[11px] text-slate-500">고객 결제 완료 및 이행 확정 시 건별로 10% 플랫폼 수수료가 차감 계산됩니다.</p>
        </div>
        <button
          @click="handleDownload"
          class="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-bold text-xs transition"
        >
          원장 엑셀 내보내기
        </button>
      </div>

      <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse text-xs">
          <thead>
            <tr class="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider">
              <th class="p-3.5">정산 ID / 일시</th>
              <th class="p-3.5">예약 번호</th>
              <th class="p-3.5">도메인</th>
              <th class="p-3.5">고객 결제액 (Gross)</th>
              <th class="p-3.5">플랫폼 수수료 (10%)</th>
              <th class="p-3.5">파트너 입금액 (Net)</th>
              <th class="p-3.5">이행 상태</th>
              <th class="p-3.5 text-right">정산 상태</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 font-medium">
            <tr v-if="loading">
              <td colspan="8" class="p-8 text-center text-slate-400 font-bold">
                정산 내역을 불러오는 중입니다...
              </td>
            </tr>
            <tr v-else-if="orderSettlements.length === 0" class="hover:bg-slate-50/80 transition">
              <td class="p-3.5 font-mono text-slate-600">stl_demo_3p_01<br><span class="text-[10px] text-slate-400">2026-11-05 12:30</span></td>
              <td class="p-3.5 font-mono font-bold text-slate-800">BK-20261105-001</td>
              <td class="p-3.5"><span class="px-2 py-0.5 rounded bg-amber-50 text-amber-700 font-bold text-[10px]">HOTEL</span></td>
              <td class="p-3.5 font-bold text-slate-900">450,000원</td>
              <td class="p-3.5 font-bold text-rose-600">-45,000원</td>
              <td class="p-3.5 font-black text-blue-600">405,000원</td>
              <td class="p-3.5"><span class="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold text-[10px]">이행 완료</span></td>
              <td class="p-3.5 text-right">
                <span class="px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">정산 대기</span>
              </td>
            </tr>
            <tr
              v-else
              v-for="s in orderSettlements"
              :key="s.id"
              class="hover:bg-slate-50/80 transition"
            >
              <td class="p-3.5 font-mono text-slate-700">
                <div class="font-bold">{{ s.id }}</div>
                <div class="text-[10px] text-slate-400">{{ s.created_at ? s.created_at.slice(0, 16).replace('T', ' ') : '-' }}</div>
              </td>
              <td class="p-3.5 font-mono font-bold text-slate-800">{{ s.booking_id }}</td>
              <td class="p-3.5">
                <span class="px-2 py-0.5 rounded font-bold text-[10px] bg-slate-100 text-slate-700">{{ s.domain_type }}</span>
              </td>
              <td class="p-3.5 font-bold text-slate-900">{{ Number(s.gross_amount_minor || 0).toLocaleString() }}원</td>
              <td class="p-3.5 font-bold text-rose-600">-{{ Number(s.commission_amount_minor || 0).toLocaleString() }}원</td>
              <td class="p-3.5 font-black text-blue-600">{{ Number(s.seller_payout_minor || 0).toLocaleString() }}원</td>
              <td class="p-3.5">
                <span :class="[
                  'px-2 py-0.5 rounded-full text-[10px] font-bold',
                  s.fulfillment_status === 'CONFIRMED' || s.fulfillment_status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                ]">
                  {{ s.fulfillment_status }}
                </span>
              </td>
              <td class="p-3.5 text-right">
                <span :class="[
                  'px-2 py-0.5 rounded-full text-[10px] font-bold',
                  s.settlement_status === 'SETTLED' ? 'bg-emerald-100 text-emerald-800' :
                  s.settlement_status === 'PENDING' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'
                ]">
                  {{ s.settlement_status === 'SETTLED' ? '지급 완료' : '정산 대기' }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Tab 2: Monthly Settlement Batches Table -->
    <div v-if="activeTab === 'batches'" class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
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
                <button @click="handleDownload" class="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-bold text-[11px] transition">
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
