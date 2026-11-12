<script setup lang="ts">
/**
 * Unified, server-driven checkout for every product type.
 * 1) trip details -> server quote (price is computed ONLY by the server)
 * 2) traveler & contact info -> booking (idempotent)
 * 3) payment via the configured PG -> real booking status page
 */
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '~/stores/auth'
import { useCurrencyStore } from '~/stores/currency'
import { apiFetch, formatKrw, formatMinor } from '~/composables/useApi'
import { fmtDay, qDate, qInt, todayIso } from '~/composables/useUrlQuery'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const currency = useCurrencyStore()

const DOMAIN_LABEL: Record<string, string> = { HOTEL: '숙소', FLIGHT: '항공권', TRAIN: '기차', CAR: '렌터카', TRANSFER: '공항 이동', ACTIVITY: '투어·티켓', PACKAGE: '패키지' }
const q = route.query as Record<string, string>
const domain = String(q.domain || '').toUpperCase()
const itemId = String(q.itemId || '')
const unitId = q.unitId ? String(q.unitId) : null
const ratePlanId = domain === 'HOTEL' && q.ratePlanId ? String(q.ratePlanId) : undefined
const returnItemId = domain === 'FLIGHT' && q.returnItemId ? String(q.returnItemId) : undefined
const needsEnd = domain === 'HOTEL' || domain === 'CAR'
const today = ref('')
// Dates are never assumed: they come from the product page or the user picks them here.
const startDate = ref(qDate(q.startDate))
const endDate = ref(qDate(q.endDate))
const returnDate = ref(qDate(q.returnDate))
const rooms = ref(qInt(q.rooms, 1, 1, 9))
const adults = ref(qInt(q.adults, domain === 'HOTEL' ? 2 : 1, 1, 9))
const children = ref(qInt(q.children, 0, 0, 8))
const infants = ref(qInt(q.infants, 0, 0, 4))
const promotionCode = ref('')
const useCoins = ref(0)
const coinBalance = computed(() => auth.user?.tripCoins || 0)

type Step = 'details' | 'travelers' | 'payment'
const step = ref<Step>('details')
const busy = ref(false)
const error = ref('')
const blocked = ref<{ code: string; message: string } | null>(null)
const quote = ref<any>(null)
const booking = ref<any>(null)
const payConfig = ref<any>(null)
const now = ref(Date.now())
let timer: any

const contact = ref({ name: auth.user?.fullName || '', email: auth.user?.email || '', phone: auth.user?.phoneNumber || '' })
const travelers = ref<any[]>([])
const specialRequests = ref('')
// #88: requested slot carried from the activity detail (?slotStart=HH:MM).
// A labelled request, never a reservation — atomic slot booking is #104.
const slotStart = ref(domain === 'ACTIVITY' && /^([01]\d|2[0-3]):[0-5]\d$/.test(String(q.slotStart || '')) ? String(q.slotStart) : '')
if (slotStart.value && !specialRequests.value) specialRequests.value = `[요청 시간대: ${slotStart.value} — 확정 아님] `
// #92: saved travelers fill a row (passport number stays manual: the API
// only ever returns it masked).
const savedTravelers = ref<any[]>([])
let savedLoaded = false
async function loadSavedTravelers() {
  if (savedLoaded) return
  savedLoaded = true
  try {
    const r = await apiFetch('/user/passengers')
    if (r.ok && Array.isArray((r.data as any).passengers)) savedTravelers.value = (r.data as any).passengers
  } catch { savedTravelers.value = [] }
}
watch(step, (s) => { if (s === 'travelers') loadSavedTravelers() })
function applySaved(i: number, id: string) {
  const p = savedTravelers.value.find((x: any) => x.id === id)
  const t = travelers.value[i]
  if (!p || !t) return
  t.lastNameEn = p.last_name_en || ''
  t.firstNameEn = p.first_name_en || ''
  t.birthDate = p.birth_date || ''
  t.gender = p.gender || t.gender
  t.nationality = p.nationality || t.nationality
  t.passportExpiry = p.passport_expiry || ''
}
// A3: three mandatory transaction consents, each pinned to the current legal version from /legal.
const agreeRefund = ref(false)
const agreePrivacyTx = ref(false)
const agreeThirdParty = ref(false)
const legalVersions = ref<Record<string, string>>({})
const simSupplier = ref('confirm')
// B8: Toss v2 payment method. CARD default; TRANSFER/VIRTUAL_ACCOUNT pass through to the PG.
const payMethod = ref('CARD')
const simTicketing = ref('ok')
const simPayment = ref('ok')

