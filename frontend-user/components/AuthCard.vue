<script setup lang="ts">
/** Centered architectural card for sign-in / sign-up / password pages (design system "Terra Nord"). */
defineProps<{ title: string; subtitle?: string; icon?: string }>()
</script>

<template>
  <div class="relative flex min-h-[78vh] items-start justify-center px-4 pb-20 pt-8 sm:items-center sm:pt-12">
    <div class="pointer-events-none absolute inset-x-0 top-0 h-64 bg-gradient-to-b from-primary-soft/50 to-transparent" aria-hidden="true" />
    <div class="card relative w-full max-w-md p-6 shadow-pop sm:p-9">
      <div class="text-center">
        <NuxtLink :to="$localePath('/')" class="inline-block" :aria-label="$t('auth.home')">
          <img src="/logo.svg" alt="getfortrip" class="mx-auto h-8 w-auto dark:hidden" width="147" height="32" />
          <img src="/logo-white.svg" alt="getfortrip" class="mx-auto hidden h-8 w-auto dark:block" width="147" height="32" />
        </NuxtLink>
        <span v-if="icon" class="mx-auto mt-5 flex h-12 w-12 items-center justify-center rounded-xl bg-primary-soft text-primary"><AppIcon :name="icon" /></span>
        <h1 class="mt-4 font-display text-2xl font-extrabold tracking-tight text-ink">{{ title }}</h1>
        <p v-if="subtitle" class="mt-1.5 text-sm text-ink-muted">{{ subtitle }}</p>
      </div>
      <div class="mt-7"><slot /></div>
    </div>
  </div>
</template>
