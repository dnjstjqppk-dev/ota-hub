<script setup lang="ts">
/**
 * CR-07 printable payout statement for one settlement batch. Figures come from
 * settled rows only; the e-tax invoice is issued manually by operations.
 */
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { dt, krw, pfetch } from '../config/http'

const route = useRoute()
const router = useRouter()
const id = String(route.params.id || '')
const st = ref<any>(null)
const loading = ref(true)
const error = ref('')
const DOMAIN: Record<string, string> = { HOTEL: '숙소', FLIGHT: '항공', TRAIN: '기차', CAR: '렌터카', TRANSFER: '공항 이동', ACTIVITY: '투어·티켓', PACKAGE: '패키지' }

async function load() {
  loading.value = true
  error.value = ''
  const r = await pfetch(`/partner/settlements/${encodeURIComponent(id)}/statement`)
  loading.value = false
  if (!r.ok) { error.value = r.data.error || '명세서를 불러오지 못했습니다.'; return }
  st.value = r.data.statement
}
function print() { window.print() }
function csv() {
  if (!st.value) return
  const q = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const rows = [['예약번호', '상품유형', '결제액', '수수료', '지급액', '회수차감', '실지급액', '정산상태', '정산일시'],
    ...st.value.lines.map((l: any) => [l.booking_number || l.booking_id, DOMAIN[l.domain_type] || l.domain_type, l.gross_amount_minor, l.commission_amount_minor, l.seller_payout_minor, l.recovery_deducted_minor, l.net_payout_minor, l.settlement_status, l.settled_at])]
  const blob = new Blob(['﻿' + rows.map((r) => r.map(q).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `statement_${id}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}
onMounted(load)
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-center justify-between gap-3 print:hidden">
      <button type="button" class="text-xs font-bold text-ink-muted hover:text-primary" @click="router.push('/settlements')">← 정산 목록으로</button>
      <div v-if="st" class="flex gap-2">
        <button type="button" class="btn-secondary btn-sm" @click="csv">CSV 내려받기</button>
        <button type="button" class="btn-primary btn-sm" @click="print">인쇄 / PDF 저장</button>
      </div>
    </div>

    <p v-if="loading" class="py-10 text-center text-sm font-bold text-ink-subtle">명세서를 불러오는 중입니다…</p>
    <div v-else-if="error" class="rounded-2xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm font-semibold text-danger">{{ error }} <button type="button" class="ml-2 underline" @click="load">다시 시도</button></div>

    <article v-else-if="st" class="card space-y-6 p-6 print:border-0 print:p-0">
      <header class="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-5">
        <div>
          <p class="text-xs font-semibold uppercase tracking-wide text-ink-subtle">정산 명세서</p>
          <h1 class="mt-1 text-xl font-black text-ink">{{ st.batch.period_start }} ~ {{ st.batch.period_end }}</h1>
          <p class="mt-1 font-mono text-xs text-ink-subtle">{{ st.batch.id }}</p>
        </div>
        <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
          <dt class="text-ink-subtle">상호</dt><dd class="font-bold text-ink">{{ st.partner.companyName }}</dd>
          <dt class="text-ink-subtle">사업자등록번호</dt><dd class="font-mono text-ink">{{ st.partner.businessNumber || '-' }}</dd>
          <dt class="text-ink-subtle">지급 계좌</dt><dd class="text-ink">{{ st.payoutAccount || '미등록' }}</dd>
          <dt class="text-ink-subtle">수수료율</dt><dd class="tabular text-ink">{{ st.partner.settlementRateBps != null ? `${(st.partner.settlementRateBps / 100).toFixed(2)}%` : '-' }}</dd>
          <dt class="text-ink-subtle">상태</dt><dd class="font-bold text-ink">{{ st.batch.status }}<span v-if="st.batch.payout_date"> · {{ st.batch.payout_date }} 지급</span></dd>
        </dl>
      </header>

      <section class="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div class="rounded-xl bg-surface-sunken p-4"><p class="label">결제액 합계</p><p class="text-lg font-black tabular text-ink">{{ krw(st.lines.length ? st.totals.gross : st.batch.gross_minor) }}</p></div>
        <div class="rounded-xl bg-surface-sunken p-4"><p class="label">플랫폼 수수료</p><p class="text-lg font-black tabular text-danger">-{{ krw(st.lines.length ? st.totals.commission : st.batch.commission_minor) }}</p></div>
        <div class="rounded-xl bg-surface-sunken p-4"><p class="label">회수 차감</p><p class="text-lg font-black tabular text-ink">-{{ krw(st.totals.deducted) }}</p></div>
        <div class="rounded-xl bg-primary-soft p-4"><p class="label">실지급액</p><p class="text-lg font-black tabular text-primary">{{ krw(st.lines.length ? st.totals.net : st.batch.payout_minor) }}</p></div>
      </section>

      <section>
        <h2 class="mb-2 text-sm font-black text-ink">건별 내역 ({{ st.lines.length }}건)</h2>
        <div class="table-wrap print:overflow-visible print:border-0">
          <table class="table text-xs">
            <thead><tr><th>예약번호</th><th>유형</th><th class="text-right">결제액</th><th class="text-right">수수료</th><th class="text-right">회수차감</th><th class="text-right">실지급액</th><th>정산일시</th></tr></thead>
            <tbody>
              <tr v-if="!st.lines.length"><td colspan="7" class="p-6 text-center text-ink-subtle">이 배치에 연결된 건별 정산 내역이 없어요. 배치 합계 기준으로 지급됩니다.</td></tr>
              <tr v-for="l in st.lines" :key="l.id">
                <td class="font-mono font-bold">{{ l.booking_number || l.booking_id }}</td>
                <td>{{ DOMAIN[l.domain_type] || l.domain_type }}</td>
                <td class="text-right tabular">{{ krw(l.gross_amount_minor) }}</td>
                <td class="text-right tabular text-danger">-{{ krw(l.commission_amount_minor) }}</td>
                <td class="text-right tabular">{{ l.recovery_deducted_minor ? `-${krw(l.recovery_deducted_minor)}` : '-' }}</td>
                <td class="text-right font-bold tabular">{{ krw(l.net_payout_minor) }}</td>
                <td class="font-mono text-ink-subtle">{{ dt(l.settled_at) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <footer class="space-y-1 border-t border-line pt-4 text-[11px] text-ink-subtle">
        <p>세금계산서는 운영팀이 수기로 발행합니다{{ st.partner.taxInvoiceEmail ? ` (수신: ${st.partner.taxInvoiceEmail})` : ' — 회사/계좌 정보에서 세금계산서 수신 이메일을 등록해주세요' }}.</p>
        <p>발행 시각 {{ dt(st.issuedAt) }} · 이 명세서는 정산 완료된 거래 기록으로만 작성됩니다.</p>
      </footer>
    </article>
  </div>
</template>
