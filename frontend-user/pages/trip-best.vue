<script setup lang="ts">
import { ref } from 'vue'
import { useCurrencyStore } from '~/stores/currency'
import { apiFetch } from '~/composables/useApi'

const { t } = useI18n()
useSeoPage({ site: `https://${useRuntimeConfig().public.brandDomain}`, path: '/trip-best', title: t('best.seoTitle'), description: t('best.seoDesc') })

const currencyStore = useCurrencyStore()
const hotels = ref<any[]>([])
const state = ref<'loading' | 'ready' | 'error'>('loading')

function lowestPrice(h: any): number | null {
  if (typeof h.base_price_krw === 'number' && h.base_price_krw > 0) return h.base_price_krw
  const rooms = Array.isArray(h.rooms) ? h.rooms : []
  for (const r of rooms) {
    if (typeof r?.base_price_krw === 'number' && r.base_price_krw > 0) return r.base_price_krw
  }
  return null
}

const fetchBest = async () => {
  state.value = 'loading'
  const r = await apiFetch('/hotels?sortBy=score_desc&limit=10')
  if (r.ok && Array.isArray((r.data as any).data)) {
    hotels.value = (r.data as any).data
    state.value = 'ready'
  } else {
    state.value = 'error'
  }
}

// TG-15: SSR the first paint (ISR caches it).
await useSsrLoad('tg15-trip-best', fetchBest, { hotels, state })
if (state.value === 'error' && import.meta.server) throw createError({ statusCode: 503, statusMessage: 'Catalog temporarily unavailable' })
</script>

<template>
  <div class="max-w-6xl mx-auto px-4 py-8 space-y-8">
    <div class="bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 rounded-3xl p-8 text-white space-y-2 shadow-xl">
      <span class="inline-flex items-center gap-1.5 px-3 py-1 bg-black/20 rounded-full text-xs font-black uppercase tracking-wider">
        <AppIcon name="trophy" :size="14" /> getfortrip Hotel Ranking
      </span>
      <h1 class="text-3xl font-black">{{ $t('best.hero') }}</h1>
      <p class="text-xs text-amber-100 font-medium">{{ $t('best.heroSub') }}</p>
    </div>

    <ResultsState
      :state="state"
      :count="hotels.length"
      icon="trophy"
      :empty-title="$t('best.empty')"
      :empty-hint="$t('best.emptyHint')"
      :error-title="$t('best.loadFail')"
      @retry="fetchBest"
    >
      <div class="space-y-4">
        <div v-for="(h, idx) in hotels" :key="h.id" class="bg-white rounded-3xl border border-slate-200 p-6 flex flex-col md:flex-row items-center justify-between gap-6 shadow-sm hover:shadow-xl transition">
          <div class="flex w-full min-w-0 items-center gap-3 md:w-auto md:gap-6">
            <div :class="['w-12 h-12 rounded-2xl flex items-center justify-center font-black text-xl text-white shadow-md shrink-0', idx === 0 ? 'bg-amber-500' : idx === 1 ? 'bg-slate-400' : 'bg-amber-700']">
              {{ idx + 1 }}
            </div>
            <SmartImg :src="h.thumbnail_url" class="h-16 w-20 shrink-0 rounded-2xl object-cover md:h-20 md:w-28" :alt="h.name_ko" />
            <div class="min-w-0">
              <div class="text-xs text-slate-400 font-semibold">{{ h.city }}, {{ h.country }}</div>
              <h3 class="break-words text-base font-black text-slate-900 md:text-lg">{{ h.name_ko }}</h3>
              <div class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                <span v-if="h.review_score != null" class="px-2 py-0.5 bg-trip-blue text-white rounded text-[11px] font-bold">{{ $t('best.score', { v: h.review_score }) }}</span>
                <span v-else class="px-2 py-0.5 bg-slate-200 text-slate-600 rounded text-[11px] font-bold">{{ $t('hotels.list.newBadge') }}</span>
                <span class="text-xs text-slate-500 font-medium">{{ $t('todo.reviewCount', { n: $n(Number(h.review_count || 0)) }) }}</span>
              </div>
            </div>
          </div>

          <div class="text-right flex items-center gap-4">
            <div>
              <div class="text-xs text-slate-400">{{ $t('best.lowest') }}</div>
              <div class="text-2xl font-black text-trip-blue">{{ lowestPrice(h) == null ? '-' : currencyStore.formatKRW(lowestPrice(h)!) }}</div>
            </div>
            <NuxtLink :to="$localePath(`/hotels/detail/${h.id}`)" class="px-5 py-2.5 bg-trip-blue text-white text-xs font-bold rounded-xl shadow-md">
              {{ $t('best.detail') }}
            </NuxtLink>
          </div>
        </div>
      </div>
    </ResultsState>
  </div>
</template>
