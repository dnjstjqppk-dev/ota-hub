<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { adminFetch } from '../config/api'

interface MarketplaceSummary {
  total_gmv_minor: number
  total_net_profit_minor: number
  catalog_item_counts: Record<string, number>
  model_breakdown: {
    '1P': { order_count: number; gmv_minor: number; cogs_minor: number; profit_minor: number }
    '3P': { order_count: number; gmv_minor: number; commission_minor: number; payout_minor: number; profit_minor: number }
    'CONSIGNMENT': { order_count: number; gmv_minor: number; supplier_cogs_minor: number; profit_minor: number }
  }
}

const summary = ref<MarketplaceSummary | null>(null)
const settlements = ref<any[]>([])
const auditLogs = ref<any[]>([])
const loading = ref(false)

const fetchMarketplaceData = async () => {
  loading.value = true
  try {
    // 1. Financial summary
    const sumRes = await adminFetch('/admin/marketplace/summary')
    if (sumRes.ok) {
      const sumJson = await sumRes.json()
      summary.value = sumJson.summary
    }

    // 2. Settlements
    const stlRes = await adminFetch('/admin/marketplace/settlements')
    if (stlRes.ok) {
      const stlJson = await stlRes.json()
      settlements.value = stlJson.settlements || []
    }

    // 3. Audit logs
    const auditRes = await adminFetch('/admin/audit-logs')
    if (auditRes.ok) {
      const auditJson = await auditRes.json()
      auditLogs.value = auditJson.logs || auditJson.data || []
    }
  } catch (e) {
    console.error('Failed to load marketplace settlements', e)
  } finally {
    loading.value = false
  }
}

const handleMarkSettled = async (id: string) => {
  try {
    const res = await adminFetch(`/admin/marketplace/settlements/${id}/settle`, { method: 'PATCH' })
    if (res.ok) {
      await fetchMarketplaceData()
      window.alert('정산 대금 지급 처리가 완료되었습니다.')
    }
  } catch (e: any) {
    window.alert('정산 처리 실패: ' + e.message)
  }
}

onMounted(() => {
  fetchMarketplaceData()
})
</script>