const isFlight = computed(() => domain === 'FLIGHT')
const STEPS = [['details', '일정·금액 확인'], ['travelers', '예약자 정보'], ['payment', '결제']] as const
const stepIndex = computed(() => STEPS.findIndex((s) => s[0] === step.value))
const startLabel = domain === 'HOTEL' ? '체크인' : domain === 'CAR' ? '인수일' : domain === 'FLIGHT' ? '가는 날' : '이용일'
const endLabel = domain === 'HOTEL' ? '체크아웃' : '반납일'
const FIELD = 'w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-subtle focus:border-primary focus:outline-none focus:shadow-focus disabled:bg-surface-sunken disabled:text-ink-muted'
const perPersonTravelers = computed(() => ['FLIGHT', 'TRAIN', 'PACKAGE'].includes(domain))
const quoteSecondsLeft = computed(() => quote.value ? Math.max(0, Math.floor((Date.parse(quote.value.expiresAt) - now.value) / 1000)) : 0)
const paySecondsLeft = computed(() => booking.value?.paymentDeadline ? Math.max(0, Math.floor((Date.parse(booking.value.paymentDeadline) - now.value) / 1000)) : 0)
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
const isSandbox = computed(() => payConfig.value?.mode === 'SANDBOX' || quote.value?.fulfilmentMode === 'SIMULATED')

function buildTravelers() {
  const list: any[] = []
  const add = (type: string, n: number) => { for (let i = 0; i < n; i++) list.push({ type, lastNameEn: '', firstNameEn: '', birthDate: '', gender: '', nationality: 'KOR', passportNumber: '', passportExpiry: '' }) }
  if (perPersonTravelers.value) { add('ADULT', adults.value); add('CHILD', children.value); add('INFANT', infants.value) } else add('ADULT', 1)
  travelers.value = list
}

function idemKeyFor(quoteId: string) {
  const k = `gft_idem_${quoteId}`
  try {
    const existing = sessionStorage.getItem(k)
    if (existing) return existing
    const v = `chk_${crypto.randomUUID().replace(/-/g, '')}`
    sessionStorage.setItem(k, v)
    return v
  } catch { return `chk_${quoteId}` }
}

const datesReady = computed(() => !!startDate.value && (!needsEnd || endDate.value > startDate.value) && (!returnItemId || returnDate.value >= startDate.value))
async function getQuote(retry = true) {
  error.value = ''
  if (!datesReady.value) { error.value = needsEnd ? '시작일과 종료일을 선택해 주세요.' : returnItemId ? '가는 날과 오는 날을 선택해 주세요.' : '이용일을 선택해 주세요.'; return }
  busy.value = true
  const r = await apiFetch('/quotes', {
    method: 'POST',
    body: { domain, itemId, unitId, ratePlanId, returnItemId, returnDate: returnItemId ? returnDate.value : undefined, startDate: startDate.value, endDate: needsEnd ? endDate.value : null, rooms: domain === 'HOTEL' ? rooms.value : undefined, travelers: { adults: adults.value, children: children.value, infants: infants.value }, promotionCode: promotionCode.value || undefined, coinAmount: useCoins.value > 0 ? Math.floor(useCoins.value) : undefined, displayCurrency: currency.activeCurrency !== 'KRW' ? currency.activeCurrency : undefined }
  })
  busy.value = false
  if (r.status === 401) return goLogin()
  if (!r.ok) {
    // The server knows the payable total: clamp an over-large coin request once and retry.
    // #13: at least 1 KRW must stay on the card (full-coin checkout is unsupported).
    if (r.data.code === 'COINS_EXCEED_TOTAL' && retry && typeof r.data.details?.maxUsable === 'number') {
      useCoins.value = Math.max(0, r.data.details.maxUsable - 1)
      return getQuote(false)
    }
    if (r.data.code === 'ZERO_TOTAL_UNSUPPORTED' && retry && useCoins.value > 0) {
      useCoins.value = Math.max(0, Math.floor(useCoins.value) - 1)
      return getQuote(false)
    }
    if (['NOT_DIRECTLY_BOOKABLE', 'SALES_NOT_ENABLED', 'PAYMENTS_DISABLED', 'BELOW_FLOOR_PRICE', 'FLIGHT_TICKETING_UNSUPPORTED', 'ESIM_INSURANCE_QUOTE_UNSUPPORTED'].includes(r.data.code || '')) blocked.value = { code: r.data.code!, message: r.data.error || '' }
    else error.value = r.data.error || '가격을 확인할 수 없습니다.'
    return
  }
  quote.value = r.data.quote
  buildTravelers()
}

