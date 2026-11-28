<script setup lang="ts">
/**
 * Unified, server-driven checkout for every product type.
 * 1) trip details -> server quote (price is computed ONLY by the server)
 * 2) traveler & contact info -> booking (idempotent)
 * 3) payment via the configured PG -> real booking status page
 */
import { ref, computed, nextTick, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { loadStripe, type Stripe, type StripeCardElement } from '@stripe/stripe-js'
import { useAuthStore } from '~/stores/auth'
import { useCurrencyStore } from '~/stores/currency'
import { useCartStore } from '~/stores/cart'
import { apiFetch, formatKrw, formatMinor } from '~/composables/useApi'
import { fmtDay, qDate, qInt, todayIso } from '~/composables/useUrlQuery'
const localePath = useLocalePath()
const { t, locale } = useI18n()
const LOCALE_TAG: Record<string, string> = { ko: 'ko-KR', en: 'en-US', ja: 'ja-JP', zh: 'zh-CN', 'zh-hant': 'zh-Hant' }
useHead({ title: t('checkout.title') })

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const currency = useCurrencyStore()
const cart = useCartStore()
// GAP-07 cart mode: ?cart=quoteId,quoteId — legs come pre-priced, travelers/contact shared.
const cartIds = computed(() => String(q.cart || '').split(',').map((s) => s.trim()).filter(Boolean))
const cartMode = computed(() => cartIds.value.length >= 2)
const cartLegs = computed(() => cartIds.value.flatMap((id) => { const l = cart.legs.find((x) => x.quoteId === id); return l ? [l] : [] }))

const DOMAIN_LABEL = computed<Record<string, string>>(() => ({ HOTEL: t('checkout.domain_HOTEL'), FLIGHT: t('checkout.domain_FLIGHT'), TRAIN: t('checkout.domain_TRAIN'), CAR: t('checkout.domain_CAR'), TRANSFER: t('checkout.domain_TRANSFER'), ACTIVITY: t('checkout.domain_ACTIVITY'), PACKAGE: t('checkout.domain_PACKAGE') }))
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
const myCoupons = ref<any[]>([])
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
if (slotStart.value && !specialRequests.value) specialRequests.value = `${t('checkout.slotReq', { t: slotStart.value })} `
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
// GAP-06: PG choice. Follows the server default; the chooser appears only when
// both Toss and Stripe are configured.
const payProvider = ref('')
const pgChoices = computed(() => (payConfig.value?.providers || []).filter((p: any) => p.provider === 'toss' || p.provider === 'stripe'))
const activeProvider = computed(() => payProvider.value || payConfig.value?.provider || '')
watch(payConfig, () => { payProvider.value = payConfig.value?.provider || '' })
const simTicketing = ref('ok')
const simPayment = ref('ok')

const isFlight = computed(() => domain === 'FLIGHT')
const STEP_IDS = ['details', 'travelers', 'payment'] as const
const STEPS = computed(() => STEP_IDS.map((id) => [id, t(`checkout.step_${id}`)] as const))
const stepIndex = computed(() => STEP_IDS.findIndex((s) => s === step.value))
const startLabel = computed(() => domain === 'HOTEL' ? t('checkout.startHotel') : domain === 'CAR' ? t('checkout.startCar') : domain === 'FLIGHT' ? t('checkout.startFlight') : t('checkout.startDefault'))
const endLabel = computed(() => domain === 'HOTEL' ? t('checkout.endHotel') : t('checkout.endDefault'))
const FIELD = 'w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-subtle focus:border-primary focus:outline-none focus:shadow-focus disabled:bg-surface-sunken disabled:text-ink-muted'
const perPersonTravelers = computed(() => ['FLIGHT', 'TRAIN', 'PACKAGE'].includes(domain) || (cartMode.value && cartLegs.value.some((l) => ['FLIGHT', 'TRAIN', 'PACKAGE'].includes(l.domain))))
const quoteSecondsLeft = computed(() => quote.value ? Math.max(0, Math.floor((Date.parse(quote.value.expiresAt) - now.value) / 1000)) : 0)
const paySecondsLeft = computed(() => booking.value?.paymentDeadline ? Math.max(0, Math.floor((Date.parse(booking.value.paymentDeadline) - now.value) / 1000)) : 0)
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
const isSandbox = computed(() => payConfig.value?.mode === 'SANDBOX' || quote.value?.fulfilmentMode === 'SIMULATED')
const mobileSummaryOpen = ref(false)

function buildTravelers() {
  const list: any[] = []
  const add = (type: string, n: number) => { for (let i = 0; i < n; i++) list.push({ type, lastNameEn: '', firstNameEn: '', birthDate: '', gender: '', nationality: 'KOR', passportNumber: '', passportExpiry: '' }) }
  if (perPersonTravelers.value) { add('ADULT', adults.value); add('CHILD', children.value); add('INFANT', infants.value) } else add('ADULT', 1)
  travelers.value = list
}

// Fallback when sessionStorage is blocked: one random key per quote for this
// page's lifetime. Never derive the key from the quote id — cart ids carry
// ':' and ',' (rejected by the API's [A-Za-z0-9_-]{16,80} rule).
const memIdemKeys = new Map<string, string>()
function idemKeyFor(quoteId: string) {
  const k = `gft_idem_${quoteId}`
  try {
    const existing = sessionStorage.getItem(k)
    if (existing) return existing
    const v = `chk_${crypto.randomUUID().replace(/-/g, '')}`
    sessionStorage.setItem(k, v)
    return v
  } catch {
    let v = memIdemKeys.get(quoteId)
    if (!v) { v = `chk_${crypto.randomUUID().replace(/-/g, '')}`; memIdemKeys.set(quoteId, v) }
    return v
  }
}

const datesReady = computed(() => !!startDate.value && (!needsEnd || endDate.value > startDate.value) && (!returnItemId || returnDate.value >= startDate.value))
async function getQuote(retry = true) {
  error.value = ''
  if (!datesReady.value) { error.value = needsEnd ? t('checkout.needDates') : returnItemId ? t('checkout.needRoundDates') : t('checkout.needDate'); return }
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
    else error.value = r.data.error || t('checkout.quoteFail')
    return
  }
  quote.value = r.data.quote
  buildTravelers()
}

