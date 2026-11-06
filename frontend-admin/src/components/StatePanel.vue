<script setup lang="ts">
/** Loading / error / empty placeholder for a list or panel. Renders the default slot only when ready and non-empty. */
withDefaults(defineProps<{ state: 'loading' | 'ready' | 'error'; error?: string; empty?: boolean; emptyText?: string; rows?: number }>(), {
  emptyText: '표시할 항목이 없어요.', rows: 4
})
defineEmits<{ retry: [] }>()
</script>

<template>
  <div v-if="state === 'loading'" class="space-y-2" aria-busy="true" aria-live="polite">
    <span class="sr-only">불러오는 중</span>
    <div v-for="n in rows" :key="n" class="h-12 animate-pulse rounded-field bg-surface-sunken" />
  </div>
  <div v-else-if="state === 'error'" class="card flex flex-col items-center gap-3 p-8 text-center" role="alert">
    <p class="text-sm font-semibold text-danger">불러오지 못했어요</p>
    <p class="max-w-md text-sm text-ink-muted">{{ error }}</p>
    <button type="button" class="btn-secondary btn-sm" @click="$emit('retry')">다시 시도</button>
  </div>
  <div v-else-if="empty" class="card p-8 text-center text-sm text-ink-muted">{{ emptyText }}</div>
  <slot v-else />
</template>
