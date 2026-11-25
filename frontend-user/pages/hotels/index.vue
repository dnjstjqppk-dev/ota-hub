<script setup lang="ts">
/**
 * 호텔 landing (design system "Horizon"). Search goes through the shared widget; the rails show real
 * catalogue items; the facts describe rules the server enforces (worker/src/domain/pricing.ts).
 */
const { t } = useI18n()
const FACTS = computed(() => [
  { icon: 'lock', title: t('hotels.home.f1t'), body: t('hotels.home.f1b') },
  { icon: 'refund', title: t('hotels.home.f2t'), body: t('hotels.home.f2b') },
  { icon: 'users', title: t('hotels.home.f3t'), body: t('hotels.home.f3b') }
])
// P5: canonical + hreflang + OG via the shared builder.
const FAQ = useSeoFaq('hotels')
useSeoPage({ site: `https://${useRuntimeConfig().public.brandDomain}`, path: '/hotels', title: t('hotels.home.seoTitle'), description: t('hotels.home.seoDesc') })
</script>

<template>
  <ProductLanding tab="hotels" :crumb="$t('nav.hotels')" :title="$t('hotels.home.heroTitle')" :subtitle="$t('hotels.home.heroSub')" :facts="FACTS" :faq="FAQ">
    <ProductRail kind="hotels" :title="$t('hotels.home.railTitle')" :hint="$t('hotels.home.railHint')" />
  </ProductLanding>
</template>
