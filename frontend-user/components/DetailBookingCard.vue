<script setup lang="ts">
/**
 * Price + booking entry for a product detail page (design system "Horizon").
 * Dates and party size are read from / written to the URL (carried over from the results page) and
 * passed to checkout, where the server prices the order. The price shown is the catalogue reference
 * price for `unitLabel`; nothing here estimates taxes or totals the server has not confirmed.
 */
import { computed, onMounted, ref, watch } from 'vue'
import { apiFetch, formatKrw, useApiUrl } from '~/composables/useApi'
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
const reason = computed(() => (props.item.bookable_reason && BOOKABLE_REASON_KO[props.item.bookable_reason]) || '지금은 직접 예약할 수 없는 상품이에요.')
/** #27: affiliate outlink supplied by the catalog API (path under the API base). Rendered only when the server emits a real link. */
const outlinkPath = computed(() => (typeof props.item.outlink_path === 'string' && props.item.outlink_path.startsWith('/out/') ? props.item.outlink_path : ''))
const outlinkUrl = computed(() => (outlinkPath.value ? useApiUrl(outlinkPath.value) : ''))

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
        <div v-if="showSlots">
          <p class="mb-1.5 text-xs font-semibold text-ink-muted">이용 시간대 <span class="font-normal text-ink-subtle">(선택 사항 · 확정 아님)</span></p>
          <p v-if="slotsLoading" class="text-xs text-ink-subtle">시간대를 불러오는 중…</p>
          <p v-else-if="!slots.length" class="text-xs text-ink-subtle">등록된 시간대가 없어요. 날짜만 정해 예약하세요.</p>
          <div v-else class="flex flex-wrap gap-1.5" role="radiogroup" aria-label="이용 시간대">
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
              {{ s.start_time }}{{ s.end_time ? `–${s.end_time}` : '' }} · {{ slotLeft(s) }}석
            </button>
          </div>
        </div>
        <p v-if="days" class="text-sm text-ink-muted">{{ fmtDay(startDate, true) }} – {{ fmtDay(endDate, true) }} · <b class="text-ink">{{ days }}일</b></p>
        <p v-if="overCapacity" class="rounded-xl bg-warning-soft px-3 py-2 text-sm text-ink">이 상품은 최대 {{ maxPeople }}명까지 이용할 수 있어요.</p>
      </template>

      <PolicyNotice :domain="domain" :item-id="item.id" v-slot="{ policy, loaded, hoursLabel, pct }">
        <div v-if="policy" class="space-y-1 text-sm">
          <p v-if="policy.free_cancel_hours !== null && policy.free_cancel_hours !== undefined" class="flex items-center gap-1.5 font-semibold text-success">
            <AppIcon name="check" :size="16" />이용 {{ hoursLabel(policy.free_cancel_hours) }} 전까지 무료 취소
          </p>
          <ul v-if="policy.tiers?.length" class="space-y-0.5 text-ink-muted">
            <li v-for="(t, i) in policy.tiers" :key="i" class="flex items-center gap-1.5">
              <AppIcon name="refund" :size="14" class="text-ink-subtle" />{{ hoursLabel(t.hours_before) }} 전 취소 시 {{ pct(t.refund_bps) }} 환불{{ t.note ? ` · ${t.note}` : '' }}
            </li>
          </ul>
          <p v-if="policy.no_show_fee_bps" class="text-ink-muted">노쇼 시 요금의 {{ pct(policy.no_show_fee_bps) }} 위약금</p>
          <p class="text-ink-muted">일정 변경은 지원하지 않아요. 날짜를 바꾸려면 취소 후 다시 예약해 주세요.</p>
          <p v-if="policy.note" class="text-xs text-ink-subtle">{{ policy.note }}</p>
        </div>
        <p v-else-if="loaded" class="flex items-center gap-1.5 text-sm font-semibold" :class="cancellation === 'FREE' ? 'text-success' : 'text-danger'">
          <AppIcon :name="cancellation === 'FREE' ? 'check' : 'close'" :size="16" />
          {{ cancellation === 'FREE' ? '이용 전날까지 무료 취소 (정확한 기한은 결제 전 표시)' : '환불 불가 상품' }}
        </p>
      </PolicyNotice>

      <template v-if="item.bookable">
        <NuxtLink v-if="datesReady && !overCapacity" :to="{ path: '/checkout', query }" class="btn-primary w-full py-3" data-testid="book-now">예약하기</NuxtLink>
        <button v-else-if="!datesReady" type="button" class="btn-primary w-full py-3" data-testid="pick-date" @click="askDates">날짜 선택</button>
        <span v-else class="block rounded-xl bg-surface-sunken py-3 text-center text-sm font-semibold text-ink-subtle">인원 초과</span>
        <p v-if="highlight && !datesReady" class="text-sm font-medium text-primary" role="status">{{ dateMode === 'range' ? `${startLabel}과 ${endLabel}을 선택해 주세요.` : `${startLabel}을 선택해 주세요.` }}</p>
      </template>
      <template v-else>
        <p class="rounded-xl bg-surface-sunken px-4 py-3 text-sm text-ink-muted" data-testid="not-bookable">{{ reason }}</p>
        <a v-if="outlinkUrl" :href="outlinkUrl" target="_blank" rel="noopener sponsored" class="btn-primary block w-full py-3 text-center" data-testid="outlink-book">제휴사 사이트에서 예약하기</a>
        <p v-if="outlinkUrl" class="text-xs text-ink-subtle">예약·결제는 외부 제휴사 사이트에서 진행돼요. 이 상품은 GetForTrip에서 직접 판매하지 않아요.</p>
      </template>

      <PriceAlertButton :domain="domain" :item-id="item.id" :label="alertLabel" :current-price="priceKrw" />
    </div>
  </aside>
</template>
