<script setup lang="ts">
/**
 * eSIM landing (design system "Horizon"). Plans come from GET /api/v1/esim/plans; the country box uses the
 * shared place autocomplete (domain "esim" → countries only) and filters by ISO country code, kept in the
 * URL as ?country=JP (the suggest API links here that way).
 * There is no eSIM supplier contract or checkout yet, so nothing here takes payment or issues a QR code.
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useCurrencyStore } from '~/stores/currency'
import { useApiUrl } from '~/composables/useApi'
import { qStr, useUrlQuery } from '~/composables/useUrlQuery'
import { isIsoCountry, resolveCountry } from '~/composables/useCountryLookup'

interface Plan {
  id: string
  country_code: string
  country_name: string
  data_quota_mb: number
  validity_days: number
  network_carrier: string
  price_minor: number
  currency: string
  speed_spec: string
}

const currency = useCurrencyStore()
const { route, patch, isSelf } = useUrlQuery()
const { t } = useI18n()
const FAQ = useSeoFaq('esim')
const plans = ref<Plan[]>([])
const state = ref<'loading' | 'ready' | 'error'>('loading')
const draft = ref('')
const picked = ref<{ code: string; name: string } | null>(null)
const notFound = ref('')

async function load() {
  state.value = 'loading'
  try {
    const r = await fetch(useApiUrl('/esim/plans'), { signal: AbortSignal.timeout(10000) })
    if (!r.ok) throw new Error(String(r.status))
    plans.value = (await r.json()).plans || []
    state.value = 'ready'
  } catch { state.value = 'error' }
}

/** URL → selection. Names come from the plans when possible, otherwise from the places API. */
async function syncFromUrl() {
  const code = qStr(route.query.country).toUpperCase()
  if (!isIsoCountry(code)) { picked.value = null; return }
  if (picked.value?.code === code) return
  const name = countries.value.find((c) => c.code === code)?.name || (await resolveCountry(code, 'esim'))?.name || code
  picked.value = { code, name }
  draft.value = name
}
onMounted(async () => { await load(); await syncFromUrl() })
watch(() => route.query.country, () => { if (isSelf()) syncFromUrl() })

/** Countries that actually have plans, in catalogue order. */
const countries = computed(() => {
  const seen = new Map<string, string>()
  for (const p of plans.value) if (!seen.has(p.country_code)) seen.set(p.country_code, p.country_name)
  return [...seen].map(([code, name]) => ({ code, name }))
})

// A plan matches its own ISO code, or a country it names explicitly ("미국/캐나다" covers 캐나다).
// Regional bundles that don't list their countries ("유럽 33개국 통합") are never guessed into a match.
const shown = computed(() => {
  const k = picked.value
  if (!k) return plans.value
  return plans.value.filter((p) => p.country_code === k.code || p.country_name.split('/').map((s) => s.trim()).includes(k.name))
})

function pick(code: string, name: string) {
  notFound.value = ''
  picked.value = { code: code.toUpperCase(), name }
  draft.value = name
  patch({ country: code.toUpperCase() })
}
function onSelect(it: { code?: string | null; country_code?: string | null; value?: string; title?: string }) {
  const code = it.code || it.country_code
  if (code) pick(code, it.value || it.title || code)
}
/** Enter without choosing a suggestion: plan country names first, then the places API. */
async function onEnter(text: string) {
  const t = text.trim()
  if (!t) return clear()
  const hit = countries.value.find((c) => c.name.split('/').some((n) => n.trim() === t))
  if (hit) return pick(hit.code, hit.name)
  const c = await resolveCountry(t, 'esim')
  if (c) pick(c.code, c.name)
  else notFound.value = t
}
function clear() { notFound.value = ''; picked.value = null; draft.value = ''; patch({ country: '' }) }

const dataLabel = (mb: number) => mb < 0 ? t('esim.unlimited') : mb >= 1024 ? `${+(mb / 1024).toFixed(1)}GB` : `${mb}MB`

// P5: canonical + hreflang + OG via the shared builder (affiliate landing: no checkout, no QR issuance).
useSeoPage({ site: `https://${useRuntimeConfig().public.brandDomain}`, path: '/esim', title: t('esim.seoTitle'), description: t('esim.seoDesc') })
</script>

