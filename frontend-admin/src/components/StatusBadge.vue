<script setup lang="ts">
import type { Tone } from '../composables/format'
withDefaults(defineProps<{ tone?: Tone; label: string }>(), { tone: 'neutral' })
const CLS: Record<Tone, string> = {
  neutral: 'bg-surface-sunken text-ink-muted',
  info: 'bg-primary-soft text-primary',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger'
}
</script>

<template>
  <span :class="['inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-2xs font-semibold', CLS[tone]]">{{ label }}</span>
</template>
