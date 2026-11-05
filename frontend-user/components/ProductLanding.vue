<script setup lang="ts">
/**
 * Product landing page frame (design system "Horizon"): hero with the shared search widget fixed to one
 * product, then caller-provided sections, then "how booking works" facts. Facts must describe rules the
 * platform actually enforces (see worker/src/domain/pricing.ts) — no marketing guarantees.
 */
defineProps<{
  tab: 'hotels' | 'flights' | 'packages' | 'activities' | 'trains' | 'cars' | 'transfers'
  crumb: string
  title: string
  subtitle: string
  facts: { icon: string; title: string; body: string }[]
}>()
</script>

<template>
  <div class="pb-16">
    <section class="relative">
      <div class="pointer-events-none absolute inset-0 bg-gradient-to-b from-sapphire-50 via-canvas to-canvas" aria-hidden="true" />
      <div class="relative mx-auto max-w-7xl px-4 pb-6 pt-6 lg:px-6 lg:pt-10">
        <nav class="mb-3 flex items-center gap-1 text-xs text-ink-subtle" aria-label="이동 경로"><NuxtLink to="/" class="hover:text-ink">홈</NuxtLink><AppIcon name="chevron-right" :size="12" /><span>{{ crumb }}</span></nav>
        <h1 class="text-[28px] font-extrabold leading-tight tracking-tight text-ink sm:text-4xl">{{ title }}</h1>
        <p class="mt-2 max-w-2xl text-base text-ink-muted">{{ subtitle }}</p>
        <div class="mt-6"><HomeSearchWidget :initial-tab="tab" fixed /></div>
      </div>
    </section>

    <slot />

    <section class="mx-auto mt-16 max-w-7xl px-4 lg:px-6" aria-labelledby="h-facts">
      <h2 id="h-facts" class="mb-5 text-2xl font-bold tracking-tight text-ink">예약 전에 알아두세요</h2>
      <div class="grid gap-px overflow-hidden rounded-card border border-line bg-line md:grid-cols-3">
        <div v-for="f in facts" :key="f.title" class="bg-surface p-6">
          <span class="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-soft text-primary"><AppIcon :name="f.icon" /></span>
          <h3 class="mt-4 font-bold text-ink">{{ f.title }}</h3>
          <p class="mt-1.5 text-sm leading-relaxed text-ink-muted">{{ f.body }}</p>
        </div>
      </div>
    </section>
  </div>
</template>
