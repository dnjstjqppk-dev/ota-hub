<script setup lang="ts">
/**
 * Account overview (design system "Horizon"). Every number here is read from the API for the signed-in
 * user: bookings, claimed coupons, wishlist items. Nothing is pre-filled or simulated.
 */
import { computed, ref } from 'vue'
import { useAuthStore } from '~/stores/auth'
import { apiFetch } from '~/composables/useApi'
import { todayIso } from '~/composables/useUrlQuery'

const { t } = useI18n()
useHead({ title: t('my.nav') })
const auth = useAuthStore()
const bookings = ref<any[]>([])
const counts = ref<{ coupons: number | null; wishlist: number | null }>({ coupons: null, wishlist: null })
const state = ref<'loading' | 'ready' | 'error'>('loading')

const CLOSED = ['COMPLETED', 'CANCELLED', 'REFUNDED', 'EXPIRED', 'FAILED']
const upcoming = computed(() => {
  const t = todayIso()
  return bookings.value.filter((b) => !CLOSED.includes(b.status) && (b.serviceEnd || b.serviceStart) >= t)
    .sort((a, b) => String(a.serviceStart).localeCompare(String(b.serviceStart)))
})
const awaiting = computed(() => bookings.value.filter((b) => b.status === 'AWAITING_PAYMENT'))

async function load() {
  state.value = 'loading'
  const [b, c, w] = await Promise.all([apiFetch('/bookings'), apiFetch('/user/coupons'), apiFetch('/wishlist')])
  if (!b.ok) { state.value = 'error'; return }
  bookings.value = b.data.bookings || []
  counts.value = { coupons: c.ok ? (c.data.coupons || []).length : null, wishlist: w.ok ? (w.data.wishlist || []).length : null }
  state.value = 'ready'
}
</script>

<template>
  <MyShell :title="$t('my.greeting', { name: auth.user?.fullName || $t('my.member') })" :subtitle="$t('my.overviewSub')" @ready="load">
    <div v-if="state === 'error'" class="card p-6 text-center text-sm" role="alert">
      <span class="text-ink-muted">{{ $t('my.loadFail') }}</span>
      <button type="button" class="ml-2 font-semibold text-primary" @click="load">{{ $t('common.retry') }}</button>
    </div>
    <template v-else>
      <div class="grid gap-3 sm:grid-cols-3">
        <NuxtLink :to="$localePath('/my/bookings')" class="card p-4 transition-shadow hover:shadow-pop">
          <p class="text-xs text-ink-subtle">{{ $t('my.upcoming') }}</p>
          <p class="mt-1 text-2xl font-extrabold text-ink tabular">{{ state === 'ready' ? upcoming.length : '–' }}</p>
        </NuxtLink>
        <NuxtLink :to="$localePath('/my/coupons')" class="card p-4 transition-shadow hover:shadow-pop">
          <p class="text-xs text-ink-subtle">{{ $t('my.couponsHeld') }}</p>
          <p class="mt-1 text-2xl font-extrabold text-ink tabular">{{ counts.coupons ?? '–' }}</p>
        </NuxtLink>
        <NuxtLink :to="$localePath('/my/wishlist')" class="card p-4 transition-shadow hover:shadow-pop">
          <p class="text-xs text-ink-subtle">{{ $t('my.wishlistCount') }}</p>
          <p class="mt-1 text-2xl font-extrabold text-ink tabular">{{ counts.wishlist ?? '–' }}</p>
        </NuxtLink>
      </div>

      <div v-if="awaiting.length" class="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-ink" role="status">
        <span>{{ $t('my.awaitingMsg', { n: awaiting.length }) }}</span>
        <NuxtLink :to="$localePath(`/my/bookings/${awaiting[0].id}`)" class="font-semibold text-primary hover:underline">{{ $t('my.checkIt') }}</NuxtLink>
      </div>

      <section class="mt-8" aria-labelledby="h-up">
        <div class="mb-3 flex items-end justify-between">
          <h2 id="h-up" class="text-lg font-bold text-ink">{{ $t('my.upcomingTrips') }}</h2>
          <NuxtLink :to="$localePath('/my/bookings')" class="text-sm font-semibold text-primary hover:underline">{{ $t('my.allBookings') }}</NuxtLink>
        </div>
        <div v-if="state === 'loading'" class="space-y-3"><div v-for="n in 2" :key="n" class="h-20 animate-pulse rounded-card bg-surface-sunken" /></div>
        <div v-else-if="!upcoming.length" class="card px-6 py-10 text-center">
          <span class="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-soft text-primary"><AppIcon name="flight" /></span>
          <p class="mt-4 font-bold text-ink">{{ $t('my.noTrips') }}</p>
          <p class="mt-1 text-sm text-ink-muted">{{ $t('my.noTripsSub') }}</p>
          <NuxtLink :to="$localePath('/')" class="btn-primary mt-5">{{ $t('my.searchTrips') }}</NuxtLink>
        </div>
        <ul v-else class="space-y-3"><li v-for="b in upcoming.slice(0, 5)" :key="b.id"><BookingRow :b="b" /></li></ul>
      </section>
    </template>
  </MyShell>
</template>
