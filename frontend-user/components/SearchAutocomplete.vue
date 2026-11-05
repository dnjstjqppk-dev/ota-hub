<script setup lang="ts">
/**
 * Search autocomplete (design system "Horizon").
 *
 * Data comes only from GET /search/suggest (places reference table + live catalog).
 * There is no built-in fallback list: when the API fails the box says so.
 *
 * - Korean IME: the input is read on every `input` event (Vue's v-model would wait for
 *   compositionend), requests are debounced, and Enter/arrow keys pressed while a syllable
 *   is still composing are ignored so the commit keystroke never selects an item.
 * - Out-of-order responses: every request gets a sequence number and the previous one is
 *   aborted; a late response for an older query is dropped.
 * - Duplicate calls: results are cached per (domain, query) and an unchanged query is not re-sent.
 * - Selection emits the full item (id, code, place_type, target_url), not just text.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useApiUrl } from '~/composables/useApi'

export interface SuggestItem {
  id: string
  kind: 'place' | 'product'
  type: string
  place_type?: string
  code?: string | null
  country_code?: string
  title: string
  subtitle: string
  value: string
  target_url: string | null
  domain: string
  badge: string
  score: number
}

const props = withDefaults(defineProps<{
  modelValue?: string
  domain?: string
  /** @deprecated use `domain` */
  type?: string
  placeholder?: string
  label?: string
  icon?: string
  inputClass?: string
  inputId?: string
  autoNavigate?: boolean
  debounceMs?: number
  /** `bare`: no border/icon, for use inside a field box that draws its own frame and label. */
  variant?: 'default' | 'bare'
}>(), {
  modelValue: '', domain: '', type: '', icon: 'search', autoNavigate: false, debounceMs: 180, variant: 'default'
})

const INPUT_CLASS = {
  default: 'w-full rounded-field border border-line bg-surface py-3 pl-11 pr-10 text-[15px] font-medium text-ink placeholder:text-ink-subtle placeholder:font-normal transition focus:border-primary focus:shadow-focus focus:outline-none',
  bare: 'w-full border-0 bg-transparent p-0 pr-8 text-base font-semibold text-ink placeholder:text-ink-subtle placeholder:font-normal focus:outline-none focus:ring-0'
}

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'select', item: SuggestItem): void
  (e: 'select-code', code: string): void
  (e: 'enter', value: string): void
}>()

const router = useRouter()
const domain = computed(() => props.domain || props.type || 'all')
// SSR-stable id (Math.random would differ between server and client and break hydration).
const uid = `ac-${useId()}`
const inputId = computed(() => props.inputId || `${uid}-input`)
const listId = `${uid}-list`

const text = ref(props.modelValue)
const open = ref(false)
const composing = ref(false)
const state = ref<'idle' | 'loading' | 'ready' | 'error' | 'offline'>('idle')
const items = ref<SuggestItem[]>([])
const popular = ref<SuggestItem[]>([])
const recent = ref<SuggestItem[]>([])
const active = ref(-1)
const root = ref<HTMLElement | null>(null)
const inputEl = ref<HTMLInputElement | null>(null)
const panelMax = ref(420)
const panel = ref<HTMLElement | null>(null)

watch(() => props.modelValue, (v) => { if (v !== text.value) text.value = v })

const query = computed(() => text.value.trim())
/** Rows the keyboard moves through: results while typing, recent + popular when empty. */
const rows = computed<SuggestItem[]>(() => (query.value ? items.value : [...recent.value, ...popular.value.filter(p => !recent.value.some(r => r.id === p.id))]))
const activeId = computed(() => (active.value >= 0 && rows.value[active.value] ? `${uid}-opt-${active.value}` : undefined))

const placeholderText = computed(() => props.placeholder || ({
  flights: '도시, 공항 또는 코드 (예: 도쿄, ICN)',
  hotels: '도시, 지역, 명소 또는 호텔명',
  trains: '역 이름 (예: 서울역, 신오사카역)',
  cars: '공항, 도시 또는 기차역',
  transfers: '공항, 호텔, 지역',
  'things-to-do': '도시, 명소 또는 체험',
  packages: '여행지 (예: 다낭, 오사카)',
  esim: '국가 (예: 일본, 베트남)',
  insurance: '여행 국가',
  cruise: '출발 항구 또는 도시'
} as Record<string, string>)[domain.value] || '어디로 떠나세요?')

// ------------------------------------------------------------------ data

const cache = new Map<string, SuggestItem[]>()
let timer: ReturnType<typeof setTimeout> | null = null
let controller: AbortController | null = null
let seq = 0
let lastSent = ''

