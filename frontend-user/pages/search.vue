<script setup lang="ts">
/**
 * Unified cross-domain OTA search wired to GET /api/v1/search (FTS5 + LIKE fallback + facets).
 */
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useApiUrl } from '~/composables/useApi'
import { useCurrencyStore } from '~/stores/currency'

const route = useRoute()
const router = useRouter()
const currency = useCurrencyStore()
const { t } = useI18n()
const seoSite = `https://${useRuntimeConfig().public.brandDomain}`

const DOMAINS = [
  { id: '', labelKey: 'common.all', icon: 'compass' },
  { id: 'HOTEL', labelKey: 'nav.hotels', icon: 'hotel' },
  { id: 'FLIGHT', labelKey: 'nav.flights', icon: 'flight' },
  { id: 'TRAIN', labelKey: 'nav.trains', icon: 'train' },
  { id: 'CAR', labelKey: 'nav.cars', icon: 'car' },
  { id: 'TRANSFER', labelKey: 'nav.transfers', icon: 'transfer' },
  { id: 'ACTIVITY', labelKey: 'nav.activities', icon: 'ticket' },
  { id: 'PACKAGE', labelKey: 'nav.packages', icon: 'package' },
] as const

const SORTS = computed(() => [
  { id: 'rank', label: t('searchPage.sortRank') },
  { id: 'price_asc', label: t('searchPage.sortPriceAsc') },
  { id: 'price_desc', label: t('searchPage.sortPriceDesc') },
  { id: 'rating', label: t('searchPage.sortRating') },
])

const str = (v: unknown) => (typeof v === 'string' ? v : Array.isArray(v) ? String(v[0] ?? '') : '')
const qText = ref(str(route.query.q))
const domain = ref(str(route.query.domain).toUpperCase())
const sort = ref(str(route.query.sort) || 'rank')
const maxPrice = ref(str(route.query.maxPrice))
const minRating = ref(str(route.query.minRating))

const items = ref<any[]>([])
const facets = ref<Record<string, number>>({})
const total = ref(0)
const state = ref<'loading' | 'ready' | 'error'>('loading')

useSeoPage({
  site: seoSite,
  path: '/search',
  title: qText.value ? `${qText.value} · ${t('searchPage.title')}` : t('searchPage.title'),
  description: t('searchPage.desc'),
})

function syncUrl() {
  const next: Record<string, string> = {}
  if (qText.value.trim()) next.q = qText.value.trim()
  if (domain.value) next.domain = domain.value
  if (sort.value && sort.value !== 'rank') next.sort = sort.value
  if (maxPrice.value) next.maxPrice = maxPrice.value
  if (minRating.value) next.minRating = minRating.value
  router.replace({ query: next })
}

function itemPath(it: any): string {
  const id = encodeURIComponent(it.id || it.item_id || '')
  const d = String(it.domain || it.domain_type || '').toUpperCase()
  const map: Record<string, string> = {
    HOTEL: `/hotels/detail/${id}`,
    FLIGHT: `/flights/detail/${id}`,
    TRAIN: `/trains/detail/${id}`,
    CAR: `/cars/detail/${id}`,
    TRANSFER: `/transfers/detail/${id}`,
    ACTIVITY: `/things-to-do/detail/${id}`,
    PACKAGE: `/packages/detail/${id}`,
  }
  return map[d] || '/'
}

function domainIcon(d: string): string {
  const found = DOMAINS.find((x) => x.id === String(d || '').toUpperCase())
  return found?.icon || 'compass'
}

function domainBadge(d: string): string {
  const found = DOMAINS.find((x) => x.id === String(d || '').toUpperCase())
  return found ? t(found.labelKey) : d
}

async function load() {
  state.value = 'loading'
  try {
    const p = new URLSearchParams({ limit: '40', sort: sort.value || 'rank' })
    if (qText.value.trim()) p.set('q', qText.value.trim())
    if (domain.value) p.set('domain', domain.value)
    if (maxPrice.value) p.set('maxPrice', maxPrice.value)
    if (minRating.value) p.set('minRating', minRating.value)
    const res = await fetch(`${useApiUrl('/search')}?${p}`, { signal: AbortSignal.timeout(10000) })
    if (!res.ok) throw new Error(String(res.status))
    const j = await res.json()
    items.value = Array.isArray(j.items) ? j.items : Array.isArray(j.data) ? j.data : []
    facets.value = j.facets?.byDomain || j.facets || {}
    total.value = Number(j.total ?? items.value.length)
    state.value = 'ready'
  } catch {
    state.value = 'error'
  }
}

function submit() {
  syncUrl()
  void load()
}

watch(() => route.fullPath, () => {
  if (!route.path.endsWith('/search')) return
  qText.value = str(route.query.q)
  domain.value = str(route.query.domain).toUpperCase()
  sort.value = str(route.query.sort) || 'rank'
  maxPrice.value = str(route.query.maxPrice)
  minRating.value = str(route.query.minRating)
  void load()
})

await useSsrLoad('unified-search', load, { items, facets, total, state })
</script>

