<script setup lang="ts">
/**
 * Product landing page frame (design system "Terra Nord"): architectural hero with fixed-tab
 * search dock, caller-provided rails, verified booking facts, and SSR-accessible FAQ.
 */
defineProps<{
  tab: 'hotels' | 'flights' | 'packages' | 'activities' | 'trains' | 'cars' | 'transfers'
  crumb: string
  title: string
  subtitle: string
  facts: { icon: string; title: string; body: string }[]
  faq?: { q: string; a: string; to?: string }[]
}>()
</script>

<template>
  <div class="pb-16">
    <section class="relative overflow-hidden border-b border-line bg-gradient-to-b from-primary-soft/60 via-canvas to-canvas">
      <div class="pointer-events-none absolute inset-0 opacity-30 dark:opacity-10" style="background-image: linear-gradient(to right, rgb(var(--gft-line)) 1px, transparent 1px), linear-gradient(to bottom, rgb(var(--gft-line)) 1px, transparent 1px); background-size: 64px 64px;" aria-hidden="true" />
      <div class="relative mx-auto max-w-7xl px-4 pb-8 pt-6 lg:px-6 lg:pb-10 lg:pt-10">
        <nav class="mb-3 flex items-center gap-1.5 text-xs font-medium text-ink-subtle" :aria-label="$t('common.breadcrumb')">
          <NuxtLink :to="$localePath('/')" class="hover:text-primary">{{ $t('common.home') }}</NuxtLink>
          <AppIcon name="chevron-right" :size="12" />
          <span class="font-semibold text-ink">{{ crumb }}</span>
        </nav>
        <h1 class="font-display text-3xl font-extrabold leading-tight tracking-tight text-ink sm:text-4xl lg:text-[42px]">{{ title }}</h1>
        <p class="mt-2 max-w-2xl text-sm leading-relaxed text-ink-muted sm:text-base">{{ subtitle }}</p>
        <div class="mt-6"><HomeSearchWidget :initial-tab="tab" fixed /></div>
      </div>
    </section>

    <slot />

    <section class="mx-auto mt-16 max-w-7xl px-4 lg:px-6" aria-labelledby="h-facts">
      <h2 id="h-facts" class="mb-5 font-display text-2xl font-extrabold tracking-tight text-ink">{{ $t('landing.factsTitle') }}</h2>
      <div class="grid gap-px overflow-hidden rounded-card border border-line bg-line md:grid-cols-3">
        <div v-for="(f, idx) in facts" :key="f.title" class="bg-surface p-6">
          <div class="flex items-center justify-between">
            <span class="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-soft text-primary"><AppIcon :name="f.icon" /></span>
            <span class="font-mono text-xs font-bold text-ink-subtle">0{{ idx + 1 }}</span>
          </div>
          <h3 class="mt-4 font-display font-bold text-ink">{{ f.title }}</h3>
          <p class="mt-1.5 text-sm leading-relaxed text-ink-muted">{{ f.body }}</p>
        </div>
      </div>
    </section>

    <SeoFaq v-if="faq?.length" :items="faq" class="mx-auto mt-16 max-w-7xl px-4 lg:px-6" />
  </div>
</template>
