<script setup lang="ts">
/**
 * Price + booking entry for a product detail page (design system "Horizon").
 * Dates and party size are read from / written to the URL (carried over from the results page) and
 * passed to checkout, where the server prices the order. The price shown is the catalogue reference
 * price for `unitLabel`; nothing here estimates taxes or totals the server has not confirmed.
 */
import { computed, onMounted, ref, watch } from 'vue'
import { apiFetch, formatKrw, useApiUrl } from '~/composables/useApi'
const { t, te, locale } = useI18n()
import { daysBetween, fmtDay, qDate, qInt, todayIso, useUrlQuery } from '~/composables/useUrlQuery'
import { appendOutlinkContext } from '~/composables/useOutlinkQuery'
import { useCartStore } from '~/stores/cart'

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
}>(), { dateMode: 'single', startLabel: '', endLabel: '', people: false, maxPeople: 9 })
const startText = computed(() => props.startLabel || t('detail.card.startDefault'))
const endText = computed(() => props.endLabel || t('detail.card.endDefault'))

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

// #88: activity time slots for the picked date. Real rows only (the API
// returns none when the partner registered none); the pick travels to
// checkout as a labelled, unconfirmed request — never as a reservation.
const slots = ref<any[]>([])
const slotsLoading = ref(false)
const slotStart = ref('')
const showSlots = computed(() => props.domain === 'ACTIVITY' && !!props.item?.bookable && !!startDate.value)
async function loadSlots() {
  slotStart.value = ''
  if (!showSlots.value) { slots.value = []; return }
  slotsLoading.value = true
  try {
    const r = await apiFetch(`/activities/${props.item.id}/slots?date=${startDate.value}`)
    slots.value = r.ok && Array.isArray((r.data as any).slots) ? (r.data as any).slots : []
  } catch { slots.value = [] } finally { slotsLoading.value = false }
}
watch([() => props.domain, () => props.item?.id, startDate], loadSlots)
onMounted(loadSlots)
const slotLeft = (s: any) => Math.max(0, Number(s.max_capacity || 0) - Number(s.booked_count || 0))

const query = computed(() => ({
  domain: props.domain, itemId: props.item.id, ...(props.checkoutQuery || {}),
  ...(startDate.value ? { startDate: startDate.value } : {}),
  ...(props.dateMode === 'range' && endDate.value ? { endDate: endDate.value } : {}),
  ...(props.people ? { adults: String(adults.value), ...(children.value ? { children: String(children.value) } : {}) } : {}),
  ...(slotStart.value ? { slotStart: slotStart.value } : {})
}))
const reason = computed(() => {
  const code = props.item.bookable_reason
  return (code && te(`detail.reason.${code}`) ? t(`detail.reason.${code}`) : null) || t('detail.card.notBookableDefault')
})
/** #27: affiliate outlink supplied by the catalog API (path under the API base). Rendered only when the server emits a real link. */
const outlinkPath = computed(() => (typeof props.item.outlink_path === 'string' && props.item.outlink_path.startsWith('/out/') ? props.item.outlink_path : ''))
/** Phase 3: carry picked dates/party plus results-page context into the click so the partner deeplink keeps them. */
const outlinkUrl = computed(() => {
  if (!outlinkPath.value) return ''
  const q = route.query as Record<string, unknown>
  const one = (v: unknown) => (typeof v === 'string' ? v : '')
  return useApiUrl(appendOutlinkContext(outlinkPath.value, {
    dest: one(q.dest), origin: one(q.origin),
    startDate: startDate.value, ...(props.dateMode === 'range' && endDate.value ? { endDate: endDate.value } : {}),
    ...(props.people ? { adults: adults.value, ...(children.value ? { children: children.value } : {}) } : {}),
    rooms: one(q.rooms), cabin: one(q.cabin),
  }))
})
/** Phase 1 trade type: server-computed bookability decides, never client guesses. */
const tradeType = computed<'DIRECT' | 'AFFILIATE' | null>(() => {
  if (outlinkPath.value) return 'AFFILIATE'
  if (props.item.bookable) return 'DIRECT'
  return null
})

