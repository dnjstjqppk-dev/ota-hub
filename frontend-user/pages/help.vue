<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { apiFetch } from '~/composables/useApi'
import { useAuthStore } from '~/stores/auth'

const { t, locale } = useI18n()
const localePath = useLocalePath()
useSeoPage({ site: `https://${useRuntimeConfig().public.brandDomain}`, path: '/help', title: t('seo.help.title'), description: t('seo.help.description') })

const auth = useAuthStore()

const HELP_FAQ_META = [
  { key: 'q1', to: '/refund-policy' },
  { key: 'q2' },
  { key: 'q3', to: '/rewards' },
  { key: 'q4', to: '/esim' },
] as const

// S2: the same list drives the shared SeoFaq accordion, so the visible Q&A and
// the FAQPage JSON-LD can never drift apart (all answers stay in the SSR DOM).
const seoFaqItems = computed(() => HELP_FAQ_META.map((f) => ({ q: t(`helpFaq.${f.key}.q`), a: t(`helpFaq.${f.key}.a`), to: (f as { to?: string }).to })))

const CAT_VALUES = ['BOOKING', 'PAYMENT', 'REFUND', 'ACCOUNT', 'TECHNICAL', 'GENERAL'] as const
const CATEGORIES = computed(() => CAT_VALUES.map((value) => ({ value, label: t(`help.cat.${value}`) })))
const catLabel = (v: string) => (CAT_VALUES as readonly string[]).includes(v) ? t(`help.cat.${v}`) : v
const STATUS_LABEL = computed<Record<string, string>>(() => ({ OPEN: t('help.status.OPEN'), IN_PROGRESS: t('help.status.IN_PROGRESS'), NEEDS_HUMAN: t('help.status.NEEDS_HUMAN'), RESOLVED: t('help.status.RESOLVED'), CLOSED: t('help.status.CLOSED') }))
const LOCALE_TAG: Record<string, string> = { ko: 'ko-KR', en: 'en-US', ja: 'ja-JP', zh: 'zh-CN', 'zh-hant': 'zh-Hant' }
const fmtDate = (s: string) => new Date(s).toLocaleDateString(LOCALE_TAG[locale.value] || 'ko-KR')

interface Inquiry {
  id: string
  category: string
  subject: string
  body: string
  booking_id: string | null
  status: string
  admin_note: string | null
  created_at: string
}

interface MyBooking {
  id: string
  bookingNumber: string
  title: string
  status: string
}

const inquiries = ref<Inquiry[]>([])
const listState = ref<'loading' | 'ready' | 'error'>('loading')
const category = ref('BOOKING')
const subject = ref('')
const body = ref('')
// #154: optional booking link for the inquiry (server verifies ownership).
const bookingId = ref('')
const myBookings = ref<MyBooking[]>([])
const submitting = ref(false)
const submitError = ref('')
const submitted = ref(false)

const fetchMine = async () => {
  if (!auth.isLoggedIn) {
    listState.value = 'ready'
    return
  }
  listState.value = 'loading'
  const r = await apiFetch('/inquiries')
  if (r.ok && Array.isArray((r.data as any).inquiries)) {
    inquiries.value = (r.data as any).inquiries
    listState.value = 'ready'
  } else {
    listState.value = 'error'
  }
  const b = await apiFetch('/bookings')
  if (b.ok && Array.isArray((b.data as any).bookings)) {
    myBookings.value = (b.data as any).bookings
  }
}

function goLogin() {
  navigateTo({ path: localePath('/login'), query: { redirect: localePath('/help') } })
}

const submitInquiry = async () => {
  const s = subject.value.trim()
  const b = body.value.trim()
  if (!s || !b || submitting.value) return
  submitting.value = true
  submitError.value = ''
  submitted.value = false
  const r = await apiFetch('/inquiries', { method: 'POST', body: { category: category.value, subject: s, body: b, ...(bookingId.value ? { bookingId: bookingId.value } : {}) } })
  submitting.value = false
  if (!r.ok) {
    submitError.value = (r.data as any)?.error || t('help.submitFail')
    return
  }
  submitted.value = true
  subject.value = ''
  body.value = ''
  bookingId.value = ''
  fetchMine()
}

onMounted(() => {
  fetchMine()
})
</script>

