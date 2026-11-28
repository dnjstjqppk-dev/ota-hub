<script setup lang="ts">
/**
 * Guests & rooms field (design system "Terra Nord").
 * Responsive ergonomics: bottom-sheet on phones (<640px), viewport-clamped popover on tablets & desktop.
 * Limits follow the quote API: adults >= 1, adults + children <= 9, and never more rooms than adults.
 */
import { computed, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'

const props = withDefaults(defineProps<{ adults: number; children?: number; rooms?: number; showRooms?: boolean; label?: string; compact?: boolean }>(), {
  children: 0, rooms: 1, showRooms: true, label: '', compact: false
})
const { t } = useI18n()
const emit = defineEmits<{ (e: 'update:adults', v: number): void; (e: 'update:children', v: number): void; (e: 'update:rooms', v: number): void }>()

const uid = `gp-${useId()}`
const open = ref(false)
const trigger = ref<HTMLElement | null>(null)
const panel = ref<HTMLElement | null>(null)
const isPhone = ref(false)
const panelStyle = ref<Record<string, string>>({})
const MAX_PEOPLE = 9

const rows = computed(() => [
  { key: 'adults' as const, label: t('search.adults'), hint: t('search.adultsHint'), value: props.adults, min: 1, max: MAX_PEOPLE - props.children },
  { key: 'children' as const, label: t('search.children'), hint: t('search.childrenHint'), value: props.children, min: 0, max: Math.min(6, MAX_PEOPLE - props.adults) },
  ...(props.showRooms ? [{ key: 'rooms' as const, label: t('search.rooms'), hint: t('search.roomsHint'), value: props.rooms, min: 1, max: Math.min(5, props.adults) }] : [])
])

function step(key: 'adults' | 'children' | 'rooms', d: number) {
  const r = rows.value.find((x) => x.key === key)!
  const next = Math.min(r.max, Math.max(r.min, r.value + d))
  if (key === 'adults') { emit('update:adults', next); if (props.showRooms && props.rooms > next) emit('update:rooms', next) }
  else if (key === 'children') emit('update:children', next)
  else emit('update:rooms', next)
}

const summary = computed(() => `${t('search.adults')} ${props.adults}${props.children ? ` · ${t('search.children')} ${props.children}` : ''}${props.showRooms ? ` · ${t('search.rooms')} ${props.rooms}` : ''}`)

function place() {
  if (!trigger.value || isPhone.value) { panelStyle.value = {}; return }
  const r = trigger.value.getBoundingClientRect()
  const vw = document.documentElement.clientWidth
  const width = Math.min(Math.max(r.width, 304), vw - 24)
  const left = Math.max(12, Math.min(r.left, vw - width - 12))
  panelStyle.value = { top: `${r.bottom + 8}px`, left: `${left}px`, width: `${width}px` }
}

function toggleOpen() {
  if (open.value) { open.value = false; return }
  isPhone.value = typeof window !== 'undefined' && window.innerWidth < 640
  open.value = true
  place()
}

function onDoc(e: Event) {
  if (!open.value || isPhone.value) return
  const target = e.target as Node
  if (trigger.value?.contains(target) || panel.value?.contains(target)) return
  open.value = false
}
function onKey(e: KeyboardEvent) {
  if (open.value && e.key === 'Escape') { open.value = false; trigger.value?.focus() }
}
let raf = 0
function onViewport() {
  if (!open.value || isPhone.value || raf) return
  raf = requestAnimationFrame(() => { raf = 0; if (open.value && !isPhone.value) place() })
}

watch(open, (v) => { if (isPhone.value && typeof document !== 'undefined') document.documentElement.style.overflow = v ? 'hidden' : '' })

onMounted(() => {
  document.addEventListener('pointerdown', onDoc)
  document.addEventListener('keydown', onKey)
  window.addEventListener('scroll', onViewport, { passive: true, capture: true })
  window.addEventListener('resize', onViewport)
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDoc)
  document.removeEventListener('keydown', onKey)
  window.removeEventListener('scroll', onViewport, { capture: true })
  window.removeEventListener('resize', onViewport)
  if (raf) cancelAnimationFrame(raf)
  if (typeof document !== 'undefined') document.documentElement.style.overflow = ''
})
</script>

