<script setup lang="ts">
/**
 * Trade-type badge (Phase 1): who sells this product and where money moves.
 * DIRECT = sold on getfortrip, paid via PG, voucher issued after confirmation.
 * AFFILIATE = sold on a partner site via outlink; getfortrip takes no payment.
 * The parent derives the value from server fields (bookable / outlink_path).
 * @example <TradeTypeBadge trade-type="DIRECT" />
 * @example <TradeTypeBadge trade-type="AFFILIATE" :show-note="false" size="sm" />
 */
import { computed } from 'vue'

/** Server-derived trade branch; parents map bookable/outlink_path to this. */
export type TradeType = 'DIRECT' | 'AFFILIATE'

const LABEL: Record<TradeType, string> = {
  DIRECT: '직접판매 · 즉시 바우처',
  AFFILIATE: '제휴 연결'
}
const NOTE: Record<TradeType, string> = {
  DIRECT: 'getfortrip에서 결제하고 공급사 확정 후 바우처를 발급해요.',
  AFFILIATE: '예약·결제는 외부 제휴사 사이트에서 진행돼요.'
}

const props = withDefaults(defineProps<{
  tradeType: TradeType
  /** Hide the one-line explainer (list rows); detail cards keep it visible. */
  showNote?: boolean
  /** Compact pill for list rows; regular pill for detail cards. */
  size?: 'sm' | 'md'
}>(), { showNote: true, size: 'md' })

const label = computed(() => LABEL[props.tradeType])
const note = computed(() => NOTE[props.tradeType])
const badgeClass = computed(() =>
  props.tradeType === 'DIRECT'
    ? 'bg-primary-soft text-primary'
    : 'bg-surface-sunken text-ink-muted'
)
const icon = computed(() => (props.tradeType === 'DIRECT' ? 'bolt' : 'external'))
const iconSize = computed(() => (props.size === 'sm' ? 12 : 14))
const sizeClass = computed(() => (props.size === 'sm' ? 'px-2 py-0.5 text-2xs' : 'px-2.5 py-1 text-xs'))
</script>

<template>
  <div data-testid="trade-type-badge" role="note" :aria-label="`거래 유형: ${label}`">
    <span :class="['inline-flex items-center gap-1.5 rounded-lg font-bold', sizeClass, badgeClass]">
      <AppIcon :name="icon" :size="iconSize" />{{ label }}
    </span>
    <p v-if="showNote" class="mt-1.5 text-xs leading-relaxed text-ink-subtle">{{ note }}</p>
  </div>
</template>