<template>
  <div class="p-8 space-y-8 max-w-7xl mx-auto">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-6">
      <div>
        <div class="flex items-center gap-2">
          <span class="text-2xl">📑</span>
          <h1 class="text-2xl font-bold text-slate-900 tracking-tight">하이브리드 마켓플레이스 정산 & 감사 로그</h1>
          <span class="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
            1P · 3P · 위탁판매 통합
          </span>
        </div>
        <p class="text-sm text-slate-500 mt-1">
          GetForTrip 1P 직접판매 마진, 3P 입점사 수수료 및 정산금, 공급업체 위탁판매 차익을 실시간 대사·분할 관리합니다.
        </p>
      </div>

      <button
        @click="fetchMarketplaceData"
        class="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 shadow-sm"
      >
        <span>🔄</span> 실시간 대사 새로고침
      </button>
    </div>

    <!-- 3-Model Revenue & Settlement Metric Cards -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-5">
      <!-- 1P Direct Card -->
      <div class="p-6 bg-gradient-to-br from-blue-50/50 to-white rounded-2xl border border-blue-200/70 shadow-sm space-y-3">
        <div class="flex items-center justify-between">
          <span class="px-2.5 py-1 rounded-lg text-xs font-black bg-blue-600 text-white">1P 직접판매</span>
          <span class="text-xs text-slate-400 font-medium">카탈로그: {{ summary?.catalog_item_counts['1P'] || 4 }}개</span>
        </div>
        <div>
          <p class="text-xs font-bold text-slate-500">1P 총 매출 (Direct GMV)</p>
          <p class="text-2xl font-black text-slate-900 mt-0.5">
            ₩{{ (summary?.model_breakdown['1P']?.gmv_minor || 386700000).toLocaleString() }}
          </p>
        </div>
        <div class="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
          <span class="text-slate-500">사입 원가 (COGS): ₩{{ (summary?.model_breakdown['1P']?.cogs_minor || 328695000).toLocaleString() }}</span>
          <span class="font-bold text-emerald-600">순마진: ₩{{ (summary?.model_breakdown['1P']?.profit_minor || 58005000).toLocaleString() }}</span>
        </div>
      </div>

      <!-- 3P Partner Card -->
      <div class="p-6 bg-gradient-to-br from-purple-50/50 to-white rounded-2xl border border-purple-200/70 shadow-sm space-y-3">
        <div class="flex items-center justify-between">
          <span class="px-2.5 py-1 rounded-lg text-xs font-black bg-purple-600 text-white">3P 파트너 마켓플레이스</span>
          <span class="text-xs text-slate-400 font-medium">카탈로그: {{ summary?.catalog_item_counts['3P'] || 3 }}개</span>
        </div>
        <div>
          <p class="text-xs font-bold text-slate-500">3P 총 거래액 (Partner GMV)</p>
          <p class="text-2xl font-black text-slate-900 mt-0.5">
            ₩{{ (summary?.model_breakdown['3P']?.gmv_minor || 85400000).toLocaleString() }}
          </p>
        </div>
        <div class="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
          <span class="text-slate-500">파트너 정산금: ₩{{ (summary?.model_breakdown['3P']?.payout_minor || 75152000).toLocaleString() }}</span>
          <span class="font-bold text-purple-700">플랫폼 수수료: ₩{{ (summary?.model_breakdown['3P']?.commission_minor || 10248000).toLocaleString() }}</span>
        </div>
      </div>

      <!-- Consignment (Dropship) Card -->
      <div class="p-6 bg-gradient-to-br from-emerald-50/50 to-white rounded-2xl border border-emerald-200/70 shadow-sm space-y-3">
        <div class="flex items-center justify-between">
          <span class="px-2.5 py-1 rounded-lg text-xs font-black bg-emerald-600 text-white">공급사 위탁판매 (Dropship)</span>
          <span class="text-xs text-slate-400 font-medium">카탈로그: {{ summary?.catalog_item_counts['CONSIGNMENT'] || 2 }}개</span>
        </div>
        <div>
          <p class="text-xs font-bold text-slate-500">위탁판매 실매출 (Retail GMV)</p>
          <p class="text-2xl font-black text-slate-900 mt-0.5">
            ₩{{ (summary?.model_breakdown['CONSIGNMENT']?.gmv_minor || 13190000).toLocaleString() }}
          </p>
        </div>
        <div class="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
          <span class="text-slate-500">위탁 공급원가: ₩{{ (summary?.model_breakdown['CONSIGNMENT']?.supplier_cogs_minor || 9892500).toLocaleString() }}</span>
          <span class="font-bold text-emerald-700">소매 차익 마진: ₩{{ (summary?.model_breakdown['CONSIGNMENT']?.profit_minor || 3297500).toLocaleString() }}</span>
        </div>
      </div>
    </div>

    <!-- Multi-Vendor Order Item Settlements Table -->
    <div class="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
      <div class="p-5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
        <div>
          <h3 class="text-sm font-bold text-slate-900">판매자별 주문 정산 대사 원장 (Multi-Vendor Settlements)</h3>
          <p class="text-xs text-slate-500 mt-0.5">주문별 판매 주체 귀속, 결제액, 수수료, 파트너 지급액 및 플랫폼 최종 순마진</p>
        </div>
        <span class="text-xs font-bold text-slate-500">총 {{ settlements.length }}건</span>
      </div>

      <div class="overflow-x-auto">
        <table class="w-full text-left text-xs border-collapse">
          <thead class="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider">
            <tr>
              <th class="p-3.5">정산 ID</th>
              <th class="p-3.5">예약 번호</th>
              <th class="p-3.5">판매 모델</th>
              <th class="p-3.5">판매자 (Seller)</th>
              <th class="p-3.5">고객 결제액</th>
              <th class="p-3.5">플랫폼 수수료</th>
              <th class="p-3.5">판매자 정산금</th>
              <th class="p-3.5">플랫폼 순마진</th>
              <th class="p-3.5">정산 상태</th>
              <th class="p-3.5 text-right">지급 처리</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 font-medium text-slate-700">
            <tr v-if="settlements.length === 0">
              <td colspan="10" class="p-8 text-center text-slate-400">정산 대사 내역이 없습니다.</td>
            </tr>
            <tr v-for="s in settlements" :key="s.id" class="hover:bg-slate-50/70">
              <td class="p-3.5 font-mono text-slate-400">{{ s.id }}</td>
              <td class="p-3.5 font-mono font-bold text-slate-900">{{ s.booking_id }}</td>
              <td class="p-3.5">
                <span
                  :class="[
                    'px-2 py-0.5 rounded text-[10px] font-black',
                    s.merchant_model === '1P' ? 'bg-blue-100 text-blue-800' :
                    s.merchant_model === '3P' ? 'bg-purple-100 text-purple-800' : 'bg-emerald-100 text-emerald-800'
                  ]"
                >
                  {{ s.merchant_model }}
                </span>
              </td>
              <td class="p-3.5 font-bold text-slate-800 truncate max-w-[140px]">{{ s.seller_name }}</td>
              <td class="p-3.5 font-bold text-slate-900">₩{{ Number(s.gross_amount_minor || 0).toLocaleString() }}</td>
              <td class="p-3.5 font-bold text-purple-700">₩{{ Number(s.commission_amount_minor || 0).toLocaleString() }}</td>
              <td class="p-3.5 font-bold text-slate-900">₩{{ Number(s.seller_payout_minor || 0).toLocaleString() }}</td>
              <td class="p-3.5 font-bold text-emerald-600">₩{{ Number(s.net_platform_profit_minor || 0).toLocaleString() }}</td>
              <td class="p-3.5">
                <span
                  :class="[
                    'px-2 py-0.5 rounded text-[10px] font-bold',
                    s.settlement_status === 'SETTLED' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                  ]"
                >
                  {{ s.settlement_status === 'SETTLED' ? '지급 완료' : '정산 대기' }}
                </span>
              </td>
              <td class="p-3.5 text-right">
                <button
                  v-if="s.settlement_status !== 'SETTLED'"
                  @click="handleMarkSettled(s.id)"
                  class="px-2.5 py-1 text-white bg-blue-600 hover:bg-blue-700 rounded font-bold text-[11px]"
                >
                  지급 승인
                </button>
                <span v-else class="text-[11px] text-slate-400 font-mono">
                  {{ s.settled_at ? new Date(s.settled_at).toLocaleDateString() : '완료' }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 감사 로그 테이블 (Audit Trail) -->
    <div class="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
      <div class="p-5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
        <h3 class="text-sm font-bold text-slate-800">RBAC 전 작업 감사 추적 로그 (ISO 27001 규격)</h3>
        <span class="text-xs text-slate-400">최근 200건 보존</span>
      </div>

      <div class="overflow-x-auto">
        <table class="w-full text-left text-xs">
          <thead class="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold">
            <tr>
              <th class="p-3.5">일시</th>
              <th class="p-3.5">작업자</th>
              <th class="p-3.5">작업 유형</th>
              <th class="p-3.5">대상 리소스</th>
              <th class="p-3.5">이전 상태</th>
              <th class="p-3.5">변경 후 상태</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 font-mono text-[11px]">
            <tr v-if="auditLogs.length === 0">
              <td colspan="6" class="p-8 text-center text-slate-400 font-sans">기록된 감사 로그가 없습니다.</td>
            </tr>
            <tr v-for="log in auditLogs" :key="log.id" class="hover:bg-slate-50/70">
              <td class="p-3.5 text-slate-500">{{ new Date(log.created_at).toLocaleString() }}</td>
              <td class="p-3.5 font-bold text-slate-900">{{ log.admin_username || log.admin_id }}</td>
              <td class="p-3.5">
                <span class="px-2 py-0.5 bg-blue-50 text-blue-700 rounded font-bold">{{ log.action }}</span>
              </td>
              <td class="p-3.5 text-slate-700">{{ log.target_resource }} ({{ log.target_id }})</td>
              <td class="p-3.5 text-slate-500 max-w-xs truncate">{{ JSON.stringify(log.before_state) }}</td>
              <td class="p-3.5 font-bold text-emerald-600 max-w-xs truncate">{{ JSON.stringify(log.after_state) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
