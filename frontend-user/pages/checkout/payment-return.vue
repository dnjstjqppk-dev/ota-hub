<script setup lang="ts">
/**
 * Return target for the hosted PG window (Toss successUrl / failUrl).
 * Toss appends ?paymentKey=&orderId=&amount= on success, or ?code=&message= on failure.
 * The amount is re-verified by the server against the booking; the client value is only forwarded.
 */
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '~/stores/auth'
import { apiFetch } from '~/composables/useApi'
const localePath = useLocalePath()

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const q = route.query as Record<string, string>
const bookingId = String(q.bookingId || q.orderId || '')
const state = ref<'working' | 'failed'>('working')
const message = ref('')
const { t } = useI18n()
useHead({ title: t('payReturn.title') })

onMounted(async () => {
  await auth.initAuth()
  if (!auth.isLoggedIn) return router.replace(localePath(`/login?redirect=${encodeURIComponent(route.fullPath)}`))
  if (!bookingId) { state.value = 'failed'; message.value = t('payReturn.noBooking'); return }

  if (q.failed || q.code) {
    state.value = 'failed'
    message.value = q.message || t('payReturn.cancelled')
    return
  }

  // GAP-06: Stripe 3DS lands here with ?payment_intent= — finalize via the API return.
  if (q.payment_intent) {
    const s = await apiFetch(`/payments/stripe/return?payment_intent=${encodeURIComponent(String(q.payment_intent))}`)
    if (s.ok && s.data.reconciled) return router.replace(localePath(`/booking/result?bookingId=${encodeURIComponent(String(s.data.bookingId || bookingId))}`))
    state.value = 'failed'
    message.value = s.data.error || t('payReturn.stripeFail')
    return
  }

  const r = await apiFetch('/payments/confirm', {
    method: 'POST',
    body: { bookingId, orderId: String(q.orderId || ''), amount: Number(q.amount), paymentKey: String(q.paymentKey || ''), provider: 'toss' }
  })
  if (r.ok) return router.replace(localePath(`/booking/result?bookingId=${encodeURIComponent(bookingId)}`))
  state.value = 'failed'
  message.value = r.data.error || t('payReturn.confirmFail')
})
</script>

<template>
  <div class="max-w-lg mx-auto px-4 py-16 text-center" data-testid="payment-return">
    <template v-if="state === 'working'">
      <div class="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-line border-t-primary" />
      <p class="mt-4 text-sm font-semibold text-ink-muted">{{ $t('payReturn.working') }}</p>
      <p class="mt-1 text-xs text-ink-subtle">{{ $t('payReturn.workingSub') }}</p>
    </template>
    <div v-else class="rounded-2xl border border-line bg-surface p-6" role="alert">
      <h1 class="text-base font-bold text-ink">{{ $t('payReturn.failed') }}</h1>
      <p class="mt-2 text-sm text-ink-muted">{{ message }}</p>
      <div class="mt-5 flex justify-center gap-2">
        <NuxtLink v-if="bookingId" :to="$localePath(`/booking/result?bookingId=${encodeURIComponent(bookingId)}`)" class="rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-ink-inverse">{{ $t('payReturn.viewBooking') }}</NuxtLink>
        <NuxtLink :to="$localePath('/')" class="rounded-xl border border-line-strong px-4 py-2.5 text-sm font-semibold">{{ $t('common.home') }}</NuxtLink>
      </div>
    </div>
  </div>
</template>
