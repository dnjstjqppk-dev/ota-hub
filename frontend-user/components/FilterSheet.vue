<script setup lang="ts">
/** Phone bottom sheet for result filters. Locks page scroll while open and restores it on close/unmount. */
import { onBeforeUnmount, watch } from 'vue'

const props = defineProps<{ open: boolean; title?: string; applyLabel: string }>()
const emit = defineEmits<{ (e: 'close'): void; (e: 'reset'): void }>()

watch(() => props.open, (v) => { document.documentElement.style.overflow = v ? 'hidden' : '' })
onBeforeUnmount(() => { document.documentElement.style.overflow = '' })
</script>

<template>
  <Teleport to="body">
    <Transition enter-from-class="opacity-0" enter-active-class="transition-opacity duration-150" leave-to-class="opacity-0" leave-active-class="transition-opacity duration-100">
      <div v-if="open" class="fixed inset-0 z-[70] bg-midnight-950/50 lg:hidden" @click="emit('close')" />
    </Transition>
    <div v-if="open" role="dialog" aria-modal="true" :aria-label="title || '필터'" class="fixed inset-x-0 bottom-0 z-[71] flex max-h-[88vh] animate-pop-in flex-col rounded-t-[28px] bg-surface-raised shadow-pop lg:hidden">
      <div class="flex items-center justify-between border-b border-line px-5 pb-3 pt-4">
        <h2 class="text-base font-bold text-ink">{{ title || '필터' }}</h2>
        <button type="button" class="flex h-9 w-9 items-center justify-center rounded-full text-ink-muted hover:bg-surface-sunken" aria-label="닫기" @click="emit('close')"><AppIcon name="close" /></button>
      </div>
      <div class="flex-1 overflow-y-auto overscroll-contain px-5 py-4"><slot /></div>
      <div class="flex gap-2 border-t border-line px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        <button type="button" class="rounded-xl px-4 py-3 text-sm font-semibold text-ink-muted hover:bg-surface-sunken" @click="emit('reset')">초기화</button>
        <button type="button" class="flex-1 rounded-xl bg-primary py-3 text-sm font-bold text-primary-ink hover:bg-primary-hover" @click="emit('close')">{{ applyLabel }}</button>
      </div>
    </div>
  </Teleport>
</template>
