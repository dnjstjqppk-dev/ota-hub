<script setup lang="ts">
import { BRAND } from '~/config/brand'
const { t } = useI18n()
useSeoPage({ site: `https://${useRuntimeConfig().public.brandDomain}`, path: '/safety', title: t('seo.safety.title'), description: t('seo.safety.description') })
</script>

<template>
  <div class="mx-auto max-w-4xl space-y-8 px-4 pb-24 pt-8 lg:px-6 lg:pb-16">
    <div class="space-y-3 text-center">
      <span class="inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-3.5 py-1 text-2xs font-bold uppercase tracking-wider text-primary">
        <AppIcon name="shield" :size="13" /> Safe Travel Guide
      </span>
      <h1 class="font-display text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
        {{ $t('safetyPage.heroTitle') }}
      </h1>
      <p class="mx-auto max-w-xl text-sm text-ink-muted">
        {{ $t('safetyPage.heroSub', { brand: BRAND.name }) }}
      </p>
    </div>

    <div class="space-y-5">
      <section class="card space-y-4 p-6 sm:p-7">
        <h2 class="flex items-center gap-2.5 text-base font-extrabold text-ink">
          <span class="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-soft text-primary"><AppIcon name="check" :size="18" /></span>
          <span>{{ $t('safetyPage.checkTitle') }}</span>
        </h2>
        <ul class="space-y-3 text-sm leading-relaxed text-ink-muted">
          <li class="flex items-start gap-2.5"><span class="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" /><span><strong class="text-ink">{{ $t('safetyPage.c1Head') }}</strong> {{ $t('safetyPage.c1Body') }}</span></li>
          <li class="flex items-start gap-2.5"><span class="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" /><span><strong class="text-ink">{{ $t('safetyPage.c2Head') }}</strong> {{ $t('safetyPage.c2Body') }}</span></li>
          <li class="flex items-start gap-2.5"><span class="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" /><span><strong class="text-ink">{{ $t('safetyPage.c3Head') }}</strong> {{ $t('safetyPage.c3Body') }}</span></li>
          <li class="flex items-start gap-2.5"><span class="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" /><span><strong class="text-ink">{{ $t('safetyPage.c4Head') }}</strong> {{ $t('safetyPage.c4Body') }}</span></li>
        </ul>
      </section>

      <section class="card space-y-4 p-6 sm:p-7">
        <h2 class="flex items-center gap-2.5 text-base font-extrabold text-ink">
          <span class="flex h-9 w-9 items-center justify-center rounded-xl bg-accent-soft text-accent"><AppIcon name="support" :size="18" /></span>
          <span>{{ $t('safetyPage.emergTitle') }}</span>
        </h2>
        <p class="text-sm leading-relaxed text-ink-muted">
          {{ $t('safetyPage.emergBody') }}
        </p>
        <div class="pt-1">
          <NuxtLink :to="$localePath('/help')" class="btn-primary !py-2.5 !text-xs">
            {{ $t('safety.cta') }}
          </NuxtLink>
        </div>
      </section>
    </div>
  </div>
</template>
