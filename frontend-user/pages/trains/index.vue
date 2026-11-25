<script setup lang="ts">
/**
 * 기차 landing (design system "Horizon"). Search goes through the shared widget; the rails show real
 * catalogue items; the facts describe rules the server enforces (worker/src/domain/pricing.ts).
 */
const { t } = useI18n()
const FACTS = computed(() => [
  { icon: 'users', title: t('trains.home.f1t'), body: t('trains.home.f1b') },
  { icon: 'check', title: t('trains.home.f2t'), body: t('trains.home.f2b') },
  { icon: 'lock', title: t('trains.home.f3t'), body: t('trains.home.f3b') }
])
const FAQ = useSeoFaq('trains')
useSeoPage({ site: `https://${useRuntimeConfig().public.brandDomain}`, path: '/trains', title: t('trains.home.seoTitle'), description: t('trains.home.seoDesc') })
</script>

<template>
  <ProductLanding tab="trains" :crumb="$t('nav.trains')" :title="$t('trains.home.heroTitle')" :subtitle="$t('trains.home.heroSub')" :facts="FACTS" :faq="FAQ">
    <ProductRail kind="trains" :title="$t('trains.home.railTitle')" :hint="$t('trains.home.railHint')" />
  </ProductLanding>
</template>
