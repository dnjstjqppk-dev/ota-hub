<script setup lang="ts">
/**
 * Product reviews. Verified reviews (backed by the customer's own fulfilled booking) are badged and listed first.
 * Writing is offered only from an eligible booking, so every review written here is a verified one.
 * CR-01: rating distribution, server-side sort / photo filter, photo reviews (own uploads, max 5),
 * and the seller's public reply.
 */
import { ref, computed, onBeforeUnmount, onMounted, watch } from 'vue'
import { useAuthStore } from '~/stores/auth'
import { useToastStore } from '~/stores/toast'
import { apiFetch, useApiUrl } from '~/composables/useApi'
import { useApiError } from '~/composables/useApiError'
import { assetUrl } from '~/composables/useMarketing'

const props = defineProps<{ domain: string; targetId: string }>()
const auth = useAuthStore()
const toast = useToastStore()
const { t, locale } = useI18n()
const apiErr = useApiError()
const tag = computed(() => ({ ko: 'ko-KR', en: 'en-US', ja: 'ja-JP', zh: 'zh-CN' })[locale.value] || 'ko-KR')

const FULFILLED = ['VOUCHER_ISSUED', 'TICKETED', 'COMPLETED']
const MAX_PHOTOS = 5
const SORTS = computed(() => [
  { id: 'recommended', label: t('reviews.sortRecommended') },
  { id: 'latest', label: t('reviews.sortLatest') },
  { id: 'rating_high', label: t('reviews.sortHigh') },
  { id: 'rating_low', label: t('reviews.sortLow') }
] as const)

type Summary = { count: number; average: number | null; verifiedCount: number; photoCount: number; distribution: Record<string, number> }
const reviews = ref<any[]>([])
const summary = ref<Summary | null>(null)
const loading = ref(true)
const loadError = ref(false)
const sort = ref<'recommended' | 'latest' | 'rating_high' | 'rating_low'>('recommended')
const photoOnly = ref(false)
const eligible = ref<any[]>([])
const form = ref({ bookingId: '', rating: 5, comment: '' })
const photos = ref<string[]>([])
const uploading = ref(false)
const busy = ref(false)
const err = ref('')
const lightbox = ref<{ list: string[]; i: number } | null>(null)

const stars = (n: number) => '★'.repeat(Math.round(n)) + '☆'.repeat(5 - Math.round(n))
const canWrite = computed(() => auth.isLoggedIn && eligible.value.length > 0)
const commentLen = computed(() => form.value.comment.trim().length)
const pct = (n: number) => (summary.value?.count ? Math.round((n / summary.value.count) * 100) : 0)

async function loadReviews() {
  loading.value = true
  loadError.value = false
  const q = new URLSearchParams({ domain: props.domain, targetId: props.targetId, sort: sort.value })
  if (photoOnly.value) q.set('withPhotos', '1')
  const r = await apiFetch(`/reviews?${q.toString()}`)
  loading.value = false
  if (!r.ok) { loadError.value = true; return }
  reviews.value = r.data.reviews || []
  // The summary always describes all visible reviews, not the photo-filtered subset.
  if (!photoOnly.value || !summary.value) summary.value = r.data.summary || null
}
watch([sort, photoOnly], loadReviews)

async function loadEligible() {
  if (!auth.isLoggedIn) return
  const r = await apiFetch('/bookings')
  if (!r.ok) return
  eligible.value = (r.data.bookings || []).filter((b: any) => b.domain === props.domain && b.itemId === props.targetId && FULFILLED.includes(b.status))
  if (eligible.value.length) form.value.bookingId = eligible.value[0].id
}

async function addPhotos(e: Event) {
  const input = e.target as HTMLInputElement
  const files = Array.from(input.files || []).slice(0, MAX_PHOTOS - photos.value.length)
  input.value = ''
  if (!files.length) return
  uploading.value = true
  for (const f of files) {
    if (!/^image\/(jpeg|png|webp)$/.test(f.type)) { toast.error(t('reviews.badType')); continue }
    if (f.size > 8 * 1024 * 1024) { toast.error(t('reviews.tooBig')); continue }
    const fd = new FormData()
    fd.append('file', f)
    fd.append('purpose', 'REVIEW_PHOTO')
    try {
      const res = await fetch(useApiUrl('/uploads'), { method: 'POST', body: fd, credentials: 'include', headers: auth.token ? { Authorization: `Bearer ${auth.token}` } : {} })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j.url) { toast.error(t('reviews.uploadFailed')); continue }
      photos.value = [...photos.value, j.url]
    } catch { toast.error(t('reviews.uploadOffline')) }
  }
  uploading.value = false
}

