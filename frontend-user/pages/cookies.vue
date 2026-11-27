<script setup lang="ts">
import { BRAND } from '~/config/brand'
import { jsonLdScript } from '~/composables/useJsonLd'
const VERSION = '1.1'
const EFFECTIVE = '2026-11-07'
const REVISED = '2026-11-07'
const { t } = useI18n()
useSeoPage({ site: `https://${useRuntimeConfig().public.brandDomain}`, path: '/cookies', title: t('seo.cookies.title'), description: t('seo.cookies.description') })
// S6: document revision as WebPage dateModified.
useHead({ script: [jsonLdScript({ '@context': 'https://schema.org', '@type': 'WebPage', url: `https://${useRuntimeConfig().public.brandDomain}/cookies`, dateModified: REVISED })] })
</script>

<template>
  <div class="mx-auto max-w-4xl space-y-8 px-4 pb-24 pt-10 lg:px-6 lg:pb-16">
    <div class="space-y-2 border-b border-line pb-6">
      <span class="text-xs font-bold text-primary">Cookie Policy · v{{ VERSION }}</span>
      <h1 class="font-display text-3xl font-extrabold tracking-tight text-ink">{{ $t('legal.cookies.title', { brand: BRAND.name }) }}</h1>
      <p class="text-xs text-ink-subtle">{{ $t('legal.effective', { d: EFFECTIVE }) }} · {{ $t('common.updatedAt', { d: REVISED }) }}</p>
    </div>

    <div class="card space-y-6 p-6 text-sm leading-relaxed text-ink-muted sm:p-8">
      <section v-for="n in 3" :key="n" class="space-y-2">
        <h2 class="text-base font-extrabold text-ink">{{ $t(`legal.cookies.s${n}Title`) }}</h2>
        <p class="whitespace-pre-line">{{ $t(`legal.cookies.s${n}Body`, { brand: BRAND.name }) }}</p>
      </section>
    </div>
  </div>
</template>
