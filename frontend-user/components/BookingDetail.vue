<script setup lang="ts">
/**
 * Server-truth booking view. Everything shown here comes from GET /bookings/:id;
 * nothing is inferred client-side (no local "CONFIRMED" badges, no generated vouchers).
 * While the booking is in a transitional state it polls until the state settles.
 */
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { apiFetch, formatMinor } from '~/composables/useApi'
import { useCurrencyStore } from '~/stores/currency'
const localePath = useLocalePath()

const props = defineProps<{ bookingId: string }>()
const router = useRouter()
const currency = useCurrencyStore()
const { t, locale } = useI18n()
const LOCALE_TAG: Record<string, string> = { ko: 'ko-KR', en: 'en-US', ja: 'ja-JP', zh: 'zh-CN', 'zh-hant': 'zh-Hant' }
const fmtMoney = (minor?: number | null) => {
  if (typeof minor !== 'number' || !Number.isFinite(minor)) return '-'
  const cur = booking.value?.currency || 'KRW'
  return cur === 'KRW' ? currency.formatKRW(minor) : formatMinor(minor, cur)
}

const domainLabel = (d: string) => t(`checkout.domain_${d}`, d)
const IN_FLIGHT = ['PAYMENT_PROCESSING', 'PAYMENT_AUTHORIZED', 'SUPPLIER_BOOKING_PENDING', 'TICKETING_PENDING', 'CANCELLATION_REQUESTED', 'REFUND_PENDING']
const POLL_MS = 4000
const POLL_MAX = 45

const booking = ref<any>(null)
const loading = ref(true)
const error = ref('')
const cancelling = ref(false)
const cancelMsg = ref('')
// B6: receipt is fetched on demand from recorded payments (never fabricated).
const receipt = ref<any>(null)
const receiptLoading = ref(false)
async function loadReceipt(open: boolean) {
  if (!open || receipt.value || receiptLoading.value) return
  receiptLoading.value = true
  try {
    const r = await apiFetch(`/bookings/${props.bookingId}/receipt`)
    if (r.ok) receipt.value = r.data.receipt
  } finally { receiptLoading.value = false }
}
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
  ok: 'bg-success-soft text-success border-success/30',
  bad: 'bg-danger-soft text-danger border-danger/30',
  muted: 'bg-surface-sunken text-ink-muted border-line',
  pending: 'bg-primary-soft text-primary border-primary/30'
}

const headline = computed(() => {
  const b = booking.value
  if (!b) return ''
  switch (b.status) {
    case 'VOUCHER_ISSUED': case 'TICKETED': return t('booking.detail.headConfirmed')
    case 'COMPLETED': return t('booking.detail.headCompleted')
    case 'AWAITING_PAYMENT': return t('booking.detail.headAwaiting')
    case 'PAYMENT_PROCESSING': case 'PAYMENT_AUTHORIZED': return t('booking.detail.headPaying')
    case 'SUPPLIER_BOOKING_PENDING': case 'SUPPLIER_CONFIRMED': return t('booking.detail.headSupplier')
    case 'TICKETING_PENDING': return t('booking.detail.headTicketing')
    case 'CANCELLATION_REQUESTED': return t('booking.detail.headCancelling')
    case 'REFUND_PENDING': return t('booking.detail.headRefunding')
    case 'REFUNDED': return t('booking.detail.headRefunded')
    case 'CANCELLED': return t('booking.detail.headCancelled')
    case 'EXPIRED': return t('booking.detail.headExpired')
    case 'FAILED': return t('booking.detail.headFailed')
    case 'MANUAL_REVIEW_REQUIRED': return t('booking.detail.headReview')
    default: return b.statusLabel
  }
})

const subline = computed(() => {
  const b = booking.value
  if (!b) return ''
  if (b.status === 'MANUAL_REVIEW_REQUIRED') return t('booking.detail.subReview')
  if (b.status === 'FAILED') return b.paidMinor > 0 ? t('booking.detail.subFailedPaid') : t('booking.detail.subFailedFree')
  if (IN_FLIGHT.includes(b.status)) return t('booking.detail.subInflight')
  if (b.status === 'SUPPLIER_CONFIRMED') return t('booking.detail.subSupplierDone')
  return ''
})