async function submit() {
  err.value = ''
  if (commentLen.value < 10) { err.value = t('reviews.minComment'); return }
  busy.value = true
  const r = await apiFetch('/reviews', { method: 'POST', body: { domainType: props.domain, targetId: props.targetId, bookingId: form.value.bookingId, rating: form.value.rating, comment: form.value.comment.trim(), photos: photos.value } })
  busy.value = false
  if (!r.ok) { err.value = apiErr(r, 'reviews.submitFailed'); return }
  toast.success(t('reviews.submitted'))
  form.value.comment = ''
  photos.value = []
  eligible.value = eligible.value.filter((b) => b.id !== form.value.bookingId)
  form.value.bookingId = eligible.value[0]?.id || ''
  summary.value = null
  await loadReviews()
}

function onKey(e: KeyboardEvent) {
  const lb = lightbox.value
  if (!lb) return
  if (e.key === 'Escape') lightbox.value = null
  else if (e.key === 'ArrowRight') lb.i = (lb.i + 1) % lb.list.length
  else if (e.key === 'ArrowLeft') lb.i = (lb.i - 1 + lb.list.length) % lb.list.length
}
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))

onMounted(async () => {
  window.addEventListener('keydown', onKey)
  await auth.initAuth()
  await Promise.all([loadReviews(), loadEligible()])
})
</script>

