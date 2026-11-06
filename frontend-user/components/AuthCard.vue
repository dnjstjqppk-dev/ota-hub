<script setup lang="ts">
/** Centered card for sign-in / sign-up / password pages (design system "Horizon"). */
defineProps<{ title: string; subtitle?: string; icon?: string }>()
</script>

<template>
  <div class="flex min-h-[78vh] items-start justify-center px-4 pb-16 pt-10 sm:items-center">
    <div class="card w-full max-w-md p-6 shadow-card sm:p-9">
      <div class="text-center">
        <NuxtLink to="/" class="inline-block" aria-label="getfortrip 홈"><img src="/logo.svg" alt="getfortrip" class="mx-auto h-8 w-auto" width="132" height="32" /></NuxtLink>
        <span v-if="icon" class="mx-auto mt-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-soft text-primary"><AppIcon :name="icon" /></span>
        <h1 class="mt-5 text-2xl font-extrabold tracking-tight text-ink">{{ title }}</h1>
        <p v-if="subtitle" class="mt-1.5 text-sm text-ink-muted">{{ subtitle }}</p>
      </div>
      <div class="mt-7"><slot /></div>
    </div>
  </div>
</template>