const tag = () => LOCALE_TAG[locale.value] || 'ko-KR'
const deadlineText = computed(() => booking.value?.paymentDeadline ? new Date(booking.value.paymentDeadline).toLocaleString(tag()) : '')
const fmt = (d?: string | null) => (d ? new Date(d).toLocaleString(tag()) : '-')

// Phase 2 wholesale: supplier-issued credentials arrive server-parsed
// (item.artefacts); raw typed strings are never shown. PDF QR carries the
// scannable code; LPA/QR payloads render as copyable text (no QR lib yet).
const copied = ref('')
async function copyText(v: string) {
  try { await navigator.clipboard.writeText(v); copied.value = v } catch { copied.value = '' }
}

async function load() {
  const r = await apiFetch(`/bookings/${encodeURIComponent(props.bookingId)}`)
  loading.value = false
  if (r.status === 401) return router.push(localePath(`/login?redirect=${encodeURIComponent(router.currentRoute.value.fullPath)}`))
  if (!r.ok) { error.value = r.status === 404 || r.status === 403 ? t('booking.detail.notFound') : (r.data.error || t('booking.detail.loadFail')); return }
  error.value = ''
  booking.value = r.data.booking
  schedulePoll()
  loadChanges()
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
    ? t('booking.detail.confirmCancelPre')
    : p ? t('booking.detail.confirmCancelFee', { fee: fmtMoney(p.feeMinor), refund: fmtMoney(p.refundMinor) }) : t('booking.detail.confirmCancel')
  if (!confirm(msg)) return
  cancelling.value = true
  cancelMsg.value = ''
  const r = await apiFetch(`/bookings/${encodeURIComponent(b.id)}/cancel`, { method: 'POST' })
  cancelling.value = false
  if (!r.ok) { cancelMsg.value = r.data.error || t('booking.detail.cancelFail'); return }
  booking.value = r.data.booking
  polls = 0
  schedulePoll()
}

function resumePayment() {
  const b = booking.value
  router.push(localePath(`/checkout?domain=${b.domain}&itemId=${encodeURIComponent(b.itemId)}&bookingId=${encodeURIComponent(b.id)}`))
}

