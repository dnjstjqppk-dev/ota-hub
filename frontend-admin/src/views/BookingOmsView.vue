<script setup lang="ts">
/**
 * Booking operations. List: GET /admin/bookings (?status, ?q). Detail: GET /admin/bookings/:id.
 * Operator actions go through POST /admin/bookings/:id/supplier-decision, the same state machine the
 * worker enforces (confirm requires payment + supplier reference; reject refunds a paid booking in full).
 * State lives in the URL: ?status=…&q=…&id=… (id opens the detail panel).
 */
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api, toast } from '../composables/session'
import { useResource } from '../composables/useResource'
import { BOOKING_STATUS, bookingStatus, dateOnly, dateTime, domainLabel, krw } from '../composables/format'
import PageHeader from '../components/PageHeader.vue'
import StatePanel from '../components/StatePanel.vue'
import StatusBadge from '../components/StatusBadge.vue'
import SidePanel from '../components/SidePanel.vue'
import EntitySearch from '../components/EntitySearch.vue'
import PageNav from '../components/PageNav.vue'

const route = useRoute()
const router = useRouter()
const qv = (k: string) => (typeof route.query[k] === 'string' ? (route.query[k] as string) : '')
function patch(change: Record<string, string>) {
  const next: Record<string, string> = {}
  for (const [k, v] of Object.entries({ ...route.query, ...change })) if (typeof v === 'string' && v) next[k] = v
  router.replace({ query: next })
}

const status = computed(() => qv('status'))
const q = computed(() => qv('q'))
const page = computed(() => Math.max(1, parseInt(qv('page') || '1', 10) || 1))
const draft = ref(q.value)
watch(q, (v) => { draft.value = v })

const total = ref(0)
const totalPages = ref(1)
const list = useResource(async () => {
  const p = new URLSearchParams()
  if (status.value) p.set('status', status.value)
  if (q.value) p.set('q', q.value)
  p.set('page', String(page.value))
  const j = await api(`/admin/bookings?${p}`)
  total.value = j.total || 0
  totalPages.value = j.totalPages || 1
  return j.bookings || []
}, [] as any[])
watch([status, q, page], ([s, qq, pg], [os, oq]) => {
  if ((s !== os || qq !== oq) && pg !== 1) patch({ page: '' })
  else list.reload()
})
onMounted(list.reload)

const suggest = async (term: string, signal: AbortSignal) =>
  (await api(`/admin/bookings?q=${encodeURIComponent(term)}&limit=8`, { signal })).bookings || []

const FILTERS = ['', 'MANUAL_REVIEW_REQUIRED', 'SUPPLIER_BOOKING_PENDING', 'REFUND_PENDING', 'AWAITING_PAYMENT', 'VOUCHER_ISSUED', 'TICKETED', 'CANCELLED', 'FAILED']

// ------------------------------------------------------------------ detail
const id = computed(() => qv('id'))
const detail = useResource(async () => (id.value ? api(`/admin/bookings/${encodeURIComponent(id.value)}`) : null), null as any)
watch(id, (v) => { if (v) detail.reload() }, { immediate: true })
const b = computed(() => detail.data.value?.booking)
const canDecide = computed(() => ['SUPPLIER_BOOKING_PENDING', 'MANUAL_REVIEW_REQUIRED'].includes(b.value?.status))
const hasPendingRefund = computed(() => (b.value?.refunds || []).some((r: any) => r.status === 'PENDING'))

const form = reactive({ mode: '' as '' | 'CONFIRM' | 'REJECT', supplierReference: '', pnr: '', note: '' })
const busy = ref(false)
function openForm(mode: 'CONFIRM' | 'REJECT') { Object.assign(form, { mode, supplierReference: '', pnr: '', note: '' }) }
async function decide(decision: 'CONFIRM' | 'REJECT' | 'RETRY_REFUND') {
  if (decision === 'CONFIRM' && !form.supplierReference.trim()) { toast('공급사 확정번호를 입력해 주세요.', 'danger'); return }
  if (decision === 'REJECT' && !form.note.trim()) { toast('거절 사유를 입력해 주세요.', 'danger'); return }
  busy.value = true
  try {
    await api(`/admin/bookings/${b.value.id}/supplier-decision`, {
      method: 'POST',
      json: { decision, supplierReference: form.supplierReference.trim() || undefined, pnr: form.pnr.trim() || undefined, note: form.note.trim() || undefined }
    })
    toast(decision === 'CONFIRM' ? '예약을 확정했어요.' : decision === 'REJECT' ? '예약을 거절했어요. 결제된 금액은 환불 절차로 넘어갔어요.' : '환불을 다시 시도했어요.')
    form.mode = ''
    await Promise.all([detail.reload(), list.reload()])
  } catch (e) {
    toast((e as Error).message, 'danger', 6000)
  } finally {
    busy.value = false
  }
}

