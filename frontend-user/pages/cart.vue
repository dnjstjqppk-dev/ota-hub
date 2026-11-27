<script setup lang="ts">
/**
 * GAP-07: cart page. Legs are server-priced quotes; booking revalidates every
 * leg, so stale facts here can never overcharge. One checkout pays all legs
 * at once; the server splits settlement per vendor.
 */
import { computed, onMounted } from 'vue'
import { useCartStore } from '~/stores/cart'
import { useCurrencyStore } from '~/stores/currency'
import { fmtDay } from '~/composables/useUrlQuery'

const cart = useCartStore()
const currency = useCurrencyStore()
onMounted(() => cart.hydrate())
const canCheckout = computed(() => cart.legs.length >= 2)
const checkoutTo = computed(() => ({ path: '/checkout', query: { cart: cart.ids.join(',') } }))
const singleCheckoutTo = computed(() => {
  const l = cart.legs[0] as any
  if (!l) return { path: '/checkout' }
  return {
    path: '/checkout',
    query: {
      domain: l.domain,
      itemId: l.itemId,
      ...(l.unitId ? { unitId: l.unitId } : {}),
      ...(l.ratePlanId ? { ratePlanId: l.ratePlanId } : {}),
      ...(l.serviceStart ? { startDate: l.serviceStart } : {}),
      ...(l.serviceEnd && l.serviceEnd !== l.serviceStart ? { endDate: l.serviceEnd } : {}),
      adults: String(l.adults || 1),
      ...(l.children ? { children: String(l.children) } : {}),
      ...(l.rooms ? { rooms: String(l.rooms) } : {}),
    },
  }
})

const { t, locale } = useI18n()
useHead({ title: t('cart.title') })
</script>

<template>
  <div class="mx-auto max-w-3xl px-4 py-8" data-testid="cart-page">
    <h1 class="text-2xl font-extrabold tracking-tight text-ink">{{ $t('cart.title') }}</h1>
    <p class="mt-1 text-sm text-ink-muted">{{ $t('cart.sub') }}</p>

    <p v-if="!cart.legs.length" class="mt-8 rounded-2xl border border-line bg-surface p-8 text-center text-sm text-ink-muted">
      {{ $t('cart.empty') }}
    </p>

    <ul v-else class="mt-6 space-y-3">
      <li v-for="l in cart.legs" :key="l.quoteId" class="card flex items-center gap-4 p-4">
        <div class="min-w-0 flex-1">
          <p class="truncate font-bold text-ink">{{ l.title }}</p>
          <p class="mt-0.5 text-xs text-ink-subtle">{{ fmtDay(l.serviceStart, true, locale) }}<template v-if="l.serviceEnd && l.serviceEnd !== l.serviceStart"> → {{ fmtDay(l.serviceEnd, true, locale) }}</template></p>
        </div>
        <p class="font-extrabold tabular text-ink">{{ currency.formatKRW(l.totalMinor) }}</p>
        <button type="button" class="btn-ghost btn-sm" :aria-label="$t('cart.removeItem', { title: l.title })" @click="cart.remove(l.quoteId)">{{ $t('cart.remove') }}</button>
      </li>
    </ul>

    <div v-if="cart.legs.length" class="mt-6 rounded-2xl border border-line bg-surface p-5">
      <div class="flex justify-between text-base font-extrabold text-ink">
        <span>{{ $t('cart.totalCount', { n: cart.count }) }}</span><span class="tabular" data-testid="cart-total">{{ currency.formatKRW(cart.totalMinor) }}</span>
      </div>
      <p v-if="!canCheckout" class="mt-2 text-xs text-ink-subtle">{{ $t('cart.needTwo') }}</p>
      <div class="mt-4 flex flex-wrap gap-2">
        <NuxtLink v-if="canCheckout" :to="$localePath(checkoutTo)" class="btn-primary flex-1 py-3 text-center" data-testid="cart-checkout">{{ $t('cart.checkoutAll') }}</NuxtLink>
        <NuxtLink v-else :to="$localePath(singleCheckoutTo)" class="btn-primary flex-1 py-3 text-center" data-testid="cart-checkout-single">{{ $t('common.bookNow') }}</NuxtLink>
        <button type="button" class="btn-secondary" @click="cart.clear()">{{ $t('cart.clear') }}</button>
      </div>
    </div>
  </div>
</template>
