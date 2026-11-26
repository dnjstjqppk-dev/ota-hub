<script setup lang="ts">
import { ref } from 'vue'
import { apiFetch } from '~/composables/useApi'

const { t, locale } = useI18n()
useSeoPage({ site: `https://${useRuntimeConfig().public.brandDomain}`, path: '/deals', title: t('deals.title'), description: t('deals.desc') })
const LOCALE_TAG: Record<string, string> = { ko: 'ko-KR', en: 'en-US', ja: 'ja-JP', zh: 'zh-CN' }

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

const fetchPromotions = async () => {
  state.value = 'loading'
  const r = await apiFetch('/promotions')
  if (r.ok && Array.isArray((r.data as any).promotions)) {
    promotions.value = (r.data as any).promotions
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
  <div class="max-w-6xl mx-auto px-4 py-8 space-y-6">
    <div class="bg-gradient-to-r from-orange-500 to-amber-500 rounded-3xl p-8 text-white space-y-2 shadow-xl">
      <span class="inline-flex items-center gap-1.5 px-3 py-1 bg-black/20 rounded-full text-xs font-black uppercase tracking-wider">
        <AppIcon name="gift" :size="14" /> {{ $t('deals.badge') }}
      </span>
      <h1 class="text-3xl font-black">{{ $t('deals.hero') }}</h1>
      <p class="text-xs text-orange-100 font-medium">{{ $t('deals.heroSub') }}</p>
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
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div v-for="p in promotions" :key="p.id" class="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm flex justify-between items-center gap-4">
          <div class="space-y-1">
            <span class="px-2.5 py-0.5 bg-orange-50 text-orange-600 rounded-full text-[11px] font-bold">
              {{ discountTypeLabel(p.discount_type) }}
            </span>
            <h3 class="font-black text-slate-900 text-lg">{{ p.title }}</h3>
            <p class="text-sm font-black text-orange-600">{{ benefitText(p) }}</p>
            <p v-if="boundText(p)" class="text-xs text-slate-500">{{ boundText(p) }}</p>
            <div class="text-[11px] font-mono text-slate-400">
              {{ $t('deals.valid', { d: p.valid_until ? fmtDate(p.valid_until) : '-' }) }}
            </div>
          </div>

          <div class="text-center space-y-2 shrink-0">
            <div class="px-4 py-2 bg-slate-100 border border-dashed border-slate-300 rounded-xl font-mono font-bold text-trip-blue text-sm">
              {{ p.code }}
            </div>
            <button type="button" @click="copyCouponCode(p.code)" class="-my-3 inline-flex min-h-[44px] min-w-[44px] items-center justify-center px-2 text-xs text-slate-500 hover:text-trip-blue font-bold cursor-pointer">
              {{ copiedCode === p.code ? $t('deals.copied') : $t('deals.copy') }}
            </button>
          </div>
        </div>
      </div>
    </ResultsState>
  </div>
</template>