const runningJobs = ref(false)
async function runMaintenance() {
  runningJobs.value = true
  try {
    const r = await api('/admin/maintenance/run', { method: 'POST' })
    const s = r.stats || {}
    toast(`정기 작업 완료 · ${Object.entries(s).map(([k, v]) => `${k} ${v}`).join(', ') || '처리할 항목 없음'}`, 'info', 6000)
    list.reload()
  } catch (e) { toast((e as Error).message, 'danger') } finally { runningJobs.value = false }
}
const ACTOR: Record<string, string> = { SYSTEM: '시스템', USER: '고객', ADMIN: '운영자', SUPPLIER: '공급사', PG: 'PG' }
</script>

<template>
  <div>
    <PageHeader title="예약 관리" description="예약 상태를 확인하고 공급사 확정·거절과 환불 재시도를 처리해요. 모든 처리는 감사 로그에 남아요.">
      <button type="button" class="btn-secondary btn-sm" :disabled="runningJobs" title="결제 기한 만료, 대기 환불 재처리 등 정기 작업을 지금 실행해요" @click="runMaintenance"><AppIcon name="refresh" :size="14" />{{ runningJobs ? '실행 중…' : '정기 작업 실행' }}</button>
    </PageHeader>

    <div class="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
      <div class="lg:w-96">
        <EntitySearch
          v-model="draft"
          label="예약 검색"
          input-id="booking-search"
          placeholder="예약번호, 고객명, 이메일, 상품명"
          :fetcher="suggest"
          :item-key="(x: any) => x.id"
          @select="(x: any) => patch({ id: x.id })"
          @submit="(t: string) => patch({ q: t, id: '' })"
        >
          <template #item="{ item }">
            <div class="flex items-center gap-2">
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-medium text-ink">{{ item.title }}</p>
                <p class="truncate text-2xs text-ink-subtle"><span class="font-mono">{{ item.booking_number }}</span> · {{ item.customer_name || '—' }} · {{ item.customer_email }}</p>
              </div>
              <StatusBadge v-bind="bookingStatus(item.status)" />
            </div>
          </template>
        </EntitySearch>
      </div>
      <div class="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:mx-0 lg:flex-wrap lg:px-0 [&::-webkit-scrollbar]:hidden" role="group" aria-label="상태 필터">
        <button v-for="f in FILTERS" :key="f || 'all'" type="button" class="chip" :aria-pressed="status === f" @click="patch({ status: f })">{{ f ? BOOKING_STATUS[f].label : '전체' }}</button>
      </div>
    </div>
    <p v-if="q" class="mb-3 text-sm text-ink-muted">‘{{ q }}’ 검색 결과 · <button type="button" class="font-semibold text-primary" @click="patch({ q: '' })">검색 해제</button></p>

    <StatePanel :state="list.state.value" :error="list.error.value" :empty="!list.data.value.length" empty-text="조건에 맞는 예약이 없어요." @retry="list.reload()">
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>예약번호</th><th>상품</th><th>고객</th><th>이용일</th><th class="text-right">금액</th><th>결제</th><th>상태</th><th>생성</th></tr></thead>
          <tbody>
            <tr v-for="r in list.data.value" :key="r.id" class="row-link" tabindex="0" @click="patch({ id: r.id })" @keydown.enter="patch({ id: r.id })">
              <td class="whitespace-nowrap font-mono text-xs">{{ r.booking_number }}</td>
              <td><p class="max-w-[260px] truncate font-medium">{{ r.title }}</p><p class="text-2xs text-ink-subtle">{{ domainLabel(r.domain_type) }}<span v-if="r.payment_mode === 'SANDBOX'"> · 샌드박스</span></p></td>
              <td><p class="max-w-[160px] truncate">{{ r.customer_name || '—' }}</p><p class="max-w-[160px] truncate text-2xs text-ink-subtle">{{ r.customer_email }}</p></td>
              <td class="whitespace-nowrap text-xs tabular">{{ dateOnly(r.service_start) }}</td>
              <td class="text-right font-semibold tabular">{{ krw(r.total_minor) }}</td>
              <td class="text-xs text-ink-muted">{{ r.payment_status }}</td>
              <td><StatusBadge v-bind="bookingStatus(r.status)" /></td>
              <td class="whitespace-nowrap text-xs text-ink-muted tabular">{{ dateTime(r.created_at) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <PageNav :page="page" :total-pages="totalPages" :total="total" @go="(p) => patch({ page: p === 1 ? '' : String(p) })" />
    </StatePanel>

    <SidePanel :open="!!id" wide :title="b ? b.title : '예약 상세'" :subtitle="b ? b.bookingNumber : ''" @close="patch({ id: '' }); form.mode = ''">
      <StatePanel :state="detail.state.value" :error="detail.error.value" @retry="detail.reload()">
        <div v-if="b" class="space-y-6 text-sm">
          <div class="flex flex-wrap items-center gap-2">
            <StatusBadge v-bind="bookingStatus(b.status)" />
            <span v-if="b.statusReason" class="text-xs text-ink-muted">사유: {{ b.statusReason }}</span>
            <span v-if="b.paymentMode === 'SANDBOX'" class="rounded bg-warning-soft px-1.5 py-0.5 text-2xs font-semibold text-warning">샌드박스 결제</span>
          </div>

          <!-- Operator actions -->
          <section v-if="canDecide || hasPendingRefund" class="rounded-card border border-warning/40 bg-warning-soft/50 p-4">
            <h3 class="font-bold text-ink">운영자 처리</h3>
            <p class="mt-1 text-xs text-ink-muted">공급사 확정은 결제가 완료된 예약만 가능해요. 결제된 예약을 거절하면 전액 환불이 자동으로 시작돼요.</p>
            <div v-if="!form.mode" class="mt-3 flex flex-wrap gap-2">
              <button v-if="canDecide" type="button" class="btn-primary btn-sm" @click="openForm('CONFIRM')">공급사 확정</button>
              <button v-if="canDecide" type="button" class="btn-secondary btn-sm" @click="openForm('REJECT')">확정 거절</button>
              <button v-if="hasPendingRefund" type="button" class="btn-secondary btn-sm" :disabled="busy" @click="decide('RETRY_REFUND')">환불 재시도</button>
            </div>
            <form v-else class="mt-3 space-y-3" @submit.prevent="decide(form.mode as 'CONFIRM' | 'REJECT')">
              <template v-if="form.mode === 'CONFIRM'">
                <div><label class="label" for="dec-ref">공급사 확정번호 *</label><input id="dec-ref" v-model="form.supplierReference" class="input" maxlength="80" required /></div>
                <div v-if="b.domain === 'FLIGHT'"><label class="label" for="dec-pnr">PNR (선택)</label><input id="dec-pnr" v-model="form.pnr" class="input font-mono uppercase" maxlength="10" /></div>
              </template>
              <div><label class="label" for="dec-note">{{ form.mode === 'REJECT' ? '거절 사유 *' : '메모 (선택)' }}</label><textarea id="dec-note" v-model="form.note" class="input min-h-[72px] py-2" maxlength="300" /></div>
              <div class="flex gap-2">
                <button type="submit" :class="form.mode === 'REJECT' ? 'btn-danger btn-sm' : 'btn-primary btn-sm'" :disabled="busy">{{ busy ? '처리 중…' : form.mode === 'CONFIRM' ? '확정 처리' : '거절 처리' }}</button>
                <button type="button" class="btn-ghost btn-sm" @click="form.mode = ''">취소</button>
              </div>
            </form>
          </section>

          <dl class="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
            <div><dt class="text-2xs text-ink-subtle">상품군</dt><dd class="font-medium">{{ domainLabel(b.domain) }}</dd></div>
            <div><dt class="text-2xs text-ink-subtle">이용일</dt><dd class="font-medium tabular">{{ dateOnly(b.serviceStart) }}<span v-if="b.serviceEnd && b.serviceEnd !== b.serviceStart"> ~ {{ dateOnly(b.serviceEnd) }}</span></dd></div>
            <div><dt class="text-2xs text-ink-subtle">생성</dt><dd class="font-medium tabular">{{ dateTime(b.createdAt) }}</dd></div>
            <div><dt class="text-2xs text-ink-subtle">총액</dt><dd class="font-semibold tabular">{{ krw(b.totalMinor) }}</dd></div>
            <div><dt class="text-2xs text-ink-subtle">결제액</dt><dd class="font-medium tabular">{{ krw(b.paidMinor) }}</dd></div>
            <div><dt class="text-2xs text-ink-subtle">환불액</dt><dd class="font-medium tabular">{{ krw(b.refundedMinor) }}</dd></div>
            <div><dt class="text-2xs text-ink-subtle">결제 상태</dt><dd class="font-medium">{{ b.paymentStatus }}</dd></div>
            <div><dt class="text-2xs text-ink-subtle">공급사 상태</dt><dd class="font-medium">{{ b.supplierStatus }}</dd></div>
            <div v-if="b.cancellationFeeMinor"><dt class="text-2xs text-ink-subtle">취소 수수료</dt><dd class="font-medium tabular">{{ krw(b.cancellationFeeMinor) }}</dd></div>
          </dl>

          <section>
            <h3 class="mb-2 font-bold">예약자</h3>
            <p>{{ b.contact?.name || '—' }} · {{ b.contact?.email || '—' }} · {{ b.contact?.phone || '—' }}</p>
          </section>

          <section v-if="b.items?.length">
            <h3 class="mb-2 font-bold">예약 항목</h3>
            <ul class="divide-y divide-line rounded-field border border-line">
              <li v-for="(it, i) in b.items" :key="i" class="p-3">
                <p class="font-medium">{{ it.title }}</p>
                <p class="mt-0.5 text-xs text-ink-muted">{{ dateOnly(it.service_start) }} · 수량 {{ it.quantity }} · {{ krw(it.total_minor) }} · 공급사 {{ it.supplier_status }}<span v-if="it.supplier_reference"> · 확정번호 <span class="font-mono">{{ it.supplier_reference }}</span></span><span v-if="it.pnr"> · PNR <span class="font-mono">{{ it.pnr }}</span></span></p>
              </li>
            </ul>
          </section>

          <section v-if="b.travelers?.length">
            <h3 class="mb-2 font-bold">여행자</h3>
            <ul class="space-y-1">
              <li v-for="(t, i) in b.travelers" :key="i">{{ t.lastNameEn }} {{ t.firstNameEn }} <span class="text-xs text-ink-subtle">· {{ t.type }}<span v-if="t.isLead"> · 대표</span><span v-if="t.passport"> · 여권 {{ t.passport }}</span></span></li>
            </ul>
          </section>

          <section>
            <h3 class="mb-2 font-bold">결제 · 환불</h3>
            <p v-if="!b.payments?.length && !b.refunds?.length" class="text-ink-muted">기록이 없어요.</p>
            <ul class="space-y-1.5">
              <li v-for="p in b.payments" :key="p.id" class="flex flex-wrap justify-between gap-2"><span>결제 · {{ p.provider }} · {{ p.status }}<span v-if="p.failure_message" class="text-danger"> · {{ p.failure_message }}</span></span><span class="tabular">{{ krw(p.amount_minor) }}</span></li>
              <li v-for="r in b.refunds" :key="r.id" class="flex flex-wrap justify-between gap-2"><span>환불 · {{ r.status }} · 시도 {{ r.attempts }}회<span v-if="r.reason" class="text-ink-muted"> · {{ r.reason }}</span></span><span class="tabular">{{ krw(r.amount_minor) }}</span></li>
            </ul>
          </section>

          <section>
            <h3 class="mb-2 font-bold">상태 이력</h3>
            <ol class="space-y-2 border-l-2 border-line pl-4">
              <li v-for="(h, i) in b.history" :key="i" class="relative">
                <span class="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-line-strong" />
                <p class="font-medium">{{ bookingStatus(h.from_status).label }} → {{ bookingStatus(h.to_status).label }}</p>
                <p class="text-xs text-ink-muted">{{ dateTime(h.created_at) }} · {{ ACTOR[h.actor_type] || h.actor_type }}<span v-if="h.reason"> · {{ h.reason }}</span></p>
              </li>
            </ol>
          </section>

          <section v-if="detail.data.value?.supplierCalls?.length">
            <h3 class="mb-2 font-bold">공급사 API 호출</h3>
            <ul class="space-y-1 text-xs">
              <li v-for="(c, i) in detail.data.value.supplierCalls" :key="i" class="flex flex-wrap justify-between gap-2"><span><span class="font-mono">{{ c.operation }}</span> · {{ c.outcome }}<span v-if="c.response_summary" class="text-ink-muted"> · {{ c.response_summary }}</span></span><span class="text-ink-subtle tabular">{{ c.latency_ms }}ms · {{ dateTime(c.created_at) }}</span></li>
            </ul>
          </section>

          <section v-if="detail.data.value?.ledger?.length">
            <h3 class="mb-2 font-bold">회계 분개</h3>
            <div class="overflow-x-auto">
              <table class="w-full text-xs">
                <thead class="text-ink-subtle"><tr><th class="py-1 text-left font-medium">이벤트</th><th class="text-left font-medium">계정</th><th class="text-right font-medium">차변</th><th class="text-right font-medium">대변</th></tr></thead>
                <tbody>
                  <tr v-for="(l, i) in detail.data.value.ledger" :key="i" class="border-t border-line">
                    <td class="py-1.5">{{ l.event_type }}</td><td class="font-mono">{{ l.account }}</td>
                    <td class="text-right tabular">{{ l.direction === 'DEBIT' ? krw(l.amount_minor) : '' }}</td>
                    <td class="text-right tabular">{{ l.direction === 'CREDIT' ? krw(l.amount_minor) : '' }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </StatePanel>
    </SidePanel>
  </div>
</template>