// GAP-08: itinerary change (assisted cancel + rebook). Same party travels —
// the server reuses this booking's travelers, so passports stay encrypted.
const chgForm = ref({ startDate: '', endDate: '', type: 'VOLUNTARY', reason: '' })
const chgPreview = ref<any>(null)
const chgBusy = ref(false)
const chgMsg = ref('')
const chgContact = ref({ name: '', email: '', phone: '' })
const chgAgree = ref({ refund: false, privacy: false, thirdParty: false })
const chgList = ref<any[]>([])
const chgEligible = computed(() => {
  const b = booking.value
  return !!b && ['FLIGHT', 'HOTEL'].includes(b.domain) && ['TICKETED', 'VOUCHER_ISSUED'].includes(b.status)
})
async function loadChanges() {
  if (!chgEligible.value) return
  const r = await apiFetch(`/bookings/${encodeURIComponent(props.bookingId)}/change-requests`)
  if (r.ok) chgList.value = r.data.requests || []
}
function prefillChangeContact() {
  const b = booking.value
  chgContact.value = {
    name: b?.contact?.name || '',
    email: b?.contact?.email || '',
    phone: b?.contact?.phone || '',
  }
}
async function requestChange() {
  chgMsg.value = ''
  if (!chgForm.value.startDate) { chgMsg.value = t('booking.detail.chgNeedDate'); return }
  chgBusy.value = true
  try {
    const r = await apiFetch(`/bookings/${encodeURIComponent(props.bookingId)}/change-request`, {
      method: 'POST',
      body: {
        newStartDate: chgForm.value.startDate,
        ...(chgForm.value.endDate ? { newEndDate: chgForm.value.endDate } : {}),
        type: chgForm.value.type,
        reason: chgForm.value.reason,
      },
    })
    if (!r.ok) { chgMsg.value = r.data.error || t('booking.detail.chgReqFail'); return }
    chgPreview.value = r.data
    prefillChangeContact()
    await loadChanges()
  } finally { chgBusy.value = false }
}
function selectApprovedChange(c: any) {
  chgMsg.value = ''
  chgPreview.value = {
    requestId: c.id,
    executable: true,
    newTotalMinor: c.new_total_minor ?? c.quoted_total_minor ?? booking.value?.totalMinor ?? 0,
    cancelFeeMinor: c.cancel_fee_minor ?? 0,
    refundDueMinor: c.refund_due_minor ?? 0,
  }
  prefillChangeContact()
}
async function confirmChange() {
  const p = chgPreview.value
  if (!p?.executable) return
  if (!chgAgree.value.refund || !chgAgree.value.privacy || !chgAgree.value.thirdParty) { chgMsg.value = t('booking.detail.chgNeedAgrees'); return }
  chgBusy.value = true
  try {
    const lv = await apiFetch('/legal')
    const versions: Record<string, string> = {}
    if (lv.ok) for (const d of (lv.data.documents || []) as any[]) versions[d.slug] = d.version
    const r = await apiFetch(`/change-requests/${encodeURIComponent(p.requestId)}/confirm`, {
      method: 'POST',
      body: { contact: chgContact.value, reuseTravelers: true, consents: { refundPolicy: versions['refund-policy'], privacy: versions['privacy'], thirdParty: versions['privacy'] } },
    })
    if (!r.ok) { chgMsg.value = r.data.error || t('booking.detail.chgConfirmFail'); return }
    router.push(localePath(`/checkout?bookingId=${encodeURIComponent(r.data.newBookingId)}`))
  } finally { chgBusy.value = false }
}

