<script setup lang="ts">
import { BRAND } from '~/config/brand'
const { t } = useI18n()
useSeoPage({ site: `https://${useRuntimeConfig().public.brandDomain}`, path: '/sustainability', title: t('seo.sustainability.title'), description: t('seo.sustainability.description') })
</script>

<template>
  <div class="mx-auto max-w-4xl space-y-8 px-4 pb-24 pt-8 lg:px-6 lg:pb-16">
    <div class="space-y-3 text-center">
      <span class="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-3.5 py-1 text-2xs font-bold uppercase tracking-wider text-success">
        <AppIcon name="globe" :size="13" /> Sustainable Travel
      </span>
      <h1 class="font-display text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
        {{ $t('sustainPage.heroTitle', { brand: BRAND.name }) }}
      </h1>
      <p class="mx-auto max-w-xl text-sm text-ink-muted">
        {{ $t('sustainPage.heroSub') }}
      </p>
    </div>

    <div class="grid grid-cols-1 gap-6 md:grid-cols-2">
      <article class="card space-y-3 p-6 sm:p-7">
        <div class="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-soft text-primary">
          <AppIcon name="ticket" :size="22" />
        </div>
        <h2 class="text-lg font-extrabold text-ink">{{ $t('sustainPage.c1Title') }}</h2>
        <p class="text-sm leading-relaxed text-ink-muted">{{ $t('sustainPage.c1Body') }}</p>
      </article>

      <article class="card space-y-3 p-6 sm:p-7">
        <div class="flex h-12 w-12 items-center justify-center rounded-2xl bg-success-soft text-success">
          <AppIcon name="users" :size="22" />
        </div>
        <h2 class="text-lg font-extrabold text-ink">{{ $t('sustainPage.c2Title') }}</h2>
        <p class="text-sm leading-relaxed text-ink-muted">{{ $t('sustainPage.c2Body') }}</p>
      </article>
    </div>
  </div>
</template>
