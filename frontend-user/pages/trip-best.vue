<script setup lang="ts">
import { ref } from 'vue'
import { useCurrencyStore } from '~/stores/currency'
import { apiFetch } from '~/composables/useApi'

const { t, locale } = useI18n()
useSeoPage({ site: `https://${useRuntimeConfig().public.brandDomain}`, path: '/trip-best', title: t('best.seoTitle'), description: t('best.seoDesc') })

const currencyStore = useCurrencyStore()
const hotels = ref<any[]>([])
const state = ref<'loading' | 'ready' | 'error'>('loading')

const displayName = (h: any) => (locale.value === 'ko' ? (h.name_ko || h.name) : (h.name_en || h.name_ko || h.name))

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
  <div class="mx-auto max-w-6xl space-y-7 px-4 pb-24 pt-6 lg:px-6 lg:pb-16">
    <section class="relative overflow-hidden rounded-card border border-line bg-gradient-to-br from-primary-soft/80 via-surface to-accent-soft/50 p-6 shadow-card sm:p-10">
      <div class="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-accent/15 blur-3xl" aria-hidden="true" />
      <div class="pointer-events-none absolute -bottom-24 left-1/4 h-64 w-64 rounded-full bg-primary/15 blur-3xl" aria-hidden="true" />
      <div class="relative max-w-2xl space-y-2.5">
        <span class="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-surface px-3 py-1 text-2xs font-bold uppercase tracking-wider text-primary">
          <AppIcon name="trophy" :size="13" /> getfortrip Curated Ranking
        </span>
        <h1 class="font-display text-2xl font-extrabold tracking-tight text-ink sm:text-4xl">{{ $t('best.hero') }}</h1>
        <p class="text-sm text-ink-muted sm:text-base">{{ $t('best.heroSub') }}</p>
      </div>
    </section>

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
        <article v-for="(h, idx) in hotels" :key="h.id" class="card group flex flex-col items-center justify-between gap-5 p-5 transition hover:border-primary/40 hover:shadow-pop md:flex-row">
          <div class="flex w-full min-w-0 items-center gap-3 md:w-auto md:gap-5">
            <div :class="['flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl font-display text-lg font-extrabold tabular shadow-sm', idx === 0 ? 'bg-accent text-white' : idx === 1 ? 'bg-primary text-primary-ink' : 'bg-surface-sunken text-ink']">
              {{ idx + 1 }}
            </div>
            <SmartImg :src="h.thumbnail_url" img-class="h-16 w-20 shrink-0 rounded-2xl object-cover md:h-20 md:w-28" icon="hotel" :alt="displayName(h)" />
            <div class="min-w-0">
              <p class="text-xs font-semibold text-primary">{{ [h.city, h.country].filter(Boolean).join(', ') }}</p>
              <h2 class="break-words text-base font-extrabold text-ink group-hover:text-primary md:text-lg">{{ displayName(h) }}</h2>
              <div class="mt-1.5 flex flex-wrap items-center gap-2">
                <span v-if="h.review_score != null" class="rounded-lg bg-primary-soft px-2 py-0.5 text-2xs font-bold text-primary tabular">{{ $t('best.score', { v: Number(h.review_score).toFixed(1) }) }}</span>
                <span v-else class="rounded-lg bg-surface-sunken px-2 py-0.5 text-2xs font-bold text-ink-muted">{{ $t('hotels.list.newBadge') }}</span>
                <span class="text-xs text-ink-muted">{{ $t('todo.reviewCount', { n: $n(Number(h.review_count || 0)) }) }}</span>
              </div>
            </div>
          </div>

          <div class="flex w-full items-center justify-between gap-4 border-t border-line pt-4 md:w-auto md:border-t-0 md:pt-0">
            <div class="md:text-right">
              <p class="text-2xs text-ink-subtle">{{ $t('best.lowest') }}</p>
              <p class="text-xl font-extrabold tabular text-ink">{{ lowestPrice(h) == null ? '-' : currencyStore.formatKRW(lowestPrice(h)!) }}</p>
            </div>
            <NuxtLink :to="$localePath(`/hotels/detail/${h.id}`)" class="btn-primary !px-5 !py-2.5 !text-xs">
              {{ $t('best.detail') }}
            </NuxtLink>
          </div>
        </article>
      </div>
    </ResultsState>
  </div>
</template>
