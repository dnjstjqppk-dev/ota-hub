<script setup lang="ts">
/**
 * 항공+호텔 landing (design system "Horizon"). Search goes through the shared widget; the rails show real
 * catalogue items; the facts describe rules the server enforces (worker/src/domain/pricing.ts).
 */
const { t } = useI18n()
const FACTS = computed(() => [
  { icon: 'users', title: t('packages.home.f1t'), body: t('packages.home.f1b') },
  { icon: 'lock', title: t('packages.home.f2t'), body: t('packages.home.f2b') },
  { icon: 'check', title: t('packages.home.f3t'), body: t('packages.home.f3b') }
])
const FAQ = useSeoFaq('packages')
useSeoPage({ site: `https://${useRuntimeConfig().public.brandDomain}`, path: '/packages', title: t('packages.home.seoTitle'), description: t('packages.home.seoDesc') })
</script>

<template>
  <ProductLanding tab="packages" :crumb="$t('nav.packages')" :title="$t('packages.home.heroTitle')" :subtitle="$t('packages.home.heroSub')" :facts="FACTS" :faq="FAQ">
    <ProductRail kind="packages" :title="$t('packages.home.railTitle')" :hint="$t('packages.home.railHint')" />
  </ProductLanding>
</template>