async function fetchSuggest(q: string): Promise<SuggestItem[] | null> {
  const key = `${domain.value}|${q.toLowerCase()}`
  const hit = cache.get(key)
  if (hit) return hit
  controller?.abort()
  controller = new AbortController()
  const mySeq = ++seq
  const res = await fetch(useApiUrl(`/search/suggest?q=${encodeURIComponent(q)}&domain=${encodeURIComponent(domain.value)}&limit=8`), { signal: controller.signal })
  if (!res.ok) throw new Error(`suggest ${res.status}`)
  const body = await res.json()
  const data: SuggestItem[] = Array.isArray(body?.data) ? body.data : []
  if (cache.size > 60) cache.delete(cache.keys().next().value as string)
  cache.set(key, data)
  return mySeq === seq ? data : null // a newer request superseded this one
}

function schedule() {
  if (timer) clearTimeout(timer)
  const q = query.value
  active.value = -1
  if (!q) { items.value = []; state.value = 'idle'; lastSent = ''; controller?.abort(); return }
  if (q === lastSent && state.value === 'ready') return
  const cached = cache.get(`${domain.value}|${q.toLowerCase()}`)
  if (cached) { items.value = cached; state.value = 'ready'; lastSent = q; return }
  state.value = 'loading'
  timer = setTimeout(() => run(q), props.debounceMs)
}

async function run(q: string) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) { state.value = 'offline'; return }
  lastSent = q
  try {
    const data = await fetchSuggest(q)
    if (data === null || q !== query.value) return
    items.value = data
    state.value = 'ready'
  } catch (e: any) {
    if (e?.name === 'AbortError') return
    if (q !== query.value) return
    state.value = typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'error'
    lastSent = ''
  }
}

async function loadPopular() {
  if (popular.value.length) return
  try {
    const res = await fetch(useApiUrl(`/search/suggest?q=&domain=${encodeURIComponent(domain.value)}&limit=6`))
    if (res.ok) popular.value = ((await res.json())?.data || []) as SuggestItem[]
  } catch { /* the panel simply shows recent searches only */ }
}

// ------------------------------------------------------------------ recent searches (per domain, this browser only)

const recentKey = computed(() => `gft_recent_v2_${domain.value}`)
function readRecent() {
  try { recent.value = JSON.parse(localStorage.getItem(recentKey.value) || '[]').slice(0, 5) } catch { recent.value = [] }
}
function writeRecent() {
  try { localStorage.setItem(recentKey.value, JSON.stringify(recent.value)) } catch { /* storage blocked */ }
}
function pushRecent(it: SuggestItem) {
  recent.value = [it, ...recent.value.filter(r => r.id !== it.id)].slice(0, 5)
  writeRecent()
}
function removeRecent(id: string) { recent.value = recent.value.filter(r => r.id !== id); writeRecent() }
function clearRecent() { recent.value = []; writeRecent() }

// ------------------------------------------------------------------ interaction

function onInput(e: Event) {
  text.value = (e.target as HTMLInputElement).value
  emit('update:modelValue', text.value)
  open.value = true
  schedule()
}

function onFocus() {
  open.value = true
  readRecent()
  loadPopular()
  fitPanel()
  setTimeout(liftIntoView, 200)
  if (query.value) schedule()
}

function select(it: SuggestItem) {
  text.value = it.value || it.title
  emit('update:modelValue', text.value)
  emit('select', it)
  if (it.code) emit('select-code', it.code)
  pushRecent(it)
  open.value = false
  active.value = -1
  if (props.autoNavigate && it.target_url) router.push(it.target_url)
}

function move(delta: number) {
  if (!open.value) { open.value = true; return }
  const n = rows.value.length
  if (!n) return
  active.value = active.value < 0 ? (delta > 0 ? 0 : n - 1) : (active.value + delta + n) % n
  nextTick(() => document.getElementById(`${uid}-opt-${active.value}`)?.scrollIntoView({ block: 'nearest' }))
}

function onKeydown(e: KeyboardEvent) {
  // Keys pressed to commit an IME syllable must not drive the list.
  if (e.isComposing || composing.value || e.keyCode === 229) return
  switch (e.key) {
    case 'ArrowDown': e.preventDefault(); move(1); break
    case 'ArrowUp': e.preventDefault(); move(-1); break
    case 'Enter': {
      const it = active.value >= 0 ? rows.value[active.value] : undefined
      // Without an explicit choice only an exact match (code / full name) is taken.
      const exact = !it && query.value && state.value === 'ready' && items.value[0] && items.value[0].score >= 900 ? items.value[0] : undefined
      if (it || exact) { e.preventDefault(); select((it || exact)!) } else { open.value = false; emit('enter', text.value) }
      break
    }
    case 'Escape': if (open.value) { e.preventDefault(); open.value = false; active.value = -1 } break
    case 'Tab': open.value = false; break
  }
}

