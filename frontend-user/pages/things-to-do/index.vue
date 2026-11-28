<script setup lang="ts">
/**
 * Tours, tickets & experiences (design system "Horizon"). URL = state (keyword, category, filters, sort).
 * API only. Ratings are supplier-provided and labelled as such; prices are per person.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useCurrencyStore } from '~/stores/currency'
import { useApiUrl } from '~/composables/useApi'
import { itemListLd, jsonLdScript } from '~/composables/useJsonLd'
import { seoUrlFor, useActiveLocaleContext } from '~/composables/useSeoPage'
import { qOneOf, qStr, useUrlQuery } from '~/composables/useUrlQuery'

const { route, patch, isSelf } = useUrlQuery()
const currency = useCurrencyStore()
const { t } = useI18n()

const SORT_IDS = ['recommended', 'price_asc', 'rating_desc'] as const
const SORTS = computed(() => SORT_IDS.map((id) => ({ id, label: t(`todo.sort_${id}`) })))
const CAT_IDS = ['THEME_PARK', 'DAY_TOUR', 'DOCENT_TOUR', 'TICKET', 'EXPERIENCE', 'CRUISE', 'SHOW', 'ESIM'] as const
const catLabel = (c: string) => ((CAT_IDS as readonly string[]).includes(c) ? t(`todo.cat_${c}`) : c)

const q = computed(() => {
  const r = route.query
  return {
    text: qStr(r.q || r.city || r.query), category: qStr(r.category),
    instant: qStr(r.instant) === 'true', freeCancel: qStr(r.freeCancel) === 'true',
    sort: qOneOf(r.sortBy, [...SORT_IDS], 'recommended')
  }
})
const draft = ref('')
watch(() => q.value.text, (v) => { draft.value = v }, { immediate: true })
function submit() { patch({ q: draft.value.trim(), city: '', query: '' }) }

const items = ref<any[]>([])
const categories = ref<string[]>([])
const state = ref<'loading' | 'ready' | 'error'>('loading')
let ctrl: AbortController | null = null
async function load() {
  ctrl?.abort(); ctrl = new AbortController(); const mine = ctrl
  const x = q.value
  state.value = 'loading'
  const timer = setTimeout(() => mine.abort(), 10000)
  try {
    const p = new URLSearchParams({ sortBy: x.sort, limit: '100' })
    if (x.text) p.set('q', x.text)
    if (x.category) p.set('category', x.category)
    if (x.instant) p.set('instantOnly', 'true')
    if (x.freeCancel) p.set('freeCancelOnly', 'true')
    const res = await fetch(`${useApiUrl('/activities')}?${p}`, { signal: mine.signal })
    if (!res.ok) throw new Error(String(res.status))
    const j = await res.json()
    if (mine !== ctrl) return
    items.value = Array.isArray(j.data) ? j.data : []
    // Category chips come from what is actually on sale (never from a fixed list of empty categories).
    if (!x.category) categories.value = [...new Set(items.value.map((a) => a.category).filter(Boolean))] as string[]
    state.value = 'ready'
  } catch { if (mine === ctrl) state.value = 'error' } finally { clearTimeout(timer) }
}
const activeCount = computed(() => (q.value.category ? 1 : 0) + (q.value.instant ? 1 : 0) + (q.value.freeCancel ? 1 : 0))
const RESET = { category: '', instant: '', freeCancel: '' }

watch(() => route.fullPath, () => { if (isSelf()) load() })
// TG-15: SSR the first paint (ISR caches it); the watcher re-loads on client query changes.
await useSsrLoad('tg15-things-list', load, { items, categories, state })
if (state.value === 'error' && import.meta.server) throw createError({ statusCode: 503, statusMessage: 'Catalog temporarily unavailable' })
onBeforeUnmount(() => ctrl?.abort())
useHead(() => ({
  title: q.value.text ? t('todo.docTitleQ', { q: q.value.text }) : t('todo.title'),
  meta: [{ name: 'description', content: t('todo.seoDesc') }]
}))
// P5: canonical + hreflang via the shared builder (bare path; query filters excluded from the canonical).
const FAQ = useSeoFaq('todos')
const todoLocaleCtx = useActiveLocaleContext()
// S7: visible results as ItemList for AI overviews (canonical bare paths).
useHead(() => {
  const elements = items.value
    .filter((a) => a && a.id && a.title)
    .map((a) => ({ name: a.title, path: `/things-to-do/detail/${a.id}` }))
  return elements.length ? { script: [jsonLdScript(itemListLd(seoUrlFor(todoLocaleCtx.value), t('nav.things-to-do'), elements))] } : {}
})
useSeoPage({ site: `https://${useRuntimeConfig().public.brandDomain}`, path: '/things-to-do', title: t('todo.title'), description: t('todo.seoDesc') })
</script>

<template>
  <div class="pb-24 lg:pb-16">
    <section class="relative overflow-hidden border-b border-line bg-gradient-to-b from-sapphire-50 to-canvas">
      <div class="mx-auto max-w-7xl px-4 pb-6 pt-8 lg:px-6 lg:pt-12">
        <nav class="mb-2 flex items-center gap-1 text-xs text-ink-subtle" :aria-label="$t('common.breadcrumb')"><NuxtLink :to="$localePath('/')" class="hover:text-ink">{{ $t('common.home') }}</NuxtLink><AppIcon name="chevron-right" :size="12" /><span>{{ $t('nav.things-to-do') }}</span></nav>
        <h1 class="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">{{ $t('todo.heroTitle') }}</h1>
        <form class="mt-5 flex max-w-2xl gap-2" role="search" novalidate @submit.prevent="submit">
          <div class="field-box flex-1"><label for="td-q" class="field-label">{{ $t('todo.searchLabel') }}</label><SearchAutocomplete v-model="draft" input-id="td-q" domain="things-to-do" variant="bare" :placeholder="$t('todo.searchPh')" @enter="submit" /></div>
          <button type="submit" class="btn-primary min-h-[52px] rounded-2xl px-6 text-base" :aria-label="$t('common.search')"><AppIcon name="search" :size="18" /><span class="hidden sm:inline">{{ $t('common.search') }}</span></button>
        </form>
      </div>
    </section>

    <div class="mx-auto max-w-7xl px-4 lg:px-6">
      <div class="flex flex-wrap items-end justify-between gap-3 pb-3 pt-6">
        <h2 class="text-xl font-bold tracking-tight text-ink">{{ q.text ? $t('todo.h2q', { q: q.text }) : $t('todo.h2all') }} <span v-if="state === 'ready'" class="ml-1 text-base font-semibold text-ink-subtle tabular">{{ $t('hotels.list.count', { n: items.length }) }}</span></h2>
        <label class="flex items-center gap-2 text-sm text-ink-muted">
          <span class="hidden sm:inline">{{ $t('hotels.list.sort') }}</span>
          <select :value="q.sort" class="rounded-xl border border-line bg-surface py-2 pl-3 pr-8 text-sm font-semibold text-ink focus:border-primary focus:outline-none" @change="patch({ sortBy: ($event.target as HTMLSelectElement).value === 'recommended' ? '' : ($event.target as HTMLSelectElement).value })">
            <option v-for="s in SORTS" :key="s.id" :value="s.id">{{ s.label }}</option>
          </select>
        </label>
      </div>

      <div class="chip-rail -mx-4 mb-4 flex gap-2 px-4 pb-1">
        <button type="button" class="chip" :aria-pressed="!q.category" @click="patch({ category: '' })">{{ $t('common.all') }}</button>
        <button v-for="c in categories" :key="c" type="button" class="chip" :aria-pressed="q.category === c" @click="patch({ category: q.category === c ? '' : c })">{{ catLabel(c) }}</button>
        <span class="mx-1 w-px shrink-0 bg-line" aria-hidden="true" />
        <button type="button" class="chip" :aria-pressed="q.instant" @click="patch({ instant: q.instant ? '' : 'true' })"><AppIcon name="bolt" :size="14" />{{ $t('todo.instant') }}</button>
        <button type="button" class="chip" :aria-pressed="q.freeCancel" @click="patch({ freeCancel: q.freeCancel ? '' : 'true' })">{{ $t('hotels.list.freeCancel') }}</button>
      </div>

      <ResultsState :state="state" :count="items.length" icon="ticket" :empty-title="q.text ? $t('todo.emptyQ', { q: q.text }) : $t('todo.emptyAll')" :empty-hint="$t('todo.emptyHint')" :error-title="$t('todo.loadFail')" @retry="load">
        <template #empty-actions>
          <button v-if="activeCount" type="button" class="btn-primary" @click="patch(RESET)">{{ $t('hotels.list.resetFilters') }}</button>
          <button v-if="q.text" type="button" class="btn-secondary" @click="patch({ q: '', city: '', query: '' })">{{ $t('todo.viewAll') }}</button>
        </template>
        <ul class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <li v-for="a in items" :key="a.id">
            <article class="card defer-paint group relative flex h-full flex-col overflow-hidden transition-shadow hover:shadow-pop">
              <SmartImg :src="a.thumbnail_url || a.image_url" :alt="a.title" icon="ticket" img-class="aspect-[4/3] w-full object-cover sm:transition-transform sm:duration-500 sm:group-hover:scale-105" />
              <div class="flex flex-1 flex-col p-4">
                <p class="text-xs text-ink-subtle">{{ [a.city, catLabel(a.category)].filter(Boolean).join(' · ') }}</p>
                <h3 class="mt-1 line-clamp-2 text-sm font-bold leading-snug text-ink"><NuxtLink :to="$localePath(`/things-to-do/detail/${a.id}`)" class="after:absolute after:inset-0 group-hover:text-primary">{{ a.title }}</NuxtLink></h3>
                <p v-if="Number(a.review_score) > 0" class="mt-1.5 flex items-center gap-1 text-xs text-ink-muted">
                  <AppIcon name="star" :size="12" stroke="0" class="fill-current text-warning" /><b class="text-ink tabular">{{ Number(a.review_score).toFixed(1) }}</b>
                  <span v-if="a.review_count" class="tabular">{{ $t('todo.reviewCount', { n: $n(Number(a.review_count)) }) }}</span>
                </p>
                <p v-else class="mt-1.5 text-2xs font-semibold text-ink-subtle">{{ $t('hotels.list.newBadge') }}</p>
                <ul class="mt-2 flex flex-wrap gap-x-2.5 gap-y-1 text-2xs font-semibold">
                  <li v-if="a.instant_confirmed" class="flex items-center gap-0.5 text-success"><AppIcon name="bolt" :size="12" />{{ $t('todo.instant') }}</li>
                  <li v-if="Number(a.free_cancellation)" class="flex items-center gap-0.5 text-success"><AppIcon name="check" :size="12" />{{ $t('hotels.list.freeCancel') }}</li>
                </ul>
                <div class="mt-auto flex items-end justify-between pt-3">
                  <span v-if="a.bookable === false" class="text-xs font-semibold text-warning">{{ $t('transfers.list.noDirect') }}</span>
                  <p v-if="Number(a.price_krw) > 0" class="ml-auto text-base font-extrabold text-ink tabular">{{ currency.formatKRW(Number(a.price_krw)) }}<span class="text-xs font-medium text-ink-subtle">{{ $t('packages.list.perPerson') }}</span></p>
                </div>
              </div>
            </article>
          </li>
        </ul>
      </ResultsState>
      <p class="mt-4 text-xs text-ink-subtle">{{ $t('todo.ratingNote') }}</p>
      <SeoFaq :items="FAQ" class="mt-12" />
    </div>
  </div>
</template>
