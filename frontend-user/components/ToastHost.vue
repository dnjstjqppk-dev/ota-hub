<script setup lang="ts">
// CR-08: toast outlet. Sits above the mobile bottom nav, top-right on desktop.
import { useToastStore } from '~/stores/toast'

const toasts = useToastStore()
const tone = {
  success: 'border-success/30 bg-surface text-ink [&_.dot]:bg-success',
  error: 'border-danger/30 bg-surface text-ink [&_.dot]:bg-danger',
  info: 'border-line bg-surface text-ink [&_.dot]:bg-primary'
} as const
</script>

<template>
  <div class="pointer-events-none fixed inset-x-0 bottom-[calc(76px+env(safe-area-inset-bottom))] z-[70] flex flex-col items-center gap-2 px-4 md:bottom-auto md:left-auto md:right-6 md:top-20 md:items-end" aria-live="polite" role="status">
    <TransitionGroup enter-from-class="translate-y-2 opacity-0" enter-active-class="transition duration-200" leave-to-class="opacity-0" leave-active-class="transition duration-150">
      <div v-for="t in toasts.items" :key="t.id" class="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border px-4 py-3 text-sm shadow-pop" :class="tone[t.tone]" data-testid="toast">
        <span class="dot mt-1.5 h-2 w-2 shrink-0 rounded-full" aria-hidden="true" />
        <p class="min-w-0 flex-1 break-words">{{ t.text }}</p>
        <button type="button" class="-m-2 grid h-11 w-11 shrink-0 place-items-center text-ink-subtle hover:text-ink" aria-label="알림 닫기" @click="toasts.dismiss(t.id)">✕</button>
      </div>
    </TransitionGroup>
  </div>
</template>