<template>
  <div class="mx-auto max-w-4xl space-y-8 px-4 pb-24 pt-8 lg:px-6 lg:pb-16">
    <div class="space-y-2.5 text-center">
      <span class="inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-3.5 py-1 text-2xs font-bold uppercase tracking-wider text-primary">
        <AppIcon name="support" :size="14" /> {{ $t('help.badge') }}
      </span>
      <h1 class="font-display text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">{{ $t('help.title') }}</h1>
      <p class="text-sm text-ink-muted">{{ $t('help.sub') }}</p>
    </div>

    <SeoFaq :items="seoFaqItems" />

    <!-- 1:1 Inquiry Form -->
    <div class="card space-y-4 p-6 sm:p-7">
      <h2 class="text-lg font-extrabold text-ink">{{ $t('help.formTitle') }}</h2>
      <div v-if="!auth.isLoggedIn" class="space-y-3 rounded-2xl border border-line bg-surface-sunken p-6 text-center">
        <p class="text-sm text-ink-muted">{{ $t('help.needLogin') }}</p>
        <button type="button" class="btn-primary !text-xs" @click="goLogin">{{ $t('help.goLogin') }}</button>
      </div>
      <div v-else class="space-y-3.5">
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-[160px_1fr]">
          <div>
            <label class="field-label" for="inq-category">{{ $t('help.type') }}</label>
            <select id="inq-category" v-model="category" class="w-full rounded-field border border-line bg-surface px-3 py-2.5 text-sm font-semibold text-ink focus:border-primary focus:outline-none focus:shadow-focus">
              <option v-for="c in CATEGORIES" :key="c.value" :value="c.value">{{ c.label }}</option>
            </select>
          </div>
          <div>
            <label class="field-label" for="inq-subject">{{ $t('help.subject') }}</label>
            <input id="inq-subject" v-model="subject" type="text" maxlength="120" class="w-full rounded-field border border-line bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-subtle focus:border-primary focus:outline-none focus:shadow-focus" :placeholder="$t('help.subjectPh')" />
          </div>
        </div>
        <div>
          <label class="field-label" for="inq-booking">{{ $t('help.bookingOpt') }}</label>
          <select id="inq-booking" v-model="bookingId" class="w-full rounded-field border border-line bg-surface px-3 py-2.5 text-sm text-ink focus:border-primary focus:outline-none focus:shadow-focus">
            <option value="">{{ $t('help.noBooking') }}</option>
            <option v-for="b in myBookings" :key="b.id" :value="b.id">{{ b.bookingNumber }} · {{ b.title }}</option>
          </select>
        </div>
        <div>
          <label class="field-label" for="inq-body">{{ $t('help.body') }}</label>
          <textarea id="inq-body" v-model="body" rows="5" maxlength="5000" class="w-full rounded-field border border-line bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-subtle focus:border-primary focus:outline-none focus:shadow-focus" :placeholder="$t('help.bodyPh')"></textarea>
        </div>
        <p v-if="submitError" class="text-xs font-bold text-danger" role="alert">{{ submitError }}</p>
        <p v-if="submitted" class="text-xs font-bold text-success" role="status">{{ $t('help.submitted') }}</p>
        <button type="button" :disabled="submitting || !subject.trim() || !body.trim()" class="btn-primary w-full sm:w-auto" @click="submitInquiry">
          {{ submitting ? $t('help.submitting') : $t('help.submit') }}
        </button>
      </div>
    </div>

    <!-- My Inquiries -->
    <div v-if="auth.isLoggedIn" id="inquiries" class="scroll-mt-24 space-y-4">
      <h2 class="text-lg font-extrabold text-ink">{{ $t('help.myTitle') }}</h2>
      <ResultsState
        :state="listState"
        :count="inquiries.length"
        icon="support"
        :empty-title="$t('help.emptyTitle')"
        :empty-hint="$t('help.emptyHint')"
        :error-title="$t('help.errorTitle')"
        @retry="fetchMine"
      >
        <div class="space-y-3">
          <div v-for="t in inquiries" :key="t.id" class="card space-y-2 p-5">
            <div class="flex items-center justify-between gap-2">
              <span class="text-xs font-semibold text-ink-subtle">{{ catLabel(t.category) }} · {{ t.created_at ? fmtDate(t.created_at) : '' }}</span>
              <span class="rounded-full px-2.5 py-0.5 text-2xs font-bold" :class="t.status === 'OPEN' ? 'bg-warning-soft text-warning' : (t.status === 'IN_PROGRESS' || t.status === 'NEEDS_HUMAN') ? 'bg-primary-soft text-primary' : 'bg-success-soft text-success'">{{ STATUS_LABEL[t.status] || t.status }}</span>
            </div>
            <h3 class="text-sm font-bold text-ink">{{ t.subject }}</h3>
            <p v-if="t.booking_id" class="text-xs font-semibold text-primary">{{ $t('help.relatedBooking', { id: t.booking_id }) }}</p>
            <p class="whitespace-pre-line text-sm leading-relaxed text-ink-muted">{{ t.body }}</p>
            <InquiryThread :ticket-id="t.id" :status="t.status" :has-reply="!!t.admin_note" @changed="fetchMine" />
          </div>
        </div>
      </ResultsState>
    </div>
  </div>
</template>
