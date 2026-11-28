<script setup lang="ts">
/** Loading / not-found / error frame for product detail pages (design system "Terra Nord"). */
defineProps<{ state: 'loading' | 'ok' | 'notfound' | 'error'; listPath: string; listLabel: string }>()
defineEmits<{ retry: [] }>()
</script>

<template>
  <div class="mx-auto max-w-7xl px-4 pb-36 pt-5 md:pb-24 lg:px-6 lg:pb-16">
    <div v-if="state === 'loading'" aria-busy="true" data-testid="detail-loading">
      <div class="h-4 w-40 animate-pulse rounded bg-surface-sunken" />
      <div class="mt-4 h-8 w-2/3 animate-pulse rounded bg-surface-sunken" />
      <div class="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]"><div class="h-72 animate-pulse rounded-card bg-surface-sunken" /><div class="h-56 animate-pulse rounded-card bg-surface-sunken" /></div>
    </div>
    <div v-else-if="state === 'notfound'" class="mx-auto max-w-xl py-20 text-center" data-testid="detail-notfound">
      <span class="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-sunken text-ink-subtle"><AppIcon name="search" /></span>
      <p class="mt-4 font-display font-bold text-ink">{{ $t('detail.notFound') }}</p>
      <p class="mt-1 text-sm text-ink-muted">{{ $t('detail.notFoundHint') }}</p>
      <NuxtLink :to="$localePath(listPath)" class="btn-primary mt-5">{{ listLabel }}</NuxtLink>
    </div>
    <div v-else-if="state === 'error'" class="mx-auto max-w-xl py-20 text-center" role="alert">
      <span class="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-danger-soft text-danger"><AppIcon name="close" /></span>
      <p class="mt-4 font-display font-bold text-ink">{{ $t('detail.loadFailed') }}</p>
      <p class="mt-1 text-sm text-ink-muted">{{ $t('search.checkNetwork') }}</p>
      <button type="button" class="btn-primary mt-5" @click="$emit('retry')">{{ $t('common.retry') }}</button>
    </div>
    <slot v-else />
  </div>
</template>
