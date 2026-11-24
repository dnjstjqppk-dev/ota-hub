<script setup lang="ts">
/**
 * 공항 이동 landing (design system "Horizon"). Search goes through the shared widget; the rails show real
 * catalogue items; the facts describe rules the server enforces (worker/src/domain/pricing.ts).
 */
const { t } = useI18n()
const FACTS = computed(() => [
  { icon: 'transfer', title: t('transfers.home.f1t'), body: t('transfers.home.f1b') },
  { icon: 'users', title: t('transfers.home.f2t'), body: t('transfers.home.f2b') },
  { icon: 'refund', title: t('transfers.home.f3t'), body: t('transfers.home.f3b') }
])
useSeoPage({ site: `https://${useRuntimeConfig().public.brandDomain}`, path: '/transfers', title: t('transfers.home.seoTitle'), description: t('transfers.home.seoDesc') })
</script>

<template>
  <ProductLanding tab="transfers" :crumb="$t('nav.transfers')" :title="$t('transfers.home.heroTitle')" :subtitle="$t('transfers.home.heroSub')" :facts="FACTS">
    <ProductRail kind="transfers" :title="$t('transfers.home.railTitle')" :hint="$t('transfers.home.railHint')" />
  </ProductLanding>
</template>