async function createBooking() {
  error.value = ''
  if (!agreeRefund.value || !agreePrivacyTx.value || !agreeThirdParty.value) { error.value = '예약하려면 취소·환불 규정, 개인정보 수집·이용, 공급사 제3자 제공에 모두 동의해 주세요.'; return }
  for (const t of travelers.value) { t.lastNameEn = t.lastNameEn.trim().toUpperCase(); t.firstNameEn = t.firstNameEn.trim().toUpperCase() }
  busy.value = true
  const body: any = { quoteId: quote.value.quoteId, contact: contact.value, travelers: travelers.value.map((t) => ({ ...t, birthDate: t.birthDate || null, passportNumber: t.passportNumber || null, passportExpiry: t.passportExpiry || null, gender: t.gender || null })), specialRequests: specialRequests.value, consents: { refundPolicy: legalVersions.value['refund-policy'], privacy: legalVersions.value['privacy'], thirdParty: legalVersions.value['privacy'] } }
  if (quote.value.fulfilmentMode === 'SIMULATED') body.simulation = { supplier: simSupplier.value, ticketing: simTicketing.value }
  const r = await apiFetch('/bookings', { method: 'POST', body, headers: { 'Idempotency-Key': idemKeyFor(quote.value.quoteId) } })
  busy.value = false
  if (r.status === 401) return goLogin()
  if (!r.ok) {
    if (r.data.code === 'PRICE_CHANGED' || r.data.code === 'QUOTE_EXPIRED') { error.value = `${r.data.error} 다시 가격을 확인해주세요.`; quote.value = null; step.value = 'details'; return }
    if (r.data.code === 'CONSENT_STALE') {
      agreeRefund.value = agreePrivacyTx.value = agreeThirdParty.value = false
      try {
        const lv = await apiFetch('/legal')
        if (lv.ok) { legalVersions.value = {}; for (const d of lv.data.documents || []) legalVersions.value[d.slug] = d.version }
      } catch { /* keep old versions; server will reject again */ }
      error.value = r.data.error || '약관이 변경되었습니다. 다시 확인하고 동의해 주세요.'
      return
    }
    error.value = r.data.error || '예약을 생성하지 못했습니다.'
    return
  }
  booking.value = r.data.booking
  const pc = await apiFetch('/payments/config')
  payConfig.value = pc.data
  step.value = 'payment'
}

async function payWithToss() {
  const w = window as any
  if (!w.TossPayments) {
    await new Promise<void>((res, rej) => { const s = document.createElement('script'); s.src = 'https://js.tosspayments.com/v2/standard'; s.onload = () => res(); s.onerror = () => rej(new Error('load')); document.head.appendChild(s) })
  }
  const toss = w.TossPayments(payConfig.value.clientKey)
  const payment = toss.payment({ customerKey: auth.user?.id })
  await payment.requestPayment({
    method: payMethod.value,
    amount: { currency: 'KRW', value: booking.value.totalMinor },
    orderId: booking.value.id,
    orderName: booking.value.title.slice(0, 100),
    customerEmail: contact.value.email,
    customerName: contact.value.name,
    successUrl: `${location.origin}/checkout/payment-return?bookingId=${booking.value.id}`,
    failUrl: `${location.origin}/checkout/payment-return?bookingId=${booking.value.id}&failed=1`
  })
}

async function paySandbox() {
  error.value = ''
  busy.value = true
  const r = await apiFetch('/payments/confirm', { method: 'POST', body: { bookingId: booking.value.id, orderId: booking.value.id, amount: booking.value.totalMinor, paymentKey: `sbx_${simPayment.value}_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}` } })
  busy.value = false
  if (!r.ok && r.status !== 402) { error.value = r.data.error || '결제 처리 중 오류가 발생했습니다.'; return }
  if (r.status === 402) { error.value = r.data.error || '결제가 거절되었습니다.'; return }
  router.push(`/booking/result?bookingId=${booking.value.id}`)
}

async function pay() {
  if (!payConfig.value?.enabled) { error.value = '현재 온라인 결제가 활성화되어 있지 않습니다.'; return }
  if (payConfig.value.provider === 'toss') {
    try { await payWithToss() } catch { error.value = '결제창을 열 수 없습니다. 잠시 후 다시 시도해주세요.' }
  } else if (payConfig.value.provider === 'sandbox') await paySandbox()
}

