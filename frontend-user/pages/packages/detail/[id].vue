<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { formatKrw } from '~/composables/useApi'
import { useCatalogDetail } from '~/composables/useCatalogDetail'
import { jsonLdScript } from '~/composables/useJsonLd'
import { generatedFallback } from '~/composables/useGeneratedCatalog'

const route = useRoute()
const id = String(route.params.id || route.query.id || '')
const { item: p, state, reload } = await useCatalogDetail('/packages', id, generatedFallback('PACKAGE', id))
const { t } = useI18n()

const details = computed<any>(() => {
  try { return JSON.parse(p.value?.details_json || '{}') || {} } catch { return {} }
})
const features = computed<string[]>(() => (Array.isArray(details.value.features) ? details.value.features.filter((f: unknown) => typeof f === 'string') : []))
const price = computed(() => Number(p.value?.bundle_price_krw ?? p.value?.total_package_krw) || null)
const original = computed(() => Number(p.value?.original_price_krw ?? p.value?.total_original_krw) || null)

// S4: markdown fact sheet alternate for LLMs (hub serves it; same-origin on apex).
useHead(() => ({ link: [{ rel: 'alternate', type: 'text/markdown', href: `/api/v1/seo/md/PACKAGE/${String(route.params.id || '')}` }] }))
useHead(() => {
  const x = p.value
  if (!x) return { title: t('packages.list.title') }
  return {
    title: x.title,
    script: [jsonLdScript({
      '@context': 'https://schema.org',
      '@type': 'TouristTrip',
      name: x.title,
      ...(x.hero_image_url || x.thumbnail_url ? { image: x.hero_image_url || x.thumbnail_url } : {}),
      ...(x.destination_city ? { itinerary: { '@type': 'Place', name: x.destination_city } } : {})
    })]
  }
})
</script>

<template>
  <DetailShell :state="state" list-path="/packages" :list-label="$t('packages.detail.backToSearch')" @retry="reload">
    <div v-if="p" class="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div class="min-w-0 space-y-8">
        <DetailHero :crumbs="[{ label: $t('common.home'), to: '/' }, { label: $t('nav.packages'), to: '/packages' }, { label: p.destination_city || p.title }]" :title="p.title" :subtitle="p.destination_city ? $t('packages.detail.destSub', { c: p.destination_city }) : ''" :image="p.hero_image_url || p.thumbnail_url || null" image-icon="package" :facts="[]" testid="package-detail" :wishlist="{ domain: 'PACKAGE', itemId: p.id, title: p.title, priceKrw: price, thumbnailUrl: p.hero_image_url || p.thumbnail_url || null, targetUrl: $route.fullPath }">
          <template #badges><span v-if="p.badge" class="mt-3 inline-block rounded-full bg-primary-soft px-2.5 py-1 text-xs font-semibold text-primary">{{ p.badge }}</span></template>
          <p v-if="original && price && original > price" class="mt-4 text-sm text-ink-muted">
            {{ $t('packages.detail.regularPre') }} <span class="line-through">{{ formatKrw(original) }}</span> → {{ $t('packages.detail.pkgIs') }} <strong class="text-ink">{{ formatKrw(price) }}</strong>
            <span v-if="p.savings_percentage" class="font-semibold text-accent"> {{ $t('packages.detail.savings', { n: p.savings_percentage }) }}</span>
          </p>
          <div v-if="features.length" class="mt-6">
            <h2 class="text-sm font-bold text-ink">{{ $t('packages.detail.included') }}</h2>
            <ul class="mt-2 space-y-1.5 text-sm text-ink"><li v-for="x in features" :key="x" class="flex items-center gap-2"><AppIcon name="check" :size="16" class="text-primary" />{{ x }}</li></ul>
          </div>
          <div v-if="p.flight_id || p.hotel_id" class="mt-6 flex flex-wrap gap-2">
            <NuxtLink v-if="p.flight_id" :to="$localePath('/flights/detail/' + p.flight_id)" class="btn-secondary px-3.5 py-2"><AppIcon name="flight" :size="16" />{{ $t('packages.detail.viewFlight') }}</NuxtLink>
            <NuxtLink v-if="p.hotel_id" :to="$localePath('/hotels/detail/' + p.hotel_id)" class="btn-secondary px-3.5 py-2"><AppIcon name="hotel" :size="16" />{{ $t('packages.detail.viewHotel') }}</NuxtLink>
          </div>
          <p class="mt-6 rounded-2xl bg-surface-sunken p-4 text-sm text-ink-muted">{{ $t('packages.detail.note') }}</p>
        </DetailHero>
        <SeoAnswer
          :name="p.title"
          :location="p.destination_city || null"
          :inclusions="features"
          :price-label="price ? `${formatKrw(price)} (${$t('packages.detail.unit')})` : null"
          :path="route.path"
        />
        <ReviewsSection domain="PACKAGE" :target-id="p.id" />
        <RecoRail domain="PACKAGE" :item-id="p.id" />
      </div>
      <DetailBookingCard :item="p" domain="PACKAGE" :price-krw="price" :unit-label="$t('packages.detail.unit')" cancellation="NON_REFUNDABLE" :start-label="$t('packages.list.depDate')" people :alert-label="p.title" />
    </div>
  </DetailShell>
</template>
