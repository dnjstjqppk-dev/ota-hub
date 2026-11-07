<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{ page: number; totalPages: number; total: number }>(), { page: 1, totalPages: 1, total: 0 })
const emit = defineEmits<{ (e: 'go', page: number): void }>()

const window_ = computed(() => {
  const pages = new Set<number>([1, props.totalPages, props.page - 1, props.page, props.page + 1])
  return [...pages].filter((p) => p >= 1 && p <= props.totalPages).sort((a, b) => a - b)
})

function go(p: number) {
  if (p >= 1 && p <= props.totalPages && p !== props.page) emit('go', p)
}
</script>

<template>
  <nav v-if="totalPages > 1" class="mt-4 flex flex-wrap items-center justify-center gap-1.5" aria-label="페이지 이동">
    <button type="button" class="btn-ghost btn-sm" :disabled="page <= 1" aria-label="이전 페이지" @click="go(page - 1)">‹</button>
    <button
      v-for="p in window_"
      :key="p"
      type="button"
      :class="['btn-sm rounded-lg px-2.5 py-1 text-xs font-bold tabular', p === page ? 'bg-primary text-primary-ink' : 'btn-ghost']"
      :aria-current="p === page ? 'page' : undefined"
      @click="go(p)"
    >{{ p }}</button>
    <button type="button" class="btn-ghost btn-sm" :disabled="page >= totalPages" aria-label="다음 페이지" @click="go(page + 1)">›</button>
    <span class="ml-2 text-2xs tabular text-ink-subtle">총 {{ total.toLocaleString() }}건</span>
  </nav>
  <p v-else-if="total > 0" class="mt-4 text-center text-2xs tabular text-ink-subtle">총 {{ total.toLocaleString() }}건</p>
</template>