<template>
  <div class="mx-auto max-w-7xl px-4 pb-24 pt-6 lg:px-6 lg:pb-16">
    <!-- Terra Nord Architectural Search Header -->
    <section class="relative overflow-hidden rounded-card border border-line bg-gradient-to-br from-primary-soft/80 via-surface to-accent-soft/45 p-6 shadow-card sm:p-8">
      <div class="pointer-events-none absolute -right-16 -top-20 h-60 w-60 rounded-full bg-primary/15 blur-3xl" aria-hidden="true" />
      <div class="relative">
        <p class="text-2xs font-bold uppercase tracking-[0.2em] text-primary">{{ $t('searchPage.eyebrow') }}</p>
        <h1 class="mt-1 font-display text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">{{ $t('searchPage.title') }}</h1>
        <form class="mt-5 flex flex-col gap-2.5 sm:flex-row" @submit.prevent="submit">
          <div class="relative flex-1">
            <AppIcon name="search" :size="18" class="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-primary" />
            <input
              v-model="qText"
              type="search"
              :placeholder="$t('searchPage.placeholder')"
              class="min-h-[50px] w-full rounded-field border border-line bg-surface pl-11 pr-4 text-sm font-medium text-ink placeholder:text-ink-subtle focus:border-primary focus:outline-none focus:shadow-focus"
            />
          </div>
          <button type="submit" class="btn-primary !px-7 !py-3">{{ $t('common.search') }}</button>
        </form>
      </div>
    </section>

    <!-- Domain facets + sort/filters -->
    <div class="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div class="chip-rail flex gap-2 pb-1">
        <button
          v-for="d in DOMAINS"
          :key="d.id || 'ALL'"
          type="button"
          class="chip"
          :aria-pressed="domain === d.id"
          @click="domain = d.id; submit()"
        >
          <AppIcon :name="d.icon" :size="14" />
          <span>{{ $t(d.labelKey) }}</span>
          <span v-if="d.id && facets[d.id]" class="rounded-full bg-surface-sunken px-1.5 text-2xs tabular">{{ facets[d.id] }}</span>
        </button>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <select v-model="maxPrice" class="rounded-xl border border-line bg-surface px-3 py-2 text-xs font-semibold text-ink" @change="submit">
          <option value="">{{ $t('searchPage.anyPrice') }}</option>
          <option value="150000">{{ currency.formatKRW(150000) }}↓</option>
          <option value="300000">{{ currency.formatKRW(300000) }}↓</option>
          <option value="500000">{{ currency.formatKRW(500000) }}↓</option>
          <option value="1000000">{{ currency.formatKRW(1000000) }}↓</option>
        </select>
        <select v-model="minRating" class="rounded-xl border border-line bg-surface px-3 py-2 text-xs font-semibold text-ink" @change="submit">
          <option value="">{{ $t('searchPage.anyRating') }}</option>
          <option value="4">4.0+</option>
          <option value="4.5">4.5+</option>
        </select>
        <select v-model="sort" class="rounded-xl border border-line bg-surface px-3 py-2 text-xs font-semibold text-ink" @change="submit">
          <option v-for="s in SORTS" :key="s.id" :value="s.id">{{ s.label }}</option>
        </select>
      </div>
    </div>

    <p v-if="state === 'ready'" class="mt-4 text-xs font-semibold text-ink-subtle tabular">
      {{ $t('searchPage.resultCount', { n: total }) }}
    </p>

    <div class="mt-4">
      <ResultsState
        :state="state"
        :count="items.length"
        icon="search"
        :empty-title="$t('searchPage.empty')"
        :empty-hint="$t('searchPage.emptyHint')"
        :error-title="$t('hotels.list.loadFail')"
        @retry="load"
      >
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <NuxtLink
            v-for="it in items"
            :key="`${it.domain}-${it.id}`"
            :to="$localePath(itemPath(it))"
            class="card group flex flex-col overflow-hidden transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-pop"
          >
            <div class="relative aspect-[16/10] overflow-hidden bg-surface-sunken">
              <SmartImg :src="it.image_url || it.thumbnail_url" :alt="it.title || it.name" :icon="domainIcon(it.domain)" img-class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
              <span class="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-midnight-950/75 px-2.5 py-1 text-2xs font-bold text-white backdrop-blur-md">
                <AppIcon :name="domainIcon(it.domain)" :size="12" />{{ domainBadge(it.domain) }}
              </span>
              <span v-if="Number(it.rating || it.review_score) > 0" class="absolute right-3 top-3 rounded-lg bg-primary px-2 py-0.5 text-xs font-bold text-primary-ink tabular">
                {{ Number(it.rating || it.review_score).toFixed(1) }}
              </span>
            </div>
            <div class="flex flex-1 flex-col p-4">
              <p v-if="it.city || it.subtitle" class="truncate text-xs font-semibold text-primary">{{ it.city || it.subtitle }}</p>
              <h2 class="mt-1 line-clamp-2 text-base font-bold text-ink group-hover:text-primary">{{ it.title || it.name }}</h2>
              <p v-if="it.snippet" class="mt-1 line-clamp-2 text-xs text-ink-muted">{{ it.snippet }}</p>
              <div class="mt-auto flex items-baseline justify-between border-t border-line pt-3">
                <span class="text-2xs text-ink-subtle">{{ $t('detail.card.refPrice') }}</span>
                <span class="text-lg font-extrabold tabular text-ink">{{ Number(it.price_krw || it.price_minor) > 0 ? currency.formatKRW(Number(it.price_krw || it.price_minor)) : $t('hotels.list.priceTbd') }}</span>
              </div>
            </div>
          </NuxtLink>
        </div>
      </ResultsState>
    </div>
  </div>
</template>