<template>
  <section class="space-y-6 rounded-3xl border border-line bg-surface p-5 md:p-8" data-testid="reviews">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <h3 class="text-xl font-bold text-ink">{{ t('reviews.title') }}</h3>
      <p class="text-xs text-ink-subtle">{{ t('reviews.verifiedOnly') }}</p>
    </div>

    <!-- Summary + distribution -->
    <div v-if="summary && summary.count" class="grid gap-6 rounded-2xl bg-surface-sunken p-5 sm:grid-cols-[180px_1fr]" data-testid="review-summary">
      <div class="flex flex-row items-center gap-4 sm:flex-col sm:items-start sm:justify-center sm:gap-1">
        <p class="text-4xl font-extrabold tabular text-ink">{{ summary.average?.toFixed(1) }}<span class="text-base font-semibold text-ink-subtle">/5</span></p>
        <div>
          <p class="text-warning" aria-hidden="true">{{ stars(summary.average || 0) }}</p>
          <p class="text-xs text-ink-muted">{{ t('reviews.counts', { n: summary.count.toLocaleString(tag), p: summary.photoCount }) }}</p>
        </div>
      </div>
      <ul class="space-y-1.5" :aria-label="t('reviews.dist')">
        <li v-for="n in [5, 4, 3, 2, 1]" :key="n" class="flex items-center gap-3 text-xs">
          <span class="w-7 shrink-0 font-semibold text-ink-muted">{{ t('reviews.points', { n }) }}</span>
          <span class="h-2 flex-1 overflow-hidden rounded-full bg-line" role="meter" :aria-valuenow="pct(summary.distribution[n] || 0)" aria-valuemin="0" aria-valuemax="100" :aria-label="t('reviews.pointsCount', { n, c: summary.distribution[n] || 0 })">
            <span class="block h-full rounded-full bg-warning" :style="{ width: `${pct(summary.distribution[n] || 0)}%` }" />
          </span>
          <span class="w-10 shrink-0 text-right tabular text-ink-subtle">{{ summary.distribution[n] || 0 }}</span>
        </li>
      </ul>
    </div>

    <!-- Controls -->
    <div v-if="summary && summary.count" class="flex flex-wrap items-center gap-2">
      <button v-for="s in SORTS" :key="s.id" type="button" class="chip min-h-[44px]" :aria-pressed="sort === s.id" @click="sort = s.id">{{ s.label }}</button>
      <button type="button" class="chip min-h-[44px]" :aria-pressed="photoOnly" :disabled="!summary.photoCount" @click="photoOnly = !photoOnly"><AppIcon name="camera" :size="14" />{{ t('reviews.photoOnly') }}</button>
    </div>

    <!-- List -->
    <div v-if="loading" class="space-y-4" aria-busy="true">
      <div v-for="i in 3" :key="i" class="space-y-2"><div class="h-3 w-40 animate-pulse rounded bg-line" /><div class="h-3 w-full animate-pulse rounded bg-line" /><div class="h-3 w-2/3 animate-pulse rounded bg-line" /></div>
    </div>
    <div v-else-if="loadError" class="rounded-2xl border border-line p-5 text-center text-sm text-ink-muted">
      {{ t('reviews.loadFailed') }} <button type="button" class="ml-1 font-semibold text-primary underline" @click="loadReviews">{{ t('common.retry') }}</button>
    </div>
    <div v-else-if="!reviews.length" class="rounded-2xl border border-dashed border-line p-8 text-center">
      <AppIcon name="star" :size="28" class="mx-auto text-ink-subtle" />
      <p class="mt-2 text-sm font-semibold text-ink">{{ photoOnly ? t('reviews.emptyPhoto') : t('reviews.empty') }}</p>
      <p class="mt-1 text-xs text-ink-subtle">{{ t('reviews.emptyHint') }}</p>
    </div>
    <ul v-else class="divide-y divide-line">
      <li v-for="r in reviews" :key="r.id" class="py-4" data-testid="review-item">
        <div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-subtle">
          <span class="text-warning" :aria-label="t('reviews.rating', { n: r.rating })">{{ stars(r.rating) }}</span>
          <span class="font-semibold text-ink-muted">{{ r.user_name }}</span>
          <span v-if="r.verified_stay" class="rounded-full bg-success-soft px-2 py-0.5 font-semibold text-success">{{ t('reviews.verified') }}</span>
          <span>{{ new Date(r.created_at).toLocaleDateString(tag) }}</span>
        </div>
        <p class="mt-1.5 whitespace-pre-line break-words text-sm leading-relaxed text-ink">{{ r.comment }}</p>
        <div v-if="r.photos?.length" class="chip-rail mt-3 flex gap-2 pb-1">
          <button v-for="(p, i) in r.photos" :key="p" type="button" class="shrink-0 overflow-hidden rounded-xl" :aria-label="t('reviews.photoZoom', { i: i + 1 })" @click="lightbox = { list: r.photos.map(assetUrl), i }">
            <SmartImg :src="assetUrl(p)" alt="" icon="camera" img-class="h-20 w-20 object-cover sm:h-24 sm:w-24" />
          </button>
        </div>
        <div v-if="r.partner_reply" class="mt-3 rounded-xl border-l-2 border-primary bg-primary-soft/50 px-4 py-3" data-testid="partner-reply">
          <p class="text-xs font-bold text-primary">{{ t('reviews.reply') }} <span class="font-normal text-ink-subtle">· {{ new Date(r.partner_replied_at).toLocaleDateString(tag) }}</span></p>
          <p class="mt-1 whitespace-pre-line break-words text-sm text-ink">{{ r.partner_reply }}</p>
        </div>
      </li>
    </ul>

    <!-- Write -->
    <form v-if="canWrite" class="space-y-3 rounded-2xl bg-surface-sunken p-4" data-testid="review-form" novalidate @submit.prevent="submit">
      <div class="text-sm font-semibold text-ink">{{ t('reviews.writeTitle') }}</div>
      <label v-if="eligible.length > 1" class="block">
        <span class="sr-only">{{ t('reviews.pickBooking') }}</span>
        <select v-model="form.bookingId" class="min-h-[44px] w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm">
          <option v-for="b in eligible" :key="b.id" :value="b.id">{{ b.bookingNumber }} · {{ b.serviceStart }}</option>
        </select>
      </label>
      <div class="flex items-center gap-1" role="radiogroup" :aria-label="t('reviews.ratingLabel')">
        <button v-for="n in 5" :key="n" type="button" :aria-checked="form.rating === n" role="radio" :aria-label="t('reviews.points', { n })" class="grid h-11 w-11 place-items-center text-2xl leading-none" :class="n <= form.rating ? 'text-warning' : 'text-ink-subtle'" @click="form.rating = n">★</button>
      </div>
      <div>
        <textarea v-model="form.comment" rows="3" maxlength="2000" :placeholder="t('reviews.commentPh')" class="w-full rounded-lg border bg-surface px-3 py-2 text-sm" :class="err && commentLen < 10 ? 'border-danger' : 'border-line-strong'" :aria-invalid="!!err && commentLen < 10" aria-describedby="review-hint" data-testid="review-comment" />
        <p id="review-hint" class="mt-1 text-right text-xs" :class="commentLen && commentLen < 10 ? 'text-danger' : 'text-ink-subtle'">{{ commentLen }}/2000{{ commentLen && commentLen < 10 ? ` · ${t('reviews.commentShort', { n: 10 - commentLen })}` : '' }}</p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <div v-for="(p, i) in photos" :key="p" class="relative">
          <SmartImg :src="assetUrl(p)" alt="" icon="camera" img-class="h-16 w-16 rounded-lg object-cover" />
          <button type="button" class="absolute -right-2 -top-2 grid h-7 w-7 place-items-center rounded-full bg-ink text-xs text-ink-inverse" :aria-label="t('reviews.removePhoto', { i: i + 1 })" @click="photos = photos.filter((x) => x !== p)">✕</button>
        </div>
        <label v-if="photos.length < MAX_PHOTOS" class="grid h-16 w-16 cursor-pointer place-items-center rounded-lg border border-dashed border-line-strong text-ink-subtle hover:text-ink" :class="uploading && 'pointer-events-none opacity-50'">
          <span class="flex flex-col items-center text-2xs"><AppIcon name="camera" :size="18" />{{ uploading ? t('reviews.uploading') : `${photos.length}/${MAX_PHOTOS}` }}</span>
          <input type="file" accept="image/jpeg,image/png,image/webp" multiple class="sr-only" :disabled="uploading" @change="addPhotos" />
        </label>
      </div>
      <p v-if="err" class="text-sm text-danger" role="alert">{{ err }}</p>
      <button type="submit" :disabled="busy || uploading" class="btn-primary min-h-[44px]">{{ busy ? t('reviews.submitting') : t('reviews.submit') }}</button>
    </form>
    <p v-else-if="auth.isLoggedIn" class="text-xs text-ink-subtle">{{ t('reviews.eligibleHint') }}</p>

    <!-- Lightbox -->
    <Teleport to="body">
      <div v-if="lightbox" class="fixed inset-0 z-[80] flex items-center justify-center bg-black/90 p-4" role="dialog" aria-modal="true" :aria-label="t('reviews.lightbox')" @click.self="lightbox = null">
        <img :src="lightbox.list[lightbox.i] || ''" :alt="t('reviews.lightbox')" class="max-h-[85vh] max-w-full rounded-lg object-contain" />
        <button type="button" class="absolute right-3 top-3 grid h-11 w-11 place-items-center rounded-full bg-white/15 text-white" :aria-label="t('common.close')" @click="lightbox = null">✕</button>
        <template v-if="lightbox.list.length > 1">
          <button type="button" class="absolute left-3 grid h-11 w-11 place-items-center rounded-full bg-white/15 text-white" :aria-label="t('reviews.prevPhoto')" @click="lightbox.i = (lightbox.i - 1 + lightbox.list.length) % lightbox.list.length"><AppIcon name="chevron-right" :size="20" class="rotate-180" /></button>
          <button type="button" class="absolute right-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/15 text-white" :aria-label="t('reviews.nextPhoto')" @click="lightbox.i = (lightbox.i + 1) % lightbox.list.length"><AppIcon name="chevron-right" :size="20" /></button>
          <p class="absolute bottom-4 text-sm text-white/80">{{ lightbox.i + 1 }} / {{ lightbox.list.length }}</p>
        </template>
      </div>
    </Teleport>
  </section>
</template>
