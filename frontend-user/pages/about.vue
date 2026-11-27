<script setup lang="ts">
import { BRAND } from '~/config/brand'
const { t } = useI18n()
useSeoPage({ site: `https://${useRuntimeConfig().public.brandDomain}`, path: '/about', title: t('seo.about.title'), description: t('seo.about.description') })
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-12 px-4 pb-24 pt-8 lg:px-6 lg:pb-16">
    <!-- Hero -->
    <section class="relative overflow-hidden rounded-[28px] bg-midnight-900 px-6 py-12 text-center text-white shadow-pop sm:px-12">
      <div class="pointer-events-none absolute -left-20 -top-24 h-72 w-72 rounded-full bg-primary/35 blur-3xl" aria-hidden="true" />
      <div class="pointer-events-none absolute -bottom-24 -right-20 h-72 w-72 rounded-full bg-accent/25 blur-3xl" aria-hidden="true" />
      <div class="relative mx-auto max-w-2xl space-y-4">
        <span class="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3.5 py-1 text-2xs font-bold uppercase tracking-widest text-horizon-300">
          About {{ BRAND.name }}
        </span>
        <h1 class="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
          {{ $t('aboutPage.heroTitle') }}
        </h1>
        <p class="text-sm leading-relaxed text-white/75 sm:text-base">
          {{ $t('aboutPage.heroSub', { brand: BRAND.name }) }}
        </p>
      </div>
    </section>

    <!-- 3 Pillars -->
    <div class="grid grid-cols-1 gap-6 md:grid-cols-3">
      <article class="card space-y-3 p-6">
        <div class="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-soft text-primary">
          <AppIcon name="shield" :size="22" />
        </div>
        <h2 class="text-lg font-extrabold text-ink">{{ $t('aboutPage.p1Title') }}</h2>
        <p class="text-sm leading-relaxed text-ink-muted">{{ $t('aboutPage.p1Desc') }}</p>
      </article>

      <article class="card space-y-3 p-6">
        <div class="flex h-12 w-12 items-center justify-center rounded-2xl bg-success-soft text-success">
          <AppIcon name="check" :size="22" />
        </div>
        <h2 class="text-lg font-extrabold text-ink">{{ $t('aboutPage.p2Title') }}</h2>
        <p class="text-sm leading-relaxed text-ink-muted">{{ $t('aboutPage.p2Desc') }}</p>
      </article>

      <article class="card space-y-3 p-6">
        <div class="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft text-accent">
          <AppIcon name="support" :size="22" />
        </div>
        <h2 class="text-lg font-extrabold text-ink">{{ $t('aboutPage.p3Title') }}</h2>
        <p class="text-sm leading-relaxed text-ink-muted">{{ $t('aboutPage.p3Desc') }}</p>
      </article>
    </div>

    <!-- Platform Stats -->
    <section class="relative overflow-hidden rounded-[28px] border border-line bg-surface p-8 shadow-card sm:p-10">
      <div class="grid grid-cols-2 gap-6 text-center md:grid-cols-4">
        <div class="space-y-1">
          <div class="font-display text-2xl font-extrabold text-primary sm:text-3xl">{{ $t('aboutPage.s1Val') }}</div>
          <div class="text-xs font-semibold text-ink-muted">{{ $t('aboutPage.s1Label') }}</div>
        </div>
        <div class="space-y-1">
          <div class="font-display text-2xl font-extrabold text-success sm:text-3xl">{{ $t('aboutPage.s2Val') }}</div>
          <div class="text-xs font-semibold text-ink-muted">{{ $t('aboutPage.s2Label') }}</div>
        </div>
        <div class="space-y-1">
          <div class="font-display text-2xl font-extrabold text-accent sm:text-3xl">{{ $t('aboutPage.s3Val') }}</div>
          <div class="text-xs font-semibold text-ink-muted">{{ $t('aboutPage.s3Label') }}</div>
        </div>
        <div class="space-y-1">
          <div class="font-display text-2xl font-extrabold text-ink sm:text-3xl">{{ $t('aboutPage.s4Val') }}</div>
          <div class="text-xs font-semibold text-ink-muted">{{ $t('aboutPage.s4Label') }}</div>
        </div>
      </div>
    </section>
  </div>
</template>
