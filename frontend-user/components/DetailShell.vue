<script setup lang="ts">
defineProps<{ state: 'loading' | 'ok' | 'notfound' | 'error'; listPath: string; listLabel: string }>()
defineEmits<{ retry: [] }>()
</script>

<template>
  <div class="max-w-6xl mx-auto px-4 py-6 md:py-10">
    <div v-if="state === 'loading'" class="py-24 text-center text-sm text-slate-400" data-testid="detail-loading">상품 정보를 불러오는 중…</div>
    <div v-else-if="state === 'notfound'" class="py-24 text-center" data-testid="detail-notfound">
      <p class="text-sm font-semibold text-slate-700">요청하신 상품을 찾을 수 없습니다.</p>
      <NuxtLink :to="listPath" class="mt-4 inline-block rounded-xl bg-trip-blue px-4 py-2.5 text-sm font-semibold text-white">{{ listLabel }}</NuxtLink>
    </div>
    <div v-else-if="state === 'error'" class="py-24 text-center" role="alert">
      <p class="text-sm font-semibold text-slate-700">상품 정보를 불러오지 못했습니다.</p>
      <button class="mt-4 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold" @click="$emit('retry')">다시 시도</button>
    </div>
    <slot v-else />
  </div>
</template>
