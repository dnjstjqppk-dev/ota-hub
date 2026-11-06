<script setup lang="ts">
/** One booking in the account area. Status label and amounts come from GET /bookings as-is. */
import { formatKrw } from '~/composables/useApi'
import { fmtDay } from '~/composables/useUrlQuery'

defineProps<{ b: any }>()
const DOMAIN: Record<string, { label: string; icon: string }> = {
  HOTEL: { label: '숙소', icon: 'hotel' }, FLIGHT: { label: '항공권', icon: 'flight' }, TRAIN: { label: '기차', icon: 'train' }, CAR: { label: '렌터카', icon: 'car' },
  TRANSFER: { label: '공항 이동', icon: 'transfer' }, ACTIVITY: { label: '투어·티켓', icon: 'ticket' }, PACKAGE: { label: '항공+호텔', icon: 'package' }
}
function tone(s: string) {
  if (['VOUCHER_ISSUED', 'TICKETED', 'SUPPLIER_CONFIRMED', 'COMPLETED'].includes(s)) return 'bg-success-soft text-success'
  if (s === 'FAILED') return 'bg-danger-soft text-danger'
  if (['CANCELLED', 'REFUNDED', 'EXPIRED'].includes(s)) return 'bg-surface-sunken text-ink-muted'
  if (['AWAITING_PAYMENT', 'MANUAL_REVIEW_REQUIRED', 'CANCELLATION_REQUESTED', 'REFUND_PENDING'].includes(s)) return 'bg-warning-soft text-warning'
  return 'bg-primary-soft text-primary'
}
</script>

<template>
  <NuxtLink :to="`/my/bookings/${b.id}`" class="card group flex items-center gap-4 p-4 transition-shadow hover:shadow-pop sm:p-5">
    <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface-sunken text-ink-muted"><AppIcon :name="DOMAIN[b.domain]?.icon || 'bookings'" /></span>
    <div class="min-w-0 flex-1">
      <p class="flex flex-wrap items-center gap-2 text-xs text-ink-subtle">
        <span>{{ DOMAIN[b.domain]?.label || b.domain }}</span><span class="tabular">{{ b.bookingNumber }}</span>
        <span :class="['rounded-full px-2 py-0.5 font-semibold', tone(b.status)]">{{ b.statusLabel || b.status }}</span>
      </p>
      <p class="mt-1 line-clamp-1 font-semibold text-ink group-hover:text-primary">{{ b.title }}</p>
      <p class="text-sm text-ink-muted">{{ fmtDay(b.serviceStart, true) }}<template v-if="b.serviceEnd && b.serviceEnd !== b.serviceStart"> – {{ fmtDay(b.serviceEnd, true) }}</template></p>
    </div>
    <div class="hidden text-right sm:block">
      <p class="font-bold text-ink tabular">{{ formatKrw(b.totalMinor) }}</p>
    </div>
    <AppIcon name="chevron-right" :size="18" class="text-ink-subtle" />
  </NuxtLink>
</template>