<template>
  <div class="relative">
    <button
      ref="trigger"
      type="button"
      :aria-expanded="open"
      :aria-controls="uid"
      :class="[
        'flex w-full flex-col justify-center rounded-field border bg-surface px-3.5 text-left transition-colors focus:outline-none focus-visible:border-primary focus-visible:shadow-focus',
        compact ? 'min-h-[52px] py-1.5' : 'min-h-[60px] py-2',
        open ? 'border-primary shadow-focus' : 'border-line hover:border-line-strong'
      ]"
      @click="toggleOpen"
    >
      <span class="mb-0.5 block text-2xs font-bold uppercase tracking-wider text-ink-subtle">{{ label || t('search.guests') }}</span>
      <span class="flex items-center justify-between gap-2 text-sm font-semibold text-ink sm:text-[15px]">
        <span class="flex min-w-0 items-center gap-2 truncate"><AppIcon name="users" :size="17" class="shrink-0 text-primary" /><span class="truncate">{{ summary }}</span></span>
        <AppIcon name="chevron-down" :size="16" :class="['shrink-0 text-ink-subtle transition-transform', open && 'rotate-180']" />
      </span>
    </button>

    <Teleport to="body">
      <Transition enter-from-class="opacity-0" enter-active-class="transition-opacity duration-150" leave-to-class="opacity-0" leave-active-class="transition-opacity duration-100">
        <div v-if="open && isPhone" class="fixed inset-0 z-[70] bg-midnight-950/50 backdrop-blur-sm" @click="open = false" />
      </Transition>
      <div
        v-if="open"
        :id="uid"
        ref="panel"
        role="dialog"
        :aria-modal="isPhone ? 'true' : undefined"
        :aria-label="label || t('search.guests')"
        :style="panelStyle"
        :class="isPhone
          ? 'fixed inset-x-0 bottom-0 z-[71] animate-pop-in rounded-t-[24px] border-t border-line bg-surface-raised p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-pop'
          : 'fixed z-[71] animate-pop-in rounded-card border border-line bg-surface-raised p-4 shadow-pop'"
      >
        <div v-if="isPhone" class="mb-3 flex items-center justify-between border-b border-line pb-3">
          <p class="font-display text-base font-bold text-ink">{{ label || t('search.guests') }}</p>
          <button type="button" class="flex h-9 w-9 items-center justify-center rounded-full text-ink-muted hover:bg-surface-sunken" :aria-label="t('common.close')" @click="open = false"><AppIcon name="close" /></button>
        </div>

        <div v-for="r in rows" :key="r.key" class="flex items-center justify-between py-2.5">
          <div>
            <p class="text-sm font-semibold text-ink">{{ r.label }}</p>
            <p class="text-xs text-ink-subtle">{{ r.hint }}</p>
          </div>
          <div class="flex items-center gap-3">
            <button type="button" class="flex h-10 w-10 items-center justify-center rounded-full border border-line text-ink transition-colors hover:border-primary hover:text-primary disabled:pointer-events-none disabled:opacity-30" :disabled="r.value <= r.min" :aria-label="t('search.decrease', { label: r.label })" @click="step(r.key, -1)"><AppIcon name="minus" :size="16" /></button>
            <span class="tabular w-6 text-center font-bold text-ink" aria-live="polite">{{ r.value }}</span>
            <button type="button" class="flex h-10 w-10 items-center justify-center rounded-full border border-line text-ink transition-colors hover:border-primary hover:text-primary disabled:pointer-events-none disabled:opacity-30" :disabled="r.value >= r.max" :aria-label="t('search.increase', { label: r.label })" @click="step(r.key, 1)"><AppIcon name="plus" :size="16" /></button>
          </div>
        </div>
        <p class="mt-1 text-xs text-ink-subtle">{{ t('search.maxParty', { n: MAX_PEOPLE }) }}</p>
        <button type="button" class="btn-primary mt-3 w-full" @click="open = false">{{ t('search.done') }}</button>
      </div>
    </Teleport>
  </div>
</template>
