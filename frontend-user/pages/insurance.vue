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
let t: ReturnType<typeof setTimeout> | undefined
watch(days, (n) => { patch({ days: n === 5 ? '' : n }); clearTimeout(t); t = setTimeout(load, 250) })

function onSelect(it: { code?: string | null; country_code?: string | null }) {
  const code = it.code || it.country_code
  if (code) patch({ country: code.toUpperCase() })
}
watch(destination, (v) => { if (!v.trim()) patch({ country: '' }) })

function setDays(n: number) {
  days.value = Math.max(MIN_DAYS, Math.min(MAX_DAYS, Math.round(Number(n) || MIN_DAYS)))
}

/** 70,000,000 → "7,000만원", 100,000,000 → "1억원". */
function won(n: number) {
  if (n >= 1e8 && n % 1e8 === 0) return `${(n / 1e8).toLocaleString('ko-KR')}억원`
  if (n >= 1e4) return `${Math.round(n / 1e4).toLocaleString('ko-KR')}만원`
  return `${n.toLocaleString('ko-KR')}원`
}
const tripLabel = computed(() => `${destination.value.trim() ? `${destination.value.trim()} ` : ''}${days.value}일 여행 기준`)

useHead({
  title: '해외 여행자보험',
  meta: [{ name: 'description', content: '여행 기간에 맞춰 해외 여행자보험 플랜의 보장 내용과 보험료를 비교해 보세요.' }]
})
</script>

<template>
  <div class="pb-24 lg:pb-16">
    <section class="relative overflow-hidden border-b border-line bg-gradient-to-b from-sapphire-50 to-canvas">
      <div class="mx-auto max-w-7xl px-4 pb-6 pt-8 lg:px-6 lg:pt-12">
        <nav class="mb-2 flex items-center gap-1 text-xs text-ink-subtle" aria-label="이동 경로"><NuxtLink to="/" class="hover:text-ink">홈</NuxtLink><AppIcon name="chevron-right" :size="12" /><span>여행자보험</span></nav>
        <h1 class="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">여행 기간에 맞춘 여행자보험</h1>
        <p class="mt-2 max-w-2xl text-base text-ink-muted">여행할 국가와 기간을 넣으면 플랜별 보험료를 비교해 드려요.</p>
        <div class="mt-5 flex max-w-2xl flex-col gap-2 sm:flex-row">
          <div class="field-box flex-1"><label for="ins-dest" class="field-label">여행 국가</label><SearchAutocomplete v-model="destination" input-id="ins-dest" domain="insurance" variant="bare" placeholder="예: 일본, 프랑스" @select="onSelect" /></div>
          <div class="field-box sm:w-48">
            <label for="ins-days" class="field-label">여행 기간</label>
            <div class="flex items-center gap-2">
              <button type="button" class="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-ink-muted hover:text-ink disabled:opacity-40" :disabled="days <= MIN_DAYS" aria-label="하루 줄이기" @click="setDays(days - 1)"><AppIcon name="minus" :size="14" /></button>
              <input id="ins-days" :value="days" type="number" inputmode="numeric" :min="MIN_DAYS" :max="MAX_DAYS" class="w-12 bg-transparent text-center text-base font-semibold text-ink tabular focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none" @change="setDays(Number(($event.target as HTMLInputElement).value))" />
              <span class="text-sm text-ink-muted">일</span>
              <button type="button" class="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-ink-muted hover:text-ink disabled:opacity-40" :disabled="days >= MAX_DAYS" aria-label="하루 늘리기" @click="setDays(days + 1)"><AppIcon name="plus" :size="14" /></button>
            </div>
          </div>
        </div>
      </div>
    </section>

    <div class="mx-auto max-w-7xl px-4 lg:px-6">
      <div class="mt-6 flex items-start gap-3 rounded-card border border-line bg-surface-sunken p-4 text-sm text-ink-muted" role="note">
        <AppIcon name="shield" class="mt-0.5 shrink-0 text-ink-subtle" />
        <p><strong class="font-semibold text-ink">여행자보험은 아직 가입할 수 없어요.</strong> 보험 판매에 필요한 대리점 등록과 보험사 제휴를 준비하고 있어요. 아래 보장 내용과 보험료는 확정 전 참고용이고, 이 화면에서는 가입이나 증권 발급이 되지 않아요.</p>
      </div>

      <h2 class="pb-3 pt-8 text-xl font-bold tracking-tight text-ink">플랜 비교 <span class="ml-1 text-base font-semibold text-ink-subtle">{{ tripLabel }}</span></h2>

      <div v-if="state === 'loading' && !plans.length" class="grid gap-4 md:grid-cols-3">
        <div v-for="n in 3" :key="n" class="h-64 animate-pulse rounded-card bg-surface-sunken" />
      </div>
      <div v-else-if="state === 'error'" class="card p-6 text-center text-sm">
        <span class="text-ink-muted">플랜을 불러오지 못했어요.</span>
        <button type="button" class="ml-2 font-semibold text-primary" @click="load">다시 시도</button>
      </div>
      <p v-else-if="!plans.length" class="card p-8 text-center text-sm text-ink-muted">준비된 플랜이 없어요.</p>
      <ul v-else class="grid gap-4 md:grid-cols-3" :aria-busy="state === 'loading'">
        <li v-for="p in plans" :key="p.id" class="card flex flex-col p-5" :class="state === 'loading' ? 'opacity-60' : ''">
          <h3 class="text-lg font-bold text-ink">{{ p.plan_name }}</h3>
          <p class="mt-2 text-2xl font-extrabold text-ink tabular">{{ currency.formatKRW(p.total_price_minor) }}</p>
          <p class="text-2xs text-ink-subtle">{{ days }}일 · 1인 · 하루 {{ currency.formatKRW(p.daily_rate_minor) }} · 참고가</p>
          <dl class="mb-4 mt-4 space-y-2 border-t border-line pt-4 text-sm">
            <div class="flex justify-between gap-3"><dt class="text-ink-subtle">해외 의료비</dt><dd class="font-semibold text-ink tabular">최대 {{ won(p.medical_coverage_minor) }}</dd></div>
            <div class="flex justify-between gap-3"><dt class="text-ink-subtle">휴대품 손해</dt><dd class="font-semibold text-ink tabular">최대 {{ won(p.baggage_loss_coverage_minor) }}</dd></div>
            <div class="flex justify-between gap-3"><dt class="text-ink-subtle">여행 취소</dt><dd class="font-semibold text-ink tabular">최대 {{ won(p.cancellation_coverage_minor) }}</dd></div>
          </dl>
          <button type="button" class="btn-secondary mt-auto w-full cursor-not-allowed opacity-60" disabled>가입 준비 중</button>
        </li>
      </ul>
    </div>
  </div>
</template>