async function createBooking() {
  error.value = ''
  if (!agreeRefund.value || !agreePrivacyTx.value || !agreeThirdParty.value) { error.value = t('checkout.needConsents'); return }
  for (const t of travelers.value) { t.lastNameEn = t.lastNameEn.trim().toUpperCase(); t.firstNameEn = t.firstNameEn.trim().toUpperCase() }
  busy.value = true
  const body: any = { quoteId: quote.value.quoteId, contact: contact.value, travelers: travelers.value.map((t) => ({ ...t, birthDate: t.birthDate || null, passportNumber: t.passportNumber || null, passportExpiry: t.passportExpiry || null, gender: t.gender || null })), specialRequests: specialRequests.value, consents: { refundPolicy: legalVersions.value['refund-policy'], privacy: legalVersions.value['privacy'], thirdParty: legalVersions.value['privacy'] } }
  if (quote.value.fulfilmentMode === 'SIMULATED') body.simulation = { supplier: simSupplier.value, ticketing: simTicketing.value }
  const r = await apiFetch('/bookings', { method: 'POST', body, headers: { 'Idempotency-Key': idemKeyFor(quote.value.quoteId) } })
  busy.value = false
  if (r.status === 401) return goLogin()
  if (!r.ok) {
    if (r.data.code === 'PRICE_CHANGED' || r.data.code === 'QUOTE_EXPIRED') { error.value = t('checkout.priceChanged', { msg: r.data.error }); quote.value = null; step.value = 'details'; return }
    if (r.data.code === 'CONSENT_STALE') {
      agreeRefund.value = agreePrivacyTx.value = agreeThirdParty.value = false
      try {
        const lv = await apiFetch('/legal')
        if (lv.ok) { legalVersions.value = {}; for (const d of lv.data.documents || []) legalVersions.value[d.slug] = d.version }
      } catch { /* keep old versions; server will reject again */ }
      error.value = r.data.error || t('checkout.consentStale')
      return
    }
    error.value = r.data.error || t('checkout.createFail')
    return
  }
  booking.value = r.data.booking
  const pc = await apiFetch('/payments/config')
  payConfig.value = pc.data
  step.value = 'payment'
}

async function createBookingCart() {
  error.value = ''
  if (!agreeRefund.value || !agreePrivacyTx.value || !agreeThirdParty.value) { error.value = t('checkout.needConsents'); return }
  for (const t of travelers.value) { t.lastNameEn = t.lastNameEn.trim().toUpperCase(); t.firstNameEn = t.firstNameEn.trim().toUpperCase() }
  busy.value = true
  const body: any = { cartQuoteIds: cartIds.value, contact: contact.value, travelers: travelers.value.map((t) => ({ ...t, birthDate: t.birthDate || null, passportNumber: t.passportNumber || null, passportExpiry: t.passportExpiry || null, gender: t.gender || null })), specialRequests: specialRequests.value, consents: { refundPolicy: legalVersions.value['refund-policy'], privacy: legalVersions.value['privacy'], thirdParty: legalVersions.value['privacy'] } }
  const r = await apiFetch('/bookings', { method: 'POST', body, headers: { 'Idempotency-Key': idemKeyFor(`cart:${cartIds.value.join(',').slice(0, 60)}`) } })
  busy.value = false
  if (r.status === 401) return goLogin()
  if (!r.ok) {
    if (r.data.code === 'CONSENT_STALE') {
      agreeRefund.value = agreePrivacyTx.value = agreeThirdParty.value = false
      try {
        const lv = await apiFetch('/legal')
        if (lv.ok) { legalVersions.value = {}; for (const d of lv.data.documents || []) legalVersions.value[d.slug] = d.version }
      } catch { /* keep old versions; server will reject again */ }
    }
    error.value = r.data.error || t('checkout.createFail')
    return
  }
  booking.value = r.data.booking
  cart.clear()
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
  if (!r.ok && r.status !== 402) { error.value = r.data.error || t('checkout.payError'); return }
  if (r.status === 402) { error.value = r.data.error || t('checkout.payDeclined'); return }
  router.push(localePath(`/booking/result?bookingId=${booking.value.id}`))
}

