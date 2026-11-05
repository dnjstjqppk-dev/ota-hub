<script setup lang="ts">
/**
 * Guests & rooms field (design system "Horizon"). Same trigger shape as DateRangePicker so the
 * two sit side by side in search bars. Limits follow the quote API: adults ≥ 1, adults + children ≤ 9,
 * and never more rooms than adults (each room needs an adult).
 */
import { computed, onBeforeUnmount, onMounted, ref, useId } from 'vue'

const props = withDefaults(defineProps<{ adults: number; children?: number; rooms?: number; showRooms?: boolean; label?: string; compact?: boolean }>(), {
  children: 0, rooms: 1, showRooms: true, label: '인원·객실', compact: false
})
const emit = defineEmits<{ (e: 'update:adults', v: number): void; (e: 'update:children', v: number): void; (e: 'update:rooms', v: number): void }>()

const uid = `gp-${useId()}`
const open = ref(false)
const root = ref<HTMLElement | null>(null)
const MAX_PEOPLE = 9

const rows = computed(() => [
  { key: 'adults' as const, label: '성인', hint: '만 18세 이상', value: props.adults, min: 1, max: MAX_PEOPLE - props.children },
  { key: 'children' as const, label: '아동', hint: '만 0–17세', value: props.children, min: 0, max: Math.min(6, MAX_PEOPLE - props.adults) },
  ...(props.showRooms ? [{ key: 'rooms' as const, label: '객실', hint: '객실마다 성인 1명 이상', value: props.rooms, min: 1, max: Math.min(5, props.adults) }] : [])
])

function step(key: 'adults' | 'children' | 'rooms', d: number) {
  const r = rows.value.find((x) => x.key === key)!
  const next = Math.min(r.max, Math.max(r.min, r.value + d))
  if (key === 'adults') { emit('update:adults', next); if (props.showRooms && props.rooms > next) emit('update:rooms', next) }
  else if (key === 'children') emit('update:children', next)
  else emit('update:rooms', next)
}

const summary = computed(() => `성인 ${props.adults}${props.children ? ` · 아동 ${props.children}` : ''}${props.showRooms ? ` · 객실 ${props.rooms}` : ''}`)

function onDoc(e: Event) { if (open.value && root.value && !root.value.contains(e.target as Node)) open.value = false }
function onKey(e: KeyboardEvent) { if (open.value && e.key === 'Escape') { open.value = false; root.value?.querySelector<HTMLElement>('button')?.focus() } }
onMounted(() => { document.addEventListener('pointerdown', onDoc); document.addEventListener('keydown', onKey) })
onBeforeUnmount(() => { document.removeEventListener('pointerdown', onDoc); document.removeEventListener('keydown', onKey) })
</script>

<template>
  <div ref="root" class="relative">
    <button
      type="button"
      :aria-expanded="open"
      :aria-controls="uid"
      :class="['flex w-full flex-col justify-center rounded-2xl border bg-surface px-4 text-left transition-colors focus:outline-none focus-visible:border-primary focus-visible:shadow-focus', compact ? 'min-h-[52px] py-1.5' : 'min-h-[64px] py-2.5', open ? 'border-primary shadow-focus' : 'border-line hover:border-line-strong']"
      @click="open = !open"
    >
      <span class="mb-0.5 block text-2xs font-semibold uppercase tracking-wide text-ink-subtle">{{ label }}</span>
      <span class="flex items-center justify-between gap-2 text-base font-semibold text-ink">
        <span class="flex items-center gap-2 truncate"><AppIcon name="users" :size="18" class="text-ink-subtle" />{{ summary }}</span>
        <AppIcon name="chevron-down" :size="18" :class="['text-ink-subtle transition-transform', open && 'rotate-180']" />
      </span>
    </button>
    <div v-if="open" :id="uid" role="dialog" :aria-label="label" class="absolute right-0 top-full z-30 mt-2 w-full min-w-[288px] animate-pop-in rounded-card border border-line bg-surface-raised p-4 shadow-pop">
      <div v-for="r in rows" :key="r.key" class="flex items-center justify-between py-2.5">
        <div>
          <p class="text-sm font-semibold text-ink">{{ r.label }}</p>
          <p class="text-xs text-ink-subtle">{{ r.hint }}</p>
        </div>
        <div class="flex items-center gap-3">
          <button type="button" class="flex h-9 w-9 items-center justify-center rounded-full border border-line text-ink transition-colors hover:border-primary hover:text-primary disabled:pointer-events-none disabled:opacity-30" :disabled="r.value <= r.min" :aria-label="`${r.label} 줄이기`" @click="step(r.key, -1)"><AppIcon name="minus" :size="16" /></button>
          <span class="tabular w-5 text-center font-semibold text-ink" aria-live="polite">{{ r.value }}</span>
          <button type="button" class="flex h-9 w-9 items-center justify-center rounded-full border border-line text-ink transition-colors hover:border-primary hover:text-primary disabled:pointer-events-none disabled:opacity-30" :disabled="r.value >= r.max" :aria-label="`${r.label} 늘리기`" @click="step(r.key, 1)"><AppIcon name="plus" :size="16" /></button>
        </div>
      </div>
      <p class="mt-1 text-xs text-ink-subtle">한 번에 최대 {{ MAX_PEOPLE }}명까지 예약할 수 있어요.</p>
      <button type="button" class="mt-3 w-full rounded-xl bg-surface-sunken py-2.5 text-sm font-semibold text-ink hover:bg-line" @click="open = false">확인</button>
    </div>
  </div>
</template>
