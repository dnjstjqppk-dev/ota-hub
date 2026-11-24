<script setup lang="ts">
/**
 * 항공권 landing (design system "Horizon"). Search goes through the shared widget; the rails show real
 * catalogue items; the facts describe rules the server enforces (worker/src/domain/pricing.ts).
 */
const { t } = useI18n()
const FACTS = computed(() => [
  { icon: 'users', title: t('flights.home.f1t'), body: t('flights.home.f1b') },
  { icon: 'flight', title: t('flights.home.f2t'), body: t('flights.home.f2b') },
  { icon: 'lock', title: t('flights.home.f3t'), body: t('flights.home.f3b') }
])
useSeoPage({ site: `https://${useRuntimeConfig().public.brandDomain}`, path: '/flights', title: t('flights.home.seoTitle'), description: t('flights.home.seoDesc') })
</script>

<template>
  <ProductLanding tab="flights" :crumb="$t('nav.flights')" :title="$t('flights.home.heroTitle')" :subtitle="$t('flights.home.heroSub')" :facts="FACTS">
    <ProductRail kind="flights" :title="$t('flights.home.railTitle')" :hint="$t('flights.home.railHint')" />
  </ProductLanding>
</template>