const stripeCardEl = ref<HTMLElement | null>(null)
let stripeObj: Stripe | null = null
let stripeCard: StripeCardElement | null = null
function stripePk(): string | null {
  const e = (payConfig.value?.providers || []).find((p: any) => p.provider === 'stripe')
  return (e?.publishableKey as string) || null
}
function unmountStripeCard() {
  try { stripeCard?.destroy() } catch { /* already gone */ }
  stripeCard = null
}
async function mountStripeCard() {
  unmountStripeCard()
  if (activeProvider.value !== 'stripe' || step.value !== 'payment') return
  const pk = stripePk()
  if (!pk) { error.value = t('checkout.stripeMissing'); return }
  try {
    stripeObj = await loadStripe(pk)
    if (!stripeObj || !stripeCardEl.value) return
    stripeCard = stripeObj.elements().create('card')
    stripeCard.mount(stripeCardEl.value)
    stripeCard.on('change', (ev: any) => { if (ev.error) error.value = ev.error.message || t('checkout.cardCheck') })
  } catch {
    error.value = t('checkout.stripeLoadFail')
  }
}
watch([step, activeProvider], () => { nextTick(() => mountStripeCard()) })

async function payWithStripe() {
  error.value = ''
  if (!stripeCard || !stripeObj) { error.value = t('checkout.cardEnter'); return }
  busy.value = true
  try {
    const pm = await stripeObj.createPaymentMethod({ type: 'card', card: stripeCard, billing_details: { name: contact.value.name || undefined, email: contact.value.email || undefined } })
    if (pm.error || !pm.paymentMethod) { error.value = pm.error?.message || t('checkout.cardCheck'); return }
    const r = await apiFetch('/payments/confirm', { method: 'POST', body: { bookingId: booking.value.id, orderId: booking.value.id, amount: booking.value.totalMinor, paymentKey: pm.paymentMethod.id, provider: 'stripe', returnOrigin: location.origin } })
    if (r.data?.actionRequired && r.data?.actionUrl) { location.href = r.data.actionUrl as string; return }
    if (!r.ok) { error.value = r.data.error || t('checkout.payError'); return }
    router.push(localePath(`/booking/result?bookingId=${booking.value.id}`))
  } finally {
    busy.value = false
  }
}

async function pay() {
  if (!payConfig.value?.enabled) { error.value = t('checkout.payDisabled'); return }
  if (activeProvider.value === 'toss') {
    try { await payWithToss() } catch { error.value = t('checkout.payWindowFail') }
  } else if (activeProvider.value === 'stripe') {
    await payWithStripe()
  } else if (activeProvider.value === 'sandbox') await paySandbox()
  else { error.value = t('checkout.payPickMethod') }
}

function goLogin() { router.push(localePath(`/login?redirect=${encodeURIComponent(route.fullPath)}`)) }

onMounted(async () => {
  cart.hydrate()
  today.value = todayIso()
  timer = setInterval(() => (now.value = Date.now()), 1000)
  await auth.initAuth()
  if (!auth.isLoggedIn) return goLogin()
  // On a direct page load the session is restored only now; prefill contact fields the user left empty.
  if (!contact.value.name) contact.value.name = auth.user?.fullName || ''
  if (!contact.value.email) contact.value.email = auth.user?.email || ''
  if (!contact.value.phone) contact.value.phone = auth.user?.phoneNumber || ''
  try {
    const lv = await apiFetch('/legal')
    if (lv.ok) for (const d of lv.data.documents || []) legalVersions.value[d.slug] = d.version
  } catch { /* consent checkboxes stay disabled without versions */ }
  // Resume existing AWAITING_PAYMENT booking before validating domain/itemId (supports GAP-08 change-confirm redirects).
  if (q.bookingId) { await resumeBooking(String(q.bookingId)); return }
  if (!cartMode.value && (!DOMAIN_LABEL.value[domain] || !itemId)) { error.value = t('checkout.badItem'); return }
  if (cartMode.value) {
    if (cartLegs.value.length !== cartIds.value.length) { error.value = t('checkout.cartLost'); return }
    const p0 = cartLegs.value[0]!
    adults.value = p0.adults; children.value = p0.children; infants.value = p0.infants || 0
    buildTravelers()
    step.value = 'travelers'
  } else {
    try {
      const cr = await apiFetch('/user/coupons')
      const list = cr.ok ? ((cr.data as any).coupons || (cr.data as any).data || []) : []
      myCoupons.value = list.filter((c: any) => !c.used_at && (!c.valid_until || Date.parse(c.valid_until) > Date.now()))
    } catch { myCoupons.value = [] }
  }
  // Arriving from a product page with dates already chosen: price it right away.
  if (!cartMode.value && datesReady.value) await getQuote()
})

