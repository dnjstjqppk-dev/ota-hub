<script setup lang="ts">
// #91: no open roles and no ATS integration exist, so the page honestly says
// so instead of listing fabricated postings with a mailto apply button.
import { BRAND } from '~/config/brand'
const { t } = useI18n()
useSeoPage({ site: `https://${useRuntimeConfig().public.brandDomain}`, path: '/careers', title: t('seo.careers.title'), description: t('seo.careers.description') })
</script>

<template>
  <div class="mx-auto max-w-4xl space-y-8 px-4 pb-24 pt-8 lg:px-6 lg:pb-16">
    <div class="space-y-3 text-center">
      <span class="inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-3.5 py-1 text-2xs font-bold uppercase tracking-wider text-primary">
        Careers at {{ BRAND.name }}
      </span>
      <h1 class="font-display text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
        {{ $t('careers.h1') }}
      </h1>
      <p class="mx-auto max-w-xl text-sm text-ink-muted">
        {{ $t('careers.sub') }}
      </p>
    </div>

    <div class="card p-8 text-center">
      <p class="text-sm font-semibold text-ink">{{ $t('careers.none') }}</p>
      <NuxtLink :to="$localePath('/help')" class="btn-primary mt-5 !text-xs">
        {{ $t('careers.cta') }}
      </NuxtLink>
    </div>
  </div>
</template>
