<script setup lang="ts">
/** Booking history for the signed-in user (GET /bookings), grouped into upcoming / past / cancelled. */
import { computed, ref } from 'vue'
import { apiFetch } from '~/composables/useApi'
import { todayIso } from '~/composables/useUrlQuery'

useHead({ title: '예약 내역' })
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
const TABS = [{ id: 'upcoming', label: '예정' }, { id: 'past', label: '지난 여행' }, { id: 'closed', label: '취소·실패' }] as const

async function load() {
  state.value = 'loading'
  const r = await apiFetch('/bookings')
  if (!r.ok) { state.value = 'error'; return }
  bookings.value = r.data.bookings || []
  state.value = 'ready'
}
</script>

<template>
  <MyShell title="예약 내역" subtitle="결제·확정 상태는 공급사 처리 결과에 따라 바뀌어요." @ready="load">
    <div class="mb-4 flex gap-1.5" role="tablist">
      <button v-for="t in TABS" :key="t.id" type="button" role="tab" class="chip" :aria-selected="tab === t.id" :aria-pressed="tab === t.id" @click="tab = t.id">
        {{ t.label }}<span v-if="state === 'ready'" class="tabular text-ink-subtle">{{ groups[t.id].length }}</span>
      </button>
    </div>
    <ResultsState :state="state" :count="groups[tab].length" icon="bookings" :empty-title="tab === 'upcoming' ? '예정된 예약이 없어요' : tab === 'past' ? '지난 여행이 없어요' : '취소되거나 실패한 예약이 없어요'" error-title="예약 내역을 불러오지 못했어요" @retry="load">
      <template #empty-actions><NuxtLink v-if="tab === 'upcoming'" to="/" class="btn-primary">여행 검색하기</NuxtLink></template>
      <ul class="space-y-3"><li v-for="b in groups[tab]" :key="b.id"><BookingRow :b="b" /></li></ul>
    </ResultsState>
  </MyShell>
</template>
