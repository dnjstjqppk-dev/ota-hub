<script setup lang="ts">
/**
 * 렌터카 landing (design system "Horizon"). Search goes through the shared widget; the rails show real
 * catalogue items; the facts describe rules the server enforces (worker/src/domain/pricing.ts).
 */
const { t } = useI18n()
const FACTS = computed(() => [
  { icon: 'calendar', title: t('cars.home.f1t'), body: t('cars.home.f1b') },
  { icon: 'refund', title: t('cars.home.f2t'), body: t('cars.home.f2b') },
  { icon: 'shield', title: t('cars.home.f3t'), body: t('cars.home.f3b') }
])
const FAQ = useSeoFaq('cars')
useSeoPage({ site: `https://${useRuntimeConfig().public.brandDomain}`, path: '/cars', title: t('cars.home.seoTitle'), description: t('cars.home.seoDesc') })
</script>

<template>
  <ProductLanding tab="cars" :crumb="$t('nav.cars')" :title="$t('cars.home.heroTitle')" :subtitle="$t('cars.home.heroSub')" :facts="FACTS" :faq="FAQ">
    <ProductRail kind="cars" :title="$t('cars.home.railTitle')" :hint="$t('cars.home.railHint')" />
  </ProductLanding>
</template>
