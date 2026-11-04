<script setup lang="ts">
/**
 * Unified, server-driven checkout for every product type.
 * 1) trip details -> server quote (price is computed ONLY by the server)
 * 2) traveler & contact info -> booking (idempotent)
 * 3) payment via the configured PG -> real booking status page
 */
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '~/stores/auth'
import { apiFetch, formatKrw } from '~/composables/useApi'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const DOMAIN_LABEL: Record<string, string> = { HOTEL: '숙소', FLIGHT: '항공권', TRAIN: '기차', CAR: '렌터카', TRANSFER: '공항 이동', ACTIVITY: '투어·티켓', PACKAGE: '패키지' }
const q = route.query as Record<string, string>
const domain = String(q.domain || '').toUpperCase()
const itemId = String(q.itemId || '')
const unitId = q.unitId ? String(q.unitId) : null
const needsEnd = domain === 'HOTEL' || domain === 'CAR'
const today = new Date().toISOString().slice(0, 10)
const plusDays = (d: string, n: number) => new Date(Date.parse(d + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10)

const startDate = ref(q.startDate || plusDays(today, 14))
const endDate = ref(q.endDate || plusDays(startDate.value, domain === 'CAR' ? 3 : 1))
const rooms = ref(Number(q.rooms || 1))
const adults = ref(Number(q.adults || (domain === 'HOTEL' ? 2 : 1)))
const children = ref(Number(q.children || 0))
const infants = ref(Number(q.infants || 0))
const promotionCode = ref('')

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
const simSupplier = ref('confirm')
const simTicketing = ref('ok')
const simPayment = ref('ok')

const isFlight = computed(() => domain === 'FLIGHT')
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

async function getQuote() {
  error.value = ''
  busy.value = true
  const r = await apiFetch('/quotes', {
    method: 'POST',
    body: { domain, itemId, unitId, startDate: startDate.value, endDate: needsEnd ? endDate.value : null, rooms: domain === 'HOTEL' ? rooms.value : undefined, travelers: { adults: adults.value, children: children.value, infants: infants.value }, promotionCode: promotionCode.value || undefined }
  })
  busy.value = false
  if (r.status === 401) return goLogin()
  if (!r.ok) {
    if (['NOT_DIRECTLY_BOOKABLE', 'SALES_NOT_ENABLED', 'PAYMENTS_DISABLED'].includes(r.data.code || '')) blocked.value = { code: r.data.code!, message: r.data.error || '' }
    else error.value = r.data.error || '가격을 확인할 수 없습니다.'
    return
  }
  quote.value = r.data.quote
  buildTravelers()
}

async function createBooking() {
  error.value = ''
  for (const t of travelers.value) { t.lastNameEn = t.lastNameEn.trim().toUpperCase(); t.firstNameEn = t.firstNameEn.trim().toUpperCase() }
  busy.value = true
  const body: any = { quoteId: quote.value.quoteId, contact: contact.value, travelers: travelers.value.map((t) => ({ ...t, birthDate: t.birthDate || null, passportNumber: t.passportNumber || null, passportExpiry: t.passportExpiry || null, gender: t.gender || null })), specialRequests: specialRequests.value }
  if (quote.value.fulfilmentMode === 'SIMULATED') body.simulation = { supplier: simSupplier.value, ticketing: simTicketing.value }
  const r = await apiFetch('/bookings', { method: 'POST', body, headers: { 'Idempotency-Key': idemKeyFor(quote.value.quoteId) } })
  busy.value = false
  if (r.status === 401) return goLogin()
  if (!r.ok) {
    if (r.data.code === 'PRICE_CHANGED' || r.data.code === 'QUOTE_EXPIRED') { error.value = `${r.data.error} 다시 가격을 확인해주세요.`; quote.value = null; step.value = 'details'; return }
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
    method: 'CARD',
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
  timer = setInterval(() => (now.value = Date.now()), 1000)
  await auth.initAuth()
  if (!auth.isLoggedIn) return goLogin()
  if (!DOMAIN_LABEL[domain] || !itemId) { error.value = '잘못된 상품 정보입니다.'; return }
})
onBeforeUnmount(() => clearInterval(timer))
</script>

<template>
  <div class="max-w-5xl mx-auto px-4 py-6 md:py-10">
    <nav class="flex items-center gap-2 text-xs font-semibold mb-6" aria-label="예약 단계">
      <span v-for="(s, i) in [['details','일정·가격 확인'],['travelers','여행자 정보'],['payment','결제']]" :key="s[0]" class="flex items-center gap-2">
        <span :class="['w-6 h-6 rounded-full flex items-center justify-center', step === s[0] ? 'bg-trip-blue text-white' : 'bg-slate-200 text-slate-600']">{{ i + 1 }}</span>
        <span :class="step === s[0] ? 'text-slate-900' : 'text-slate-500'">{{ s[1] }}</span>
        <span v-if="i < 2" class="w-6 h-px bg-slate-300" />
      </span>
    </nav>

    <div v-if="isSandbox" class="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-900" data-testid="sandbox-banner">
      <strong>테스트 모드</strong> — 실제 결제·실제 예약이 발생하지 않는 개발용 시뮬레이터입니다.
    </div>

    <div v-if="blocked" class="rounded-2xl border border-slate-200 bg-white p-6 md:p-8" data-testid="not-bookable">
      <h1 class="text-lg font-bold text-slate-900">지금은 GetForTrip에서 바로 예약할 수 없는 상품입니다</h1>
      <p class="mt-2 text-sm text-slate-600">{{ blocked.message }}</p>
      <p class="mt-2 text-xs text-slate-500">결제 전 단계에서 확인되었으며, 어떠한 금액도 청구되지 않았습니다.</p>
      <NuxtLink to="/" class="mt-5 inline-block rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white">다른 상품 둘러보기</NuxtLink>
    </div>

    <div v-else class="grid md:grid-cols-[1fr_340px] gap-6">
      <section class="space-y-4">
        <!-- Step 1: details -->
        <div class="rounded-2xl border border-slate-200 bg-white p-5 md:p-6">
          <h1 class="text-base font-bold text-slate-900">{{ DOMAIN_LABEL[domain] || '상품' }} 예약</h1>
          <div class="mt-4 grid grid-cols-2 gap-3 text-sm">
            <label class="col-span-2 sm:col-span-1">
              <span class="block text-xs font-semibold text-slate-600 mb-1">{{ domain === 'HOTEL' ? '체크인' : domain === 'CAR' ? '대여일' : '이용일' }}</span>
              <input v-model="startDate" type="date" :min="today" :disabled="!!quote" class="w-full rounded-lg border border-slate-300 px-3 py-2" data-testid="start-date" />
            </label>
            <label v-if="needsEnd" class="col-span-2 sm:col-span-1">
              <span class="block text-xs font-semibold text-slate-600 mb-1">{{ domain === 'HOTEL' ? '체크아웃' : '반납일' }}</span>
              <input v-model="endDate" type="date" :min="startDate" :disabled="!!quote" class="w-full rounded-lg border border-slate-300 px-3 py-2" data-testid="end-date" />
            </label>
            <label v-if="domain === 'HOTEL'">
              <span class="block text-xs font-semibold text-slate-600 mb-1">객실 수</span>
              <input v-model.number="rooms" type="number" min="1" max="9" :disabled="!!quote" class="w-full rounded-lg border border-slate-300 px-3 py-2" />
            </label>
            <label>
              <span class="block text-xs font-semibold text-slate-600 mb-1">성인</span>
              <input v-model.number="adults" type="number" min="1" max="9" :disabled="!!quote" class="w-full rounded-lg border border-slate-300 px-3 py-2" />
            </label>
            <label v-if="domain !== 'CAR' && domain !== 'TRANSFER'">
              <span class="block text-xs font-semibold text-slate-600 mb-1">아동</span>
              <input v-model.number="children" type="number" min="0" max="8" :disabled="!!quote" class="w-full rounded-lg border border-slate-300 px-3 py-2" />
            </label>
            <label v-if="isFlight">
              <span class="block text-xs font-semibold text-slate-600 mb-1">유아 (좌석 미점유)</span>
              <input v-model.number="infants" type="number" min="0" max="4" :disabled="!!quote" class="w-full rounded-lg border border-slate-300 px-3 py-2" />
            </label>
            <label class="col-span-2">
              <span class="block text-xs font-semibold text-slate-600 mb-1">쿠폰 코드 (선택)</span>
              <input v-model="promotionCode" type="text" :disabled="!!quote" class="w-full rounded-lg border border-slate-300 px-3 py-2 uppercase" />
            </label>
          </div>
          <div class="mt-4 flex gap-2">
            <button v-if="!quote" :disabled="busy" class="rounded-xl bg-trip-blue px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50" data-testid="get-quote" @click="getQuote">
              {{ busy ? '확인 중…' : '실시간 가격 확인' }}
            </button>
            <button v-else-if="step === 'details'" class="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold" @click="quote = null">일정 변경</button>
            <button v-if="quote && step === 'details'" class="rounded-xl bg-trip-blue px-5 py-2.5 text-sm font-semibold text-white" data-testid="to-travelers" @click="step = 'travelers'">다음: 여행자 정보</button>
          </div>
        </div>

        <!-- Step 2: travelers -->
        <div v-if="step !== 'details' && quote" class="rounded-2xl border border-slate-200 bg-white p-5 md:p-6">
          <h2 class="text-base font-bold text-slate-900">예약자 정보</h2>
          <div class="mt-3 grid sm:grid-cols-3 gap-3 text-sm">
            <input v-model="contact.name" :disabled="step === 'payment'" placeholder="이름" class="rounded-lg border border-slate-300 px-3 py-2" data-testid="contact-name" />
            <input v-model="contact.email" :disabled="step === 'payment'" type="email" placeholder="이메일" class="rounded-lg border border-slate-300 px-3 py-2" data-testid="contact-email" />
            <input v-model="contact.phone" :disabled="step === 'payment'" type="tel" placeholder="+82-10-0000-0000" class="rounded-lg border border-slate-300 px-3 py-2" data-testid="contact-phone" />
          </div>
          <h2 class="mt-6 text-base font-bold text-slate-900">{{ perPersonTravelers ? '탑승자/여행자 정보' : '대표 이용자' }}</h2>
          <p class="text-xs text-slate-500 mt-1">영문 성/이름은 {{ isFlight ? '여권과 정확히 동일하게' : '신분증과 동일하게' }} 입력하세요.</p>
          <div v-for="(t, i) in travelers" :key="i" class="mt-3 rounded-xl bg-slate-50 p-3">
            <div class="text-xs font-semibold text-slate-700 mb-2">{{ i + 1 }}. {{ t.type === 'ADULT' ? '성인' : t.type === 'CHILD' ? '아동' : '유아' }}</div>
            <div class="grid sm:grid-cols-2 gap-2 text-sm">
              <input v-model="t.lastNameEn" :disabled="step === 'payment'" placeholder="영문 성 (예: KIM)" class="rounded-lg border border-slate-300 px-3 py-2 uppercase" :data-testid="`t${i}-last`" />
              <input v-model="t.firstNameEn" :disabled="step === 'payment'" placeholder="영문 이름 (예: MINJI)" class="rounded-lg border border-slate-300 px-3 py-2 uppercase" :data-testid="`t${i}-first`" />
              <template v-if="isFlight">
                <label class="text-xs text-slate-600">생년월일<input v-model="t.birthDate" :disabled="step === 'payment'" type="date" class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label>
                <label class="text-xs text-slate-600">국적<input v-model="t.nationality" :disabled="step === 'payment'" maxlength="3" class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm uppercase" /></label>
                <label class="text-xs text-slate-600">여권번호<input v-model="t.passportNumber" :disabled="step === 'payment'" class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm uppercase" autocomplete="off" /></label>
                <label class="text-xs text-slate-600">여권 만료일<input v-model="t.passportExpiry" :disabled="step === 'payment'" type="date" class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label>
              </template>
            </div>
          </div>
          <textarea v-if="!perPersonTravelers" v-model="specialRequests" :disabled="step === 'payment'" rows="2" maxlength="500" placeholder="요청사항 (선택, 보장되지 않음)" class="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />

          <div v-if="quote.fulfilmentMode === 'SIMULATED' && step === 'travelers'" class="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
            <div class="font-semibold mb-2">테스트 시나리오 (개발 환경 전용)</div>
            <label class="mr-3">공급사 응답
              <select v-model="simSupplier" class="ml-1 rounded border px-1 py-0.5" data-testid="sim-supplier"><option value="confirm">확정</option><option value="fail">실패</option><option value="timeout">응답 없음</option><option value="pending">확정 대기</option></select>
            </label>
            <label v-if="isFlight">발권
              <select v-model="simTicketing" class="ml-1 rounded border px-1 py-0.5"><option value="ok">성공</option><option value="fail">실패</option></select>
            </label>
          </div>
          <button v-if="step === 'travelers'" :disabled="busy" class="mt-4 rounded-xl bg-trip-blue px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50" data-testid="create-booking" @click="createBooking">
            {{ busy ? '처리 중…' : '예약 정보 확인 후 결제 단계로' }}
          </button>
        </div>

        <!-- Step 3: payment -->
        <div v-if="step === 'payment' && booking" class="rounded-2xl border border-slate-200 bg-white p-5 md:p-6" data-testid="payment-step">
          <h2 class="text-base font-bold text-slate-900">결제</h2>
          <p class="mt-1 text-xs text-slate-600">예약번호 <strong data-testid="booking-number">{{ booking.bookingNumber }}</strong> · 결제 가능 시간 <strong>{{ mmss(paySecondsLeft) }}</strong></p>
          <p class="mt-2 text-xs text-slate-500">결제가 완료되어도 공급사 확정 전까지는 예약이 확정되지 않습니다. 확정 실패 시 전액 환불됩니다.</p>
          <div v-if="payConfig?.provider === 'sandbox'" class="mt-4 text-xs">
            <label>테스트 결제 결과
              <select v-model="simPayment" class="ml-1 rounded border px-1 py-0.5" data-testid="sim-payment"><option value="ok">승인</option><option value="declined">카드 거절</option><option value="timeout">PG 응답 유실</option><option value="refundfail">승인(환불 실패)</option></select>
            </label>
          </div>
          <p v-if="!payConfig?.enabled" class="mt-4 text-sm text-red-700">현재 온라인 결제가 활성화되어 있지 않습니다.</p>
          <button :disabled="busy || !payConfig?.enabled || paySecondsLeft === 0" class="mt-4 w-full rounded-xl bg-trip-orange px-5 py-3 text-sm font-bold text-white disabled:opacity-50" data-testid="pay" @click="pay">
            {{ busy ? '결제 처리 중…' : `${formatKrw(booking.totalMinor)} 결제하기` }}
          </button>
        </div>

        <p v-if="error" class="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700" role="alert" data-testid="error">{{ error }}</p>
      </section>

      <!-- Summary -->
      <aside v-if="quote" class="rounded-2xl border border-slate-200 bg-white p-5 h-fit md:sticky md:top-20" data-testid="summary">
        <div class="text-xs font-semibold text-slate-500">{{ DOMAIN_LABEL[domain] }}</div>
        <div class="mt-1 font-bold text-slate-900 text-sm leading-snug">{{ quote.title }}</div>
        <div class="mt-1 text-xs text-slate-600">{{ quote.serviceStart }}<span v-if="quote.serviceEnd !== quote.serviceStart"> → {{ quote.serviceEnd }}</span></div>
        <dl class="mt-4 space-y-1.5 text-sm">
          <div v-for="l in quote.lines" :key="l.code" class="flex justify-between gap-3">
            <dt class="text-slate-600">{{ l.label }}</dt><dd :class="l.amountMinor < 0 ? 'text-emerald-700' : 'text-slate-900'">{{ formatKrw(l.amountMinor) }}</dd>
          </div>
          <div class="flex justify-between border-t border-slate-200 pt-2 font-bold text-base"><dt>총 결제금액</dt><dd data-testid="total">{{ formatKrw(quote.totalMinor) }}</dd></div>
        </dl>
        <p v-if="quote.display" class="mt-1 text-[11px] text-slate-500">≈ {{ (quote.display.totalMinor / 100).toLocaleString() }} {{ quote.display.currency }} · {{ quote.display.note }}</p>
        <div class="mt-4 rounded-lg bg-slate-50 p-3 text-xs text-slate-700">
          <div class="font-semibold mb-1">취소 규정</div>
          <span v-if="quote.cancellationPolicy.type === 'FREE_UNTIL'">{{ new Date(quote.cancellationPolicy.freeUntil).toLocaleString('ko-KR') }}까지 무료 취소, 이후 취소 시 환불 불가</span>
          <span v-else>환불 불가 요금입니다.</span>
        </div>
        <p v-if="step !== 'payment'" class="mt-3 text-[11px] text-slate-500">이 가격은 {{ mmss(quoteSecondsLeft) }} 동안 유효합니다.</p>
      </aside>
    </div>
  </div>
</template>
