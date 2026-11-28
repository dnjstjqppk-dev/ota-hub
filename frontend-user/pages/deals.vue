<script setup lang="ts">
import { ref } from 'vue'
import { apiFetch } from '~/composables/useApi'

const { t, locale } = useI18n()
useSeoPage({ site: `https://${useRuntimeConfig().public.brandDomain}`, path: '/deals', title: t('deals.title'), description: t('deals.desc') })
const LOCALE_TAG: Record<string, string> = { ko: 'ko-KR', en: 'en-US', ja: 'ja-JP', zh: 'zh-CN', 'zh-hant': 'zh-Hant' }

interface Promotion {
  id: string
  code: string
  title: string
  discount_type: string
  discount_value: number
  min_order_amount_krw: number
  max_discount_krw: number
  valid_until: string
}

const promotions = ref<Promotion[]>([])
const state = ref<'loading' | 'ready' | 'error'>('loading')
const copiedCode = ref<string | null>(null)
const claimingCode = ref<string | null>(null)
const claimedCodes = ref<Record<string, string>>({})
const claimNotice = ref<string>('')

const discountTypeLabel = (v: string) => t(`deals.type_${v}`, v)
// #90: the actual benefit (percent or KRW) plus only the bounds that apply —
// a zero min/max bound is hidden instead of printed as ₩0.
const num = (n: number) => Number(n).toLocaleString(LOCALE_TAG[locale.value] || 'ko-KR')
const benefitText = (p: Promotion) => t('deals.benefit', { v: p.discount_type === 'PERCENTAGE' ? `${num(p.discount_value)}%` : t('deals.krw', { v: num(p.discount_value) }) })
const boundText = (p: Promotion) => {
  const parts: string[] = []
  if (Number(p.min_order_amount_krw || 0) > 0) parts.push(t('deals.minOrder', { v: num(p.min_order_amount_krw) }))
  if (Number(p.max_discount_krw || 0) > 0) parts.push(t('deals.maxOff', { v: num(p.max_discount_krw) }))
  return parts.join(' · ')
}
const fmtDate = (s: string) => new Date(s).toLocaleDateString(LOCALE_TAG[locale.value] || 'ko-KR')

const copyCouponCode = async (code: string) => {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(code)
    }
    copiedCode.value = code
    setTimeout(() => {
      if (copiedCode.value === code) copiedCode.value = null
    }, 2000)
  } catch (e) {
    console.warn('Clipboard write failed', e)
  }
}

const claimCoupon = async (code: string) => {
  if (claimingCode.value) return
  claimNotice.value = ''
  claimingCode.value = code
  try {
    const r = await apiFetch('/user/coupons/claim', { method: 'POST', body: { code } })
    if (r.ok) {
      claimedCodes.value = { ...claimedCodes.value, [code]: 'claimed' }
    } else if (r.status === 401) {
      claimNotice.value = t('deals.loginToClaim')
    } else if (r.status === 409) {
      claimedCodes.value = { ...claimedCodes.value, [code]: 'claimed' }
    } else {
      claimNotice.value = (r.data as any)?.error || t('deals.claimFail')
    }
  } finally {
    claimingCode.value = null
  }
}

const fetchPromotions = async () => {
  state.value = 'loading'
  const r = await apiFetch('/promotions')
  if (r.ok && Array.isArray((r.data as any).promotions)) {
    const now = Date.now()
    promotions.value = ((r.data as any).promotions as Promotion[]).filter((p) => {
      if (String(p.title || '').includes('[테스트]')) return false
      if (p.valid_until && Number.isFinite(Date.parse(p.valid_until)) && Date.parse(p.valid_until) < now) return false
      return true
    })
    state.value = 'ready'
  } else {
    state.value = 'error'
  }
}

// TG-15: SSR the first paint (ISR caches it).
await useSsrLoad('tg15-deals', fetchPromotions, { promotions, state })
if (state.value === 'error' && import.meta.server) throw createError({ statusCode: 503, statusMessage: 'Catalog temporarily unavailable' })
</script>

