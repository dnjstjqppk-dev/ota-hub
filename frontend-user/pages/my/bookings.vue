<script setup lang="ts">
/** Booking history for the signed-in user (GET /bookings), grouped into upcoming / past / cancelled. */
import { computed, ref } from 'vue'
import { apiFetch } from '~/composables/useApi'
import { todayIso } from '~/composables/useUrlQuery'

const { t } = useI18n()
useHead({ title: t('my.bookings') })
const bookings = ref<any[]>([])
const state = ref<'loading' | 'ready' | 'error'>('loading')
const tab = ref<'upcoming' | 'past' | 'closed'>('upcoming')

const CANCELLED = ['CANCELLED', 'REFUNDED', 'EXPIRED', 'FAILED']
const groups = computed(() => {
  const t = todayIso()
  const up: any[] = [], past: any[] = [], closed: any[] = []
  for (const b of bookings.value) {
    if (CANCELLED.includes(b.status)) closed.push(b)
    else if (b.status === 'COMPLETED' || (b.serviceEnd || b.serviceStart) < t) past.push(b)
    else up.push(b)
  }
  up.sort((a, b) => String(a.serviceStart).localeCompare(String(b.serviceStart)))
  past.sort((a, b) => String(b.serviceStart).localeCompare(String(a.serviceStart)))
  return { upcoming: up, past, closed }
})
const TAB_IDS = ['upcoming', 'past', 'closed'] as const
const TABS = computed(() => TAB_IDS.map((id) => ({ id, label: t(`my.tab_${id}`) })))

async function load() {
  state.value = 'loading'
  const r = await apiFetch('/bookings')
  if (!r.ok) { state.value = 'error'; return }
  bookings.value = r.data.bookings || []
  state.value = 'ready'
}
</script>

<template>
  <MyShell :title="$t('my.bookings')" :subtitle="$t('my.bookingsSub')" @ready="load">
    <div class="mb-4 flex gap-1.5" role="tablist">
      <button v-for="tb in TABS" :key="tb.id" type="button" role="tab" class="chip" :aria-selected="tab === tb.id" :aria-pressed="tab === tb.id" @click="tab = tb.id">
        {{ tb.label }}<span v-if="state === 'ready'" class="tabular text-ink-subtle">{{ groups[tb.id].length }}</span>
      </button>
    </div>
    <ResultsState :state="state" :count="groups[tab].length" icon="bookings" :empty-title="$t(`my.empty_${tab}`)" :error-title="$t('my.bookingsFail')" @retry="load">
      <template #empty-actions><NuxtLink v-if="tab === 'upcoming'" :to="$localePath('/')" class="btn-primary">{{ $t('my.searchTrips') }}</NuxtLink></template>
      <ul class="space-y-3"><li v-for="b in groups[tab]" :key="b.id"><BookingRow :b="b" /></li></ul>
    </ResultsState>
  </MyShell>
</template>
