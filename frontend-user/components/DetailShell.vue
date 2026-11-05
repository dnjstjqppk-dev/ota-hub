<script setup lang="ts">
/** Loading / not-found / error frame for product detail pages (design system "Horizon"). */
defineProps<{ state: 'loading' | 'ok' | 'notfound' | 'error'; listPath: string; listLabel: string }>()
defineEmits<{ retry: [] }>()
</script>

<template>
  <div class="mx-auto max-w-7xl px-4 pb-28 pt-5 lg:px-6 lg:pb-16">
    <div v-if="state === 'loading'" aria-busy="true" data-testid="detail-loading">
      <div class="h-4 w-40 animate-pulse rounded bg-surface-sunken" />
      <div class="mt-4 h-8 w-2/3 animate-pulse rounded bg-surface-sunken" />
      <div class="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]"><div class="h-72 animate-pulse rounded-card bg-surface-sunken" /><div class="h-56 animate-pulse rounded-card bg-surface-sunken" /></div>
    </div>
    <div v-else-if="state === 'notfound'" class="mx-auto max-w-xl py-20 text-center" data-testid="detail-notfound">
      <span class="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-sunken text-ink-subtle"><AppIcon name="search" /></span>
      <p class="mt-4 font-bold text-ink">요청하신 상품을 찾을 수 없어요</p>
      <p class="mt-1 text-sm text-ink-muted">판매가 끝났거나 주소가 잘못되었을 수 있어요.</p>
      <NuxtLink :to="listPath" class="btn-primary mt-5">{{ listLabel }}</NuxtLink>
    </div>
    <div v-else-if="state === 'error'" class="mx-auto max-w-xl py-20 text-center" role="alert">
      <span class="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-danger-soft text-danger"><AppIcon name="close" /></span>
      <p class="mt-4 font-bold text-ink">상품 정보를 불러오지 못했어요</p>
      <p class="mt-1 text-sm text-ink-muted">네트워크 상태를 확인한 뒤 다시 시도해 주세요.</p>
      <button type="button" class="btn-primary mt-5" @click="$emit('retry')">다시 시도</button>
    </div>
    <slot v-else />
  </div>
</template>
