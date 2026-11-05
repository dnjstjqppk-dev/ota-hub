<script setup lang="ts">
/**
 * Date picker (design system "Horizon") — single date or range.
 * Desktop: two-month popover anchored to the field. Phones: bottom sheet with stacked months.
 * Values are ISO dates (YYYY-MM-DD) in local time. Past dates (before `min`) and ranges longer
 * than `maxRange` nights cannot be chosen. Keyboard: arrows move, Enter/Space pick, Esc closes.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'

const props = withDefaults(defineProps<{
  start: string
  end?: string
  mode?: 'single' | 'range'
  label?: string
  startLabel?: string
  endLabel?: string
  min?: string
  maxRange?: number
  unit?: 'night' | 'day'
  invalid?: boolean
  compact?: boolean
}>(), { end: '', mode: 'range', label: '', startLabel: '시작', endLabel: '종료', min: '', maxRange: 30, unit: 'night', invalid: false, compact: false })

const emit = defineEmits<{ (e: 'update:start', v: string): void; (e: 'update:end', v: string): void }>()

const uid = `dp-${useId()}`
const open = ref(false)
const trigger = ref<HTMLElement | null>(null)
const panel = ref<HTMLElement | null>(null)
const isPhone = ref(false)
const panelStyle = ref<Record<string, string>>({})

// working selection (committed on 확인 / second pick)
const a = ref(props.start)
const b = ref(props.end)
const hover = ref('')
const focusDay = ref('')
const viewMonth = ref('') // YYYY-MM-01 of the first visible month (desktop)

// ------------------------------------------------------------------ date helpers (local time, ISO strings)
const pad = (n: number) => String(n).padStart(2, '0')
const toIso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const fromIso = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d) }
const addDays = (s: string, n: number) => { const d = fromIso(s); d.setDate(d.getDate() + n); return toIso(d) }
const addMonths = (s: string, n: number) => { const d = fromIso(s); return toIso(new Date(d.getFullYear(), d.getMonth() + n, 1)) }
const diff = (x: string, y: string) => Math.round((fromIso(y).getTime() - fromIso(x).getTime()) / 86400000)
const todayIso = () => toIso(new Date())
const WEEK = ['일', '월', '화', '수', '목', '금', '토']
const fmtShort = (s: string) => { if (!s) return ''; const d = fromIso(s); return `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEK[d.getDay()]})` }
const fmtLong = (s: string) => { const d = fromIso(s); return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${WEEK[d.getDay()]}요일` }

const minDay = computed(() => props.min || todayIso())
const maxDay = computed(() => addDays(minDay.value, 365))
const isRange = computed(() => props.mode === 'range')
const length = computed(() => (a.value && b.value ? diff(a.value, b.value) : 0))
const unitLabel = computed(() => (props.unit === 'night' ? '박' : '일'))

function monthGrid(first: string) {
  const d = fromIso(first)
  const lead = d.getDay()
  const days = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  const cells: (string | null)[] = Array(lead).fill(null)
  for (let i = 1; i <= days; i++) cells.push(toIso(new Date(d.getFullYear(), d.getMonth(), i)))
  while (cells.length % 7) cells.push(null)
  return { key: first, title: `${d.getFullYear()}년 ${d.getMonth() + 1}월`, cells }
}
const months = computed(() => {
  const first = viewMonth.value || minDay.value.slice(0, 8) + '01'
  return Array.from({ length: isPhone.value ? 7 : 2 }, (_, i) => monthGrid(addMonths(first, i)))
})
const canPrev = computed(() => (viewMonth.value || '') > minDay.value.slice(0, 8) + '01')
const canNext = computed(() => addMonths(viewMonth.value || minDay.value, 1) <= maxDay.value)

function disabled(day: string) {
  if (day < minDay.value || day > maxDay.value) return true
  // While picking the end of a range, days beyond maxRange are not selectable.
  if (isRange.value && a.value && !b.value && day > a.value && diff(a.value, day) > props.maxRange) return true
  return false
}
function state(day: string) {
  const end = b.value || (isRange.value && a.value && hover.value > a.value && !disabled(hover.value) ? hover.value : '')
  const start = day === a.value
  const isEnd = !!end && day === end
  const inRange = !!a.value && !!end && day > a.value && day < end
  // Range band behind the day circle: full width inside the range, half width at the ends.
  const band = !isRange.value || !end || (start && isEnd) ? '' : inRange ? 'before:inset-x-0' : start ? 'before:left-1/2 before:right-0' : isEnd ? 'before:left-0 before:right-1/2' : ''
  return { start, end: isEnd, inRange, today: day === todayIso(), band }
}

// ------------------------------------------------------------------ interaction
function pick(day: string) {
  if (disabled(day)) return
  if (!isRange.value) { a.value = day; commit(); return }
  if (!a.value || b.value || day <= a.value) { a.value = day; b.value = ''; return }
  b.value = day
  if (!isPhone.value) commit()
}
function commit() {
  if (isRange.value && (!a.value || !b.value)) return
  emit('update:start', a.value)
  if (isRange.value) emit('update:end', b.value)
  close()
}
function reset() { a.value = ''; b.value = '' }

function openPicker() {
  a.value = props.start; b.value = props.end
  const anchor = props.start || minDay.value
  viewMonth.value = anchor.slice(0, 8) + '01'
  if (viewMonth.value < minDay.value.slice(0, 8) + '01') viewMonth.value = minDay.value.slice(0, 8) + '01'
  focusDay.value = anchor
  isPhone.value = window.innerWidth < 640
  open.value = true
  place()
  nextTick(() => {
    const el = panel.value?.querySelector<HTMLElement>(`[data-day="${focusDay.value}"]`)
    if (isPhone.value) el?.scrollIntoView({ block: 'center' })
    el?.focus({ preventScroll: isPhone.value })
  })
}
function close() { open.value = false; hover.value = ''; trigger.value?.focus() }

function place() {
  if (!trigger.value || isPhone.value) { panelStyle.value = {}; return }
  const r = trigger.value.getBoundingClientRect()
  const vw = document.documentElement.clientWidth
  const width = Math.min(680, vw - 24)
  const left = Math.max(12, Math.min(r.left, vw - width - 12))
  panelStyle.value = { top: `${r.bottom + 8}px`, left: `${left}px`, width: `${width}px` }
}

function onKey(e: KeyboardEvent) {
  if (!open.value) return
  if (e.key === 'Escape') { e.preventDefault(); close(); return }
  const moves: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }
  if (e.key in moves && focusDay.value) {
    e.preventDefault()
    const next = addDays(focusDay.value, moves[e.key])
    if (next < minDay.value || next > maxDay.value) return
    focusDay.value = next
    if (!isPhone.value) {
      const lastShown = addMonths(viewMonth.value, 2)
      if (next >= lastShown) viewMonth.value = addMonths(viewMonth.value, 1)
      if (next < viewMonth.value) viewMonth.value = addMonths(viewMonth.value, -1)
    }
    nextTick(() => panel.value?.querySelector<HTMLElement>(`[data-day="${next}"]`)?.focus())
  }
}
function onDoc(e: Event) {
  if (!open.value || isPhone.value) return
  const t = e.target as Node
  if (trigger.value?.contains(t) || panel.value?.contains(t)) return
  open.value = false
}
function onScroll() { if (open.value) place() }

watch(open, (v) => { if (isPhone.value) document.documentElement.style.overflow = v ? 'hidden' : '' })
onMounted(() => {
  document.addEventListener('pointerdown', onDoc)
  document.addEventListener('keydown', onKey)
  window.addEventListener('scroll', onScroll, { passive: true, capture: true })
  window.addEventListener('resize', onScroll)
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDoc)
  document.removeEventListener('keydown', onKey)
  window.removeEventListener('scroll', onScroll, { capture: true })
  window.removeEventListener('resize', onScroll)
  document.documentElement.style.overflow = ''
})

const summary = computed(() => {
  if (!isRange.value) return a.value ? fmtShort(a.value) : '날짜를 선택하세요'
  if (a.value && b.value) return `${fmtShort(a.value)} → ${fmtShort(b.value)} · ${length.value}${unitLabel.value}`
  if (a.value) return `${fmtShort(a.value)} → ${props.endLabel}을 선택하세요`
  return `${props.startLabel}을 선택하세요`
})
</script>

<template>
  <div class="relative">
    <button
      ref="trigger"
      type="button"
      :aria-expanded="open"
      :aria-controls="uid"
      aria-haspopup="dialog"
      :class="['relative flex w-full flex-col justify-center rounded-2xl border bg-surface px-4 text-left', compact ? 'min-h-[52px] py-1.5' : 'min-h-[64px] py-2.5', ' transition-colors focus:outline-none focus-visible:border-primary focus-visible:shadow-focus', invalid ? 'border-danger' : open ? 'border-primary shadow-focus' : 'border-line hover:border-line-strong']"
      @click="open ? close() : openPicker()"
    >
      <span class="mb-0.5 block text-2xs font-semibold uppercase tracking-wide text-ink-subtle">
        {{ label || (isRange ? `${startLabel} — ${endLabel}` : startLabel) }}<template v-if="isRange && start && end"> · {{ diff(start, end) }}{{ unitLabel }}</template>
      </span>
      <span class="flex items-center gap-2 text-base font-semibold text-ink">
        <AppIcon name="calendar" :size="18" class="text-ink-subtle" />
        <template v-if="start">
          <span class="tabular">{{ fmtShort(start) }}</span>
          <template v-if="isRange"><AppIcon name="arrow-right" :size="14" class="text-ink-subtle" /><span class="tabular" :class="!end && 'text-ink-subtle'">{{ end ? fmtShort(end) : endLabel }}</span></template>
        </template>
        <span v-else class="font-normal text-ink-subtle">날짜 선택</span>
      </span>
    </button>

    <Teleport to="body">
      <Transition enter-from-class="opacity-0" enter-active-class="transition-opacity duration-150" leave-to-class="opacity-0" leave-active-class="transition-opacity duration-100">
        <div v-if="open && isPhone" class="fixed inset-0 z-[70] bg-midnight-950/50" @click="close" />
      </Transition>
      <div
        v-if="open"
        :id="uid"
        ref="panel"
        role="dialog"
        aria-modal="true"
        :aria-label="isRange ? `${startLabel}·${endLabel} 날짜 선택` : `${startLabel} 날짜 선택`"
        :style="panelStyle"
        :class="isPhone
          ? 'fixed inset-x-0 bottom-0 z-[71] flex max-h-[88vh] flex-col rounded-t-[28px] bg-surface-raised shadow-pop animate-pop-in'
          : 'fixed z-[71] animate-pop-in rounded-card border border-line bg-surface-raised p-5 shadow-pop'"
      >
        <!-- Phone header -->
        <div v-if="isPhone" class="border-b border-line px-5 pb-2 pt-3">
          <div class="mx-auto mb-3 h-1 w-10 rounded-full bg-line-strong" />
          <div class="flex items-center justify-between">
            <p class="text-base font-bold text-ink">{{ isRange ? `${startLabel}·${endLabel}` : startLabel }}</p>
            <button type="button" class="flex h-9 w-9 items-center justify-center rounded-full text-ink-muted hover:bg-surface-sunken" aria-label="닫기" @click="close"><AppIcon name="close" /></button>
          </div>
          <div class="mt-3 grid grid-cols-7 text-center text-2xs font-semibold text-ink-subtle">
            <span v-for="(w, i) in WEEK" :key="w" :class="i === 0 && 'text-danger/80'">{{ w }}</span>
          </div>
        </div>

        <!-- Desktop nav -->
        <div v-else class="mb-3 flex items-center justify-between">
          <button type="button" class="flex h-9 w-9 items-center justify-center rounded-full text-ink hover:bg-surface-sunken disabled:opacity-25" :disabled="!canPrev" aria-label="이전 달" @click="viewMonth = addMonths(viewMonth, -1)"><AppIcon name="chevron-right" class="rotate-180" /></button>
          <p class="text-sm font-medium text-ink-muted" aria-live="polite">{{ summary }}</p>
          <button type="button" class="flex h-9 w-9 items-center justify-center rounded-full text-ink hover:bg-surface-sunken disabled:opacity-25" :disabled="!canNext" aria-label="다음 달" @click="viewMonth = addMonths(viewMonth, 1)"><AppIcon name="chevron-right" /></button>
        </div>

        <div :class="isPhone ? 'flex-1 overflow-y-auto overscroll-contain px-4 pb-4' : 'grid grid-cols-1 gap-8 sm:grid-cols-2'">
          <section v-for="m in months" :key="m.key" :class="isPhone && 'pt-5'">
            <h3 :class="['mb-2 text-sm font-bold text-ink', isPhone ? 'px-1' : 'text-center']">{{ m.title }}</h3>
            <div v-if="!isPhone" class="mb-1 grid grid-cols-7 text-center text-2xs font-semibold text-ink-subtle">
              <span v-for="(w, i) in WEEK" :key="w" :class="i === 0 && 'text-danger/80'">{{ w }}</span>
            </div>
            <div class="grid grid-cols-7" role="grid" :aria-label="m.title">
              <template v-for="(day, i) in m.cells" :key="day || `${m.key}-${i}`">
                <span v-if="!day" aria-hidden="true" />
                <div
                  v-else
                  :class="['relative flex h-11 items-center justify-center', state(day).band && ['before:absolute before:inset-y-1 before:bg-primary-soft', state(day).band]]"
                >
                  <button
                    type="button"
                    :data-day="day"
                    :tabindex="day === focusDay ? 0 : -1"
                    :disabled="disabled(day)"
                    :aria-label="fmtLong(day)"
                    :aria-pressed="state(day).start || state(day).end"
                    :aria-current="state(day).today ? 'date' : undefined"
                    :class="['relative z-[1] flex h-10 w-10 flex-col items-center justify-center rounded-full text-sm font-semibold tabular transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                      state(day).start || state(day).end ? 'bg-primary text-primary-ink' : disabled(day) ? 'cursor-not-allowed text-ink-subtle/40 line-through decoration-transparent' : 'text-ink hover:bg-surface-sunken',
                      !state(day).start && !state(day).end && !disabled(day) && fromIso(day).getDay() === 0 && 'text-danger/80']"
                    @click="pick(day)"
                    @pointerenter="hover = day"
                    @focus="focusDay = day"
                  >
                    {{ Number(day.slice(8)) }}
                    <span v-if="state(day).today" :class="['absolute bottom-1 h-1 w-1 rounded-full', state(day).start || state(day).end ? 'bg-primary-ink' : 'bg-primary']" />
                  </button>
                </div>
              </template>
            </div>
          </section>
        </div>

        <!-- Footer -->
        <div :class="isPhone ? 'border-t border-line px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3' : 'mt-4 flex items-center justify-between border-t border-line pt-4'">
          <p v-if="isPhone" class="mb-3 text-sm font-medium text-ink" aria-live="polite">{{ summary }}</p>
          <p v-else class="text-xs text-ink-subtle">오늘 <span class="inline-block h-1 w-1 translate-y-[-2px] rounded-full bg-primary" /> · 최대 {{ maxRange }}{{ unitLabel }}</p>
          <div class="flex gap-2" :class="isPhone && 'w-full'">
            <button type="button" class="rounded-xl px-4 py-2.5 text-sm font-semibold text-ink-muted hover:bg-surface-sunken" @click="reset">초기화</button>
            <button
              type="button"
              class="flex-1 rounded-xl bg-primary px-6 py-2.5 text-sm font-bold text-primary-ink hover:bg-primary-hover disabled:opacity-40"
              :disabled="isRange ? !(a && b) : !a"
              @click="commit"
            >확인</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
