<script setup lang="ts">
/**
 * Wishlist and price alerts (design system "Horizon"), both read from and deleted through the API.
 * Alerts are created from product pages (PriceAlertButton) and fire one-shot by email when the
 * tracked product reaches the target price.
 */
import { ref } from 'vue'
import { apiFetch } from '~/composables/useApi'
import { useCurrencyStore } from '~/stores/currency'

const currency = useCurrencyStore()
const { t } = useI18n()
useHead({ title: t('my.wishlist') })
const items = ref<any[]>([])
const alerts = ref<any[]>([])
const state = ref<'loading' | 'ready' | 'error'>('loading')
const removing = ref('')
const err = ref('')

const PATHS: Record<string, string> = { HOTEL: '/hotels/detail/', FLIGHT: '/flights/detail/', TRAIN: '/trains/detail/', CAR: '/cars/detail/', TRANSFER: '/transfers/detail/', ACTIVITY: '/things-to-do/detail/', PACKAGE: '/packages/detail/' }
const ICONS: Record<string, string> = { HOTEL: 'hotel', FLIGHT: 'flight', TRAIN: 'train', CAR: 'car', TRANSFER: 'transfer', ACTIVITY: 'ticket', PACKAGE: 'package' }
const linkOf = (domain: string, id: string) => (PATHS[domain] && id && id !== 'general' ? PATHS[domain] + id : '')

async function load() {
  state.value = 'loading'
  const [w, a] = await Promise.all([apiFetch('/wishlist'), apiFetch('/price-alerts')])
  if (!w.ok || !a.ok) { state.value = 'error'; return }
  items.value = w.data.wishlist || []
  alerts.value = a.data.alerts || []
  state.value = 'ready'
}
async function remove(kind: 'wishlist' | 'price-alerts', id: string) {
  removing.value = id; err.value = ''
  const r = await apiFetch(`/${kind}/${encodeURIComponent(id)}`, { method: 'DELETE' })
  removing.value = ''
  if (!r.ok) { err.value = t('my.wishDeleteFail'); return }
  if (kind === 'wishlist') items.value = items.value.filter((x) => x.id !== id)
  else alerts.value = alerts.value.filter((x) => x.id !== id)
}
</script>

<template>
  <MyShell :title="$t('my.wishlist')" :subtitle="$t('my.wishSub')" @ready="load">
    <p v-if="err" class="mb-4 rounded-xl bg-danger-soft px-4 py-2.5 text-sm font-medium text-danger" role="alert">{{ err }}</p>

    <h2 class="mb-3 text-lg font-bold text-ink">{{ $t('my.wishItems') }}</h2>
    <ResultsState :state="state" :count="items.length" icon="heart" :empty-title="$t('my.wishEmpty')" :empty-hint="$t('my.wishEmptyHint')" :error-title="$t('my.wishFail')" @retry="load">
      <ul class="grid gap-3 sm:grid-cols-2">
        <li v-for="w in items" :key="w.id" class="card flex items-center gap-3 p-3">
          <SmartImg :src="w.thumbnail_url" :alt="w.item_title" :icon="ICONS[w.domain_type] || 'heart'" img-class="h-16 w-16 shrink-0 rounded-xl object-cover" />
          <div class="min-w-0 flex-1">
            <NuxtLink v-if="linkOf(w.domain_type, w.item_id)" :to="$localePath(linkOf(w.domain_type, w.item_id))" class="line-clamp-2 text-sm font-semibold text-ink hover:text-primary">{{ w.item_title }}</NuxtLink>
            <p v-else class="line-clamp-2 text-sm font-semibold text-ink">{{ w.item_title }}</p>
            <p v-if="Number(w.price_krw) > 0" class="mt-0.5 text-xs text-ink-subtle">{{ $t('my.wishRefPrice', { v: currency.formatKRW(Number(w.price_krw)) }) }}</p>
          </div>
          <button type="button" class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-subtle hover:bg-surface-sunken hover:text-danger" :disabled="removing === w.id" :aria-label="$t('my.wishUnsave', { title: w.item_title })" @click="remove('wishlist', w.id)"><AppIcon name="close" :size="18" /></button>
        </li>
      </ul>
    </ResultsState>

    <template v-if="state === 'ready'">
      <h2 class="mb-1 mt-10 text-lg font-bold text-ink">{{ $t('my.alertsTitle') }}</h2>
      <p class="mb-3 flex items-start gap-1.5 text-sm text-ink-muted"><AppIcon name="mail" :size="16" class="mt-0.5" />{{ $t('my.alertsHint') }}</p>
      <p v-if="!alerts.length" class="card px-6 py-8 text-center text-sm text-ink-muted">{{ $t('my.alertsEmpty') }}</p>
      <ul v-else class="space-y-2">
        <li v-for="a in alerts" :key="a.id" class="card flex items-center gap-3 p-4">
          <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-sunken text-ink-muted"><AppIcon :name="ICONS[a.domain_type] || 'bolt'" :size="18" /></span>
          <div class="min-w-0 flex-1">
            <NuxtLink v-if="linkOf(a.domain_type, a.item_id)" :to="$localePath(linkOf(a.domain_type, a.item_id))" class="line-clamp-1 text-sm font-semibold text-ink hover:text-primary">{{ a.route_or_hotel }}</NuxtLink>
            <p v-else class="line-clamp-1 text-sm font-semibold text-ink">{{ a.route_or_hotel }}</p>
            <p class="text-xs text-ink-subtle">{{ $t('my.alertTarget', { v: currency.formatKRW(Number(a.target_price)) }) }}<template v-if="Number(a.current_price_krw) > 0"> · {{ $t('my.alertAtReg', { v: currency.formatKRW(Number(a.current_price_krw)) }) }}</template></p>
          </div>
          <button type="button" class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-subtle hover:bg-surface-sunken hover:text-danger" :disabled="removing === a.id" :aria-label="$t('my.alertDelete')" @click="remove('price-alerts', a.id)"><AppIcon name="close" :size="18" /></button>
        </li>
      </ul>
    </template>
  </MyShell>
</template>
