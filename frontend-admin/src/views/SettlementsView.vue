<script setup lang="ts">
/**
 * Settlements and audit trail. Figures are the sums the server computes from marketplace_order_settlements
 * (GET /admin/marketplace/summary) — zero means zero, never a sample figure. Payout is a conditional
 * update on the server (PENDING/HELD only, once). Audit log: GET /admin/audit-logs (latest 200).
 */
import { computed, onMounted, ref, watch } from 'vue'
import { api, toast } from '../composables/session'
import { useResource } from '../composables/useResource'
import { dateTime, domainLabel, krw, num } from '../composables/format'
import PageHeader from '../components/PageHeader.vue'
import StatCard from '../components/StatCard.vue'
import StatePanel from '../components/StatePanel.vue'
import StatusBadge from '../components/StatusBadge.vue'

const tab = ref<'settlements' | 'audit'>('settlements')
const statusFilter = ref('')
const summary = useResource(async () => (await api('/admin/marketplace/summary')).summary, null as any)
const rows = useResource(async () => (await api(`/admin/marketplace/settlements${statusFilter.value ? `?status=${statusFilter.value}` : ''}`)).settlements || [], [] as any[])
const logs = useResource(async () => (await api('/admin/audit-logs')).logs || [], [] as any[])
watch(statusFilter, () => rows.reload())
watch(tab, (t) => { if (t === 'audit' && logs.state.value !== 'ready') logs.reload() })
onMounted(() => { summary.reload(); rows.reload() })

const MODEL: Record<string, string> = { '1P': '직매입 (1P)', '3P': '입점 판매 (3P)', CONSIGNMENT: '위탁' }
const STATUS: Record<string, { label: string; tone: any }> = {
  PENDING: { label: '지급 대기', tone: 'warning' }, HELD: { label: '보류', tone: 'neutral' },
  SETTLED: { label: '지급 완료', tone: 'success' }, REFUNDED: { label: '환불됨', tone: 'neutral' }
}
const s = computed(() => summary.data.value)

const paying = ref('')
async function payout(r: any) {
  if (!confirm(`${r.seller_name}에게 ${krw(r.seller_payout_minor)} 지급 완료로 처리할까요? 실제 송금은 별도로 해야 해요.`)) return
  paying.value = r.id
  try {
    await api(`/admin/marketplace/settlements/${r.id}/settle`, { method: 'PATCH' })
    toast('지급 완료로 처리했어요.')
    rows.reload(); summary.reload()
  } catch (e) { toast((e as Error).message, 'danger', 6000) } finally { paying.value = '' }
}

const logQuery = ref('')
const filteredLogs = computed(() => {
  const t = logQuery.value.trim().toLowerCase()
  if (!t) return logs.data.value
  return logs.data.value.filter((l: any) => [l.action, l.target_type, l.target_id, l.admin_id, l.details].some((v) => String(v || '').toLowerCase().includes(t)))
})
function details(d: string | null) {
  if (!d) return ''
  try { return JSON.stringify(JSON.parse(d)) } catch { return d }
}
</script>

