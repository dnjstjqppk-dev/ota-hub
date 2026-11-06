<script setup lang="ts">
import { toasts } from '../composables/session'
const TONE = { success: 'bg-midnight-900 text-white', danger: 'bg-danger text-white', info: 'bg-midnight-900 text-white' }
</script>

<template>
  <div class="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4" aria-live="polite" role="status">
    <div v-for="t in toasts" :key="t.id" :class="['pointer-events-auto max-w-md rounded-field px-4 py-2.5 text-sm font-medium shadow-pop animate-pop-in', TONE[t.tone]]">{{ t.text }}</div>
  </div>
</template>
