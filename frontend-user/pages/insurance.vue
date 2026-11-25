<script setup lang="ts">
/**
 * Travel insurance landing (design system "Horizon"). Plans and premiums come from
 * GET /api/v1/insurance/plans?days=N (the server multiplies the daily rate). Selling insurance needs an
 * insurance-agency registration and an underwriter agreement, neither of which exists yet, so this page
 * never enrolls anyone, never issues a policy number and does not name an insurer.
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useCurrencyStore } from '~/stores/currency'
import { useApiUrl } from '~/composables/useApi'
import { qInt, qStr, useUrlQuery } from '~/composables/useUrlQuery'
import { isIsoCountry, resolveCountry } from '~/composables/useCountryLookup'

interface Plan {
  id: string
  plan_name: string
  tier: string
  medical_coverage_minor: number
  baggage_loss_coverage_minor: number
  cancellation_coverage_minor: number
  daily_rate_minor: number
  total_price_minor: number
}

const currency = useCurrencyStore()
const { route, patch } = useUrlQuery()
const { t, locale } = useI18n()
const FAQ = useSeoFaq('insurance')
const MIN_DAYS = 1
const MAX_DAYS = 90
const days = ref(qInt(route.query.days, 5, MIN_DAYS, MAX_DAYS))
const destination = ref('')
const plans = ref<Plan[]>([])
const state = ref<'loading' | 'ready' | 'error'>('loading')
let ctrl: AbortController | null = null

async function load() {
  ctrl?.abort()
  ctrl = new AbortController()
  state.value = 'loading'
  try {
    const r = await fetch(useApiUrl(`/insurance/plans?days=${days.value}`), { signal: ctrl.signal })
    if (!r.ok) throw new Error(String(r.status))
    plans.value = (await r.json()).plans || []
    state.value = 'ready'
  } catch (e) {
    if ((e as Error).name !== 'AbortError') state.value = 'error'
  }
}
onMounted(async () => {
  load()
  const code = qStr(route.query.country).toUpperCase()
  if (isIsoCountry(code)) destination.value = (await resolveCountry(code, 'insurance'))?.name || ''
})
let deb: ReturnType<typeof setTimeout> | undefined
watch(days, (n) => { patch({ days: n === 5 ? '' : n }); clearTimeout(deb); deb = setTimeout(load, 250) })

function onSelect(it: { code?: string | null; country_code?: string | null }) {
  const code = it.code || it.country_code
  if (code) patch({ country: code.toUpperCase() })
}
watch(destination, (v) => { if (!v.trim()) patch({ country: '' }) })

function setDays(n: number) {
  days.value = Math.max(MIN_DAYS, Math.min(MAX_DAYS, Math.round(Number(n) || MIN_DAYS)))
}

/** 70,000,000 → "7,000만원", 100,000,000 → "1억원". */
function wonKo(n: number) {
  if (n >= 1e8 && n % 1e8 === 0) return `${(n / 1e8).toLocaleString('ko-KR')}억원`
  if (n >= 1e4) return `${Math.round(n / 1e4).toLocaleString('ko-KR')}만원`
  return `${n.toLocaleString('ko-KR')}원`
}
const won = (n: number) => (locale.value === 'ko' ? wonKo(n) : currency.formatKRW(n))
const tripLabel = computed(() => {
  const d = destination.value.trim()
  return d ? t('insurance.tripDest', { dest: d, n: days.value }) : t('insurance.tripNoDest', { n: days.value })
})

// P5: canonical + hreflang + OG via the shared builder (affiliate landing: no direct issuance).
useSeoPage({ site: `https://${useRuntimeConfig().public.brandDomain}`, path: '/insurance', title: t('insurance.seoTitle'), description: t('insurance.seoDesc') })
</script>