function clear() {
  text.value = ''
  emit('update:modelValue', '')
  items.value = []
  state.value = 'idle'
  lastSent = ''
  open.value = true
  inputEl.value?.focus()
}

function retry() { lastSent = ''; cache.delete(`${domain.value}|${query.value.toLowerCase()}`); schedule() }

const panelStyle = ref<Record<string, string>>({})

/** Size the panel to the space above the on-screen keyboard; on phones span the viewport width. */
function fitPanel() {
  if (typeof window === 'undefined' || !root.value) return
  const rect = root.value.getBoundingClientRect()
  const vh = window.visualViewport?.height || window.innerHeight
  panelMax.value = Math.max(220, Math.min(440, vh - rect.bottom - 16))
  // The panel is teleported to <body> (fixed) so no ancestor's overflow can clip it.
  const vw = document.documentElement.clientWidth
  const width = vw < 640 ? vw - 24 : Math.min(Math.max(rect.width, 384), vw - 24)
  const left = vw < 640 ? 12 : Math.min(rect.left, vw - width - 12)
  panelStyle.value = { top: `${rect.bottom + 8}px`, left: `${left}px`, width: `${width}px` }
}

/** Phones: scroll the field to just below the sticky header so the list is not hidden by the keyboard. */
function liftIntoView() {
  if (typeof window === 'undefined' || !root.value || window.innerWidth >= 768) return
  const header = document.querySelector('header')
  const offset = (header && getComputedStyle(header).position.match(/sticky|fixed/) ? header.getBoundingClientRect().height : 0) + 12
  const top = root.value.getBoundingClientRect().top
  if (top < offset || top > window.innerHeight * 0.35) window.scrollBy({ top: top - offset, behavior: 'smooth' })
  setTimeout(fitPanel, 350)
}

function onDocPointer(e: Event) {
  const t = e.target as Node
  if (root.value?.contains(t) || panel.value?.contains(t)) return
  open.value = false
}
function onScroll() { if (open.value) fitPanel() }
function onOnline() { if (state.value === 'offline') retry() }

onMounted(() => {
  document.addEventListener('pointerdown', onDocPointer)
  window.addEventListener('online', onOnline)
  window.visualViewport?.addEventListener('resize', fitPanel)
  window.addEventListener('scroll', onScroll, { passive: true, capture: true })
  window.addEventListener('resize', fitPanel)
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocPointer)
  window.removeEventListener('online', onOnline)
  window.visualViewport?.removeEventListener('resize', fitPanel)
  window.removeEventListener('scroll', onScroll, { capture: true })
  window.removeEventListener('resize', fitPanel)
  if (timer) clearTimeout(timer)
  controller?.abort()
})

// ------------------------------------------------------------------ presentation helpers

