<script setup lang="ts">
/**
 * Flight + hotel bundle results (design system "Horizon"). URL = state (destination, departure date, travelers).
 * API only. Prices are per person (server: PER_PERSON); "정가" is the supplier-provided sum of the parts.
 */
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useCurrencyStore } from '~/stores/currency'
import { useApiUrl } from '~/composables/useApi'
import { itemListLd, jsonLdScript } from '~/composables/useJsonLd'
import { hreflangLinks, ogMeta } from '~/composables/useSeoPage'
import { fmtDay, qDate, qInt, qStr, todayIso, useUrlQuery } from '~/composables/useUrlQuery'
// Resolved once in setup: head getters run at render time, outside the Nuxt context.
const packageSeoSite = `https://${useRuntimeConfig().public.brandDomain}`

const { route, router, isSelf } = useUrlQuery()
const currency = useCurrencyStore()
const { t, locale } = useI18n()

const q = computed(() => {
  const r = route.query
  return { city: qStr(r.city || r.dest), date: qDate(r.date || r.startDate), adults: qInt(r.adults, 2, 1, 9), children: qInt(r.children, 0, 0, 8) }
})
const today = ref('')
const draft = reactive({ city: '', date: '', adults: 2, children: 0 })
function syncDraft() { Object.assign(draft, { ...q.value }) }
syncDraft()
function submit() {
  router.replace({ query: { ...(draft.city.trim() ? { city: draft.city.trim() } : {}), ...(draft.date ? { date: draft.date } : {}), adults: String(draft.adults), ...(draft.children ? { children: String(draft.children) } : {}) } })
}

const items = ref<any[]>([])
const state = ref<'loading' | 'ready' | 'error'>('loading')
let ctrl: AbortController | null = null
async function load() {
  ctrl?.abort(); ctrl = new AbortController(); const mine = ctrl
  state.value = 'loading'
  const timer = setTimeout(() => mine.abort(), 10000)
  try {
    const p = new URLSearchParams()
    if (q.value.city) p.set('dest', q.value.city)
    const res = await fetch(`${useApiUrl('/packages')}?${p}`, { signal: mine.signal })
    if (!res.ok) throw new Error(String(res.status))
    const j = await res.json()
    if (mine !== ctrl) return
    items.value = Array.isArray(j.data) ? j.data : []
    state.value = 'ready'
  } catch { if (mine === ctrl) state.value = 'error' } finally { clearTimeout(timer) }
}
const price = (p: any) => Number(p.bundle_price_krw ?? p.total_package_krw) || 0
const original = (p: any) => Number(p.original_price_krw ?? p.total_original_krw) || 0
function features(p: any): string[] { try { const f = JSON.parse(p.details_json || '{}').features; return Array.isArray(f) ? f.filter((x: unknown) => typeof x === 'string').slice(0, 3) : [] } catch { return [] } }
function detailLink(p: any) { const x = q.value; return { path: `/packages/detail/${p.id}`, query: { ...(x.date ? { startDate: x.date } : {}), adults: String(x.adults), ...(x.children ? { children: String(x.children) } : {}) } } }

watch(() => route.fullPath, () => { if (!isSelf()) return; syncDraft(); load() })
// TG-15: SSR the first paint (ISR caches it); the watcher re-loads on client query changes.
await useAsyncData('tg15-packages-list', () => load())
if (state.value === 'error' && import.meta.server) throw createError({ statusCode: 503, statusMessage: 'Catalog temporarily unavailable' })
onMounted(() => { today.value = todayIso() })
onBeforeUnmount(() => ctrl?.abort())
useHead(() => ({ title: q.value.city ? t('packages.list.docTitle', { c: q.value.city }) : t('packages.list.title'), meta: [...ogMeta(packageSeoSite, '/packages/list', null, locale.value)], link: [{ rel: 'canonical', href: `${packageSeoSite}/packages/list` }, ...hreflangLinks(packageSeoSite, '/packages/list')] }))
// S7: visible results as ItemList for AI overviews (canonical bare paths).
useHead(() => {
  const elements = items.value
    .filter((p) => p && p.id && p.title)
    .map((p) => ({ name: p.title, path: detailLink(p).path }))
  return elements.length ? { script: [jsonLdScript(itemListLd(packageSeoSite, t('nav.packages'), elements))] } : {}
})
</script>

