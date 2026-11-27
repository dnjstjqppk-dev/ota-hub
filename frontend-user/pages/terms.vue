<script setup lang="ts">
import { BRAND } from '~/config/brand'
import { jsonLdScript } from '~/composables/useJsonLd'
const VERSION = '2.1'
const EFFECTIVE = '2026-11-10'
const REVISED = '2026-11-10'
const { t } = useI18n()
useSeoPage({ site: `https://${useRuntimeConfig().public.brandDomain}`, path: '/terms', title: t('seo.terms.title'), description: t('seo.terms.description') })
// S6: document revision as WebPage dateModified.
useHead({ script: [jsonLdScript({ '@context': 'https://schema.org', '@type': 'WebPage', url: `https://${useRuntimeConfig().public.brandDomain}/terms`, dateModified: REVISED })] })
</script>

<template>
  <div class="mx-auto max-w-4xl space-y-8 px-4 pb-24 pt-10 lg:px-6 lg:pb-16">
    <div class="space-y-2 border-b border-line pb-6">
      <span class="text-xs font-bold text-primary">Terms of Service · v{{ VERSION }}</span>
      <h1 class="font-display text-3xl font-extrabold tracking-tight text-ink">{{ $t('legal.terms.title', { brand: BRAND.name }) }}</h1>
      <p class="text-xs text-ink-subtle">{{ $t('legal.effective', { d: EFFECTIVE }) }} · {{ $t('common.updatedAt', { d: REVISED }) }}</p>
    </div>

    <div class="card space-y-6 p-6 text-sm leading-relaxed text-ink-muted sm:p-8">
      <section v-for="n in 8" :key="n" class="space-y-2">
        <h2 class="text-base font-extrabold text-ink">{{ $t(`legal.terms.a${n}Title`) }}</h2>
        <p class="whitespace-pre-line">{{ $t(`legal.terms.a${n}Body`, { brand: BRAND.name }) }}</p>
      </section>
      <section class="space-y-2 border-t border-line pt-5">
        <h2 class="text-base font-extrabold text-ink">{{ $t('legal.terms.addendumTitle') }}</h2>
        <p>{{ $t('legal.terms.addendumBody', { v: VERSION, d: EFFECTIVE }) }}</p>
      </section>
    </div>
  </div>
</template>
