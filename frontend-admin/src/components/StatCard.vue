<script setup lang="ts">
import type { Tone } from '../composables/format'
withDefaults(defineProps<{ label: string; value: string; hint?: string; icon?: string; tone?: Tone; to?: string }>(), { tone: 'neutral' })
const ICON: Record<Tone, string> = {
  neutral: 'bg-surface-sunken text-ink-muted', info: 'bg-primary-soft text-primary', success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning', danger: 'bg-danger-soft text-danger'
}
</script>

<template>
  <component :is="to ? 'router-link' : 'div'" :to="to" :class="['card flex items-start justify-between gap-3 p-4 sm:p-5', to ? 'transition-[border-color,box-shadow] hover:border-primary/45 hover:shadow-pop' : '']">
    <div class="min-w-0">
      <p class="text-xs font-semibold text-ink-muted">{{ label }}</p>
      <p class="mt-1 truncate font-display text-xl font-extrabold text-ink tabular sm:text-2xl">{{ value }}</p>
      <p v-if="hint" class="mt-0.5 text-2xs text-ink-subtle">{{ hint }}</p>
    </div>
    <span v-if="icon" :class="['flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', ICON[tone]]"><AppIcon :name="icon" :size="18" /></span>
  </component>
</template>
