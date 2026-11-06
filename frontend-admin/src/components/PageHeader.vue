<script setup lang="ts">
defineProps<{ title: string; description?: string }>()
</script>

<template>
  <header class="flex flex-wrap items-end justify-between gap-3 pb-5">
    <div class="min-w-0">
      <h1 class="text-xl font-bold tracking-tight text-ink sm:text-2xl">{{ title }}</h1>
      <p v-if="description" class="mt-1 max-w-3xl text-sm text-ink-muted">{{ description }}</p>
    </div>
    <div v-if="$slots.default" class="flex flex-wrap items-center gap-2"><slot /></div>
  </header>
</template>
