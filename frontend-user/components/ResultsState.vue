<script setup lang="ts">
/**
 * Loading / error / empty states for search result lists (design system "Horizon").
 * Renders the default slot only when state is 'ready' and there are results.
 */
defineProps<{
  state: 'loading' | 'ready' | 'error'
  count: number
  icon?: string
  emptyTitle: string
  emptyHint?: string
  errorTitle?: string
}>()
defineEmits<{ retry: [] }>()
</script>

<template>
  <ul v-if="state === 'loading'" class="space-y-3" aria-busy="true" aria-label="불러오는 중">
    <li v-for="n in 4" :key="n" class="rounded-card border border-line bg-surface p-5">
      <div class="flex items-center gap-4">
        <div class="h-10 w-10 animate-pulse rounded-xl bg-surface-sunken" />
        <div class="flex-1 space-y-2"><div class="h-4 w-1/2 animate-pulse rounded bg-surface-sunken" /><div class="h-3 w-1/3 animate-pulse rounded bg-surface-sunken" /></div>
        <div class="h-8 w-24 animate-pulse rounded bg-surface-sunken" />
      </div>
    </li>
  </ul>

  <div v-else-if="state === 'error'" class="rounded-card border border-dashed border-line-strong bg-surface px-6 py-12 text-center" role="alert">
    <span class="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-danger-soft text-danger"><AppIcon name="close" /></span>
    <p class="mt-4 font-bold text-ink">{{ errorTitle || '목록을 불러오지 못했어요' }}</p>
    <p class="mt-1 text-sm text-ink-muted">네트워크 상태를 확인한 뒤 다시 시도해 주세요.</p>
    <button type="button" class="mt-5 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-ink hover:bg-primary-hover" @click="$emit('retry')">다시 시도</button>
  </div>

  <div v-else-if="!count" class="rounded-card border border-dashed border-line-strong bg-surface px-6 py-12 text-center">
    <span class="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-sunken text-ink-subtle"><AppIcon :name="icon || 'search'" /></span>
    <p class="mt-4 font-bold text-ink">{{ emptyTitle }}</p>
    <p v-if="emptyHint" class="mt-1 text-sm text-ink-muted">{{ emptyHint }}</p>
    <div class="mt-5 flex flex-wrap justify-center gap-2"><slot name="empty-actions" /></div>
  </div>

  <slot v-else />
</template>
