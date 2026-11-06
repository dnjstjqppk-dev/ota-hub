<script setup lang="ts">
/** Right-hand detail panel (full screen on phones). Esc and the backdrop close it; focus moves into it. */
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
const props = withDefaults(defineProps<{ open: boolean; title: string; subtitle?: string; wide?: boolean }>(), { wide: false })
const emit = defineEmits<{ close: [] }>()
const panel = ref<HTMLElement | null>(null)
let restore: HTMLElement | null = null
function onKey(e: KeyboardEvent) { if (e.key === 'Escape') emit('close') }
watch(() => props.open, async (o) => {
  if (o) {
    restore = document.activeElement as HTMLElement
    document.addEventListener('keydown', onKey)
    await nextTick()
    panel.value?.focus()
  } else {
    document.removeEventListener('keydown', onKey)
    restore?.focus?.()
  }
}, { immediate: true })
onBeforeUnmount(() => document.removeEventListener('keydown', onKey))
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="fixed inset-0 z-40 flex justify-end">
      <div class="absolute inset-0 bg-midnight-950/40" aria-hidden="true" @click="emit('close')" />
      <section
        ref="panel"
        tabindex="-1"
        role="dialog"
        aria-modal="true"
        :aria-label="title"
        :class="['relative flex h-full w-full flex-col bg-surface shadow-pop outline-none animate-slide-in', wide ? 'sm:max-w-2xl' : 'sm:max-w-lg']"
      >
        <header class="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div class="min-w-0">
            <h2 class="truncate text-base font-bold text-ink">{{ title }}</h2>
            <p v-if="subtitle" class="mt-0.5 truncate text-xs text-ink-muted">{{ subtitle }}</p>
          </div>
          <button type="button" class="btn-ghost btn-sm -mr-2 px-2" aria-label="닫기" @click="emit('close')"><AppIcon name="close" :size="18" /></button>
        </header>
        <div class="flex-1 overflow-y-auto px-5 py-5"><slot /></div>
        <footer v-if="$slots.footer" class="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3"><slot name="footer" /></footer>
      </section>
    </div>
  </Teleport>
</template>
