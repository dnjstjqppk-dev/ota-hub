<script setup lang="ts">
/**
 * CR-04 business insights (GET /admin/insights?days=7|30|90). Every figure is a
 * recorded fact (payments, refunds, ledger, analytics events) — the definitions
 * the server returns are shown under the KPIs so nobody reads them differently.
 */
import { computed, onMounted, ref, watch } from 'vue'
import { api } from '../composables/session'
import { useResource } from '../composables/useResource'
import { domainLabel, krw, num } from '../composables/format'
import PageHeader from '../components/PageHeader.vue'
import StatePanel from '../components/StatePanel.vue'
import StatCard from '../components/StatCard.vue'
import DailyBars from '../components/DailyBars.vue'

const days = ref(30)
const r = useResource(async () => api(`/admin/insights?days=${days.value}`), null as any)
watch(days, () => r.reload())
onMounted(r.reload)
const d = computed(() => r.data.value)
const pct = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${v.toFixed(1)}%`)
// Bookings can arrive without a tracked view (deep links, repeat customers), so a step ratio can exceed 100%.
const stepPct = (v: number | null | undefined) => (v !== null && v !== undefined && v > 100 ? '100%+' : pct(v))
const series = (k: 'gmvMinor' | 'bookings' | 'activeUsers') => (d.value?.daily || []).map((x: any) => ({ date: x.date, value: Number(x[k]) || 0 }))
const domainMax = computed(() => Math.max(1, ...(d.value?.byDomain || []).map((x: any) => Number(x.gmv) || 0)))
const krwShort = (n: number) => (n >= 1e8 ? `${(n / 1e8).toFixed(1)}억원` : n >= 1e4 ? `${Math.round(n / 1e4).toLocaleString('ko-KR')}만원` : `${n.toLocaleString('ko-KR')}원`)
const countFmt = (n: number) => `${n.toLocaleString('ko-KR')}`
</script>

<template>
  <div>
    <PageHeader title="비즈니스 분석" description="거래액·순매출·활성 회원·전환율을 기록된 거래와 이벤트로만 집계해요.">
      <div class="flex gap-1" role="group" aria-label="기간">
        <button v-for="n in [7, 30, 90]" :key="n" type="button" class="chip" :aria-pressed="days === n" @click="days = n">최근 {{ n }}일</button>
      </div>
    </PageHeader>

    <StatePanel :state="r.state.value" :error="r.error.value" :rows="4" @retry="r.reload()">
      <template v-if="d">
        <p class="mb-3 text-xs tabular text-ink-subtle">{{ d.from }} ~ {{ d.to }} · 통화 {{ d.currency }}</p>
        <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="거래액(GMV)" :value="krw(d.kpis.gmvMinor)" :hint="`결제 ${num(d.kpis.bookingsPaid)}건 · 객단가 ${d.kpis.averageOrderMinor ? krw(d.kpis.averageOrderMinor) : '—'}`" icon="coins" />
          <StatCard label="순매출(수수료)" :value="krw(d.kpis.netRevenueMinor)" :hint="`환불 ${krw(d.kpis.refundedMinor)}`" icon="ledger" tone="success" />
          <StatCard label="활성 회원" :value="`DAU ${num(d.kpis.dau)}`" :hint="`MAU ${num(d.kpis.mau)} · 신규 가입 ${num(d.kpis.signups)}`" icon="users" />
          <StatCard label="취소율" :value="pct(d.kpis.cancelRatePct)" :hint="`예약 생성 ${num(d.kpis.bookingsCreated)}건`" icon="refund" :tone="(d.kpis.cancelRatePct || 0) > 15 ? 'warning' : 'neutral'" />
        </div>
        <details class="mt-2 text-2xs text-ink-subtle">
          <summary class="cursor-pointer py-1">지표 정의</summary>
          <ul class="mt-1 space-y-0.5"><li v-for="(v, k) in d.definitions" :key="k">· {{ v }}</li></ul>
        </details>

        <div class="mt-6 grid gap-3 lg:grid-cols-3">
          <DailyBars title="일별 거래액" :points="series('gmvMinor')" :format="krwShort" />
          <DailyBars title="일별 예약 생성" :points="series('bookings')" :format="countFmt" />
          <DailyBars title="일별 활성 회원" :points="series('activeUsers')" :format="countFmt" />
        </div>

        <div class="mt-6 grid gap-3 xl:grid-cols-2">
          <section class="card overflow-hidden">
            <h2 class="border-b border-line px-4 py-3 text-sm font-bold">카테고리별 전환 (검색 → 상세 → 예약) <span class="font-normal text-ink-subtle">· 100%+는 조회 없이 바로 들어온 예약 포함</span></h2>
            <div class="overflow-x-auto">
              <table class="table !min-w-[520px] text-xs">
                <thead><tr><th>카테고리</th><th class="text-right">검색</th><th class="text-right">상세 조회</th><th class="text-right">예약</th><th class="text-right">검색→조회</th><th class="text-right">조회→예약</th></tr></thead>
                <tbody>
                  <tr v-if="!d.funnel.length"><td colspan="6" class="p-6 text-center text-ink-subtle">기간 내 퍼널 이벤트가 없어요.</td></tr>
                  <tr v-for="f in d.funnel" :key="f.domain">
                    <td class="font-semibold">{{ f.domain === 'ALL' ? '전체(미분류)' : domainLabel(f.domain) }}</td>
                    <td class="text-right tabular">{{ num(f.search) }}</td>
                    <td class="text-right tabular">{{ num(f.view) }}</td>
                    <td class="text-right tabular">{{ num(f.book) }}</td>
                    <td class="text-right tabular">{{ stepPct(f.searchToViewPct) }}</td>
                    <td class="text-right font-bold tabular">{{ stepPct(f.viewToBookPct) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section class="card overflow-hidden">
            <h2 class="border-b border-line px-4 py-3 text-sm font-bold">카테고리별 거래액</h2>
            <ul class="divide-y divide-line">
              <li v-if="!d.byDomain.length" class="p-6 text-center text-xs text-ink-subtle">기간 내 예약이 없어요.</li>
              <li v-for="x in d.byDomain" :key="x.domain" class="grid grid-cols-[88px_1fr_auto] items-center gap-3 px-4 py-2.5 text-xs">
                <span class="font-semibold">{{ domainLabel(x.domain) }}</span>
                <span class="h-2 overflow-hidden rounded-full bg-surface-sunken" :aria-label="`${domainLabel(x.domain)} ${krw(x.gmv)}`"><span class="block h-full rounded-full bg-primary" :style="{ width: `${(Number(x.gmv) / domainMax) * 100}%` }" /></span>
                <span class="tabular text-ink-muted">{{ krw(x.gmv) }} · {{ num(x.bookings) }}건</span>
              </li>
            </ul>
          </section>
        </div>

        <section class="card mt-6 overflow-hidden">
          <h2 class="border-b border-line px-4 py-3 text-sm font-bold">결제액 상위 상품</h2>
          <div class="overflow-x-auto">
            <table class="table !min-w-[520px] text-xs">
              <thead><tr><th>#</th><th>상품</th><th>카테고리</th><th class="text-right">예약</th><th class="text-right">결제액</th></tr></thead>
              <tbody>
                <tr v-if="!d.topProducts.length"><td colspan="5" class="p-6 text-center text-ink-subtle">기간 내 결제된 예약이 없어요.</td></tr>
                <tr v-for="(p, i) in d.topProducts" :key="`${p.domain}-${p.itemId}`">
                  <td class="tabular text-ink-subtle">{{ i + 1 }}</td>
                  <td class="max-w-[280px] truncate font-semibold">{{ p.title }}</td>
                  <td>{{ domainLabel(p.domain) }}</td>
                  <td class="text-right tabular">{{ num(p.bookings) }}</td>
                  <td class="text-right font-bold tabular">{{ krw(p.paidMinor) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <details class="card mt-6 p-4 text-xs">
          <summary class="cursor-pointer font-bold">일별 데이터 표로 보기</summary>
          <div class="mt-3 overflow-x-auto">
            <table class="table !min-w-[420px]">
              <thead><tr><th>날짜</th><th class="text-right">거래액</th><th class="text-right">예약</th><th class="text-right">활성 회원</th></tr></thead>
              <tbody><tr v-for="x in d.daily" :key="x.date"><td class="tabular">{{ x.date }}</td><td class="text-right tabular">{{ krw(x.gmvMinor) }}</td><td class="text-right tabular">{{ num(x.bookings) }}</td><td class="text-right tabular">{{ num(x.activeUsers) }}</td></tr></tbody>
            </table>
          </div>
        </details>
      </template>
    </StatePanel>
  </div>
</template>