const cart = useCartStore()
const addedTick = ref(false)
async function addToCart() {
  const ok = await cart.add({
    domain: props.domain, itemId: props.item.id,
    unitId: (props.item as any).unit_id || null,
    startDate: startDate.value || undefined,
    endDate: props.dateMode === 'range' ? endDate.value || undefined : undefined,
    adults: props.people ? adults.value : 1,
    children: props.people ? children.value : undefined,
    title: props.item.title || props.item.name_ko || props.item.name || props.alertLabel,
  })
  if (ok) { addedTick.value = true; setTimeout(() => (addedTick.value = false), 2500) }
}

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
      <TradeTypeBadge v-if="tradeType" :trade-type="tradeType" />
      <div>
        <p class="text-xs text-ink-subtle">{{ unitLabel }} {{ t('detail.card.refPrice') }}</p>
        <p class="text-2xl font-extrabold text-ink tabular" data-testid="ref-price">{{ priceKrw ? formatKrw(priceKrw) : t('detail.card.noPrice') }}</p>
        <p class="mt-1 text-xs text-ink-subtle">{{ item.price_notice || t('detail.card.refPriceDefault') }} · {{ t('detail.card.priceNotice') }}</p>
      </div>

      <template v-if="item.bookable || outlinkPath">
        <DateRangePicker v-if="dateMode === 'range'" v-model:start="startDate" v-model:end="endDate" :start-label="startLabel" :end-label="endLabel" unit="day" :min="today" :max-range="60" :invalid="highlight" />
        <DateRangePicker v-else-if="dateMode === 'single'" v-model:start="startDate" mode="single" :start-label="startLabel" :min="today" :invalid="highlight" />
        <GuestPicker v-if="people" v-model:adults="adults" v-model:children="children" :show-rooms="false" :label="t('search.travelers')" />
        <div v-if="showSlots">
          <p class="mb-1.5 text-xs font-semibold text-ink-muted">{{ t('detail.card.slots') }} <span class="font-normal text-ink-subtle">{{ t('detail.card.slotsOptional') }}</span></p>
          <p v-if="slotsLoading" class="text-xs text-ink-subtle">{{ t('detail.card.slotsLoading') }}</p>
          <p v-else-if="!slots.length" class="text-xs text-ink-subtle">{{ t('detail.card.slotsEmpty') }}</p>
          <div v-else class="flex flex-wrap gap-1.5" role="radiogroup" :aria-label="t('detail.card.slots')">
            <button
              v-for="s in slots"
              :key="s.start_time"
              type="button"
              role="radio"
              :aria-checked="slotStart === s.start_time"
              :disabled="slotLeft(s) <= 0"
              :class="['rounded-lg border px-3 py-1.5 text-xs font-semibold tabular', slotStart === s.start_time ? 'border-primary bg-primary-soft text-primary' : 'border-line text-ink hover:bg-surface-sunken', slotLeft(s) <= 0 ? 'cursor-not-allowed opacity-40' : '']"
              @click="slotStart = slotStart === s.start_time ? '' : s.start_time"
            >
              {{ s.start_time }}{{ s.end_time ? `–${s.end_time}` : '' }} · {{ slotLeft(s) }}{{ t('detail.card.slotSeats') }} · {{ t('search.adults') }} {{ formatKrw(s.price_adult_minor) }}
            </button>
          </div>
        </div>
        <p v-if="days" class="text-sm text-ink-muted">{{ fmtDay(startDate, true, locale) }} – {{ fmtDay(endDate, true, locale) }} · <b class="text-ink">{{ days }}{{ t('search.days') }}</b></p>
        <p v-if="overCapacity" class="rounded-xl bg-warning-soft px-3 py-2 text-sm text-ink">{{ t('detail.card.overCapacity', { n: maxPeople }) }}</p>
      </template>

      <PolicyNotice :domain="domain" :item-id="item.id" v-slot="{ policy, loaded, hoursLabel, pct }">
        <div v-if="policy" class="space-y-1 text-sm">
          <p v-if="policy.free_cancel_hours !== null && policy.free_cancel_hours !== undefined" class="flex items-center gap-1.5 font-semibold text-success">
            <AppIcon name="check" :size="16" />{{ t('detail.card.freeCancelUntil', { h: hoursLabel(policy.free_cancel_hours) }) }}
          </p>
          <ul v-if="policy.tiers?.length" class="space-y-0.5 text-ink-muted">
            <li v-for="(t, i) in policy.tiers" :key="i" class="flex items-center gap-1.5">
              <AppIcon name="refund" :size="14" class="text-ink-subtle" />{{ t('detail.card.tierRefund', { h: hoursLabel(t.hours_before), p: pct(t.refund_bps) }) }}{{ t.note ? ` · ${t.note}` : '' }}
            </li>
          </ul>
          <p v-if="policy.no_show_fee_bps" class="text-ink-muted">{{ t('detail.card.noShowFee', { p: pct(policy.no_show_fee_bps) }) }}</p>
          <p v-if="!['FLIGHT', 'HOTEL'].includes(domain)" class="text-ink-muted">{{ t('detail.card.noChange') }}</p>
          <p v-if="policy.note" class="text-xs text-ink-subtle">{{ policy.note }}</p>
        </div>
        <p v-else-if="loaded" class="flex items-center gap-1.5 text-sm font-semibold" :class="cancellation === 'FREE' ? 'text-success' : 'text-danger'">
          <AppIcon :name="cancellation === 'FREE' ? 'check' : 'close'" :size="16" />
          {{ cancellation === 'FREE' ? t('detail.card.freeCancelFallback') : t('detail.card.nonRefundable') }}
        </p>
      </PolicyNotice>

      <template v-if="item.bookable">
        <NuxtLink v-if="datesReady && !overCapacity" :to="$localePath({ path: '/checkout', query })" class="btn-primary w-full py-3" data-testid="book-now">{{ t('common.bookNow') }}</NuxtLink>
        <button v-else-if="!datesReady" type="button" class="btn-primary w-full py-3" data-testid="pick-date" @click="askDates">{{ t('search.selectDates') }}</button>
        <button v-if="datesReady && !overCapacity && !slotStart" type="button" class="btn-secondary mt-2 w-full py-3" :disabled="cart.adding" data-testid="add-cart" @click="addToCart">{{ cart.adding ? t('detail.card.adding') : addedTick ? t('detail.card.added') : t('detail.card.addCart') }}</button>
        <p v-if="slotStart" class="text-xs text-ink-subtle">{{ t('detail.card.slotSingle') }}</p>
        <p v-if="cart.error" class="text-xs font-medium text-danger" role="alert">{{ cart.error }}</p>
        <span v-else class="block rounded-xl bg-surface-sunken py-3 text-center text-sm font-semibold text-ink-subtle">{{ t('detail.card.overLimit') }}</span>
        <p v-if="highlight && !datesReady" class="text-sm font-medium text-primary" role="status">{{ dateMode === 'range' ? t('detail.card.pickRange', { a: startText, b: endText }) : t('detail.card.pickSingle', { a: startText }) }}</p>
      </template>
      <template v-else>
        <p class="rounded-xl bg-surface-sunken px-4 py-3 text-sm text-ink-muted" data-testid="not-bookable">{{ reason }}</p>
        <a v-if="outlinkUrl" :href="outlinkUrl" target="_blank" rel="noopener sponsored" class="btn-primary block w-full py-3 text-center" data-testid="outlink-book">{{ t('detail.card.outlinkBook') }}</a>
        <p v-if="outlinkUrl" class="text-xs text-ink-subtle">{{ t('detail.card.outlinkNote') }}</p>
      </template>

      <PriceAlertButton :domain="domain" :item-id="item.id" :label="alertLabel" :current-price="priceKrw" />
    </div>
  </aside>
</template>