<template>
  <div>
    <PageHeader title="정산·감사 로그" description="거래 모델별 매출과 파트너 지급 현황, 운영자 작업 기록을 확인해요." />

    <div class="mb-5 flex gap-1 border-b border-line" role="tablist">
      <button v-for="t in [{ k: 'settlements', l: '정산' }, { k: 'audit', l: '감사 로그' }]" :key="t.k" type="button" role="tab" :aria-selected="tab === t.k"
        :class="['-mb-px border-b-2 px-4 py-2 text-sm font-semibold transition-colors', tab === t.k ? 'border-primary text-primary' : 'border-transparent text-ink-muted hover:text-ink']" @click="tab = t.k as any">{{ t.l }}</button>
    </div>

    <template v-if="tab === 'settlements'">
      <StatePanel :state="summary.state.value" :error="summary.error.value" :rows="1" @retry="summary.reload()">
        <section v-if="s" class="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4 [&>*]:min-w-0" aria-label="정산 요약">
          <StatCard label="총 거래액" :value="krw(s.total_gmv_minor)" icon="coins" tone="info" />
          <StatCard label="플랫폼 순이익" :value="krw(s.total_net_profit_minor)" icon="ledger" tone="success" />
          <StatCard :label="MODEL['3P']" :value="krw(s.model_breakdown['3P'].gmv_minor)" :hint="`${num(s.model_breakdown['3P'].order_count)}건 · 수수료 ${krw(s.model_breakdown['3P'].commission_minor)} · 지급 ${krw(s.model_breakdown['3P'].payout_minor)}`" icon="building" />
          <StatCard :label="MODEL['1P']" :value="krw(s.model_breakdown['1P'].gmv_minor)" :hint="`${num(s.model_breakdown['1P'].order_count)}건 · 원가 ${krw(s.model_breakdown['1P'].cogs_minor)}`" icon="package" />
        </section>
      </StatePanel>

      <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 class="font-bold text-ink">정산 내역</h2>
        <div class="flex flex-wrap gap-1.5" role="group" aria-label="정산 상태 필터">
          <button type="button" class="chip" :aria-pressed="!statusFilter" @click="statusFilter = ''">전체</button>
          <button v-for="(v, k) in STATUS" :key="k" type="button" class="chip" :aria-pressed="statusFilter === k" @click="statusFilter = k">{{ v.label }}</button>
        </div>
      </div>
      <StatePanel :state="rows.state.value" :error="rows.error.value" :empty="!rows.data.value.length" empty-text="정산 내역이 없어요." @retry="rows.reload()">
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>판매자</th><th>모델</th><th>상품군</th><th class="text-right">거래액</th><th class="text-right">수수료</th><th class="text-right">지급액</th><th>상태</th><th>생성</th><th class="w-px"></th></tr></thead>
            <tbody>
              <tr v-for="r in rows.data.value" :key="r.id">
                <td><p class="font-medium">{{ r.seller_name }}</p><p class="font-mono text-2xs text-ink-subtle">{{ r.booking_id }}</p></td>
                <td class="text-xs">{{ MODEL[r.merchant_model] || r.merchant_model }}</td>
                <td class="text-xs">{{ domainLabel(r.domain_type) }}</td>
                <td class="text-right tabular">{{ krw(r.gross_amount_minor) }}</td>
                <td class="text-right tabular">{{ krw(r.commission_amount_minor) }}</td>
                <td class="text-right font-semibold tabular">{{ krw(r.seller_payout_minor) }}</td>
                <td><StatusBadge v-bind="STATUS[r.settlement_status] || { label: r.settlement_status }" /></td>
                <td class="whitespace-nowrap text-xs text-ink-muted tabular">{{ dateTime(r.created_at) }}</td>
                <td><button v-if="r.settlement_status === 'PENDING' || r.settlement_status === 'HELD'" type="button" class="btn-secondary btn-sm" :disabled="paying === r.id" @click="payout(r)">지급 완료 처리</button></td>
              </tr>
            </tbody>
          </table>
        </div>
      </StatePanel>
    </template>

    <template v-else>
      <div class="mb-3 sm:w-80">
        <label for="log-q" class="sr-only">감사 로그 필터</label>
        <input id="log-q" v-model="logQuery" class="input" placeholder="작업, 대상, 관리자 ID로 거르기" />
      </div>
      <StatePanel :state="logs.state.value" :error="logs.error.value" :empty="!filteredLogs.length" empty-text="기록이 없어요." @retry="logs.reload()">
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>시각</th><th>작업</th><th>대상</th><th>관리자</th><th>내용</th></tr></thead>
            <tbody>
              <tr v-for="l in filteredLogs" :key="l.id">
                <td class="whitespace-nowrap text-xs tabular">{{ dateTime(l.created_at) }}</td>
                <td class="font-mono text-xs">{{ l.action }}</td>
                <td class="text-xs"><span class="text-ink-muted">{{ l.target_type }}</span> <span class="font-mono">{{ l.target_id }}</span></td>
                <td class="font-mono text-2xs text-ink-muted">{{ l.admin_id }}</td>
                <td><p class="max-w-[360px] truncate font-mono text-2xs text-ink-muted" :title="details(l.details)">{{ details(l.details) }}</p></td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="mt-2 text-2xs text-ink-subtle">최근 200건이에요.</p>
      </StatePanel>
    </template>
  </div>
</template>
