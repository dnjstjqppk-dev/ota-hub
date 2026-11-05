<script setup lang="ts">
/**
 * Product reviews. Verified reviews (backed by the customer's own fulfilled booking) are badged and listed first.
 * Writing is offered only from an eligible booking, so every review written here is a verified one.
 */
import { ref, computed, onMounted } from 'vue'
import { useAuthStore } from '~/stores/auth'
import { apiFetch } from '~/composables/useApi'

const props = defineProps<{ domain: string; targetId: string }>()
const auth = useAuthStore()

const FULFILLED = ['VOUCHER_ISSUED', 'TICKETED', 'COMPLETED']
const reviews = ref<any[]>([])
const summary = ref<{ count: number; average: number | null; verifiedCount: number } | null>(null)
const loading = ref(true)
const eligible = ref<any[]>([])
const form = ref({ bookingId: '', rating: 5, comment: '' })
const busy = ref(false)
const msg = ref('')
const err = ref('')

const stars = (n: number) => '★'.repeat(Math.round(n)) + '☆'.repeat(5 - Math.round(n))
const canWrite = computed(() => auth.isLoggedIn && eligible.value.length > 0)

async function loadReviews() {
  const r = await apiFetch(`/reviews?domain=${encodeURIComponent(props.domain)}&targetId=${encodeURIComponent(props.targetId)}`)
  loading.value = false
  if (!r.ok) return
  reviews.value = r.data.reviews || []
  summary.value = r.data.summary || null
}

async function loadEligible() {
  if (!auth.isLoggedIn) return
  const r = await apiFetch('/bookings')
  if (!r.ok) return
  eligible.value = (r.data.bookings || []).filter((b: any) => b.domain === props.domain && b.itemId === props.targetId && FULFILLED.includes(b.status))
  if (eligible.value.length) form.value.bookingId = eligible.value[0].id
}

async function submit() {
  err.value = ''
  msg.value = ''
  if (form.value.comment.trim().length < 10) { err.value = '후기는 10자 이상 작성해주세요.'; return }
  busy.value = true
  const r = await apiFetch('/reviews', { method: 'POST', body: { domainType: props.domain, targetId: props.targetId, bookingId: form.value.bookingId, rating: form.value.rating, comment: form.value.comment.trim() } })
  busy.value = false
  if (!r.ok) { err.value = r.data.error || '후기를 등록하지 못했습니다.'; return }
  msg.value = '후기가 등록되었습니다.'
  form.value.comment = ''
  eligible.value = eligible.value.filter((b) => b.id !== form.value.bookingId)
  form.value.bookingId = eligible.value[0]?.id || ''
  await loadReviews()
}

onMounted(async () => {
  await auth.initAuth()
  await Promise.all([loadReviews(), loadEligible()])
})
</script>

<template>
  <section class="rounded-3xl border border-slate-200 bg-white p-6 md:p-8 space-y-5" data-testid="reviews">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <h3 class="text-xl font-bold text-slate-900">이용 후기</h3>
      <div v-if="summary && summary.count" class="text-sm text-slate-700">
        <span class="text-amber-500">{{ stars(summary.average || 0) }}</span>
        <strong class="ml-1">{{ summary.average }}</strong>
        <span class="text-slate-500"> · 후기 {{ summary.count }}개 (실이용 인증 {{ summary.verifiedCount }}개)</span>
      </div>
    </div>

    <p v-if="loading" class="text-sm text-slate-400">후기를 불러오는 중…</p>
    <p v-else-if="!reviews.length" class="text-sm text-slate-500">아직 등록된 후기가 없습니다.</p>
    <ul v-else class="divide-y divide-slate-100">
      <li v-for="r in reviews" :key="r.id" class="py-3">
        <div class="flex items-center gap-2 text-xs text-slate-500">
          <span class="text-amber-500">{{ stars(r.rating) }}</span>
          <span class="font-semibold text-slate-700">{{ r.user_name }}</span>
          <span v-if="r.verified_stay" class="rounded-full bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700">실이용 인증</span>
          <span>{{ new Date(r.created_at).toLocaleDateString('ko-KR') }}</span>
        </div>
        <p class="mt-1 whitespace-pre-line text-sm text-slate-800">{{ r.comment }}</p>
      </li>
    </ul>

    <form v-if="canWrite" class="rounded-2xl bg-slate-50 p-4 space-y-3" data-testid="review-form" @submit.prevent="submit">
      <div class="text-sm font-semibold text-slate-800">이용하신 예약으로 후기 남기기</div>
      <select v-if="eligible.length > 1" v-model="form.bookingId" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
        <option v-for="b in eligible" :key="b.id" :value="b.id">{{ b.bookingNumber }} · {{ b.serviceStart }}</option>
      </select>
      <div class="flex items-center gap-1" role="radiogroup" aria-label="평점">
        <button v-for="n in 5" :key="n" type="button" :aria-checked="form.rating === n" role="radio" class="text-2xl leading-none" :class="n <= form.rating ? 'text-amber-500' : 'text-slate-300'" @click="form.rating = n">★</button>
      </div>
      <textarea v-model="form.comment" rows="3" maxlength="2000" placeholder="이용 경험을 10자 이상 남겨주세요." class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" data-testid="review-comment" />
      <p v-if="err" class="text-sm text-red-700" role="alert">{{ err }}</p>
      <button type="submit" :disabled="busy" class="rounded-xl bg-trip-blue px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{{ busy ? '등록 중…' : '후기 등록' }}</button>
    </form>
    <p v-else-if="auth.isLoggedIn && !msg" class="text-xs text-slate-500">이용이 완료된 예약이 있으면 인증 후기를 남길 수 있습니다.</p>
    <p v-if="msg" class="text-sm text-emerald-700" role="status" data-testid="review-success">{{ msg }}</p>
  </section>
</template>
