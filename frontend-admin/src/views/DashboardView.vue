<script setup lang="ts">
/**
 * Operations dashboard. Every number is read from GET /admin/dashboard and /admin/reconciliation;
 * when the API fails the page says so instead of showing sample figures.
 */
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../composables/session'
import { useResource } from '../composables/useResource'
import { bookingStatus, dateTime, krw, num } from '../composables/format'
import PageHeader from '../components/PageHeader.vue'
import StatCard from '../components/StatCard.vue'
import StatePanel from '../components/StatePanel.vue'
import StatusBadge from '../components/StatusBadge.vue'

const router = useRouter()
const dash = useResource(() => api('/admin/dashboard'), null as any)
const recon = useResource(() => api('/admin/reconciliation'), null as any)
onMounted(() => { dash.reload(); recon.reload() })

const m = computed(() => dash.data.value?.metrics || {})
const byStatus = computed(() => [...(dash.data.value?.byStatus || [])].sort((a: any, b: any) => b.c - a.c))
const statusMax = computed(() => Math.max(1, ...byStatus.value.map((s: any) => Number(s.c) || 0)))
const ledger = computed(() => dash.data.value?.ledgerBalances || [])
const issues = computed(() => {
  const r = recon.data.value
  if (!r) return []
  return [
    { label: '대차 불일치 분개', n: r.unbalancedJournals?.length || 0 },
    { label: '결제액 불일치 예약', n: r.paidMismatch?.length || 0 },
    { label: '환불액 불일치 예약', n: r.refundMismatch?.length || 0 },
    { label: '종료 예약에 남은 예치금', n: r.strandedDeposits?.length || 0 }
  ]
})
const ACCOUNT: Record<string, string> = {
  PG_CLEARING: 'PG 정산 대기', CUSTOMER_DEPOSITS: '고객 예치금', SUPPLIER_PAYABLE: '공급사 미지급금',
  COMMISSION_REVENUE: '수수료 수익', CANCELLATION_FEE_REVENUE: '취소 수수료 수익', PROMOTION_EXPENSE: '프로모션 비용'
}
</script>

