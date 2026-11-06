<script setup lang="ts" generic="T">
/**
 * Server-backed combobox for the admin console (users, partners, products, bookings, places).
 *
 * - Korean IME: listens to `input` (not v-model) so suggestions follow the composing syllable; Enter that
 *   commits a composition is ignored.
 * - Enter with nothing highlighted never picks an arbitrary row — it emits `submit` with the typed text.
 * - Stale responses are aborted/dropped; results are cached per query; errors show a retry, never a
 *   fallback list.
 * - WAI-ARIA combobox: aria-expanded / aria-controls / aria-activedescendant, role=listbox/option.
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'

const props = withDefaults(defineProps<{
  modelValue: string
  fetcher: (q: string, signal: AbortSignal) => Promise<T[]>
  itemKey: (item: T) => string
  placeholder?: string
  label: string
  inputId?: string
  minChars?: number
  debounceMs?: number
  /** Ask the server on focus with an empty query (e.g. "recent" lists). */
  suggestOnFocus?: boolean
}>(), { placeholder: '', minChars: 1, debounceMs: 200, suggestOnFocus: false })

const emit = defineEmits<{ 'update:modelValue': [string]; select: [T]; submit: [string] }>()

const uid = `es-${Math.random().toString(36).slice(2, 8)}`
const listId = `${uid}-list`
const inputId = computed(() => props.inputId || `${uid}-input`)
const text = ref(props.modelValue)
watch(() => props.modelValue, (v) => { if (v !== text.value) text.value = v })

const items = ref<T[]>([]) as { value: T[] }
const open = ref(false)
const active = ref(-1)
const state = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')
const cache = new Map<string, T[]>()
let ctrl: AbortController | null = null
let timer: ReturnType<typeof setTimeout> | undefined

async function run(q: string) {
  const key = q.trim().toLowerCase()
  if (cache.has(key)) { items.value = cache.get(key)!; state.value = 'ready'; open.value = true; active.value = -1; return }
  ctrl?.abort()
  const mine = (ctrl = new AbortController())
  state.value = 'loading'
  open.value = true
  try {
    const rows = await props.fetcher(q.trim(), mine.signal)
    if (mine !== ctrl) return
    cache.set(key, rows)
    items.value = rows
    active.value = -1
    state.value = 'ready'
  } catch (e) {
    if ((e as Error).name === 'AbortError' || mine !== ctrl) return
    state.value = 'error'
  }
}
function schedule() {
  clearTimeout(timer)
  const q = text.value
  if (q.trim().length < props.minChars) { ctrl?.abort(); items.value = []; state.value = 'idle'; open.value = false; return }
  timer = setTimeout(() => run(q), props.debounceMs)
}
function onInput(e: Event) {
  text.value = (e.target as HTMLInputElement).value
  emit('update:modelValue', text.value)
  schedule()
}
function onFocus() {
  if (text.value.trim().length >= props.minChars) schedule()
  else if (props.suggestOnFocus) run('')
}
function select(it: T) {
  emit('select', it)
  open.value = false
  active.value = -1
}
function onKeydown(e: KeyboardEvent) {
  if (e.isComposing || e.keyCode === 229) return
  const n = items.value.length
  if (e.key === 'ArrowDown') { e.preventDefault(); if (!open.value && n) open.value = true; else if (n) active.value = (active.value + 1) % n }
  else if (e.key === 'ArrowUp') { e.preventDefault(); if (n) active.value = active.value <= 0 ? n - 1 : active.value - 1 }
  else if (e.key === 'Enter') {
    e.preventDefault()
    if (open.value && active.value >= 0 && items.value[active.value]) select(items.value[active.value])
    else { open.value = false; emit('submit', text.value.trim()) }
  } else if (e.key === 'Escape') { if (open.value) { e.preventDefault(); open.value = false } }
}
function clear() {
  text.value = ''
  emit('update:modelValue', '')
  items.value = []
  open.value = false
  emit('submit', '')
}
function retry() { cache.delete(text.value.trim().toLowerCase()); run(text.value) }

const root = ref<HTMLElement | null>(null)
function onDocDown(e: MouseEvent) { if (root.value && !root.value.contains(e.target as Node)) open.value = false }
document.addEventListener('mousedown', onDocDown)
onBeforeUnmount(() => { document.removeEventListener('mousedown', onDocDown); ctrl?.abort(); clearTimeout(timer) })

const activeId = computed(() => (open.value && active.value >= 0 ? `${uid}-opt-${active.value}` : undefined))
defineExpose({ clear })
</script>

<template>
  <div ref="root" class="relative">
    <AppIcon name="search" :size="16" class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle" />
    <input
      :id="inputId"
      :value="text"
      type="text"
      role="combobox"
      autocomplete="off"
      spellcheck="false"
      :aria-label="label"
      :aria-expanded="open"
      :aria-controls="listId"
      aria-autocomplete="list"
      :aria-activedescendant="activeId"
      :placeholder="placeholder"
      class="input pl-9 pr-9"
      @input="onInput"
      @focus="onFocus"
      @keydown="onKeydown"
    />
    <button v-if="text" type="button" class="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-ink-subtle hover:text-ink" aria-label="검색어 지우기" @click="clear"><AppIcon name="close" :size="14" /></button>

    <div v-show="open" class="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-field border border-line bg-surface shadow-pop animate-pop-in">
      <ul :id="listId" role="listbox" :aria-label="`${label} 결과`" class="max-h-80 overflow-y-auto py-1">
        <li v-if="state === 'loading' && !items.length" class="px-3 py-2.5 text-sm text-ink-subtle" role="presentation">검색 중…</li>
        <li v-else-if="state === 'error'" class="flex items-center justify-between gap-2 px-3 py-2.5 text-sm" role="presentation">
          <span class="text-danger">검색하지 못했어요.</span>
          <button type="button" class="font-semibold text-primary" @mousedown.prevent="retry">다시 시도</button>
        </li>
        <li v-else-if="state === 'ready' && !items.length" class="px-3 py-2.5 text-sm text-ink-subtle" role="presentation">‘{{ text.trim() }}’ 결과가 없어요.</li>
        <li
          v-for="(it, i) in items"
          :id="`${uid}-opt-${i}`"
          :key="itemKey(it)"
          role="option"
          :aria-selected="i === active"
          :class="['cursor-pointer px-3 py-2', i === active ? 'bg-primary-soft' : 'hover:bg-surface-sunken']"
          @mousedown.prevent="select(it)"
          @mousemove="active = i"
        ><slot name="item" :item="it" :active="i === active">{{ itemKey(it) }}</slot></li>
      </ul>
    </div>
  </div>
</template>
