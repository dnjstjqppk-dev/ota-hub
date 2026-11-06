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

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const q = route.query as Record<string, string>
const bookingId = String(q.bookingId || q.orderId || '')
const state = ref<'working' | 'failed'>('working')
const message = ref('')

onMounted(async () => {
  await auth.initAuth()
  if (!auth.isLoggedIn) return router.replace(`/login?redirect=${encodeURIComponent(route.fullPath)}`)
  if (!bookingId) { state.value = 'failed'; message.value = '예약 정보를 확인할 수 없습니다.'; return }

  if (q.failed || q.code) {
    state.value = 'failed'
    message.value = q.message || '결제가 취소되었거나 승인되지 않았습니다. 결제 가능 시간 내에 다시 시도할 수 있습니다.'
    return
  }

  const r = await apiFetch('/payments/confirm', {
    method: 'POST',
    body: { bookingId, orderId: String(q.orderId || ''), amount: Number(q.amount), paymentKey: String(q.paymentKey || '') }
  })
  if (r.ok) return router.replace(`/booking/result?bookingId=${encodeURIComponent(bookingId)}`)
  state.value = 'failed'
  message.value = r.data.error || '결제 승인 처리 중 오류가 발생했습니다.'
})
</script>

<template>
  <div class="max-w-lg mx-auto px-4 py-16 text-center" data-testid="payment-return">
    <template v-if="state === 'working'">
      <div class="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-line border-t-primary" />
      <p class="mt-4 text-sm font-semibold text-ink-muted">결제 승인을 확인하고 있습니다…</p>
      <p class="mt-1 text-xs text-ink-subtle">이 창을 닫거나 새로고침하지 마세요.</p>
    </template>
    <div v-else class="rounded-2xl border border-line bg-surface p-6" role="alert">
      <h1 class="text-base font-bold text-ink">결제가 완료되지 않았습니다</h1>
      <p class="mt-2 text-sm text-ink-muted">{{ message }}</p>
      <div class="mt-5 flex justify-center gap-2">
        <NuxtLink v-if="bookingId" :to="`/booking/result?bookingId=${encodeURIComponent(bookingId)}`" class="rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-ink-inverse">예약 상태 보기</NuxtLink>
        <NuxtLink to="/" class="rounded-xl border border-line-strong px-4 py-2.5 text-sm font-semibold">홈으로</NuxtLink>
      </div>
    </div>
  </div>
</template>
