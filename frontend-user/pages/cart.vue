<script setup lang="ts">
/**
 * GAP-07: cart page. Legs are server-priced quotes; booking revalidates every
 * leg, so stale facts here can never overcharge. One checkout pays all legs
 * at once; the server splits settlement per vendor.
 */
import { computed, onMounted } from 'vue'
import { useCartStore } from '~/stores/cart'
import { formatKrw } from '~/composables/useApi'
import { fmtDay } from '~/composables/useUrlQuery'

const cart = useCartStore()
onMounted(() => cart.hydrate())
const canCheckout = computed(() => cart.legs.length >= 2)
const checkoutTo = computed(() => ({ path: '/checkout', query: { cart: cart.ids.join(',') } }))

const { t } = useI18n()
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
          <p class="mt-0.5 text-xs text-ink-subtle">{{ fmtDay(l.serviceStart, true) }}<template v-if="l.serviceEnd && l.serviceEnd !== l.serviceStart"> → {{ fmtDay(l.serviceEnd, true) }}</template></p>
        </div>
        <p class="font-extrabold tabular text-ink">{{ formatKrw(l.totalMinor) }}</p>
        <button type="button" class="btn-ghost btn-sm" :aria-label="$t('cart.removeItem', { title: l.title })" @click="cart.remove(l.quoteId)">{{ $t('cart.remove') }}</button>
      </li>
    </ul>

    <div v-if="cart.legs.length" class="mt-6 rounded-2xl border border-line bg-surface p-5">
      <div class="flex justify-between text-base font-extrabold text-ink">
        <span>{{ $t('cart.totalCount', { n: cart.count }) }}</span><span class="tabular" data-testid="cart-total">{{ formatKrw(cart.totalMinor) }}</span>
      </div>
      <p v-if="!canCheckout" class="mt-2 text-xs text-ink-subtle">{{ $t('cart.needTwo') }}</p>
      <div class="mt-4 flex gap-2">
        <NuxtLink v-if="canCheckout" :to="$localePath(checkoutTo)" class="btn-primary flex-1 py-3 text-center" data-testid="cart-checkout">{{ $t('cart.checkoutAll') }}</NuxtLink>
        <button type="button" class="btn-ghost" @click="cart.clear()">{{ $t('cart.clear') }}</button>
      </div>
    </div>
  </div>
</template>