<template>
  <div class="mx-auto max-w-6xl space-y-6 px-4 pb-24 pt-6 lg:px-6 lg:pb-16">
    <section class="relative overflow-hidden rounded-card border border-line bg-gradient-to-br from-primary-soft/80 via-surface to-accent-soft/50 p-6 shadow-card sm:p-10">
      <div class="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-primary/15 blur-3xl" aria-hidden="true" />
      <div class="pointer-events-none absolute -bottom-24 left-1/3 h-64 w-64 rounded-full bg-accent/15 blur-3xl" aria-hidden="true" />
      <div class="relative max-w-2xl space-y-2.5">
        <span class="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-surface px-3 py-1 text-2xs font-bold uppercase tracking-wider text-primary">
          <AppIcon name="gift" :size="13" /> {{ $t('deals.badge') }}
        </span>
        <h1 class="font-display text-2xl font-extrabold tracking-tight text-ink sm:text-4xl">{{ $t('deals.hero') }}</h1>
        <p class="text-sm text-ink-muted sm:text-base">{{ $t('deals.heroSub') }}</p>
      </div>
    </section>

    <div v-if="claimNotice" class="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-ink" role="alert">
      <span>{{ claimNotice }}</span>
      <NuxtLink :to="$localePath('/login?redirect=/deals')" class="font-bold text-primary hover:underline">{{ $t('nav.login') }}</NuxtLink>
    </div>

    <ResultsState
      :state="state"
      :count="promotions.length"
      icon="gift"
      :empty-title="$t('deals.empty')"
      :empty-hint="$t('deals.emptyHint')"
      :error-title="$t('my.couponsFail')"
      @retry="fetchPromotions"
    >
      <div class="grid grid-cols-1 gap-5 md:grid-cols-2">
        <article v-for="p in promotions" :key="p.id" class="card group flex flex-col justify-between gap-4 p-6 transition hover:border-primary/40 hover:shadow-pop sm:flex-row sm:items-center">
          <div class="min-w-0 space-y-1.5">
            <span class="inline-flex rounded-full bg-accent-soft px-2.5 py-0.5 text-2xs font-bold text-accent">
              {{ discountTypeLabel(p.discount_type) }}
            </span>
            <h2 class="text-lg font-extrabold tracking-tight text-ink">{{ p.title }}</h2>
            <p class="text-base font-extrabold text-primary tabular">{{ benefitText(p) }}</p>
            <p v-if="boundText(p)" class="text-xs text-ink-muted">{{ boundText(p) }}</p>
            <p class="font-mono text-2xs text-ink-subtle">
              {{ $t('deals.valid', { d: p.valid_until ? fmtDate(p.valid_until) : '-' }) }}
            </p>
          </div>

          <div class="flex shrink-0 flex-col items-stretch gap-2 sm:w-40">
            <div class="rounded-xl border border-dashed border-line-strong bg-surface-sunken px-3.5 py-2 text-center font-mono text-sm font-bold text-primary">
              {{ p.code }}
            </div>
            <button
              type="button"
              :disabled="claimingCode === p.code || claimedCodes[p.code] === 'claimed'"
              class="btn-primary !py-2 !text-xs"
              @click="claimCoupon(p.code)"
            >
              {{ claimedCodes[p.code] === 'claimed' ? $t('deals.claimed') : claimingCode === p.code ? $t('my.processing') : $t('deals.claimNow') }}
            </button>
            <button
              type="button"
              class="inline-flex min-h-[36px] items-center justify-center rounded-xl border border-line bg-surface px-3 text-xs font-semibold text-ink-muted transition hover:border-line-strong hover:text-ink"
              @click="copyCouponCode(p.code)"
            >
              {{ copiedCode === p.code ? $t('deals.copied') : $t('deals.copy') }}
            </button>
          </div>
        </article>
      </div>
    </ResultsState>
  </div>
</template>