const printVoucher = () => window.print()
function downloadIcs() {
  const b = booking.value
  if (!b?.serviceStart) return
  const esc = (s: string) => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
  const dt = (d: string) => d.replace(/-/g, '')
  const start = dt(String(b.serviceStart).slice(0, 10))
  const endRaw = String(b.serviceEnd || b.serviceStart).slice(0, 10)
  const endDate = new Date(`${endRaw}T00:00:00Z`)
  if (endRaw === String(b.serviceStart).slice(0, 10)) endDate.setUTCDate(endDate.getUTCDate() + 1)
  const end = endDate.toISOString().slice(0, 10).replace(/-/g, '')
  const voucher = (b.items || []).map((it: any) => it.voucher_code || it.pnr).filter(Boolean).join(', ')
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//getfortrip//OTA Itinerary//EN',
    'BEGIN:VEVENT',
    `UID:${b.bookingNumber || b.id}@getfortrip.com`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')}`,
    `DTSTART;VALUE=DATE:${start}`,
    `DTEND;VALUE=DATE:${end}`,
    `SUMMARY:${esc(`[getfortrip] ${b.title}`)}`,
    `DESCRIPTION:${esc(`Booking No: ${b.bookingNumber}${voucher ? `\\nVoucher/PNR: ${voucher}` : ''}`)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')
  const blob = new Blob([lines], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `getfortrip-${b.bookingNumber || b.id}.ics`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
/** Supplier-provided links: https only (Vue does not sanitize :href — no javascript:). */
function httpsOnly(urls: unknown): string[] {
  if (!Array.isArray(urls)) return []
  return urls.filter((u): u is string => {
    if (typeof u !== 'string') return false
    try { return new URL(u).protocol === 'https:' } catch { return false }
  })
}

onMounted(load)
onBeforeUnmount(() => clearTimeout(pollTimer))
</script>

<template>
  <div class="max-w-3xl mx-auto px-4 py-6 md:py-10">
    <div v-if="loading" class="py-24 text-center text-sm text-ink-subtle" data-testid="booking-loading">{{ $t('booking.checking') }}</div>

    <div v-else-if="error" class="rounded-2xl border border-line bg-surface p-8 text-center" role="alert" data-testid="booking-error">
      <p class="text-sm font-semibold text-ink">{{ error }}</p>
      <NuxtLink :to="$localePath('/my/bookings')" class="mt-4 inline-block rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-ink-inverse">{{ $t('booking.myList') }}</NuxtLink>
    </div>

    <div v-else-if="booking" class="space-y-4" data-testid="booking-detail">
      <div :class="['rounded-2xl border p-5 md:p-6', TONE_CLASS[tone]]" data-testid="booking-status">
        <div class="flex items-start justify-between gap-3">
          <div>
            <div class="text-xs font-semibold opacity-80">{{ domainLabel(booking.domain) }} · {{ $t('booking.detail.bookingNo', { n: booking.bookingNumber }) }}</div>
            <div v-if="booking.salesTypeLabel" class="mt-1 text-xs font-semibold opacity-80" data-testid="sales-type">{{ $t('booking.detail.salesType', { v: booking.salesTypeLabel }) }}<span v-if="booking.supplierName"> · {{ booking.supplierName }}</span></div>
            <h1 class="mt-1 text-lg md:text-xl font-bold">{{ headline }}</h1>
            <p v-if="subline" class="mt-1 text-sm opacity-90">{{ subline }}</p>
          </div>
          <span class="shrink-0 rounded-full bg-surface/70 px-3 py-1 text-xs font-semibold" :data-status="booking.status">{{ $te('booking.status.' + booking.status) ? $t('booking.status.' + booking.status) : booking.statusLabel }}</span>
        </div>
        <div v-if="booking.paymentMode === 'SANDBOX'" class="mt-3 text-[11px] font-semibold text-warning">{{ $t('booking.detail.sandboxNote') }}</div>
      </div>

      <div class="hidden print:flex items-center justify-between border-b border-line pb-4 mb-2">
        <div>
          <p class="text-lg font-extrabold tracking-tight text-ink">getfortrip E-Voucher</p>
          <p class="text-xs text-ink-muted">{{ booking.bookingNumber }}</p>
        </div>
        <p class="text-xs text-ink-subtle">{{ new Date().toLocaleDateString(tag()) }}</p>
      </div>

      <div v-if="booking.status === 'AWAITING_PAYMENT'" class="rounded-2xl border border-line bg-surface p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 print:hidden">
        <p class="text-sm text-ink-muted">{{ $t('booking.detail.autoCancel', { d: deadlineText }) }}</p>
        <button class="rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-ink transition-colors hover:bg-primary-hover" data-testid="resume-payment" @click="resumePayment">{{ $t('checkout.payNow', { v: fmtMoney(booking.totalMinor) }) }}</button>
      </div>

      <section class="rounded-2xl border border-line bg-surface p-5 md:p-6">
        <h2 class="font-bold text-ink">{{ booking.title }}</h2>
        <p class="mt-1 text-sm text-ink-muted">{{ booking.serviceStart }}<span v-if="booking.serviceEnd && booking.serviceEnd !== booking.serviceStart"> → {{ booking.serviceEnd }}</span></p>

        <div v-for="(it, i) in booking.items" :key="i" class="mt-4 rounded-xl bg-surface-sunken p-4 text-sm" data-testid="booking-item">
          <div v-if="booking.items.length > 1" class="mb-2 font-semibold text-ink">{{ it.title }} <span class="font-normal text-ink-subtle">· {{ it.service_start }}</span></div>
          <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
            <template v-if="it.voucher_code"><dt class="text-ink-subtle">{{ $t('booking.detail.voucher') }}</dt><dd class="font-mono font-bold text-ink" data-testid="voucher-code">{{ it.voucher_code }}</dd></template>
            <template v-if="it.pnr"><dt class="text-ink-subtle">{{ $t('booking.detail.pnr') }}</dt><dd class="font-mono font-bold text-ink">{{ it.pnr }}</dd></template>
            <template v-if="it.ticket_numbers?.length && !it.artefacts"><dt class="text-ink-subtle">{{ $t('booking.detail.ticketNos') }}</dt><dd class="font-mono text-ink">{{ it.ticket_numbers.join(', ') }}</dd></template>
            <template v-if="it.artefacts">
              <dt class="text-ink-subtle">{{ $t('booking.detail.artefacts') }}</dt>
              <dd class="space-y-1" data-testid="wholesale-artefacts">
                <p v-if="it.artefacts.lpa">{{ $t('booking.detail.lpa') }}: <span class="font-mono font-bold">{{ it.artefacts.lpa }}</span> <button type="button" class="ml-1 rounded border border-line px-1.5 py-0.5 text-xs" @click="copyText(it.artefacts.lpa)">{{ copied === it.artefacts.lpa ? $t('booking.detail.copied') : $t('booking.detail.copy') }}</button></p>
                <p v-if="it.artefacts.qr">{{ $t('booking.detail.qrInfo') }}: <span class="font-mono break-all">{{ it.artefacts.qr }}</span></p>
                <p v-for="(c, ci) in it.artefacts.codes" :key="ci">{{ $t('booking.detail.credNo') }}: <span class="font-mono font-bold">{{ c }}</span></p>
                <p v-for="(u, ui) in httpsOnly(it.artefacts.pdfUrls)" :key="ui"><a :href="u" target="_blank" rel="noopener" class="font-semibold text-primary underline">{{ $t('booking.detail.pdfOpen') }}</a></p>
              </dd>
            </template>
            <template v-if="it.supplier_reference"><dt class="text-ink-subtle">{{ $t('booking.detail.supRef') }}</dt><dd class="font-mono text-ink">{{ it.supplier_reference }}</dd></template>
            <dt class="text-ink-subtle">{{ $t('booking.detail.supStatus') }}</dt><dd class="text-ink">{{ it.supplier_status || '-' }}</dd>
          </dl>
          <p v-if="!it.voucher_code && !booking.isConfirmed" class="mt-2 text-xs text-ink-subtle">{{ $t('booking.detail.voucherPending') }}</p>
        </div>
      </section>

      <section class="rounded-2xl border border-line bg-surface p-5 md:p-6 grid md:grid-cols-2 gap-6 text-sm">
        <div>
          <h3 class="font-semibold text-ink">{{ $t('booking.detail.payInfo') }}</h3>
          <dl class="mt-2 space-y-1">
            <div class="flex justify-between"><dt class="text-ink-subtle">{{ $t('booking.detail.total') }}</dt><dd class="font-bold tabular" data-testid="booking-total">{{ fmtMoney(booking.totalMinor) }}</dd></div>
            <div class="flex justify-between"><dt class="text-ink-subtle">{{ $t('booking.detail.paid') }}</dt><dd class="tabular">{{ fmtMoney(booking.paidMinor) }}</dd></div>
            <div v-if="booking.cancellationFeeMinor" class="flex justify-between"><dt class="text-ink-subtle">{{ $t('booking.detail.cancelFee') }}</dt><dd class="tabular">{{ fmtMoney(booking.cancellationFeeMinor) }}</dd></div>
            <div v-if="booking.refundedMinor" class="flex justify-between"><dt class="text-ink-subtle">{{ $t('booking.detail.refunded') }}</dt><dd class="text-success tabular">{{ fmtMoney(booking.refundedMinor) }}</dd></div>
          </dl>
          <ul v-if="booking.refunds?.length" class="mt-2 space-y-1 text-xs text-ink-muted">
            <li v-for="rf in booking.refunds" :key="rf.id">{{ $t('booking.detail.refundLine', { v: fmtMoney(rf.amount_minor), s: rf.status, d: fmt(rf.updated_at) }) }}</li>
          </ul>
        </div>
        <div>
          <h3 class="font-semibold text-ink">{{ $t('booking.detail.booker') }}</h3>
          <p class="mt-2 text-ink-muted">{{ booking.contact?.name }}<br>{{ booking.contact?.email }}<br>{{ booking.contact?.phone }}</p>
          <h3 v-if="booking.travelers?.length" class="mt-4 font-semibold text-ink">{{ $t('booking.detail.travelers') }}</h3>
          <ul class="mt-1 space-y-0.5 text-ink-muted">
            <li v-for="(t, i) in booking.travelers" :key="i">{{ t.lastNameEn }} {{ t.firstNameEn }} <span class="text-xs text-ink-subtle">({{ t.type === 'ADULT' ? $t('checkout.paxAdult') : t.type === 'CHILD' ? $t('checkout.paxChild') : $t('checkout.infant') }}{{ t.passport ? $t('booking.detail.paxPassport', { p: t.passport }) : '' }})</span></li>
          </ul>
        </div>
      </section>

      <section class="rounded-2xl border border-line bg-surface p-5 md:p-6 text-sm">
        <h3 class="font-semibold text-ink">{{ $t('checkout.cancelPolicy') }}</h3>
        <p class="mt-1 text-ink-muted">
          <span v-if="booking.cancellationPolicy?.type === 'FREE_UNTIL'">{{ $t('booking.detail.freeUntilFull', { d: fmt(booking.cancellationPolicy.freeUntil) }) }}</span>
          <span v-else>{{ $t('checkout.nonRefundable') }}</span>
        </p>
        <p v-if="booking.cancellationPreview" class="mt-1 text-xs text-ink-subtle">{{ $t('booking.detail.cancelNow', { fee: fmtMoney(booking.cancellationPreview.feeMinor), refund: fmtMoney(booking.cancellationPreview.refundMinor) }) }}</p>
        <PolicyNotice :domain="booking.domain" :item-id="booking.itemId" v-slot="{ policy, hoursLabel, pct }">
          <ul v-if="policy && policy.tiers?.length" class="mt-2 space-y-1 text-xs text-ink-muted">
            <li v-for="(t, i) in policy.tiers" :key="i">{{ $t('booking.detail.tierLine', { h: hoursLabel(t.hours_before), p: pct(t.refund_bps), note: t.note ? ` (${t.note})` : '' }) }}</li>
            <li v-if="policy.no_show_fee_bps">{{ $t('booking.detail.noshowLine', { p: pct(policy.no_show_fee_bps) }) }}</li>
          </ul>
        </PolicyNotice>
        <button v-if="booking.canCancel" :disabled="cancelling" class="mt-3 rounded-xl border border-danger/40 px-4 py-2 text-sm font-semibold text-danger disabled:opacity-50 print:hidden" data-testid="cancel-booking" @click="cancel">
          {{ cancelling ? $t('my.processing') : $t('booking.detail.cancelGo') }}
        </button>
        <p v-if="cancelMsg" class="mt-2 text-sm text-danger" role="alert">{{ cancelMsg }}</p>
      </section>

      <section v-if="chgEligible" class="rounded-2xl border border-line bg-surface p-5 md:p-6 print:hidden" data-testid="change-section">
        <h2 class="font-bold text-ink">{{ $t('booking.detail.chgTitle') }}</h2>
        <p class="mt-1 text-sm text-ink-muted">{{ $t('booking.detail.chgSub') }}</p>
        <div v-if="chgList.length" class="mt-3 space-y-2">
          <div v-for="c in chgList" :key="c.id" class="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface-sunken p-3 text-sm">
            <div>
              <p class="font-semibold text-ink">{{ $t('booking.detail.chgRow', { a: c.new_start_date, b: c.new_end_date ? ` → ${c.new_end_date}` : '', s: c.status === 'PENDING_APPROVAL' ? $t('booking.detail.chgPending') : c.status === 'EXECUTED' ? $t('booking.detail.chgDone') : c.status }) }}</p>
              <p v-if="c.status === 'PENDING_APPROVAL'" class="mt-1 text-xs text-ink-subtle">{{ $t('booking.detail.chgInvolNote') }}</p>
            </div>
            <button v-if="c.status === 'APPROVED'" type="button" class="btn-primary btn-sm shrink-0" @click="selectApprovedChange(c)">{{ $t('booking.detail.chgConfirm') }}</button>
          </div>
        </div>
        <div v-if="!chgPreview" class="mt-3 grid gap-3 sm:grid-cols-2">
          <label class="text-sm">{{ $t('booking.detail.chgNewStart') }}<input v-model="chgForm.startDate" type="date" class="mt-1 w-full rounded-xl border border-line bg-surface px-3 py-2.5" data-testid="change-start" /></label>
          <label class="text-sm">{{ $t('booking.detail.chgNewEnd') }}<input v-model="chgForm.endDate" type="date" class="mt-1 w-full rounded-xl border border-line bg-surface px-3 py-2.5" /></label>
          <label class="text-sm">{{ $t('booking.detail.chgReason') }}
            <select v-model="chgForm.type" class="mt-1 w-full rounded-xl border border-line bg-surface px-3 py-2.5">
              <option value="VOLUNTARY">{{ $t('booking.detail.chgVoluntary') }}</option>
              <option value="INVOLUNTARY">{{ $t('booking.detail.chgInvoluntary') }}</option>
            </select>
          </label>
          <label class="text-sm">{{ $t('booking.detail.chgMemo') }}<input v-model="chgForm.reason" type="text" maxlength="200" class="mt-1 w-full rounded-xl border border-line bg-surface px-3 py-2.5" /></label>
        </div>
        <div v-if="chgPreview" class="mt-3 rounded-xl bg-surface-sunken p-4 text-sm" data-testid="change-preview">
          <p class="font-semibold text-ink">{{ $t('booking.detail.chgPreviewLine', { v: fmtMoney(chgPreview.newTotalMinor), fee: fmtMoney(chgPreview.cancelFeeMinor), refund: fmtMoney(chgPreview.refundDueMinor) }) }}</p>
          <p v-if="!chgPreview.executable" class="mt-1 text-xs text-ink-subtle">{{ $t('booking.detail.chgNeedApproval') }}</p>
          <div v-else class="mt-3 space-y-2">
            <input v-model="chgContact.name" :placeholder="$t('booking.detail.chgPhName')" class="w-full rounded-xl border border-line bg-surface px-3 py-2.5" />
            <input v-model="chgContact.email" :placeholder="$t('auth.email')" class="w-full rounded-xl border border-line bg-surface px-3 py-2.5" />
            <input v-model="chgContact.phone" :placeholder="$t('booking.detail.chgPhPhone')" class="w-full rounded-xl border border-line bg-surface px-3 py-2.5" />
            <label class="flex items-center gap-2 text-xs"><input v-model="chgAgree.refund" type="checkbox" /> {{ $t('booking.detail.chgAgreeRefund') }}</label>
            <label class="flex items-center gap-2 text-xs"><input v-model="chgAgree.privacy" type="checkbox" /> {{ $t('booking.detail.chgAgreePrivacy') }}</label>
            <label class="flex items-center gap-2 text-xs"><input v-model="chgAgree.thirdParty" type="checkbox" /> {{ $t('booking.detail.chgAgreeThird') }}</label>
          </div>
        </div>
        <p v-if="chgMsg" class="mt-2 text-sm text-danger" role="alert">{{ chgMsg }}</p>
        <div class="mt-3 flex gap-2">
          <button v-if="!chgPreview" type="button" :disabled="chgBusy" class="btn-secondary" data-testid="change-request" @click="requestChange">{{ chgBusy ? $t('booking.detail.chgLooking') : $t('booking.detail.chgQuote') }}</button>
          <button v-if="chgPreview?.executable" type="button" :disabled="chgBusy" class="btn-primary" data-testid="change-confirm" @click="confirmChange">{{ chgBusy ? $t('my.processing') : $t('booking.detail.chgConfirm') }}</button>
        </div>
      </section>

      <!-- CR-03: conversation with the seller (or getfortrip CS when there is no partner) -->
      <BookingMessages :booking-id="bookingId" class="print:hidden" />

      <details v-if="booking.paidMinor > 0" class="rounded-2xl border border-line bg-surface p-5 text-sm" data-testid="receipt-block" @toggle="(e: any) => loadReceipt(e.target.open)">
        <summary class="cursor-pointer font-semibold text-ink">{{ $t('booking.detail.receipt') }}</summary>
        <p v-if="receiptLoading" class="mt-3 text-ink-muted">{{ $t('common.loading') }}</p>
        <div v-else-if="receipt" class="mt-3 space-y-2">
          <dl class="space-y-1">
            <div class="flex justify-between"><dt class="text-ink-subtle">{{ $t('checkout.bookingNo') }}</dt><dd class="font-mono">{{ receipt.bookingNumber }}</dd></div>
            <div class="flex justify-between"><dt class="text-ink-subtle">{{ $t('booking.detail.salesTypeShort') }}</dt><dd>{{ receipt.salesTypeLabel }}</dd></div>
            <div v-for="p in receipt.payments" :key="p.id" class="border-t border-line pt-2">
              <div class="flex justify-between"><dt class="text-ink-subtle">{{ $t('booking.detail.payLine', { m: p.method || p.provider }) }}</dt><dd class="font-bold tabular">{{ fmtMoney(p.amountMinor) }}</dd></div>
              <div v-if="p.card?.company" class="flex justify-between text-xs text-ink-muted"><span>{{ p.card.company }} {{ p.card.number }}</span><span>{{ p.card.installmentMonths ? $t('booking.detail.installment', { n: p.card.installmentMonths }) : $t('booking.detail.lumpSum') }}</span></div>
              <div class="flex justify-between text-xs text-ink-muted"><span>{{ $t('booking.detail.approved', { d: p.approvedAt ? fmt(p.approvedAt) : '—' }) }}</span><span>{{ p.status }}</span></div>
            </div>
            <div v-for="rf in receipt.refunds" :key="rf.id" class="flex justify-between text-success"><dt>{{ $t('booking.detail.refundLineShort', { s: rf.status }) }}</dt><dd class="tabular">{{ fmtMoney(rf.amountMinor) }}</dd></div>
            <div class="flex justify-between border-t border-line pt-2"><dt class="text-ink-subtle">{{ $t('booking.detail.netPaid') }}</dt><dd class="font-bold tabular">{{ fmtMoney(receipt.paidMinor - receipt.refundedMinor) }}</dd></div>
          </dl>
          <button class="rounded-xl border border-line-strong px-4 py-2 text-xs font-semibold print:hidden" @click="printVoucher">{{ $t('booking.detail.printReceipt') }}</button>
        </div>
      </details>

      <details class="rounded-2xl border border-line bg-surface p-5 text-sm print:hidden">
        <summary class="cursor-pointer font-semibold text-ink">{{ $t('booking.detail.history') }}</summary>
        <ol class="mt-3 space-y-1 text-xs text-ink-muted">
          <li v-for="(h, i) in booking.history" :key="i">{{ fmt(h.created_at) }} · {{ h.from_status || $t('booking.detail.created') }} → <strong>{{ h.to_status }}</strong><span v-if="h.reason"> ({{ h.reason }})</span></li>
        </ol>
      </details>

      <div class="flex flex-wrap gap-2 print:hidden">
        <NuxtLink :to="$localePath('/my/bookings')" class="rounded-xl border border-line-strong px-4 py-2.5 text-sm font-semibold">{{ $t('booking.myList') }}</NuxtLink>
        <button v-if="booking.isConfirmed" type="button" class="rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-ink-inverse" @click="printVoucher">{{ $t('booking.detail.printVoucher') }}</button>
        <button v-if="booking.isConfirmed && booking.serviceStart" type="button" class="rounded-xl border border-primary/40 bg-primary-soft px-4 py-2.5 text-sm font-semibold text-primary hover:bg-primary/15" @click="downloadIcs">{{ $t('booking.detail.addCalendar') }}</button>
      </div>
    </div>
  </div>
</template>