<template>
  <div class="pb-24 lg:pb-16">
    <section class="relative overflow-hidden border-b border-line bg-gradient-to-b from-sapphire-50 to-canvas">
      <div class="mx-auto max-w-7xl px-4 pb-6 pt-8 lg:px-6 lg:pt-12">
        <nav class="mb-2 flex items-center gap-1 text-xs text-ink-subtle" :aria-label="$t('common.breadcrumb')"><NuxtLink :to="$localePath('/')" class="hover:text-ink">{{ $t('common.home') }}</NuxtLink><AppIcon name="chevron-right" :size="12" /><span>{{ $t('nav.insurance') }}</span></nav>
        <h1 class="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">{{ $t('insurance.heroTitle') }}</h1>
        <p class="mt-2 max-w-2xl text-base text-ink-muted">{{ $t('insurance.heroSub') }}</p>
        <div class="mt-5 flex max-w-2xl flex-col gap-2 sm:flex-row">
          <div class="field-box flex-1"><label for="ins-dest" class="field-label">{{ $t('esim.countryLabel') }}</label><SearchAutocomplete v-model="destination" input-id="ins-dest" domain="insurance" variant="bare" :placeholder="$t('insurance.countryPh')" @select="onSelect" /></div>
          <div class="field-box sm:w-48">
            <label for="ins-days" class="field-label">{{ $t('insurance.period') }}</label>
            <div class="flex items-center gap-2">
              <button type="button" class="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-ink-muted hover:text-ink disabled:opacity-40" :disabled="days <= MIN_DAYS" :aria-label="$t('insurance.dayDec')" @click="setDays(days - 1)"><AppIcon name="minus" :size="14" /></button>
              <input id="ins-days" :value="days" type="number" inputmode="numeric" :min="MIN_DAYS" :max="MAX_DAYS" class="w-12 bg-transparent text-center text-base font-semibold text-ink tabular focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none" @change="setDays(Number(($event.target as HTMLInputElement).value))" />
              <span class="text-sm text-ink-muted">{{ $t('insurance.dayUnit') }}</span>
              <button type="button" class="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-ink-muted hover:text-ink disabled:opacity-40" :disabled="days >= MAX_DAYS" :aria-label="$t('insurance.dayInc')" @click="setDays(days + 1)"><AppIcon name="plus" :size="14" /></button>
            </div>
          </div>
        </div>
      </div>
    </section>

    <div class="mx-auto max-w-7xl px-4 lg:px-6">
      <div class="mt-6 flex items-start gap-3 rounded-card border border-line bg-surface-sunken p-4 text-sm text-ink-muted" role="note">
        <AppIcon name="shield" class="mt-0.5 shrink-0 text-ink-subtle" />
        <p><strong class="font-semibold text-ink">{{ $t('insurance.comingSoon') }}</strong> {{ $t('insurance.comingSub') }}</p>
      </div>

      <h2 class="pb-3 pt-8 text-xl font-bold tracking-tight text-ink">{{ $t('insurance.compare') }} <span class="ml-1 text-base font-semibold text-ink-subtle">{{ tripLabel }}</span></h2>

      <div v-if="state === 'loading' && !plans.length" class="grid gap-4 md:grid-cols-3">
        <div v-for="n in 3" :key="n" class="h-64 animate-pulse rounded-card bg-surface-sunken" />
      </div>
      <div v-else-if="state === 'error'" class="card p-6 text-center text-sm">
        <span class="text-ink-muted">{{ $t('insurance.loadFail') }}</span>
        <button type="button" class="ml-2 font-semibold text-primary" @click="load">{{ $t('common.retry') }}</button>
      </div>
      <p v-else-if="!plans.length" class="card p-8 text-center text-sm text-ink-muted">{{ $t('insurance.empty') }}</p>
      <ul v-else class="grid gap-4 md:grid-cols-3" :aria-busy="state === 'loading'">
        <li v-for="p in plans" :key="p.id" class="card flex flex-col p-5" :class="state === 'loading' ? 'opacity-60' : ''">
          <h3 class="text-lg font-bold text-ink">{{ p.plan_name }}</h3>
          <p class="mt-2 text-2xl font-extrabold text-ink tabular">{{ currency.formatKRW(p.total_price_minor) }}</p>
          <p class="text-2xs text-ink-subtle">{{ $t('insurance.perLine', { n: days, v: currency.formatKRW(p.daily_rate_minor) }) }}</p>
          <dl class="mb-4 mt-4 space-y-2 border-t border-line pt-4 text-sm">
            <div class="flex justify-between gap-3"><dt class="text-ink-subtle">{{ $t('insurance.covMedical') }}</dt><dd class="font-semibold text-ink tabular">{{ $t('insurance.maxCover', { v: won(p.medical_coverage_minor) }) }}</dd></div>
            <div class="flex justify-between gap-3"><dt class="text-ink-subtle">{{ $t('insurance.covBaggage') }}</dt><dd class="font-semibold text-ink tabular">{{ $t('insurance.maxCover', { v: won(p.baggage_loss_coverage_minor) }) }}</dd></div>
            <div class="flex justify-between gap-3"><dt class="text-ink-subtle">{{ $t('insurance.covCancel') }}</dt><dd class="font-semibold text-ink tabular">{{ $t('insurance.maxCover', { v: won(p.cancellation_coverage_minor) }) }}</dd></div>
          </dl>
          <button type="button" class="btn-secondary mt-auto w-full cursor-not-allowed opacity-60" disabled>{{ $t('insurance.comingBtn') }}</button>
        </li>
      </ul>
      <SeoFaq :items="FAQ" class="mt-12" />
    </div>
  </div>
</template>