<template>
  <div class="pb-24 lg:pb-16">
    <section class="relative overflow-hidden border-b border-line bg-gradient-to-b from-sapphire-50 to-canvas">
      <div class="mx-auto max-w-7xl px-4 pb-6 pt-8 lg:px-6 lg:pt-12">
        <nav class="mb-2 flex items-center gap-1 text-xs text-ink-subtle" :aria-label="$t('common.breadcrumb')"><NuxtLink :to="$localePath('/')" class="hover:text-ink">{{ $t('common.home') }}</NuxtLink><AppIcon name="chevron-right" :size="12" /><span>{{ $t('nav.esim') }}</span></nav>
        <h1 class="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">{{ $t('esim.heroTitle') }}</h1>
        <p class="mt-2 max-w-2xl text-base text-ink-muted">{{ $t('esim.heroSub') }}</p>
        <form class="mt-5 flex max-w-2xl gap-2" role="search" novalidate @submit.prevent="onEnter(draft)">
          <div class="field-box flex-1"><label for="esim-q" class="field-label">{{ $t('esim.countryLabel') }}</label><SearchAutocomplete v-model="draft" input-id="esim-q" domain="esim" variant="bare" :placeholder="$t('esim.countryPh')" @select="onSelect" @enter="onEnter" /></div>
          <button type="submit" class="btn-primary min-h-[52px] rounded-2xl px-6 text-base" :aria-label="$t('common.search')"><AppIcon name="search" :size="18" /><span class="hidden sm:inline">{{ $t('esim.find') }}</span></button>
        </form>
        <div v-if="countries.length" class="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button type="button" class="chip" :aria-pressed="!picked" @click="clear">{{ $t('common.all') }}</button>
          <button v-for="c in countries" :key="c.code" type="button" class="chip" :aria-pressed="picked?.code === c.code" @click="pick(c.code, c.name)">{{ c.name }}</button>
        </div>
      </div>
    </section>

    <div class="mx-auto max-w-7xl px-4 lg:px-6">
      <div class="mt-6 flex items-start gap-3 rounded-card border border-line bg-surface-sunken p-4 text-sm text-ink-muted" role="note">
        <AppIcon name="esim" class="mt-0.5 shrink-0 text-ink-subtle" />
        <p><strong class="font-semibold text-ink">{{ $t('esim.comingSoon') }}</strong> {{ $t('esim.comingSub') }}</p>
      </div>

      <p v-if="notFound" class="mt-4 text-sm text-ink-muted" role="status">{{ $t('esim.notFound', { q: notFound }) }}</p>

      <h2 class="pb-3 pt-8 text-xl font-bold tracking-tight text-ink">
        {{ picked ? $t('esim.h2picked', { name: picked.name }) : $t('esim.h2all') }}
        <span v-if="state === 'ready'" class="ml-1 text-base font-semibold text-ink-subtle tabular">{{ $t('hotels.list.count', { n: shown.length }) }}</span>
      </h2>

      <div v-if="state === 'loading'" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div v-for="n in 3" :key="n" class="h-48 animate-pulse rounded-card bg-surface-sunken" />
      </div>
      <div v-else-if="state === 'error'" class="card p-6 text-center text-sm">
        <span class="text-ink-muted">{{ $t('esim.loadFail') }}</span>
        <button type="button" class="ml-2 font-semibold text-primary" @click="load">{{ $t('common.retry') }}</button>
      </div>
      <div v-else-if="!shown.length" class="card p-8 text-center">
        <p class="font-semibold text-ink">{{ $t('esim.empty', { name: picked?.name }) }}</p>
        <p class="mt-1 text-sm text-ink-muted">{{ $t('esim.hasPlans', { list: countries.map((c) => c.name).join(', ') }) }}</p>
        <button type="button" class="btn-secondary mt-4" @click="clear">{{ $t('esim.viewAll') }}</button>
      </div>
      <ul v-else class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <li v-for="p in shown" :key="p.id" class="card flex flex-col p-5">
          <p class="text-xs text-ink-subtle">{{ p.country_name }}</p>
          <h3 class="mt-0.5 text-lg font-bold text-ink">{{ dataLabel(p.data_quota_mb) }} · {{ $t('esim.days', { n: p.validity_days }) }}</h3>
          <dl class="mb-4 mt-3 space-y-1.5 text-sm">
            <div class="flex justify-between gap-3"><dt class="text-ink-subtle">{{ $t('esim.network') }}</dt><dd class="text-right font-medium text-ink">{{ p.network_carrier }}</dd></div>
            <div class="flex justify-between gap-3"><dt class="text-ink-subtle">{{ $t('esim.speed') }}</dt><dd class="text-right font-medium text-ink">{{ p.speed_spec }}</dd></div>
          </dl>
          <div class="mt-auto flex items-end justify-between gap-3 border-t border-line pt-4">
            <div>
              <p class="text-lg font-extrabold text-ink tabular">{{ currency.formatKRW(p.price_minor) }}</p>
              <p class="text-2xs text-ink-subtle">{{ $t('esim.refPrice') }}</p>
            </div>
            <button type="button" class="btn-secondary cursor-not-allowed opacity-60" disabled>{{ $t('esim.comingBtn') }}</button>
          </div>
        </li>
      </ul>
      <SeoFaq :items="FAQ" class="mt-12" />
    </div>
  </div>
</template>