function goLogin() { router.push(`/login?redirect=${encodeURIComponent(route.fullPath)}`) }

onMounted(async () => {
  today.value = todayIso()
  timer = setInterval(() => (now.value = Date.now()), 1000)
  await auth.initAuth()
  if (!auth.isLoggedIn) return goLogin()
  // On a direct page load the session is restored only now; prefill contact fields the user left empty.
  if (!contact.value.name) contact.value.name = auth.user?.fullName || ''
  if (!contact.value.email) contact.value.email = auth.user?.email || ''
  if (!contact.value.phone) contact.value.phone = auth.user?.phoneNumber || ''
  if (!DOMAIN_LABEL[domain] || !itemId) { error.value = '잘못된 상품 정보입니다.'; return }
  try {
    const lv = await apiFetch('/legal')
    if (lv.ok) for (const d of lv.data.documents || []) legalVersions.value[d.slug] = d.version
  } catch { /* consent checkboxes stay disabled without versions */ }
  if (q.bookingId) await resumeBooking(String(q.bookingId))
  // Arriving from a product page with dates already chosen: price it right away.
  else if (datesReady.value) await getQuote()
})

/** Re-enter the payment step for an existing booking that is still awaiting payment (e.g. after a declined card). */
async function resumeBooking(id: string) {
  const r = await apiFetch(`/bookings/${encodeURIComponent(id)}`)
  if (r.status === 401) return goLogin()
  if (!r.ok || r.data.booking?.status !== 'AWAITING_PAYMENT') return router.replace(`/booking/result?bookingId=${encodeURIComponent(id)}`)
  booking.value = r.data.booking
  const pc = await apiFetch('/payments/config')
  payConfig.value = pc.data
  step.value = 'payment'
}
onBeforeUnmount(() => clearInterval(timer))
</script>

