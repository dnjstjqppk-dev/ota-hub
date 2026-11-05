<script setup lang="ts">
/**
 * Price + booking entry for a product detail page. The price shown is the catalog
 * reference price; the payable amount is always computed by the server at checkout.
 */
import { computed } from 'vue'
import { formatKrw } from '~/composables/useApi'
import { BOOKABLE_REASON_KO } from '~/composables/useCatalogDetail'

const props = defineProps<{
  item: any
  domain: string
  priceKrw: number | null
  unitLabel: string
  cancellation: 'FREE' | 'NON_REFUNDABLE'
  alertLabel: string
  checkoutQuery?: Record<string, string>
}>()

const query = computed(() => ({ domain: props.domain, itemId: props.item.id, ...(props.checkoutQuery || {}) }))
const reason = computed(() => (props.item.bookable_reason && BOOKABLE_REASON_KO[props.item.bookable_reason]) || '지금은 직접 예약할 수 없는 상품입니다.')
</script>

<template>
  <aside class="rounded-3xl border border-slate-200 bg-white p-6 space-y-4 h-fit md:sticky md:top-20" data-testid="booking-card">
    <div>
      <div class="text-xs text-slate-500">{{ unitLabel }} 기준 참고가</div>
      <div class="text-2xl font-black text-slate-900" data-testid="ref-price">{{ priceKrw ? formatKrw(priceKrw) : '가격 정보 없음' }}</div>
      <p class="mt-1 text-[11px] text-slate-500">{{ item.price_notice || '참고 가격' }} · 세금·수수료를 포함한 최종 금액은 예약 단계에서 서버가 계산합니다.</p>
    </div>
    <p class="text-xs font-semibold" :class="cancellation === 'FREE' ? 'text-emerald-700' : 'text-rose-700'">
      {{ cancellation === 'FREE' ? '무료 취소 가능 (정확한 기한은 예약 단계에서 확인)' : '환불 불가 상품' }}
    </p>
    <NuxtLink
      v-if="item.bookable"
      :to="{ path: '/checkout', query }"
      class="block w-full rounded-xl bg-trip-blue px-5 py-3 text-center text-sm font-bold text-white hover:bg-blue-600"
      data-testid="book-now"
    >
      예약하기
    </NuxtLink>
    <p v-else class="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600" data-testid="not-bookable">{{ reason }}</p>
    <PriceAlertButton :domain="domain" :item-id="item.id" :label="alertLabel" :current-price="priceKrw" />
  </aside>
</template>