<template>
  <div class="pb-24 lg:pb-16">
    <section class="border-b border-line bg-surface">
      <form class="mx-auto grid max-w-7xl gap-2 px-4 py-3 lg:grid-cols-[1.4fr_1fr_1fr_auto] lg:px-6 lg:py-4" novalidate @submit.prevent="submit">
        <div class="field-box"><label for="pl-city" class="field-label">{{ $t('packages.list.dest') }}</label><SearchAutocomplete v-model="draft.city" input-id="pl-city" domain="packages" variant="bare" :placeholder="$t('packages.list.destPh')" @enter="submit" /></div>
        <DateRangePicker v-model:start="draft.date" mode="single" :start-label="$t('packages.list.depDate')" :min="today" compact />
        <GuestPicker v-model:adults="draft.adults" v-model:children="draft.children" :show-rooms="false" :label="$t('packages.list.travelers')" compact />
        <button type="submit" class="btn-primary min-h-[52px] rounded-2xl px-7 text-base"><AppIcon name="search" :size="18" />{{ $t('common.search') }}</button>
      </form>
    </section>

    <div class="mx-auto max-w-7xl px-4 lg:px-6">
      <div class="pb-3 pt-6">
        <nav class="mb-1 flex items-center gap-1 text-xs text-ink-subtle" :aria-label="$t('common.breadcrumb')"><NuxtLink :to="$localePath('/')" class="hover:text-ink">{{ $t('common.home') }}</NuxtLink><AppIcon name="chevron-right" :size="12" /><NuxtLink :to="$localePath('/packages')" class="hover:text-ink">{{ $t('nav.packages') }}</NuxtLink></nav>
        <h1 class="text-xl font-bold tracking-tight text-ink sm:text-2xl">{{ q.city ? $t('packages.list.docTitle', { c: q.city }) : $t('packages.list.h1all') }} <span v-if="state === 'ready'" class="ml-1 text-base font-semibold text-ink-subtle tabular">{{ $t('hotels.list.count', { n: items.length }) }}</span></h1>
        <p v-if="q.date" class="mt-0.5 text-sm text-ink-muted">{{ $t('packages.list.depOn', { d: fmtDay(q.date, true) }) }}</p>
      </div>
      <p class="mb-3 flex items-start gap-1.5 text-xs text-ink-subtle"><AppIcon name="check" :size="14" class="mt-px" />{{ $t('packages.list.priceNote') }}</p>

      <ResultsState :state="state" :count="items.length" icon="package" :empty-title="q.city ? $t('packages.list.emptyCity', { c: q.city }) : $t('packages.list.emptyAll')" :empty-hint="$t('packages.list.emptyHint')" :error-title="$t('packages.list.loadFail')" @retry="load">
        <template #empty-actions>
          <NuxtLink v-if="q.city" :to="$localePath({ path: '/hotels/list', query: { city: q.city } })" class="btn-primary">{{ $t('packages.list.cityHotels', { c: q.city }) }}</NuxtLink>
          <button v-if="q.city" type="button" class="btn-secondary" @click="router.replace({ query: {} })">{{ $t('packages.list.viewAll') }}</button>
        </template>
        <ul class="grid gap-4 md:grid-cols-2">
          <li v-for="p in items" :key="p.id">
            <article class="card group relative flex h-full flex-col overflow-hidden transition-shadow hover:shadow-pop sm:flex-row">
              <SmartImg :src="p.thumbnail_url || p.hero_image_url" :alt="p.title" icon="package" img-class="aspect-[16/10] w-full shrink-0 object-cover sm:aspect-auto sm:w-48" />
              <div class="flex flex-1 flex-col p-4">
                <p class="flex items-center gap-2 text-xs text-ink-subtle"><span>{{ p.destination_city }}</span><span v-if="p.badge" class="rounded-full bg-accent-soft px-2 py-0.5 font-semibold text-accent">{{ p.badge }}</span></p>
                <h2 class="mt-1 line-clamp-2 font-bold leading-snug text-ink"><NuxtLink :to="$localePath(detailLink(p))" class="after:absolute after:inset-0 group-hover:text-primary">{{ p.title }}</NuxtLink></h2>
                <ul v-if="features(p).length" class="mt-2 space-y-1 text-xs text-ink-muted">
                  <li v-for="f in features(p)" :key="f" class="flex items-start gap-1.5"><AppIcon name="check" :size="12" class="mt-0.5 text-primary" /><span class="line-clamp-1">{{ f }}</span></li>
                </ul>
                <div class="mt-auto flex items-end justify-between gap-2 border-t border-line pt-3">
                  <span v-if="p.bookable === false" class="text-xs font-semibold text-warning">{{ $t('transfers.list.noDirect') }}</span>
                  <div class="ml-auto text-right">
                    <p v-if="original(p) > price(p)" class="text-2xs text-ink-subtle">{{ $t('packages.list.regularPre') }} <span class="line-through tabular">{{ currency.formatKRW(original(p)) }}</span></p>
                    <p class="text-lg font-extrabold text-ink tabular">{{ currency.formatKRW(price(p)) }}<span class="text-xs font-medium text-ink-subtle">{{ $t('packages.list.perPerson') }}</span></p>
                  </div>
                </div>
              </div>
            </article>
          </li>
        </ul>
      </ResultsState>
    </div>
  </div>
</template>
