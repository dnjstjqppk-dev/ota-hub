<script setup lang="ts">
/**
 * Price + booking entry for a product detail page (design system "Horizon").
 * Dates and party size are read from / written to the URL (carried over from the results page) and
 * passed to checkout, where the server prices the order. The price shown is the catalogue reference
 * price for `unitLabel`; nothing here estimates taxes or totals the server has not confirmed.
 */
import { computed, ref, watch } from 'vue'
import { formatKrw } from '~/composables/useApi'
import { BOOKABLE_REASON_KO } from '~/composables/useCatalogDetail'
import { daysBetween, fmtDay, qDate, qInt, todayIso, useUrlQuery } from '~/composables/useUrlQuery'

const props = withDefaults(defineProps<{
  item: any
  domain: string
  priceKrw: number | null
  unitLabel: string
  cancellation: 'FREE' | 'NON_REFUNDABLE'
  alertLabel: string
  checkoutQuery?: Record<string, string>
  /** 'single' = one service date, 'range' = start + end (car rental), 'none' = no date picker. */
  dateMode?: 'single' | 'range' | 'none'
  startLabel?: string
  endLabel?: string
  /** Show adult/child counters (per-person products). */
  people?: boolean
  maxPeople?: number
}>(), { dateMode: 'single', startLabel: '이용일', endLabel: '반납일', people: false, maxPeople: 9 })

const { route, patch } = useUrlQuery()
const today = ref(todayIso())

const startDate = ref(qDate(route.query.startDate || route.query.date))
const endDate = ref(qDate(route.query.endDate))
const adults = ref(qInt(route.query.adults, 1, 1, 9))
const children = ref(qInt(route.query.children, 0, 0, 8))
watch([startDate, endDate, adults, children], () => {
  patch({ startDate: startDate.value, endDate: props.dateMode === 'range' ? endDate.value : '', adults: props.people && adults.value !== 1 ? adults.value : '', children: props.people ? children.value : '' })
})

const needsDate = computed(() => props.dateMode !== 'none')
const datesReady = computed(() => !needsDate.value || (!!startDate.value && (props.dateMode !== 'range' || (!!endDate.value && endDate.value > startDate.value))))
const days = computed(() => (props.dateMode === 'range' && startDate.value && endDate.value ? daysBetween(startDate.value, endDate.value) : 0))
const overCapacity = computed(() => props.people && adults.value + children.value > props.maxPeople)

const query = computed(() => ({
  domain: props.domain, itemId: props.item.id, ...(props.checkoutQuery || {}),
  ...(startDate.value ? { startDate: startDate.value } : {}),
  ...(props.dateMode === 'range' && endDate.value ? { endDate: endDate.value } : {}),
  ...(props.people ? { adults: String(adults.value), ...(children.value ? { children: String(children.value) } : {}) } : {})
}))
const reason = computed(() => (props.item.bookable_reason && BOOKABLE_REASON_KO[props.item.bookable_reason]) || '지금은 직접 예약할 수 없는 상품이에요.')

const highlight = ref(false)
const card = ref<HTMLElement | null>(null)
function askDates() {
  highlight.value = true
  card.value?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  setTimeout(() => card.value?.querySelector<HTMLElement>('[aria-haspopup=dialog]')?.click(), 350)
}
watch(datesReady, (v) => { if (v) highlight.value = false })
defineExpose({ askDates })
</script>

<template>
  <aside class="lg:sticky lg:top-24 lg:h-fit" data-testid="booking-card">
    <div ref="card" :class="['card space-y-4 p-5 shadow-card transition-colors', highlight ? 'border-primary shadow-focus' : '']">
      <div>
        <p class="text-xs text-ink-subtle">{{ unitLabel }} 기준 참고가</p>
        <p class="text-2xl font-extrabold text-ink tabular" data-testid="ref-price">{{ priceKrw ? formatKrw(priceKrw) : '가격 정보 없음' }}</p>
        <p class="mt-1 text-xs text-ink-subtle">{{ item.price_notice || '참고 가격' }} · 세금·수수료를 포함한 최종 금액은 결제 전 확인 화면에서 확정돼요.</p>
      </div>

      <template v-if="item.bookable">
        <DateRangePicker v-if="dateMode === 'range'" v-model:start="startDate" v-model:end="endDate" :start-label="startLabel" :end-label="endLabel" unit="day" :min="today" :max-range="60" :invalid="highlight" />
        <DateRangePicker v-else-if="dateMode === 'single'" v-model:start="startDate" mode="single" :start-label="startLabel" :min="today" :invalid="highlight" />
        <GuestPicker v-if="people" v-model:adults="adults" v-model:children="children" :show-rooms="false" label="인원" />
        <p v-if="days" class="text-sm text-ink-muted">{{ fmtDay(startDate, true) }} – {{ fmtDay(endDate, true) }} · <b class="text-ink">{{ days }}일</b></p>
        <p v-if="overCapacity" class="rounded-xl bg-warning-soft px-3 py-2 text-sm text-ink">이 상품은 최대 {{ maxPeople }}명까지 이용할 수 있어요.</p>
      </template>

      <p class="flex items-center gap-1.5 text-sm font-semibold" :class="cancellation === 'FREE' ? 'text-success' : 'text-danger'">
        <AppIcon :name="cancellation === 'FREE' ? 'check' : 'close'" :size="16" />
        {{ cancellation === 'FREE' ? '이용 전날까지 무료 취소 (정확한 기한은 결제 전 표시)' : '환불 불가 상품' }}
      </p>

      <template v-if="item.bookable">
        <NuxtLink v-if="datesReady && !overCapacity" :to="{ path: '/checkout', query }" class="btn-primary w-full py-3" data-testid="book-now">예약하기</NuxtLink>
        <button v-else-if="!datesReady" type="button" class="btn-primary w-full py-3" data-testid="pick-date" @click="askDates">날짜 선택</button>
        <span v-else class="block rounded-xl bg-surface-sunken py-3 text-center text-sm font-semibold text-ink-subtle">인원 초과</span>
        <p v-if="highlight && !datesReady" class="text-sm font-medium text-primary" role="status">{{ dateMode === 'range' ? `${startLabel}과 ${endLabel}을 선택해 주세요.` : `${startLabel}을 선택해 주세요.` }}</p>
      </template>
      <p v-else class="rounded-xl bg-surface-sunken px-4 py-3 text-sm text-ink-muted" data-testid="not-bookable">{{ reason }}</p>

      <PriceAlertButton :domain="domain" :item-id="item.id" :label="alertLabel" :current-price="priceKrw" />
    </div>
  </aside>
</template>
