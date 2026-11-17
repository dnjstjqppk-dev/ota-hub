<script setup lang="ts">
/**
 * Single-series daily bar chart (one measure per chart — never a dual axis).
 * Thin bars with a 2px surface gap, rounded data-end, recessive baseline,
 * per-bar hover/focus tooltip, and min/max direct labels only.
 */
import { computed, ref } from 'vue'

const props = defineProps<{ title: string; points: Array<{ date: string; value: number }>; format: (n: number) => string }>()
const H = 120
const max = computed(() => Math.max(1, ...props.points.map((p) => p.value)))
const total = computed(() => props.points.reduce((s, p) => s + p.value, 0))
const peak = computed(() => props.points.reduce((best, p, i) => (p.value > (props.points[best]?.value ?? -1) ? i : best), 0))
const hover = ref<number | null>(null)
const label = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`
</script>

<template>
  <figure class="card p-4">
    <figcaption class="mb-3 flex items-baseline justify-between gap-2">
      <span class="text-sm font-bold text-ink">{{ title }}</span>
      <span class="text-xs tabular text-ink-muted">기간 합계 {{ format(total) }}</span>
    </figcaption>
    <div class="relative" @mouseleave="hover = null">
      <div class="flex items-end gap-[2px] border-b border-line" :style="{ height: `${H}px` }" role="list" :aria-label="title">
        <button
          v-for="(p, i) in points" :key="p.date" type="button" role="listitem"
          class="group relative flex h-full flex-1 items-end focus:outline-none"
          :aria-label="`${p.date} ${format(p.value)}`"
          @mouseenter="hover = i" @focus="hover = i" @blur="hover = null"
        >
          <span class="block w-full rounded-t-[4px] transition-colors" :class="hover === i ? 'bg-primary' : 'bg-primary/70'" :style="{ height: p.value ? `${Math.max(2, (p.value / max) * (H - 18))}px` : '0px' }" />
          <span v-if="i === peak && p.value > 0 && hover === null" class="pointer-events-none absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-2xs font-semibold tabular text-ink-muted" :style="{ bottom: `${(p.value / max) * (H - 18) + 2}px` }">{{ format(p.value) }}</span>
        </button>
      </div>
      <div v-if="hover !== null && points[hover]" class="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full rounded-field bg-midnight-900 px-2.5 py-1.5 text-xs text-white shadow-pop" :style="{ left: `${((hover + 0.5) / points.length) * 100}%` }">
        <p class="text-white/70">{{ points[hover].date }}</p>
        <p class="font-bold tabular">{{ format(points[hover].value) }}</p>
      </div>
      <div class="mt-1 flex justify-between text-2xs tabular text-ink-subtle">
        <span>{{ points[0] ? label(points[0].date) : '' }}</span>
        <span>{{ points.length ? label(points[points.length - 1].date) : '' }}</span>
      </div>
    </div>
  </figure>
</template>
