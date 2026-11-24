<script setup lang="ts">
// #91: no open roles and no ATS integration exist, so the page honestly says
// so instead of listing fabricated postings with a mailto apply button.
import { BRAND } from '~/config/brand'
const { t } = useI18n()
useSeoPage({ site: `https://${useRuntimeConfig().public.brandDomain}`, path: '/careers', title: t('seo.careers.title'), description: t('seo.careers.description') })
</script>

<template>
  <div class="max-w-4xl mx-auto px-4 py-12 space-y-10">
    <div class="text-center space-y-3">
      <span class="px-3.5 py-1 bg-blue-50 text-trip-blue rounded-full text-xs font-black uppercase tracking-wider">
        Careers at {{ BRAND.name }}
      </span>
      <h1 class="text-3xl sm:text-4xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
        {{ $t('careers.h1') }}
      </h1>
      <p class="text-sm text-slate-500 dark:text-slate-400 max-w-xl mx-auto">
        {{ $t('careers.sub') }}
      </p>
    </div>

    <div class="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700/90 shadow-sm p-8 text-center">
      <p class="text-sm font-semibold text-slate-700 dark:text-slate-200">{{ $t('careers.none') }}</p>
      <NuxtLink :to="$localePath('/help')" class="mt-4 inline-block px-4 py-2.5 bg-trip-blue hover:bg-blue-600 text-white rounded-xl text-xs font-black shadow-sm transition">
        {{ $t('careers.cta') }}
      </NuxtLink>
    </div>
  </div>
</template>

