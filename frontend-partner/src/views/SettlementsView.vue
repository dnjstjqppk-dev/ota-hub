<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { apiUrl, partnerToken } from '../config/api'

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
const error = ref('')

const summary = ref({
  totalGrossKrw: 0,
  totalCommissionKrw: 0,
  totalNetPayoutKrw: 0,
  pendingPayoutKrw: 0,
  nextPayoutDate: '' as string | null,
  payoutBank: null as string | null
})

const fetchSettlements = async () => {
  loading.value = true
  error.value = ''
  try {
    const token = partnerToken()
    const headers = { Authorization: `Bearer ${token}` }

    // 1. Fetch live marketplace order settlements
    const mktRes = await fetch(apiUrl('/partner/marketplace/settlements'), { headers })
    if (mktRes.ok) {
      const data = await mktRes.json()
      orderSettlements.value = data.settlements || []
    }

    // 2. Fetch periodic settlement batches
    const batchRes = await fetch(apiUrl('/partner/settlements'), { headers })
    if (!batchRes.ok) throw new Error('정산 내역을 불러오지 못했습니다.')
    const json = await batchRes.json()
    batches.value = json.batches || []
    if (json.summary) {
      summary.value = {
        totalGrossKrw: json.summary.totalGrossKrw || 0,
        totalCommissionKrw: json.summary.totalCommissionKrw || 0,
        totalNetPayoutKrw: json.summary.totalNetPayoutKrw || 0,
        pendingPayoutKrw: summary.value.pendingPayoutKrw,
        nextPayoutDate: json.summary.nextPayoutDate || null,
        payoutBank: json.summary.payoutBank || null
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
  } catch (e: any) {
    error.value = e.message || '정산 내역을 불러오지 못했습니다.'
  } finally {
    loading.value = false
  }
}

function csvCell(v: unknown): string {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Real CSV export of the currently visible ledger (no server round-trip needed). Prepends a U+FEFF BOM so Excel opens UTF-8 correctly. */
const handleDownload = () => {
  const rows: string[][] = activeTab.value === 'realtime'
    ? [
        ['정산ID', '일시', '예약번호', '도메인', '고객결제액', '수수료', '입금액', '이행상태', '정산상태'],
        ...orderSettlements.value.map(s => [s.id, s.created_at, s.booking_id, s.domain_type, s.gross_amount_minor, s.commission_amount_minor, s.seller_payout_minor, s.fulfillment_status, s.settlement_status])
      ]
    : [
        ['정산주기', '총공급액', '수수료', '실지급액', '상태', '지급일시'],
        ...batches.value.map(b => [`${b.period_start}~${b.period_end}`, b.gross_minor, b.commission_minor, b.payout_minor, b.status, b.payout_date])
      ]
  const csv = '﻿' + rows.map(r => r.map(csvCell).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `getfortrip-settlement-${activeTab.value}-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

onMounted(() => {
  fetchSettlements()
})
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-col justify-between gap-4 md:flex-row md:items-center">
      <div>
        <h1 class="flex items-center gap-2 text-2xl font-black tracking-tight text-ink">
          <span>정산 명세서 & 정산 계좌</span>
          <span class="rounded-full bg-primary-soft px-2.5 py-0.5 text-xs font-bold text-primary">3P 입점 마켓플레이스</span>
        </h1>
        <p class="mt-1 text-sm font-medium text-ink-subtle">
          주문별 실시간 공급 매출, 플랫폼 수수료 차감 내역 및 월별 정산 확정 명세서를 확인합니다.
        </p>
      </div>
      <div class="flex items-center gap-2">
        <button
          type="button"
          class="btn-secondary btn-sm !text-xs"
          @click="fetchSettlements"
        >
          <AppIcon name="refresh" :size="14" />새로고침
        </button>
        <router-link
          to="/profile"
          class="btn-secondary btn-sm !text-xs"
        >
          정산 입금 통장 변경
        </router-link>
      </div>
    </div>

    <div v-if="error" class="rounded-2xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm font-semibold text-danger">
      {{ error }}
      <button type="button" class="ml-2 underline" @click="fetchSettlements">다시 시도</button>
    </div>

    <!-- Settlement Summary Cards -->
    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div class="card space-y-1.5 p-5">
        <div class="text-xs font-bold text-ink-subtle">누적 총 공급액 (Gross GMV)</div>
        <div class="text-2xl font-black tabular text-ink">{{ (summary.totalGrossKrw || 0).toLocaleString() }}원</div>
        <div class="text-[11px] text-ink-subtle">파트너 등록 상품 주문 총 결제액</div>
      </div>
      <div class="card space-y-1.5 p-5">
        <div class="text-xs font-bold text-ink-subtle">플랫폼 수수료 공제액</div>
        <div class="text-2xl font-black tabular text-danger">-{{ (summary.totalCommissionKrw || 0).toLocaleString() }}원</div>
        <div class="text-[11px] text-ink-subtle">PG 결제대행 및 getfortrip 플랫폼 수수료</div>
      </div>
      <div class="rounded-card border border-primary/30 bg-primary-soft p-5 shadow-card space-y-1.5">
        <div class="text-xs font-bold text-primary">누적 파트너 정산액 (Net Payout)</div>
        <div class="text-2xl font-black tabular text-ink">{{ (summary.totalNetPayoutKrw || 0).toLocaleString() }}원</div>
        <div class="text-[11px] font-medium text-ink-muted">파트너 통장 입금 대상 합계</div>
      </div>
      <div class="card space-y-1.5 p-5">
        <div class="text-xs font-bold text-ink-subtle">차기 정산 입금 예정일</div>
        <div class="text-2xl font-black tabular text-success">{{ summary.nextPayoutDate || '-' }}</div>
        <div class="text-[11px] font-bold text-ink-muted">{{ summary.payoutBank || '입금 계좌를 등록해주세요' }}</div>
      </div>
    </div>

    <!-- Navigation Tabs -->
    <div class="flex items-center gap-2 border-b border-line pb-2" role="tablist" aria-label="정산 보기 전환">
      <button
        type="button"
        role="tab"
        :aria-selected="activeTab === 'realtime'"
        :class="[
          'rounded-xl px-4 py-2 text-xs font-black transition',
          activeTab === 'realtime'
            ? 'bg-primary text-primary-ink shadow-md'
            : 'border border-line bg-surface text-ink-muted hover:bg-surface-sunken'
        ]"
        @click="activeTab = 'realtime'"
      >
        주문별 실시간 정산 원장 ({{ orderSettlements.length }}건)
      </button>
      <button
        type="button"
        role="tab"
        :aria-selected="activeTab === 'batches'"
        :class="[
          'rounded-xl px-4 py-2 text-xs font-black transition',
          activeTab === 'batches'
            ? 'bg-primary text-primary-ink shadow-md'
            : 'border border-line bg-surface text-ink-muted hover:bg-surface-sunken'
        ]"
        @click="activeTab = 'batches'"
      >
        월별 정산 주기 명세서 ({{ batches.length }}건)
      </button>
    </div>

    <!-- Tab 1: Live Order Settlements Table -->
    <div v-if="activeTab === 'realtime'" class="card overflow-hidden">
      <div class="flex items-center justify-between border-b border-line p-4">
        <div>
          <h3 class="text-sm font-black text-ink">3P 파트너 주문별 분할 정산 원장 (Order-Level Settlement)</h3>
          <p class="text-[11px] text-ink-subtle">고객 결제 완료 및 이행 확정 시 건별로 플랫폼 수수료가 차감 계산됩니다.</p>
        </div>
        <button
          type="button"
          :disabled="!orderSettlements.length"
          class="btn-secondary btn-sm !text-xs disabled:opacity-50"
          @click="handleDownload"
        >
          원장 엑셀 내보내기
        </button>
      </div>

      <div class="overflow-x-auto">
        <table :class="['table text-xs', loading || orderSettlements.length ? '!min-w-[760px]' : 'w-full !min-w-0']">
          <thead>
            <tr>
              <th>정산 ID / 일시</th>
              <th>예약 번호</th>
              <th>도메인</th>
              <th>고객 결제액 (Gross)</th>
              <th>플랫폼 수수료</th>
              <th>파트너 입금액 (Net)</th>
              <th>이행 상태</th>
              <th class="!text-right">정산 상태</th>
            </tr>
          </thead>
          <tbody class="font-medium">
            <tr v-if="loading">
              <td colspan="8" class="p-8 text-center font-bold text-ink-subtle">
                정산 내역을 불러오는 중입니다...
              </td>
            </tr>
            <tr v-else-if="orderSettlements.length === 0">
              <td colspan="8" class="p-8 text-center font-bold text-ink-subtle">
                아직 정산 대상 주문이 없습니다.
              </td>
            </tr>
            <tr
              v-else
              v-for="s in orderSettlements"
              :key="s.id"
              class="transition hover:bg-surface-sunken"
            >
              <td class="font-mono">
                <div class="font-bold">{{ s.id }}</div>
                <div class="text-[10px] text-ink-subtle">{{ s.created_at ? s.created_at.slice(0, 16).replace('T', ' ') : '-' }}</div>
              </td>
              <td class="font-mono font-bold">{{ s.booking_id }}</td>
              <td>
                <span class="rounded bg-surface-sunken px-2 py-0.5 text-[10px] font-bold text-ink-muted">{{ s.domain_type }}</span>
              </td>
              <td class="font-bold tabular">{{ Number(s.gross_amount_minor || 0).toLocaleString() }}원</td>
              <td class="font-bold tabular text-danger">-{{ Number(s.commission_amount_minor || 0).toLocaleString() }}원</td>
              <td class="font-black tabular text-primary">{{ Number(s.seller_payout_minor || 0).toLocaleString() }}원</td>
              <td>
                <span :class="[
                  'rounded-full px-2 py-0.5 text-[10px] font-bold',
                  s.fulfillment_status === 'CONFIRMED' || s.fulfillment_status === 'COMPLETED' ? 'bg-success-soft text-success' : 'bg-surface-sunken text-ink-muted'
                ]">
                  {{ s.fulfillment_status }}
                </span>
              </td>
              <td class="!text-right">
                <span :class="[
                  'rounded-full px-2 py-0.5 text-[10px] font-bold',
                  s.settlement_status === 'SETTLED' ? 'bg-success-soft text-success' :
                  s.settlement_status === 'PENDING' ? 'bg-warning-soft text-warning' : 'bg-surface-sunken text-ink-muted'
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
    <div v-if="activeTab === 'batches'" class="card overflow-hidden">
      <div class="flex items-center justify-between border-b border-line p-4">
        <h3 class="text-sm font-black text-ink">정산 주기별 지급 명세서</h3>
        <button
          type="button"
          :disabled="!batches.length"
          class="btn-secondary btn-sm !text-xs disabled:opacity-50"
          @click="handleDownload"
        >
          명세서 내보내기
        </button>
      </div>

      <div class="overflow-x-auto">
        <table :class="['table text-xs', loading || batches.length ? '!min-w-[680px]' : 'w-full !min-w-0']">
          <thead>
            <tr>
              <th>정산 주기 (Period)</th>
              <th>총 공급액 (Gross)</th>
              <th>플랫폼 수수료</th>
              <th>최종 실지급액 (Net)</th>
              <th>지급 상태</th>
              <th>지급 완료 일시</th>
            </tr>
          </thead>
          <tbody class="font-medium">
            <tr v-if="loading">
              <td colspan="6" class="p-8 text-center font-bold text-ink-subtle">
                정산 명세서를 불러오는 중입니다...
              </td>
            </tr>
            <tr v-else-if="batches.length === 0">
              <td colspan="6" class="p-8 text-center font-bold text-ink-subtle">
                아직 확정된 월별 정산 명세서가 없습니다.
              </td>
            </tr>
            <tr
              v-else
              v-for="b in batches"
              :key="b.id"
              class="transition hover:bg-surface-sunken"
            >
              <td class="font-bold">{{ b.period_start }} ~ {{ b.period_end }}</td>
              <td class="font-bold tabular">{{ (b.gross_minor || 0).toLocaleString() }}원</td>
              <td class="font-bold tabular text-danger">-{{ (b.commission_minor || 0).toLocaleString() }}원</td>
              <td class="font-black tabular text-primary">{{ (b.payout_minor || 0).toLocaleString() }}원</td>
              <td>
                <span class="rounded-full bg-success-soft px-2 py-0.5 text-[10px] font-bold text-success">
                  {{ b.status }}
                </span>
              </td>
              <td class="font-mono text-ink-subtle">{{ b.payout_date || '-' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
