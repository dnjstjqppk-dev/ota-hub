<script setup lang="ts">
/**
 * Server-truth booking view. Everything shown here comes from GET /bookings/:id;
 * nothing is inferred client-side (no local "CONFIRMED" badges, no generated vouchers).
 * While the booking is in a transitional state it polls until the state settles.
 */
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { apiFetch, formatKrw } from '~/composables/useApi'

const props = defineProps<{ bookingId: string }>()
const router = useRouter()

const DOMAIN_LABEL: Record<string, string> = { HOTEL: '숙소', FLIGHT: '항공권', TRAIN: '기차', CAR: '렌터카', TRANSFER: '공항 이동', ACTIVITY: '투어·티켓', PACKAGE: '패키지' }
const IN_FLIGHT = ['PAYMENT_PROCESSING', 'PAYMENT_AUTHORIZED', 'SUPPLIER_BOOKING_PENDING', 'TICKETING_PENDING', 'CANCELLATION_REQUESTED', 'REFUND_PENDING']
const POLL_MS = 4000
const POLL_MAX = 45

const booking = ref<any>(null)
const loading = ref(true)
const error = ref('')
const cancelling = ref(false)
const cancelMsg = ref('')
let pollTimer: any
let polls = 0

const tone = computed(() => {
  const s = booking.value?.status || ''
  if (['VOUCHER_ISSUED', 'TICKETED', 'COMPLETED'].includes(s)) return 'ok'
  if (['FAILED', 'EXPIRED', 'MANUAL_REVIEW_REQUIRED'].includes(s)) return 'bad'
  if (['CANCELLED', 'REFUNDED'].includes(s)) return 'muted'
  return 'pending'
})
const TONE_CLASS: Record<string, string> = {
  ok: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  bad: 'bg-red-50 text-red-800 border-red-200',
  muted: 'bg-slate-100 text-slate-700 border-slate-200',
  pending: 'bg-blue-50 text-blue-800 border-blue-200'
}

const headline = computed(() => {
  const b = booking.value
  if (!b) return ''
  switch (b.status) {
    case 'VOUCHER_ISSUED': case 'TICKETED': return '예약이 확정되었습니다'
    case 'COMPLETED': return '이용이 완료된 예약입니다'
    case 'AWAITING_PAYMENT': return '결제를 기다리고 있습니다'
    case 'PAYMENT_PROCESSING': case 'PAYMENT_AUTHORIZED': return '결제가 승인되어 예약을 진행 중입니다'
    case 'SUPPLIER_BOOKING_PENDING': case 'SUPPLIER_CONFIRMED': return '공급사 확정을 기다리고 있습니다'
    case 'TICKETING_PENDING': return '항공권 발권을 진행 중입니다'
    case 'CANCELLATION_REQUESTED': return '취소를 처리하고 있습니다'
    case 'REFUND_PENDING': return '환불을 진행 중입니다'
    case 'REFUNDED': return '환불이 완료되었습니다'
    case 'CANCELLED': return '취소된 예약입니다'
    case 'EXPIRED': return '결제 시간이 지나 예약이 만료되었습니다'
    case 'FAILED': return '예약이 완료되지 못했습니다'
    case 'MANUAL_REVIEW_REQUIRED': return '담당자 확인이 필요한 예약입니다'
    default: return b.statusLabel
  }
})

const subline = computed(() => {
  const b = booking.value
  if (!b) return ''
  if (b.status === 'MANUAL_REVIEW_REQUIRED') return '결제 또는 공급사 응답을 확인하는 중입니다. 고객센터에서 확인 후 연락드리며, 이중 청구는 발생하지 않습니다.'
  if (b.status === 'FAILED') return b.paidMinor > 0 ? '결제된 금액은 전액 환불 처리됩니다.' : '결제는 청구되지 않았습니다.'
  if (IN_FLIGHT.includes(b.status)) return '보통 1~2분 내에 완료됩니다. 이 화면은 자동으로 갱신됩니다.'
  if (b.status === 'SUPPLIER_CONFIRMED') return '공급사 확정이 완료되었으며 바우처를 발급하고 있습니다.'
  return ''
})

const deadlineText = computed(() => booking.value?.paymentDeadline ? new Date(booking.value.paymentDeadline).toLocaleString('ko-KR') : '')
const fmt = (d?: string | null) => (d ? new Date(d).toLocaleString('ko-KR') : '-')

async function load() {
  const r = await apiFetch(`/bookings/${encodeURIComponent(props.bookingId)}`)
  loading.value = false
  if (r.status === 401) return router.push(`/login?redirect=${encodeURIComponent(router.currentRoute.value.fullPath)}`)
  if (!r.ok) { error.value = r.status === 404 || r.status === 403 ? '예약 정보를 찾을 수 없습니다.' : (r.data.error || '예약 정보를 불러오지 못했습니다.'); return }
  error.value = ''
  booking.value = r.data.booking
  schedulePoll()
}