/** Re-enter the payment step for an existing booking that is still awaiting payment (e.g. after a declined card). */
async function resumeBooking(id: string) {
  const r = await apiFetch(`/bookings/${encodeURIComponent(id)}`)
  if (r.status === 401) return goLogin()
  if (!r.ok || r.data.booking?.status !== 'AWAITING_PAYMENT') return router.replace(localePath(`/booking/result?bookingId=${encodeURIComponent(id)}`))
  booking.value = r.data.booking
  const pc = await apiFetch('/payments/config')
  payConfig.value = pc.data
  step.value = 'payment'
}
onBeforeUnmount(() => { clearInterval(timer); unmountStripeCard() })
</script>

<template>
  <div class="mx-auto max-w-6xl px-4 pb-24 pt-6 lg:px-6 lg:pt-10">
    <!-- Steps -->
    <nav class="mb-6 flex items-center gap-2 text-sm font-semibold" :aria-label="$t('checkout.stepsAria')">
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
      <span><b>{{ $t('checkout.testMode') }}</b> — {{ $t('checkout.testModeSub') }}</span>
    </div>

    <div v-if="blocked" class="card mx-auto max-w-xl p-6 text-center sm:p-8" data-testid="not-bookable">
      <span class="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-sunken text-ink-subtle"><AppIcon name="lock" /></span>
      <h1 class="mt-4 text-lg font-bold text-ink">{{ $t('checkout.notBookable') }}</h1>
      <p class="mt-2 text-sm text-ink-muted">{{ blocked.message }}</p>
      <p class="mt-2 text-xs text-ink-subtle">{{ $t('checkout.notBookableSub') }}</p>
      <NuxtLink :to="$localePath('/')" class="btn-primary mt-5">{{ $t('checkout.browseOther') }}</NuxtLink>
    </div>

    <div v-else class="grid gap-6 lg:grid-cols-[1fr_360px]">
      <!-- Mobile & Tablet Compact Order Summary (<lg) -->
      <div v-if="quote" class="card overflow-hidden lg:hidden">
        <button type="button" class="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left" :aria-expanded="mobileSummaryOpen" @click="mobileSummaryOpen = !mobileSummaryOpen">
          <div class="min-w-0">
            <p class="truncate text-xs font-bold text-primary">{{ DOMAIN_LABEL[domain] }}<template v-if="step !== 'payment'"> · {{ mmss(quoteSecondsLeft) }}</template></p>
            <p class="truncate text-sm font-bold text-ink">{{ quote.title }}</p>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <span class="font-display text-base font-extrabold tabular text-ink">{{ formatKrw(quote.totalMinor) }}</span>
            <AppIcon name="chevron-down" :size="16" :class="['text-ink-subtle transition-transform', mobileSummaryOpen && 'rotate-180']" />
          </div>
        </button>
        <div v-if="mobileSummaryOpen" class="space-y-2 border-t border-line bg-surface-sunken/50 px-4 py-3 text-xs">
          <div v-for="l in quote.lines" :key="l.code + l.label" class="flex justify-between gap-3">
            <span class="text-ink-muted">{{ l.label }}</span><span :class="['tabular', l.amountMinor < 0 ? 'font-semibold text-success' : 'text-ink']">{{ formatKrw(l.amountMinor) }}</span>
          </div>
          <div v-if="quote.coinsMinor > 0" class="flex justify-between gap-3">
            <span class="text-ink-muted">{{ $t('checkout.coinsUsed') }}</span><span class="tabular font-semibold text-success">{{ formatKrw(-quote.coinsMinor) }}</span>
          </div>
        </div>
      </div>

      <section class="min-w-0 space-y-4">
        <!-- Step 1: details (cart mode shows pre-priced legs instead) -->
        <div v-if="cartMode && !booking" class="card p-5 sm:p-6" data-testid="cart-legs">
          <h1 class="text-lg font-bold text-ink">{{ $t('checkout.cartBundle', { n: cartLegs.length }) }}</h1>
          <ul class="mt-3 space-y-2">
            <li v-for="l in cartLegs" :key="l.quoteId" class="flex justify-between gap-3 rounded-xl bg-surface-sunken px-3.5 py-2.5 text-sm">
              <span class="min-w-0 truncate font-semibold text-ink">{{ l.title }}</span>
              <span class="shrink-0 font-bold tabular text-ink">{{ formatKrw(l.totalMinor) }}</span>
            </li>
          </ul>
          <p class="mt-3 text-sm text-ink-muted">{{ $t('checkout.cartBundleSub') }}</p>
        </div>
        <div v-if="(!booking || quote) && !cartMode" class="card p-5 sm:p-6">
          <h1 class="text-lg font-bold text-ink">{{ $t('checkout.bookTitle', { item: DOMAIN_LABEL[domain] || $t('checkout.product'), round: returnItemId ? $t('checkout.roundTrip') : '' }) }}</h1>
          <p v-if="quote" class="mt-1 text-sm text-ink-muted">{{ quote.title }}</p>

          <div class="mt-4 grid gap-3 sm:grid-cols-2">
            <div data-testid="start-date" :class="needsEnd ? 'sm:col-span-2' : ''">
              <DateRangePicker v-if="needsEnd" v-model:start="startDate" v-model:end="endDate" :start-label="startLabel" :end-label="endLabel" :unit="domain === 'HOTEL' ? 'night' : 'day'" :min="today" :max-range="domain === 'HOTEL' ? 30 : 60" :class="quote && 'pointer-events-none opacity-70'" />
              <DateRangePicker v-else v-model:start="startDate" mode="single" :start-label="startLabel" :min="today" :class="quote && 'pointer-events-none opacity-70'" />
            </div>
            <div v-if="returnItemId" data-testid="return-date">
              <DateRangePicker v-model:start="returnDate" mode="single" :start-label="$t('checkout.returnDate')" :min="startDate || today" :class="quote && 'pointer-events-none opacity-70'" />
            </div>
            <div v-if="domain !== 'CAR'" :class="quote && 'pointer-events-none opacity-70'">
              <GuestPicker v-model:adults="adults" v-model:children="children" v-model:rooms="rooms" :show-rooms="domain === 'HOTEL'" :label="domain === 'HOTEL' ? $t('checkout.guestsRooms') : $t('checkout.guests')" />
            </div>
            <div v-if="isFlight" class="flex min-h-[64px] items-center justify-between rounded-2xl border border-line bg-surface px-4" :class="quote && 'pointer-events-none opacity-70'">
              <div><p class="text-sm font-semibold text-ink">{{ $t('checkout.infant') }}</p><p class="text-xs text-ink-subtle">{{ $t('checkout.infantSub') }}</p></div>
              <div class="flex items-center gap-3">
                <button type="button" class="flex h-9 w-9 items-center justify-center rounded-full border border-line text-ink disabled:opacity-30" :disabled="infants <= 0" :aria-label="$t('checkout.infantDec')" @click="infants--"><AppIcon name="minus" :size="16" /></button>
                <span class="tabular w-5 text-center font-semibold text-ink">{{ infants }}</span>
                <button type="button" class="flex h-9 w-9 items-center justify-center rounded-full border border-line text-ink disabled:opacity-30" :disabled="infants >= adults" :aria-label="$t('checkout.infantInc')" @click="infants++"><AppIcon name="plus" :size="16" /></button>
              </div>
            </div>
            <label class="sm:col-span-2">
              <span class="field-label">{{ $t('checkout.couponOpt') }}</span>
              <input v-model="promotionCode" type="text" :disabled="!!quote" :class="[FIELD, 'uppercase']" :placeholder="$t('checkout.couponPh')" />
              <div v-if="myCoupons.length && !quote" class="mt-2 flex flex-wrap gap-1.5">
                <button
                  v-for="c in myCoupons.slice(0, 5)"
                  :key="c.code"
                  type="button"
                  :class="['chip !py-1 !text-xs', promotionCode.toUpperCase() === String(c.code || '').toUpperCase() ? 'border-primary bg-primary-soft text-primary' : '']"
                  @click="promotionCode = promotionCode === c.code ? '' : c.code"
                >
                  {{ c.code }} · {{ c.title }}
                </button>
              </div>
            </label>
            <div class="rounded-2xl border border-line bg-surface-sunken p-3.5 sm:col-span-2">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <span class="text-xs font-semibold text-ink-subtle">{{ $t('checkout.coinUse', { n: $n(coinBalance) }) }}</span>
                <button v-if="coinBalance > 0 && !quote" type="button" class="text-xs font-bold text-primary" @click="useCoins = coinBalance">{{ $t('checkout.coinMax') }}</button>
              </div>
              <input v-model.number="useCoins" type="number" min="0" :max="coinBalance" step="100" :disabled="!!quote || coinBalance <= 0" :class="[FIELD, 'mt-2']" placeholder="0" data-testid="coin-amount" />
              <p class="mt-1.5 text-xs text-ink-subtle">{{ $t('checkout.coinNote') }}</p>
            </div>
          </div>

          <div class="mt-5 flex flex-wrap gap-2">
            <button v-if="!quote" type="button" :disabled="busy" class="btn-primary px-6 py-3" data-testid="get-quote" @click="() => getQuote()">{{ busy ? $t('checkout.checking') : $t('checkout.checkPrice') }}</button>
            <template v-else-if="step === 'details'">
              <button type="button" class="btn-secondary" @click="quote = null">{{ $t('checkout.changePlan') }}</button>
              <button type="button" class="btn-primary px-6" data-testid="to-travelers" @click="step = 'travelers'">{{ $t('checkout.nextTravelers') }}<AppIcon name="arrow-right" :size="16" /></button>
            </template>
          </div>
        </div>

        <!-- Step 2: travelers -->
        <div v-if="(step !== 'details' && quote) || (cartMode && step !== 'details')" class="card p-5 sm:p-6">
          <h2 class="text-lg font-bold text-ink">{{ $t('checkout.travelersTitle') }}</h2>
          <p class="mt-1 text-sm text-ink-muted">{{ $t('checkout.travelersSub') }}</p>
          <div class="mt-4 grid gap-3 sm:grid-cols-3">
            <label><span class="field-label">{{ $t('auth.nameLabel') }}</span><input v-model="contact.name" :disabled="step === 'payment'" autocomplete="name" :class="FIELD" data-testid="contact-name" /></label>
            <label><span class="field-label">{{ $t('auth.email') }}</span><input v-model="contact.email" :disabled="step === 'payment'" type="email" autocomplete="email" :class="FIELD" data-testid="contact-email" /></label>
            <label><span class="field-label">{{ $t('my.profPhone') }}</span><input v-model="contact.phone" :disabled="step === 'payment'" type="tel" autocomplete="tel" placeholder="+82-10-0000-0000" :class="FIELD" data-testid="contact-phone" /></label>
          </div>

          <h2 class="mt-7 text-lg font-bold text-ink">{{ perPersonTravelers ? $t('checkout.paxPerPerson') : $t('checkout.paxLead') }}</h2>
          <p class="mt-1 text-sm text-ink-muted">{{ $t('checkout.nameMatch', { doc: isFlight ? $t('checkout.docPassport') : $t('checkout.docId') }) }}</p>
          <p v-if="slotStart" class="mt-2 inline-block rounded-lg bg-primary-soft px-2.5 py-1 text-xs font-semibold text-primary">{{ $t('checkout.slotBadge', { t: slotStart }) }}</p>
          <div v-for="(t, i) in travelers" :key="i" class="mt-3 rounded-2xl bg-surface-sunken p-4">
            <div class="mb-3 flex items-center justify-between gap-2">
              <p class="text-sm font-semibold text-ink">{{ $t('checkout.paxNth', { n: i + 1, type: t.type === 'ADULT' ? $t('checkout.paxAdult') : t.type === 'CHILD' ? $t('checkout.paxChild') : $t('checkout.infant') }) }}</p>
              <select
                v-if="savedTravelers.length && step === 'travelers'"
                class="max-w-44 truncate rounded-lg border border-line bg-surface px-2 py-1.5 text-xs text-ink"
                :aria-label="$t('checkout.loadSaved')"
                @change="applySaved(i, ($event.target as HTMLSelectElement).value); ($event.target as HTMLSelectElement).value = ''"
              >
                <option value="">{{ $t('checkout.loadSavedPh') }}</option>
                <option v-for="p in savedTravelers" :key="p.id" :value="p.id">{{ p.name_ko }} · {{ p.last_name_en }} {{ p.first_name_en }}</option>
              </select>
            </div>
            <p v-if="savedTravelers.length && step === 'travelers'" class="-mt-1 mb-2 text-2xs text-ink-subtle">{{ $t('checkout.passportManual') }}</p>
            <div class="grid gap-3 sm:grid-cols-2">
              <label><span class="field-label">{{ $t('checkout.lastEn') }}</span><input v-model="t.lastNameEn" :disabled="step === 'payment'" :placeholder="$t('checkout.lastEnPh')" autocomplete="family-name" :class="[FIELD, 'uppercase']" :data-testid="`t${i}-last`" /></label>
              <label><span class="field-label">{{ $t('checkout.firstEn') }}</span><input v-model="t.firstNameEn" :disabled="step === 'payment'" :placeholder="$t('checkout.firstEnPh')" autocomplete="given-name" :class="[FIELD, 'uppercase']" :data-testid="`t${i}-first`" /></label>
              <template v-if="isFlight">
                <label><span class="field-label">{{ $t('my.paxBirth') }}</span><input v-model="t.birthDate" :disabled="step === 'payment'" type="date" :class="FIELD" /></label>
                <label><span class="field-label">{{ $t('my.paxNationCode') }}</span><input v-model="t.nationality" :disabled="step === 'payment'" maxlength="3" :class="[FIELD, 'uppercase']" /></label>
                <label><span class="field-label">{{ $t('my.paxPassport') }}</span><input v-model="t.passportNumber" :disabled="step === 'payment'" autocomplete="off" :class="[FIELD, 'uppercase']" /></label>
                <label><span class="field-label">{{ $t('my.paxExpiry') }}</span><input v-model="t.passportExpiry" :disabled="step === 'payment'" type="date" :class="FIELD" /></label>
              </template>
            </div>
          </div>
          <label v-if="!perPersonTravelers" class="mt-4 block"><span class="field-label">{{ $t('checkout.specialReq') }}</span><textarea v-model="specialRequests" :disabled="step === 'payment'" rows="2" maxlength="500" :class="FIELD" /></label>

          <div v-if="quote?.fulfilmentMode === 'SIMULATED' && step === 'travelers'" class="mt-4 rounded-2xl border border-warning/30 bg-warning-soft p-4 text-sm text-ink">
            <p class="mb-2 font-semibold">{{ $t('checkout.simTitle') }}</p>
            <label class="mr-4">{{ $t('checkout.simSupplier') }}
              <select v-model="simSupplier" class="ml-1 rounded-lg border border-line bg-surface px-2 py-1" data-testid="sim-supplier"><option value="confirm">{{ $t('checkout.simConfirm') }}</option><option value="fail">{{ $t('checkout.simFail') }}</option><option value="timeout">{{ $t('checkout.simTimeout') }}</option><option value="pending">{{ $t('checkout.simPending') }}</option></select>
            </label>
            <label v-if="isFlight">{{ $t('checkout.simTicketing') }}
              <select v-model="simTicketing" class="ml-1 rounded-lg border border-line bg-surface px-2 py-1"><option value="ok">{{ $t('checkout.simOk') }}</option><option value="fail">{{ $t('checkout.simFail') }}</option></select>
            </label>
          </div>
          <fieldset v-if="step === 'travelers'" class="mt-5 space-y-2.5 rounded-2xl border border-line bg-surface p-4">
            <legend class="px-1 text-sm font-bold text-ink">{{ $t('checkout.reqConsents') }}</legend>
            <label class="flex items-start gap-2.5 text-sm"><input v-model="agreeRefund" type="checkbox" class="mt-0.5 h-4 w-4 accent-primary" data-testid="agree-refund" /><span class="text-ink"><b>{{ $t('auth.req') }}</b> {{ $t('auth.agreePrefix') }}<NuxtLink :to="$localePath('/refund-policy')" target="_blank" class="underline">{{ $t('checkout.refundLink') }}</NuxtLink>{{ $t('auth.agreeSuffix') }}</span></label>
            <label class="flex items-start gap-2.5 text-sm"><input v-model="agreePrivacyTx" type="checkbox" class="mt-0.5 h-4 w-4 accent-primary" data-testid="agree-privacy" /><span class="text-ink"><b>{{ $t('auth.req') }}</b> {{ $t('checkout.privacyTxPre') }}<NuxtLink :to="$localePath('/privacy')" target="_blank" class="underline">{{ $t('auth.privacyLink') }}</NuxtLink>{{ $t('auth.agreeSuffix') }}</span></label>
            <label class="flex items-start gap-2.5 text-sm"><input v-model="agreeThirdParty" type="checkbox" class="mt-0.5 h-4 w-4 accent-primary" data-testid="agree-thirdparty" /><span class="text-ink"><b>{{ $t('auth.req') }}</b> {{ $t('checkout.thirdParty') }}</span></label>
          </fieldset>
          <button v-if="step === 'travelers'" type="button" :disabled="busy" class="btn-primary mt-5 px-6 py-3" data-testid="create-booking" @click="cartMode ? createBookingCart() : createBooking()">{{ busy ? $t('my.processing') : $t('checkout.toPayment') }}</button>
        </div>

        <!-- Step 3: payment -->
        <div v-if="step === 'payment' && booking" class="card p-5 sm:p-6" data-testid="payment-step">
          <h2 class="text-lg font-bold text-ink">{{ $t('checkout.payTitle') }}</h2>
          <p v-if="!quote" class="mt-1 text-sm text-ink">{{ booking.title }} · {{ booking.serviceStart }}</p>
          <dl class="mt-3 grid gap-2 rounded-2xl bg-surface-sunken p-4 text-sm sm:grid-cols-2">
            <div><dt class="text-xs text-ink-subtle">{{ $t('checkout.bookingNo') }}</dt><dd class="font-semibold text-ink tabular" data-testid="booking-number">{{ booking.bookingNumber }}</dd></div>
            <div><dt class="text-xs text-ink-subtle">{{ $t('checkout.payWindow') }}</dt><dd :class="['font-semibold tabular', paySecondsLeft < 120 ? 'text-danger' : 'text-ink']">{{ mmss(paySecondsLeft) }}</dd></div>
            <div v-if="booking.coinsUsedMinor > 0"><dt class="text-xs text-ink-subtle">{{ $t('checkout.coinsUsed') }}</dt><dd class="font-semibold text-success tabular">{{ formatKrw(-booking.coinsUsedMinor) }}</dd></div>
          </dl>
          <p class="mt-3 flex items-start gap-1.5 text-sm text-ink-muted"><AppIcon name="check" :size="16" class="mt-0.5 text-ink-subtle" />{{ $t('checkout.confirmNote') }}</p>
          <label v-if="payConfig?.provider === 'sandbox'" class="mt-4 block text-sm text-ink">{{ $t('checkout.simPayResult') }}
            <select v-model="simPayment" class="ml-1 rounded-lg border border-line bg-surface px-2 py-1" data-testid="sim-payment"><option value="ok">{{ $t('checkout.simApprove') }}</option><option value="declined">{{ $t('checkout.simDecline') }}</option><option value="timeout">{{ $t('checkout.simPgLost') }}</option><option value="refundfail">{{ $t('checkout.simRefundFail') }}</option></select>
          </label>
          <div v-if="pgChoices.length > 1" class="mt-4 space-y-2" role="radiogroup" :aria-label="$t('checkout.pgAria')">
            <p class="text-sm font-semibold text-ink">{{ $t('checkout.pgTitle') }}</p>
            <label v-for="c in pgChoices" :key="c.provider" class="flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2.5 text-sm">
              <input type="radio" v-model="payProvider" :value="c.provider" class="h-4 w-4 accent-primary" data-testid="pay-provider" />
              <span>{{ c.provider === 'toss' ? $t('checkout.pgToss') : $t('checkout.pgStripe') }}</span>
            </label>
          </div>
          <div v-if="activeProvider === 'toss'" class="mt-4 flex items-center gap-2 text-sm">
            <label for="pay-method" class="font-semibold text-ink">{{ $t('checkout.payMethod') }}</label>
            <select id="pay-method" v-model="payMethod" class="rounded-lg border border-line bg-surface px-2 py-1.5" data-testid="pay-method">
              <option value="CARD">{{ $t('checkout.methodCard') }}</option>
              <option value="TRANSFER">{{ $t('checkout.methodTransfer') }}</option>
              <option value="VIRTUAL_ACCOUNT">{{ $t('checkout.methodVaccount') }}</option>
            </select>
          </div>
          <div v-if="activeProvider === 'stripe'" class="mt-4">
            <label for="stripe-card" class="text-sm font-semibold text-ink">{{ $t('checkout.cardInfo') }}</label>
            <div id="stripe-card" ref="stripeCardEl" class="mt-2 rounded-xl border border-line bg-surface px-3 py-3"></div>
            <p class="mt-1.5 text-xs text-ink-subtle">{{ $t('checkout.stripeNote') }}</p>
          </div>
          <p v-if="!payConfig?.enabled" class="mt-4 text-sm font-medium text-danger">{{ $t('checkout.payDisabledMsg') }}</p>
          <button type="button" :disabled="busy || !payConfig?.enabled || paySecondsLeft === 0" class="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-5 py-3.5 text-base font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-40" data-testid="pay" @click="pay">
            <AppIcon name="lock" :size="18" />{{ busy ? $t('checkout.paying') : $t('checkout.payNow', { v: formatKrw(booking.totalMinor) }) }}
          </button>
          <p class="mt-3 text-xs leading-relaxed text-ink-subtle">{{ $t('checkout.legalPre') }}<NuxtLink :to="$localePath('/refund-policy')" class="underline">{{ $t('checkout.refundLink') }}</NuxtLink>{{ $t('checkout.legalMid') }}<NuxtLink :to="$localePath('/privacy')" class="underline">{{ $t('checkout.privacyShareLink') }}</NuxtLink>{{ $t('checkout.legalPost') }}</p>
        </div>

        <p v-if="error" class="flex items-start gap-2 rounded-2xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger" role="alert" data-testid="error"><AppIcon name="close" :size="16" class="mt-0.5" />{{ error }}</p>
      </section>

      <!-- Summary -->
      <aside v-if="quote" class="h-fit lg:sticky lg:top-28" data-testid="summary">
        <div class="card p-5">
          <p class="text-xs font-semibold text-primary">{{ DOMAIN_LABEL[domain] }}</p>
          <p class="mt-1 font-bold leading-snug text-ink">{{ quote.title }}</p>
          <p class="mt-1 text-sm text-ink-muted">{{ fmtDay(quote.serviceStart, true, locale) }}<template v-if="quote.serviceEnd && quote.serviceEnd !== quote.serviceStart"> → {{ fmtDay(quote.serviceEnd, true, locale) }}</template></p>
          <dl class="mt-4 space-y-2 border-t border-line pt-4 text-sm">
            <div v-for="l in quote.lines" :key="l.code + l.label" class="flex justify-between gap-3">
              <dt class="text-ink-muted">{{ l.label }}</dt><dd :class="['tabular', l.amountMinor < 0 ? 'font-semibold text-success' : 'text-ink']">{{ formatKrw(l.amountMinor) }}</dd>
            </div>
            <div v-if="quote.coinsMinor > 0" class="flex justify-between gap-3">
              <dt class="text-ink-muted">{{ $t('checkout.coinsUsed') }}</dt><dd class="tabular font-semibold text-success">{{ formatKrw(-quote.coinsMinor) }}</dd>
            </div>
            <div class="flex justify-between border-t border-line pt-3 text-base font-extrabold text-ink"><dt>{{ $t('checkout.total') }}</dt><dd class="tabular" data-testid="total">{{ formatKrw(quote.totalMinor) }}</dd></div>
          </dl>
          <p v-if="quote.display" class="mt-1 text-right text-xs text-ink-subtle">≈ {{ formatMinor(quote.display.totalMinor, quote.display.currency) }} · {{ quote.display.note }}</p>
          <div class="mt-4 rounded-2xl bg-surface-sunken p-3.5 text-sm">
            <p class="font-semibold text-ink">{{ $t('checkout.cancelPolicy') }}</p>
            <p v-if="quote.cancellationPolicy.type === 'FREE_UNTIL'" class="mt-0.5 text-success">{{ $t('checkout.freeUntil', { d: new Date(quote.cancellationPolicy.freeUntil).toLocaleString(LOCALE_TAG[locale] || 'ko-KR', { dateStyle: 'medium', timeStyle: 'short' }) }) }}<span class="text-ink-muted">{{ $t('checkout.freeUntilPost') }}</span></p>
            <p v-else class="mt-0.5 text-danger">{{ $t('checkout.nonRefundable') }}</p>
          </div>
          <p v-if="step !== 'payment'" class="mt-3 text-xs text-ink-subtle">{{ $t('checkout.holdPre') }} <b class="tabular text-ink">{{ mmss(quoteSecondsLeft) }}</b> {{ $t('checkout.holdPost') }}</p>
        </div>
      </aside>
    </div>
  </div>
</template>
