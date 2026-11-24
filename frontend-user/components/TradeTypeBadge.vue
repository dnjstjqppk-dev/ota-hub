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

const { t } = useI18n()
const LABEL: Record<TradeType, () => string> = {
  DIRECT: () => t('trade.direct'),
  AFFILIATE: () => t('trade.affiliate')
}
const NOTE: Record<TradeType, () => string> = {
  DIRECT: () => t('trade.directNote'),
  AFFILIATE: () => t('trade.affiliateNote')
}

const props = withDefaults(defineProps<{
  tradeType: TradeType
  /** Hide the one-line explainer (list rows); detail cards keep it visible. */
  showNote?: boolean
  /** Compact pill for list rows; regular pill for detail cards. */
  size?: 'sm' | 'md'
}>(), { showNote: true, size: 'md' })

const label = computed(() => LABEL[props.tradeType]())
const note = computed(() => NOTE[props.tradeType]())
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
  <div data-testid="trade-type-badge" role="note" :aria-label="`${t('trade.type')}: ${label}`">
    <span :class="['inline-flex items-center gap-1.5 rounded-lg font-bold', sizeClass, badgeClass]">
      <AppIcon :name="icon" :size="iconSize" />{{ label }}
    </span>
    <p v-if="showNote" class="mt-1.5 text-xs leading-relaxed text-ink-subtle">{{ note }}</p>
  </div>
</template>