function schedulePoll() {
  clearTimeout(pollTimer)
  const s = booking.value?.status
  if ((IN_FLIGHT.includes(s) || s === 'SUPPLIER_CONFIRMED') && polls < POLL_MAX) {
    polls++
    pollTimer = setTimeout(load, POLL_MS)
  }
}

async function cancel() {
  const b = booking.value
  const p = b.cancellationPreview
  const msg = b.status === 'AWAITING_PAYMENT'
    ? '결제 전 예약을 취소합니다. 청구된 금액은 없습니다. 계속할까요?'
    : p ? `취소 수수료 ${formatKrw(p.feeMinor)}, 환불 예정 금액 ${formatKrw(p.refundMinor)}입니다. 취소할까요?` : '예약을 취소할까요?'
  if (!confirm(msg)) return
  cancelling.value = true
  cancelMsg.value = ''
  const r = await apiFetch(`/bookings/${encodeURIComponent(b.id)}/cancel`, { method: 'POST' })
  cancelling.value = false
  if (!r.ok) { cancelMsg.value = r.data.error || '취소를 처리하지 못했습니다.'; return }
  booking.value = r.data.booking
  polls = 0
  schedulePoll()
}

function resumePayment() {
  const b = booking.value
  router.push(`/checkout?domain=${b.domain}&itemId=${encodeURIComponent(b.itemId)}&bookingId=${encodeURIComponent(b.id)}`)
}

const printVoucher = () => window.print()

onMounted(load)
onBeforeUnmount(() => clearTimeout(pollTimer))
</script>

