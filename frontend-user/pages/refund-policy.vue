<script setup lang="ts">
import { BRAND } from '~/config/brand'
import { jsonLdScript } from '~/composables/useJsonLd'
const VERSION = '2.0'
const EFFECTIVE = '2026-11-07'
const REVISED = '2026-11-07'
const { t } = useI18n()
useSeoPage({ site: `https://${useRuntimeConfig().public.brandDomain}`, path: '/refund-policy', title: t('seo.refund.title'), description: t('seo.refund.description') })
// S6: document revision as WebPage dateModified.
useHead({ script: [jsonLdScript({ '@context': 'https://schema.org', '@type': 'WebPage', url: `https://${useRuntimeConfig().public.brandDomain}/refund-policy`, dateModified: REVISED })] })
const SECTIONS = [
  { key: 'hotel', icon: 'hotel' },
  { key: 'flight', icon: 'flight' },
  { key: 'mobility', icon: 'car' },
  { key: 'other', icon: 'package' },
] as const
</script>

<template>
  <div class="mx-auto max-w-4xl space-y-8 px-4 pb-24 pt-10 lg:px-6 lg:pb-16">
    <div class="space-y-3 text-center">
      <span class="inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-3.5 py-1 text-2xs font-bold uppercase tracking-wider text-primary">
        Cancellation & Refund Policy · v{{ VERSION }}
      </span>
      <h1 class="font-display text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
        {{ $t('legal.refund.title') }}
      </h1>
      <p class="mx-auto max-w-2xl text-sm text-ink-muted">
        {{ $t('legal.refund.intro', { brand: BRAND.name, d: EFFECTIVE }) }}
      </p>
      <p class="text-xs text-ink-subtle">{{ $t('common.updatedAt', { d: REVISED }) }}</p>
    </div>

    <div class="space-y-5">
      <section v-for="s in SECTIONS" :key="s.key" class="card space-y-3 p-6 sm:p-7">
        <h2 class="flex items-center gap-2.5 text-base font-extrabold text-ink">
          <span class="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-soft text-primary"><AppIcon :name="s.icon" :size="18" /></span>
          <span>{{ $t(`legal.refund.${s.key}Title`) }}</span>
        </h2>
        <p class="whitespace-pre-line text-sm leading-relaxed text-ink-muted">
          {{ $t(`legal.refund.${s.key}Body`) }}
        </p>
      </section>
    </div>
  </div>
</template>