function esc(s: string) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}
/** Bold the typed text inside a label (HTML-escaped first). */
function mark(s: string) {
  const safe = esc(s)
  const q = query.value
  if (!q) return safe
  const re = new RegExp(`(${esc(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'ig')
  return safe.replace(re, '<mark class="bg-transparent text-primary font-bold">$1</mark>')
}

const ICONS: Record<string, string> = {
  airport: 'M2.5 19h19M3.3 13.6l4 1.6 3.4-1.4-4.6-5.3 2-.8 6.4 4.1 4.3-1.8a1.9 1.9 0 0 1 1.5 3.5L6.4 19.6 2 15.1z',
  flight: 'M2.5 19h19M3.3 13.6l4 1.6 3.4-1.4-4.6-5.3 2-.8 6.4 4.1 4.3-1.8a1.9 1.9 0 0 1 1.5 3.5L6.4 19.6 2 15.1z',
  city: 'M12 21s-7-6.2-7-11.5a7 7 0 1 1 14 0C19 14.8 12 21 12 21zm0-9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  region: 'M12 21s-7-6.2-7-11.5a7 7 0 1 1 14 0C19 14.8 12 21 12 21zm0-9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  country: 'M5 21V4m0 0h11l-2 4 2 4H5',
  station: 'M7 3h10a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3zm-3 8h16M8 21l2-4m6 4-2-4M8 14h.01M16 14h.01',
  train: 'M7 3h10a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3zm-3 8h16M8 21l2-4m6 4-2-4M8 14h.01M16 14h.01',
  port: 'M12 4a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm0 4v13m-7-8a7 7 0 0 0 14 0M8 11H5m14 0h-3',
  landmark: 'M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z',
  hotel: 'M3 21V8l9-5 9 5v13M9 21v-6h6v6M8 10h.01M12 10h.01M16 10h.01',
  activity: 'M4 8a2 2 0 0 0 2-2h12a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H6a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4zm10-2v12',
  car: 'M5 16H4a1 1 0 0 1-1-1v-3l2-5h14l2 5v3a1 1 0 0 1-1 1h-1M7 16a2 2 0 1 0 4 0 2 2 0 0 0-4 0m6 0a2 2 0 1 0 4 0 2 2 0 0 0-4 0M3 12h18',
  transfer: 'M5 16H4a1 1 0 0 1-1-1v-3l2-5h14l2 5v3a1 1 0 0 1-1 1h-1M7 16a2 2 0 1 0 4 0 2 2 0 0 0-4 0m6 0a2 2 0 1 0 4 0 2 2 0 0 0-4 0M3 12h18',
  package: 'M4 8h16v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zm5 0V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3',
  esim: 'M8 3h6l4 4v13a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm1 9h6v5H9z',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zm9 3-4.3-4.3',
  recent: 'M12 21a9 9 0 1 0-9-9m0 0V7m0 5h5m4-4v4l3 2'
}
const LEAD_ICON: Record<string, string> = { plane: 'airport', train: 'station', car: 'car', ticket: 'activity', search: 'search' }
const iconPath = (t: string) => ICONS[t] || ICONS.city
const leadIcon = computed(() => iconPath(LEAD_ICON[props.icon] || (domain.value === 'flights' ? 'airport' : domain.value === 'trains' ? 'station' : 'search')))
const statusText = computed(() => {
  if (!open.value) return ''
  if (state.value === 'loading') return '검색 중'
  if (state.value === 'ready') return items.value.length ? `추천 ${items.value.length}개` : '검색 결과 없음'
  if (state.value === 'error') return '추천을 불러오지 못했습니다'
  return ''
})
</script>

<template>
  <div ref="root" class="relative w-full">
    <label v-if="label" :for="inputId" class="mb-1 block text-2xs font-semibold uppercase tracking-wide text-ink-subtle">{{ label }}</label>
    <div class="relative flex items-center">
      <svg v-if="variant !== 'bare'" class="pointer-events-none absolute left-3.5 h-5 w-5 text-ink-subtle" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path :d="leadIcon" /></svg>
      <input
        :id="inputId"
        ref="inputEl"
        :value="text"
        type="text"
        role="combobox"
        aria-autocomplete="list"
        :aria-expanded="open"
        :aria-controls="listId"
        :aria-activedescendant="activeId"
        :placeholder="placeholderText"
        autocomplete="off"
        autocapitalize="off"
        autocorrect="off"
        spellcheck="false"
        enterkeyhint="search"
        :class="inputClass || INPUT_CLASS[variant]"
        @input="onInput"
        @focus="onFocus"
        @keydown="onKeydown"
        @compositionstart="composing = true"
        @compositionend="composing = false"
      />
      <span v-if="state === 'loading'" :class="['absolute h-4 w-4', variant === 'bare' ? 'right-8' : 'right-10']" class=" animate-spin rounded-full border-2 border-primary/25 border-t-primary" aria-hidden="true" />
      <button
        v-if="text"
        type="button"
        :class="variant === 'bare' ? '-right-1' : 'right-2.5'" class="absolute flex h-7 w-7 items-center justify-center rounded-full text-ink-subtle hover:bg-surface-sunken hover:text-ink"
        aria-label="입력 지우기"
        @click="clear"
      >
        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
      </button>
    </div>

    <span class="sr-only" aria-live="polite">{{ statusText }}</span>

    <Teleport to="body">
    <div
      v-if="open"
      ref="panel"
      :style="panelStyle"
      class="fixed z-[70] animate-pop-in overflow-hidden rounded-card border border-line bg-surface-raised shadow-pop sm:min-w-[24rem]"
    >
      <ul :id="listId" role="listbox" class="overflow-y-auto overscroll-contain py-2" :style="{ maxHeight: panelMax + 'px' }">
        <!-- Empty query: recent searches, then editorial suggestions -->
        <template v-if="!query">
          <li v-if="recent.length" role="presentation" class="flex items-center justify-between px-4 pb-1 pt-2">
            <span class="text-2xs font-semibold uppercase tracking-wide text-ink-subtle">최근 검색</span>
            <button type="button" class="text-2xs font-medium text-ink-subtle hover:text-danger" @pointerdown.prevent @click="clearRecent">전체 삭제</button>
          </li>
        </template>

        <template v-if="state === 'ready' || !query">
          <template v-for="(it, i) in rows" :key="it.id">
            <li
              v-if="!query && i === recent.length && popular.length"
              role="presentation"
              class="px-4 pb-1 pt-3 text-2xs font-semibold uppercase tracking-wide text-ink-subtle"
            >추천 여행지</li>
            <li
              :id="`${uid}-opt-${i}`"
              role="option"
              :aria-selected="i === active"
              :class="['group mx-2 flex cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2.5', i === active ? 'bg-primary-soft' : 'hover:bg-surface-sunken']"
              @pointerdown.prevent
              @click="select(it)"
              @pointermove="active = i"
            >
              <span :class="['flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', it.kind === 'product' ? 'bg-accent-soft text-accent' : 'bg-primary-soft text-primary']">
                <svg class="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path :d="!query && i < recent.length ? ICONS.recent : iconPath(it.type)" />
                </svg>
              </span>
              <span class="min-w-0 flex-1">
                <span class="block truncate text-sm font-semibold text-ink" v-html="mark(it.title)" />
                <span class="block truncate text-xs text-ink-muted" v-html="mark(it.subtitle)" />
              </span>
              <span v-if="it.code && (it.type === 'airport' || it.type === 'city')" class="shrink-0 rounded-md bg-surface-sunken px-1.5 py-0.5 font-mono text-xs font-semibold text-ink-muted">{{ it.code }}</span>
              <span v-else class="shrink-0 text-2xs font-medium text-ink-subtle">{{ it.badge }}</span>
              <button
                v-if="!query && i < recent.length"
                type="button"
                class="ml-1 hidden h-6 w-6 items-center justify-center rounded-full text-ink-subtle hover:bg-surface hover:text-danger group-hover:flex"
                aria-label="최근 검색에서 삭제"
                @pointerdown.prevent
                @click.stop="removeRecent(it.id)"
              >
                <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
              </button>
            </li>
          </template>
        </template>

        <!-- Loading skeleton -->
        <template v-if="query && state === 'loading' && !items.length">
          <li v-for="n in 3" :key="n" role="presentation" class="mx-2 flex items-center gap-3 px-2.5 py-2.5">
            <span class="h-9 w-9 rounded-xl bg-surface-sunken" />
            <span class="flex-1 space-y-1.5"><span class="block h-3 w-2/3 rounded bg-surface-sunken" /><span class="block h-2.5 w-1/3 rounded bg-surface-sunken" /></span>
          </li>
        </template>
        <!-- Previous results stay visible (dimmed) while the next query loads -->
        <template v-if="query && state === 'loading' && items.length">
          <li v-for="it in items" :key="it.id" role="presentation" class="mx-2 flex items-center gap-3 px-2.5 py-2.5 opacity-50">
            <span class="h-9 w-9 rounded-xl bg-surface-sunken" />
            <span class="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{{ it.title }}</span>
          </li>
        </template>

        <li v-if="query && state === 'ready' && !items.length" role="presentation" class="px-5 py-6 text-center">
          <p class="text-sm font-semibold text-ink">'{{ query }}'에 맞는 결과가 없어요</p>
          <p class="mt-1 text-xs text-ink-muted">철자를 확인하거나 도시·공항 이름, 영문명, 코드로 검색해 보세요.</p>
        </li>
        <li v-if="state === 'error'" role="presentation" class="px-5 py-6 text-center">
          <p class="text-sm font-semibold text-ink">추천 목록을 불러오지 못했어요</p>
          <p class="mt-1 text-xs text-ink-muted">입력한 내용 그대로 검색할 수도 있어요.</p>
          <button type="button" class="mt-3 rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary-soft" @pointerdown.prevent @click="retry">다시 시도</button>
        </li>
        <li v-if="state === 'offline'" role="presentation" class="px-5 py-6 text-center">
          <p class="text-sm font-semibold text-ink">인터넷 연결이 끊겼어요</p>
          <p class="mt-1 text-xs text-ink-muted">연결되면 자동으로 다시 검색합니다.</p>
        </li>
        <li v-if="!query && !rows.length" role="presentation" class="px-5 py-5 text-center text-xs text-ink-muted">
          도시, 공항, 역 이름을 입력해 보세요. 초성(ㄷㅋ)과 영문도 됩니다.
        </li>
      </ul>
    </div>
    </Teleport>
  </div>
</template>