<template>
  <div>
    <PageHeader title="대시보드" description="예약·결제·환불 현황과 회계 정합성을 한눈에 확인해요.">
      <button type="button" class="btn-secondary btn-sm" @click="dash.reload(); recon.reload()"><AppIcon name="refresh" :size="14" />새로고침</button>
    </PageHeader>

    <StatePanel :state="dash.state.value" :error="dash.error.value" :rows="3" @retry="dash.reload()">
      <section class="grid grid-cols-2 gap-3 lg:grid-cols-4 [&>*]:min-w-0" aria-label="주요 지표">
        <StatCard label="확인 필요 · 수동 검토" :value="num(m.manualReview)" icon="alert" :tone="m.manualReview ? 'danger' : 'neutral'" to="/bookings?status=MANUAL_REVIEW_REQUIRED" />
        <StatCard label="공급사 확정 대기" :value="num(m.supplierPending)" icon="server" :tone="m.supplierPending ? 'warning' : 'neutral'" to="/bookings?status=SUPPLIER_BOOKING_PENDING" />
        <StatCard label="환불 처리 대기" :value="num(m.pendingRefunds)" icon="refund" :tone="m.pendingRefunds ? 'warning' : 'neutral'" to="/bookings?status=REFUND_PENDING" />
        <StatCard label="전체 예약" :value="num(m.totalBookings)" icon="bookings" tone="info" to="/bookings" />
        <StatCard label="결제 승인액 (누적)" :value="krw(m.grossCapturedMinor)" :hint="`승인 ${num(m.capturedPayments)}건`" icon="coins" tone="success" />
        <StatCard label="환불 완료액 (누적)" :value="krw(m.refundedMinor)" icon="refund" />
        <StatCard label="순 결제액" :value="krw((Number(m.grossCapturedMinor) || 0) - (Number(m.refundedMinor) || 0))" hint="승인액 − 환불액" icon="ledger" />
        <StatCard label="회원" :value="num(m.totalUsers)" icon="users" to="/users" />
      </section>

      <div class="mt-6 grid gap-6 xl:grid-cols-3 [&>*]:min-w-0">
        <section class="card p-5 xl:col-span-2" aria-labelledby="h-recent">
          <div class="mb-3 flex items-center justify-between">
            <h2 id="h-recent" class="font-bold text-ink">최근 예약</h2>
            <router-link to="/bookings" class="text-sm font-semibold text-primary">전체 보기</router-link>
          </div>
          <p v-if="!dash.data.value?.recentBookings?.length" class="py-6 text-center text-sm text-ink-muted">아직 예약이 없어요.</p>
          <ul v-else class="divide-y divide-line">
            <li v-for="b in dash.data.value.recentBookings" :key="b.id">
              <button type="button" class="flex w-full items-center gap-3 py-2.5 text-left hover:bg-surface-sunken/60" @click="router.push(`/bookings?id=${b.id}`)">
                <div class="min-w-0 flex-1">
                  <p class="truncate text-sm font-semibold text-ink">{{ b.title }}</p>
                  <p class="truncate text-xs text-ink-subtle"><span class="font-mono">{{ b.booking_number }}</span> · {{ b.customer_name || '—' }} · {{ dateTime(b.created_at) }}</p>
                </div>
                <span class="hidden text-sm font-semibold text-ink tabular sm:block">{{ krw(b.total_minor) }}</span>
                <StatusBadge v-bind="bookingStatus(b.status)" />
              </button>
            </li>
          </ul>
        </section>

        <section class="card p-5" aria-labelledby="h-status">
          <h2 id="h-status" class="mb-3 font-bold text-ink">상태별 예약</h2>
          <p v-if="!byStatus.length" class="py-6 text-center text-sm text-ink-muted">데이터가 없어요.</p>
          <ul v-else class="space-y-2.5">
            <li v-for="s in byStatus" :key="s.status">
              <router-link :to="`/bookings?status=${s.status}`" class="block">
                <div class="mb-1 flex justify-between text-xs"><span class="font-medium text-ink">{{ bookingStatus(s.status).label }}</span><span class="text-ink-muted tabular">{{ num(s.c) }}건</span></div>
                <div class="h-1.5 overflow-hidden rounded-full bg-surface-sunken"><div class="h-full rounded-full bg-primary" :style="{ width: `${(Number(s.c) / statusMax) * 100}%` }" /></div>
              </router-link>
            </li>
          </ul>
        </section>
      </div>

      <div class="mt-6 grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
        <section class="card p-5" aria-labelledby="h-recon">
          <div class="mb-3 flex items-center justify-between">
            <h2 id="h-recon" class="font-bold text-ink">회계 정합성 점검</h2>
            <StatusBadge v-if="recon.state.value === 'ready'" :tone="recon.data.value?.ok ? 'success' : 'danger'" :label="recon.data.value?.ok ? '이상 없음' : '불일치 발견'" />
          </div>
          <p v-if="recon.state.value === 'loading'" class="text-sm text-ink-subtle">점검 중…</p>
          <p v-else-if="recon.state.value === 'error'" class="text-sm text-danger">{{ recon.error.value }}</p>
          <ul v-else class="divide-y divide-line text-sm">
            <li v-for="i in issues" :key="i.label" class="flex justify-between py-2"><span class="text-ink-muted">{{ i.label }}</span><span :class="['font-semibold tabular', i.n ? 'text-danger' : 'text-ink']">{{ i.n }}건</span></li>
          </ul>
        </section>

        <section class="card p-5" aria-labelledby="h-ledger">
          <h2 id="h-ledger" class="mb-3 font-bold text-ink">원장 계정 잔액</h2>
          <p v-if="!ledger.length" class="py-6 text-center text-sm text-ink-muted">분개 기록이 없어요.</p>
          <ul v-else class="divide-y divide-line text-sm">
            <li v-for="l in ledger" :key="l.account" class="flex justify-between gap-3 py-2">
              <span class="text-ink-muted">{{ ACCOUNT[l.account] || l.account }} <span class="font-mono text-2xs text-ink-subtle">{{ l.account }}</span></span>
              <span class="font-semibold text-ink tabular">{{ krw(l.balance) }}</span>
            </li>
          </ul>
          <p class="mt-3 text-2xs text-ink-subtle">차변 − 대변 기준 잔액이에요.</p>
        </section>
      </div>
    </StatePanel>
  </div>
</template>