<template>
  <div class="max-w-3xl mx-auto px-4 py-6 md:py-10">
    <div v-if="loading" class="py-24 text-center text-sm text-slate-400" data-testid="booking-loading">예약 정보를 불러오는 중…</div>

    <div v-else-if="error" class="rounded-2xl border border-slate-200 bg-white p-8 text-center" role="alert" data-testid="booking-error">
      <p class="text-sm font-semibold text-slate-800">{{ error }}</p>
      <NuxtLink to="/my/bookings" class="mt-4 inline-block rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white">내 예약 목록</NuxtLink>
    </div>

    <div v-else-if="booking" class="space-y-4" data-testid="booking-detail">
      <div :class="['rounded-2xl border p-5 md:p-6', TONE_CLASS[tone]]" data-testid="booking-status">
        <div class="flex items-start justify-between gap-3">
          <div>
            <div class="text-xs font-semibold opacity-80">{{ DOMAIN_LABEL[booking.domain] || booking.domain }} · 예약번호 <span class="font-mono">{{ booking.bookingNumber }}</span></div>
            <h1 class="mt-1 text-lg md:text-xl font-bold">{{ headline }}</h1>
            <p v-if="subline" class="mt-1 text-sm opacity-90">{{ subline }}</p>
          </div>
          <span class="shrink-0 rounded-full bg-white/70 px-3 py-1 text-xs font-semibold" :data-status="booking.status">{{ booking.statusLabel }}</span>
        </div>
        <div v-if="booking.paymentMode === 'SANDBOX'" class="mt-3 text-[11px] font-semibold text-amber-800">테스트 모드 예약 — 실제 결제·실제 예약이 아닙니다.</div>
      </div>

      <div v-if="booking.status === 'AWAITING_PAYMENT'" class="rounded-2xl border border-slate-200 bg-white p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <p class="text-sm text-slate-700">{{ deadlineText }}까지 결제하지 않으면 예약이 자동 취소됩니다.</p>
        <button class="rounded-xl bg-trip-orange px-5 py-2.5 text-sm font-bold text-white" data-testid="resume-payment" @click="resumePayment">{{ formatKrw(booking.totalMinor) }} 결제하기</button>
      </div>

      <section class="rounded-2xl border border-slate-200 bg-white p-5 md:p-6">
        <h2 class="font-bold text-slate-900">{{ booking.title }}</h2>
        <p class="mt-1 text-sm text-slate-600">{{ booking.serviceStart }}<span v-if="booking.serviceEnd && booking.serviceEnd !== booking.serviceStart"> → {{ booking.serviceEnd }}</span></p>

        <div v-for="(it, i) in booking.items" :key="i" class="mt-4 rounded-xl bg-slate-50 p-4 text-sm" data-testid="booking-item">
          <div v-if="booking.items.length > 1" class="mb-2 font-semibold text-slate-800">{{ it.title }} <span class="font-normal text-slate-500">· {{ it.service_start }}</span></div>
          <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
            <template v-if="it.voucher_code"><dt class="text-slate-500">바우처</dt><dd class="font-mono font-bold text-slate-900" data-testid="voucher-code">{{ it.voucher_code }}</dd></template>
            <template v-if="it.pnr"><dt class="text-slate-500">예약번호(PNR)</dt><dd class="font-mono font-bold text-slate-900">{{ it.pnr }}</dd></template>
            <template v-if="it.ticket_numbers?.length"><dt class="text-slate-500">항공권 번호</dt><dd class="font-mono text-slate-900">{{ it.ticket_numbers.join(', ') }}</dd></template>
            <template v-if="it.supplier_reference"><dt class="text-slate-500">공급사 확인번호</dt><dd class="font-mono text-slate-900">{{ it.supplier_reference }}</dd></template>
            <dt class="text-slate-500">공급사 상태</dt><dd class="text-slate-900">{{ it.supplier_status || '-' }}</dd>
          </dl>
          <p v-if="!it.voucher_code && !booking.isConfirmed" class="mt-2 text-xs text-slate-500">바우처·이용권은 공급사 확정 후 발급됩니다.</p>
        </div>
      </section>

      <section class="rounded-2xl border border-slate-200 bg-white p-5 md:p-6 grid md:grid-cols-2 gap-6 text-sm">
        <div>
          <h3 class="font-semibold text-slate-900">결제 정보</h3>
          <dl class="mt-2 space-y-1">
            <div class="flex justify-between"><dt class="text-slate-500">총 금액</dt><dd class="font-bold" data-testid="booking-total">{{ formatKrw(booking.totalMinor) }}</dd></div>
            <div class="flex justify-between"><dt class="text-slate-500">결제 금액</dt><dd>{{ formatKrw(booking.paidMinor) }}</dd></div>
            <div v-if="booking.cancellationFeeMinor" class="flex justify-between"><dt class="text-slate-500">취소 수수료</dt><dd>{{ formatKrw(booking.cancellationFeeMinor) }}</dd></div>
            <div v-if="booking.refundedMinor" class="flex justify-between"><dt class="text-slate-500">환불 금액</dt><dd class="text-emerald-700">{{ formatKrw(booking.refundedMinor) }}</dd></div>
          </dl>
          <ul v-if="booking.refunds?.length" class="mt-2 space-y-1 text-xs text-slate-600">
            <li v-for="rf in booking.refunds" :key="rf.id">환불 {{ formatKrw(rf.amount_minor) }} · {{ rf.status }} · {{ fmt(rf.updated_at) }}</li>
          </ul>
        </div>
        <div>
          <h3 class="font-semibold text-slate-900">예약자</h3>
          <p class="mt-2 text-slate-700">{{ booking.contact?.name }}<br>{{ booking.contact?.email }}<br>{{ booking.contact?.phone }}</p>
          <h3 v-if="booking.travelers?.length" class="mt-4 font-semibold text-slate-900">여행자</h3>
          <ul class="mt-1 space-y-0.5 text-slate-700">
            <li v-for="(t, i) in booking.travelers" :key="i">{{ t.lastNameEn }} {{ t.firstNameEn }} <span class="text-xs text-slate-500">({{ t.type === 'ADULT' ? '성인' : t.type === 'CHILD' ? '아동' : '유아' }}{{ t.passport ? ' · 여권 ' + t.passport : '' }})</span></li>
          </ul>
        </div>
      </section>

      <section class="rounded-2xl border border-slate-200 bg-white p-5 md:p-6 text-sm">
        <h3 class="font-semibold text-slate-900">취소 규정</h3>
        <p class="mt-1 text-slate-700">
          <span v-if="booking.cancellationPolicy?.type === 'FREE_UNTIL'">{{ fmt(booking.cancellationPolicy.freeUntil) }}까지 무료 취소, 이후 취소 시 환불 불가</span>
          <span v-else>환불 불가 요금입니다.</span>
        </p>
        <p v-if="booking.cancellationPreview" class="mt-1 text-xs text-slate-500">지금 취소 시: 수수료 {{ formatKrw(booking.cancellationPreview.feeMinor) }} · 환불 {{ formatKrw(booking.cancellationPreview.refundMinor) }}</p>
        <button v-if="booking.canCancel" :disabled="cancelling" class="mt-3 rounded-xl border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 disabled:opacity-50" data-testid="cancel-booking" @click="cancel">
          {{ cancelling ? '처리 중…' : '예약 취소' }}
        </button>
        <p v-if="cancelMsg" class="mt-2 text-sm text-red-700" role="alert">{{ cancelMsg }}</p>
      </section>

      <details class="rounded-2xl border border-slate-200 bg-white p-5 text-sm">
        <summary class="cursor-pointer font-semibold text-slate-900">처리 이력</summary>
        <ol class="mt-3 space-y-1 text-xs text-slate-600">
          <li v-for="(h, i) in booking.history" :key="i">{{ fmt(h.created_at) }} · {{ h.from_status || '생성' }} → <strong>{{ h.to_status }}</strong><span v-if="h.reason"> ({{ h.reason }})</span></li>
        </ol>
      </details>

      <div class="flex gap-2">
        <NuxtLink to="/my/bookings" class="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold">내 예약 목록</NuxtLink>
        <button v-if="booking.isConfirmed" class="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white print:hidden" @click="printVoucher">바우처 인쇄</button>
      </div>
    </div>
  </div>
</template>
