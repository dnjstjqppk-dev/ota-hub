<script setup lang="ts">
import { BRAND } from '~/config/brand'

const articles: Array<{ id: number; date: string; category: string; title: string; summary: string }> = []
const { t } = useI18n()
useSeoPage({ site: `https://${useRuntimeConfig().public.brandDomain}`, path: '/news', title: t('seo.news.title'), description: t('seo.news.description') })
</script>

<template>
  <div class="mx-auto max-w-4xl space-y-8 px-4 pb-24 pt-8 lg:px-6 lg:pb-16">
    <div class="space-y-3 text-center">
      <span class="inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-3.5 py-1 text-2xs font-bold uppercase tracking-wider text-primary">
        Newsroom
      </span>
      <h1 class="font-display text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
        {{ $t('news.h1', { brand: BRAND.name }) }}
      </h1>
      <p class="text-sm text-ink-muted">
        {{ $t('news.sub', { brand: BRAND.name }) }}
      </p>
    </div>

    <div v-if="articles.length" class="space-y-4">
      <article v-for="a in articles" :key="a.id" class="card space-y-2 p-6 transition hover:shadow-pop">
        <div class="flex items-center gap-2">
          <span class="rounded-full bg-surface-sunken px-2.5 py-0.5 text-2xs font-bold text-ink-muted">{{ a.category }}</span>
          <span class="font-mono text-xs text-ink-subtle">{{ a.date }}</span>
        </div>
        <h2 class="text-lg font-extrabold text-ink">{{ a.title }}</h2>
        <p class="text-sm leading-relaxed text-ink-muted">{{ a.summary }}</p>
      </article>
    </div>
    <div v-else class="card p-10 text-center">
      <p class="text-sm font-bold text-ink">{{ $t('news.empty') }}</p>
      <p class="mt-2 text-xs text-ink-muted">{{ $t('news.emptySub') }}</p>
    </div>
  </div>
</template>