<template>
  <div class="mx-auto max-w-6xl px-4 pb-24 pt-6 lg:px-6 lg:pt-10">
    <!-- Steps -->
    <nav class="mb-6 flex items-center gap-2 text-sm font-semibold" aria-label="예약 단계">
      <template v-for="(s, i) in STEPS" :key="s[0]">
        <span :class="['flex items-center gap-2', i <= stepIndex ? 'text-ink' : 'text-ink-subtle']" :aria-current="step === s[0] ? 'step' : undefined">
          <span :class="['flex h-7 w-7 items-center justify-center rounded-full text-xs', i < stepIndex ? 'bg-success text-white' : i === stepIndex ? 'bg-primary text-primary-ink' : 'bg-surface-sunken text-ink-subtle']">
            <AppIcon v-if="i < stepIndex" name="check" :size="14" /><template v-else>{{ i + 1 }}</template>
          </span>
          <span :class="i === stepIndex ? '' : 'hidden sm:inline'">{{ s[1] }}</span>
        </span>
        <span v-if="i < 2" class="h-px w-6 bg-line-strong sm:w-10" aria-hidden="true" />
      </template>
    </nav>

    <div v-if="isSandbox" class="mb-4 flex items-start gap-2 rounded-2xl border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-ink" data-testid="sandbox-banner">
      <AppIcon name="bolt" :size="18" class="mt-px text-warning" />
      <span><b>테스트 모드</b> — 실제 결제나 실제 예약이 일어나지 않는 개발용 시뮬레이터예요.</span>
    </div>

    <div v-if="blocked" class="card mx-auto max-w-xl p-6 text-center sm:p-8" data-testid="not-bookable">
      <span class="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-sunken text-ink-subtle"><AppIcon name="lock" /></span>
      <h1 class="mt-4 text-lg font-bold text-ink">지금은 getfortrip에서 바로 예약할 수 없는 상품이에요</h1>
      <p class="mt-2 text-sm text-ink-muted">{{ blocked.message }}</p>
      <p class="mt-2 text-xs text-ink-subtle">결제 전 단계에서 확인되었고, 어떤 금액도 청구되지 않았어요.</p>
      <NuxtLink to="/" class="btn-primary mt-5">다른 상품 둘러보기</NuxtLink>
    </div>

    <div v-else class="grid gap-6 lg:grid-cols-[1fr_360px]">
      <section class="min-w-0 space-y-4">
        <!-- Step 1: details -->
        <div v-if="!booking || quote" class="card p-5 sm:p-6">
          <h1 class="text-lg font-bold text-ink">{{ DOMAIN_LABEL[domain] || '상품' }}{{ returnItemId ? ' 왕복' : '' }} 예약</h1>
          <p v-if="quote" class="mt-1 text-sm text-ink-muted">{{ quote.title }}</p>

          <div class="mt-4 grid gap-3 sm:grid-cols-2">
            <div data-testid="start-date" :class="needsEnd ? 'sm:col-span-2' : ''">
              <DateRangePicker v-if="needsEnd" v-model:start="startDate" v-model:end="endDate" :start-label="startLabel" :end-label="endLabel" :unit="domain === 'HOTEL' ? 'night' : 'day'" :min="today" :max-range="domain === 'HOTEL' ? 30 : 60" :class="quote && 'pointer-events-none opacity-70'" />
              <DateRangePicker v-else v-model:start="startDate" mode="single" :start-label="startLabel" :min="today" :class="quote && 'pointer-events-none opacity-70'" />
            </div>
            <div v-if="returnItemId" data-testid="return-date">
              <DateRangePicker v-model:start="returnDate" mode="single" start-label="오는 날" :min="startDate || today" :class="quote && 'pointer-events-none opacity-70'" />
            </div>
            <div v-if="domain !== 'CAR'" :class="quote && 'pointer-events-none opacity-70'">
              <GuestPicker v-model:adults="adults" v-model:children="children" v-model:rooms="rooms" :show-rooms="domain === 'HOTEL'" :label="domain === 'HOTEL' ? '인원·객실' : '인원'" />
            </div>
            <div v-if="isFlight" class="flex min-h-[64px] items-center justify-between rounded-2xl border border-line bg-surface px-4" :class="quote && 'pointer-events-none opacity-70'">
              <div><p class="text-sm font-semibold text-ink">유아</p><p class="text-xs text-ink-subtle">만 2세 미만 · 좌석 미점유</p></div>
              <div class="flex items-center gap-3">
                <button type="button" class="flex h-9 w-9 items-center justify-center rounded-full border border-line text-ink disabled:opacity-30" :disabled="infants <= 0" aria-label="유아 줄이기" @click="infants--"><AppIcon name="minus" :size="16" /></button>
                <span class="tabular w-5 text-center font-semibold text-ink">{{ infants }}</span>
                <button type="button" class="flex h-9 w-9 items-center justify-center rounded-full border border-line text-ink disabled:opacity-30" :disabled="infants >= adults" aria-label="유아 늘리기" @click="infants++"><AppIcon name="plus" :size="16" /></button>
              </div>
            </div>
            <label class="sm:col-span-2">
              <span class="field-label">쿠폰 코드 (선택)</span>
              <input v-model="promotionCode" type="text" :disabled="!!quote" :class="[FIELD, 'uppercase']" placeholder="예: WELCOME10" />
            </label>
            <div class="rounded-2xl border border-line bg-surface-sunken p-3.5 sm:col-span-2">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <span class="text-xs font-semibold text-ink-subtle">코인 사용 · 보유 {{ coinBalance.toLocaleString('ko-KR') }} G</span>
                <button v-if="coinBalance > 0 && !quote" type="button" class="text-xs font-bold text-primary" @click="useCoins = coinBalance">전액 사용</button>
              </div>
              <input v-model.number="useCoins" type="number" min="0" :max="coinBalance" step="100" :disabled="!!quote || coinBalance <= 0" :class="[FIELD, 'mt-2']" placeholder="0" data-testid="coin-amount" />
              <p class="mt-1.5 text-xs text-ink-subtle">1코인 = 1원, 결제 금액에서 차감돼요. 최소 1원은 카드로 결제해야 해요. 취소하면 사용한 코인을 전액 돌려받아요.</p>
            </div>
          </div>

          <div class="mt-5 flex flex-wrap gap-2">
            <button v-if="!quote" type="button" :disabled="busy" class="btn-primary px-6 py-3" data-testid="get-quote" @click="getQuote">{{ busy ? '확인 중…' : '금액 확인' }}</button>
            <template v-else-if="step === 'details'">
              <button type="button" class="btn-secondary" @click="quote = null">일정·인원 변경</button>
              <button type="button" class="btn-primary px-6" data-testid="to-travelers" @click="step = 'travelers'">다음: 예약자 정보<AppIcon name="arrow-right" :size="16" /></button>
            </template>
          </div>
        </div>

        <!-- Step 2: travelers -->
        <div v-if="step !== 'details' && quote" class="card p-5 sm:p-6">
          <h2 class="text-lg font-bold text-ink">예약자 정보</h2>
          <p class="mt-1 text-sm text-ink-muted">예약 확인 메일과 바우처를 받을 연락처예요.</p>
          <div class="mt-4 grid gap-3 sm:grid-cols-3">
            <label><span class="field-label">이름</span><input v-model="contact.name" :disabled="step === 'payment'" autocomplete="name" :class="FIELD" data-testid="contact-name" /></label>
            <label><span class="field-label">이메일</span><input v-model="contact.email" :disabled="step === 'payment'" type="email" autocomplete="email" :class="FIELD" data-testid="contact-email" /></label>
            <label><span class="field-label">휴대전화</span><input v-model="contact.phone" :disabled="step === 'payment'" type="tel" autocomplete="tel" placeholder="+82-10-0000-0000" :class="FIELD" data-testid="contact-phone" /></label>
          </div>

          <h2 class="mt-7 text-lg font-bold text-ink">{{ perPersonTravelers ? '탑승객·여행자 정보' : '대표 이용자' }}</h2>
          <p class="mt-1 text-sm text-ink-muted">영문 성과 이름은 {{ isFlight ? '여권과 똑같이' : '신분증과 똑같이' }} 입력해 주세요.</p>
          <p v-if="slotStart" class="mt-2 inline-block rounded-lg bg-primary-soft px-2.5 py-1 text-xs font-semibold text-primary">요청 시간대 {{ slotStart }} · 확정 아님</p>
          <div v-for="(t, i) in travelers" :key="i" class="mt-3 rounded-2xl bg-surface-sunken p-4">
            <div class="mb-3 flex items-center justify-between gap-2">
              <p class="text-sm font-semibold text-ink">{{ i + 1 }}. {{ t.type === 'ADULT' ? '성인' : t.type === 'CHILD' ? '아동' : '유아' }}</p>
              <select
                v-if="savedTravelers.length && step === 'travelers'"
                class="max-w-44 truncate rounded-lg border border-line bg-surface px-2 py-1.5 text-xs text-ink"
                aria-label="저장한 여행자 불러오기"
                @change="applySaved(i, ($event.target as HTMLSelectElement).value); ($event.target as HTMLSelectElement).value = ''"
              >
                <option value="">불러오기…</option>
                <option v-for="p in savedTravelers" :key="p.id" :value="p.id">{{ p.name_ko }} · {{ p.last_name_en }} {{ p.first_name_en }}</option>
              </select>
            </div>
            <p v-if="savedTravelers.length && step === 'travelers'" class="-mt-1 mb-2 text-2xs text-ink-subtle">여권번호는 보안상 직접 입력해 주세요.</p>
            <div class="grid gap-3 sm:grid-cols-2">
              <label><span class="field-label">영문 성</span><input v-model="t.lastNameEn" :disabled="step === 'payment'" placeholder="예: KIM" autocomplete="family-name" :class="[FIELD, 'uppercase']" :data-testid="`t${i}-last`" /></label>
              <label><span class="field-label">영문 이름</span><input v-model="t.firstNameEn" :disabled="step === 'payment'" placeholder="예: MINJI" autocomplete="given-name" :class="[FIELD, 'uppercase']" :data-testid="`t${i}-first`" /></label>
              <template v-if="isFlight">
                <label><span class="field-label">생년월일</span><input v-model="t.birthDate" :disabled="step === 'payment'" type="date" :class="FIELD" /></label>
                <label><span class="field-label">국적 (3자리 코드)</span><input v-model="t.nationality" :disabled="step === 'payment'" maxlength="3" :class="[FIELD, 'uppercase']" /></label>
                <label><span class="field-label">여권번호</span><input v-model="t.passportNumber" :disabled="step === 'payment'" autocomplete="off" :class="[FIELD, 'uppercase']" /></label>
                <label><span class="field-label">여권 만료일</span><input v-model="t.passportExpiry" :disabled="step === 'payment'" type="date" :class="FIELD" /></label>
              </template>
            </div>
          </div>
          <label v-if="!perPersonTravelers" class="mt-4 block"><span class="field-label">요청사항 (선택 · 반영이 보장되지는 않아요)</span><textarea v-model="specialRequests" :disabled="step === 'payment'" rows="2" maxlength="500" :class="FIELD" /></label>

          <div v-if="quote.fulfilmentMode === 'SIMULATED' && step === 'travelers'" class="mt-4 rounded-2xl border border-warning/30 bg-warning-soft p-4 text-sm text-ink">
            <p class="mb-2 font-semibold">테스트 시나리오 (개발 환경 전용)</p>
            <label class="mr-4">공급사 응답
              <select v-model="simSupplier" class="ml-1 rounded-lg border border-line bg-surface px-2 py-1" data-testid="sim-supplier"><option value="confirm">확정</option><option value="fail">실패</option><option value="timeout">응답 없음</option><option value="pending">확정 대기</option></select>
            </label>
            <label v-if="isFlight">발권
              <select v-model="simTicketing" class="ml-1 rounded-lg border border-line bg-surface px-2 py-1"><option value="ok">성공</option><option value="fail">실패</option></select>
            </label>
          </div>
          <fieldset v-if="step === 'travelers'" class="mt-5 space-y-2.5 rounded-2xl border border-line bg-surface p-4">
            <legend class="px-1 text-sm font-bold text-ink">필수 동의</legend>
            <label class="flex items-start gap-2.5 text-sm"><input v-model="agreeRefund" type="checkbox" class="mt-0.5 h-4 w-4 accent-primary" data-testid="agree-refund" /><span class="text-ink"><b>(필수)</b> <NuxtLink to="/refund-policy" target="_blank" class="underline">취소·환불 규정</NuxtLink>에 동의합니다</span></label>
            <label class="flex items-start gap-2.5 text-sm"><input v-model="agreePrivacyTx" type="checkbox" class="mt-0.5 h-4 w-4 accent-primary" data-testid="agree-privacy" /><span class="text-ink"><b>(필수)</b> 예약 처리를 위한 <NuxtLink to="/privacy" target="_blank" class="underline">개인정보 수집·이용</NuxtLink>에 동의합니다</span></label>
            <label class="flex items-start gap-2.5 text-sm"><input v-model="agreeThirdParty" type="checkbox" class="mt-0.5 h-4 w-4 accent-primary" data-testid="agree-thirdparty" /><span class="text-ink"><b>(필수)</b> 이 상품의 공급사(파트너)에게 예약 이행을 위해 예약자·여행자 정보(이름, 연락처, 여권정보 등)를 제공하고, 이용 완료 후 5년간 보관하는 것에 동의합니다</span></label>
          </fieldset>
          <button v-if="step === 'travelers'" type="button" :disabled="busy" class="btn-primary mt-5 px-6 py-3" data-testid="create-booking" @click="createBooking">{{ busy ? '처리 중…' : '예약 정보 확인 후 결제 단계로' }}</button>
        </div>

        <!-- Step 3: payment -->
        <div v-if="step === 'payment' && booking" class="card p-5 sm:p-6" data-testid="payment-step">
          <h2 class="text-lg font-bold text-ink">결제</h2>
          <p v-if="!quote" class="mt-1 text-sm text-ink">{{ booking.title }} · {{ booking.serviceStart }}</p>
          <dl class="mt-3 grid gap-2 rounded-2xl bg-surface-sunken p-4 text-sm sm:grid-cols-2">
            <div><dt class="text-xs text-ink-subtle">예약번호</dt><dd class="font-semibold text-ink tabular" data-testid="booking-number">{{ booking.bookingNumber }}</dd></div>
            <div><dt class="text-xs text-ink-subtle">결제 가능 시간</dt><dd :class="['font-semibold tabular', paySecondsLeft < 120 ? 'text-danger' : 'text-ink']">{{ mmss(paySecondsLeft) }}</dd></div>
            <div v-if="booking.coinsUsedMinor > 0"><dt class="text-xs text-ink-subtle">코인 사용</dt><dd class="font-semibold text-success tabular">{{ formatKrw(-booking.coinsUsedMinor) }}</dd></div>
          </dl>
          <p class="mt-3 flex items-start gap-1.5 text-sm text-ink-muted"><AppIcon name="check" :size="16" class="mt-0.5 text-ink-subtle" />결제가 끝나도 공급사가 확정하기 전까지는 예약이 확정되지 않아요. 확정에 실패하면 결제 금액을 전액 환불해요.</p>
          <label v-if="payConfig?.provider === 'sandbox'" class="mt-4 block text-sm text-ink">테스트 결제 결과
            <select v-model="simPayment" class="ml-1 rounded-lg border border-line bg-surface px-2 py-1" data-testid="sim-payment"><option value="ok">승인</option><option value="declined">카드 거절</option><option value="timeout">PG 응답 유실</option><option value="refundfail">승인(환불 실패)</option></select>
          </label>
          <div v-if="payConfig?.enabled && payConfig?.provider !== 'sandbox'" class="mt-4 flex items-center gap-2 text-sm">
            <label for="pay-method" class="font-semibold text-ink">결제 수단</label>
            <select id="pay-method" v-model="payMethod" class="rounded-lg border border-line bg-surface px-2 py-1.5" data-testid="pay-method">
              <option value="CARD">신용·체크카드</option>
              <option value="TRANSFER">계좌이체</option>
              <option value="VIRTUAL_ACCOUNT">가상계좌</option>
            </select>
          </div>
          <p v-if="!payConfig?.enabled" class="mt-4 text-sm font-medium text-danger">지금은 온라인 결제를 사용할 수 없어요.</p>
          <button type="button" :disabled="busy || !payConfig?.enabled || paySecondsLeft === 0" class="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-5 py-3.5 text-base font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-40" data-testid="pay" @click="pay">
            <AppIcon name="lock" :size="18" />{{ busy ? '결제 처리 중…' : `${formatKrw(booking.totalMinor)} 결제하기` }}
          </button>
          <p class="mt-3 text-xs leading-relaxed text-ink-subtle">예약 단계에서 동의한 <NuxtLink to="/refund-policy" class="underline">취소·환불 규정</NuxtLink>과 <NuxtLink to="/privacy" class="underline">개인정보 수집·이용 및 공급사 제3자 제공</NuxtLink>에 따라 결제가 진행돼요. 이 주문의 판매 형태(직판·중개)는 예약 상세에서 확인할 수 있어요.</p>
        </div>

        <p v-if="error" class="flex items-start gap-2 rounded-2xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger" role="alert" data-testid="error"><AppIcon name="close" :size="16" class="mt-0.5" />{{ error }}</p>
      </section>

      <!-- Summary -->
      <aside v-if="quote" class="h-fit lg:sticky lg:top-24" data-testid="summary">
        <div class="card p-5">
          <p class="text-xs font-semibold text-primary">{{ DOMAIN_LABEL[domain] }}</p>
          <p class="mt-1 font-bold leading-snug text-ink">{{ quote.title }}</p>
          <p class="mt-1 text-sm text-ink-muted">{{ fmtDay(quote.serviceStart, true) }}<template v-if="quote.serviceEnd && quote.serviceEnd !== quote.serviceStart"> → {{ fmtDay(quote.serviceEnd, true) }}</template></p>
          <dl class="mt-4 space-y-2 border-t border-line pt-4 text-sm">
            <div v-for="l in quote.lines" :key="l.code + l.label" class="flex justify-between gap-3">
              <dt class="text-ink-muted">{{ l.label }}</dt><dd :class="['tabular', l.amountMinor < 0 ? 'font-semibold text-success' : 'text-ink']">{{ formatKrw(l.amountMinor) }}</dd>
            </div>
            <div v-if="quote.coinsMinor > 0" class="flex justify-between gap-3">
              <dt class="text-ink-muted">코인 사용</dt><dd class="tabular font-semibold text-success">{{ formatKrw(-quote.coinsMinor) }}</dd>
            </div>
            <div class="flex justify-between border-t border-line pt-3 text-base font-extrabold text-ink"><dt>총 결제 금액</dt><dd class="tabular" data-testid="total">{{ formatKrw(quote.totalMinor) }}</dd></div>
          </dl>
          <p v-if="quote.display" class="mt-1 text-right text-xs text-ink-subtle">≈ {{ formatMinor(quote.display.totalMinor, quote.display.currency) }} · {{ quote.display.note }}</p>
          <div class="mt-4 rounded-2xl bg-surface-sunken p-3.5 text-sm">
            <p class="font-semibold text-ink">취소 규정</p>
            <p v-if="quote.cancellationPolicy.type === 'FREE_UNTIL'" class="mt-0.5 text-success">{{ new Date(quote.cancellationPolicy.freeUntil).toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }) }}까지 무료 취소<span class="text-ink-muted">, 이후에는 환불되지 않아요</span></p>
            <p v-else class="mt-0.5 text-danger">환불할 수 없는 요금이에요.</p>
          </div>
          <p v-if="step !== 'payment'" class="mt-3 text-xs text-ink-subtle">이 금액은 <b class="tabular text-ink">{{ mmss(quoteSecondsLeft) }}</b> 동안 유지돼요.</p>
        </div>
      </aside>
    </div>
  </div>
</template>
