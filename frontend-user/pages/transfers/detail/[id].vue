<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { formatKrw } from '~/composables/useApi'
import { useCatalogDetail } from '~/composables/useCatalogDetail'
import { jsonLdScript } from '~/composables/useJsonLd'
import { generatedFallback } from '~/composables/useGeneratedCatalog'

const route = useRoute()
const id = String(route.params.id || route.query.id || '')
const { item: t, state, reload } = await useCatalogDetail('/transfers', id, generatedFallback('TRANSFER', id))
const { t: tr } = useI18n()

const facts = computed(() => {
  const x = t.value
  if (!x) return []
  return ([
    [tr('transfers.detail.fAirport'), x.airport_code],
    [tr('transfers.detail.fDest'), x.destination_area],
    [tr('transfers.detail.fClass'), x.vehicle_class],
    [tr('transfers.detail.fMaxPax'), x.max_passengers ? tr('transfers.detail.paxN', { n: x.max_passengers }) : null],
    [tr('transfers.detail.fMaxLug'), x.max_luggage ? tr('transfers.detail.lugN', { n: x.max_luggage }) : null],
    [tr('transfers.detail.fTracking'), x.flight_tracking ? tr('transfers.detail.trackingYes') : null]
  ] as [string, string | null][]).filter((f): f is [string, string] => !!f[1])
})

useHead(() => {
  const x = t.value
  if (!x) return { title: tr('transfers.list.title') }
  return {
    title: `${x.airport_code} → ${x.destination_area} · ${x.service_title}`,
    script: [jsonLdScript({
      '@context': 'https://schema.org',
      '@type': 'TaxiService',
      name: x.service_title,
      areaServed: x.destination_area,
      ...(x.image_url ? { image: x.image_url } : {})
    })]
  }
})
</script>

<template>
  <DetailShell :state="state" list-path="/transfers" :list-label="$t('transfers.detail.backToSearch')" @retry="reload">
    <div v-if="t" class="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div class="min-w-0 space-y-8">
        <DetailHero :crumbs="[{ label: $t('common.home'), to: '/' }, { label: $t('nav.transfers'), to: '/transfers' }, { label: t.service_title }]" :eyebrow="t.vehicle_class" :title="t.service_title" :image="t.image_url || null" image-icon="transfer" :facts="facts" testid="transfer-detail" :wishlist="{ domain: 'TRANSFER', itemId: t.id, title: t.service_title, priceKrw: t.price_krw, thumbnailUrl: t.image_url || null, targetUrl: $route.fullPath }">
          <p class="mt-5 rounded-2xl bg-surface-sunken p-4 text-sm text-ink-muted">{{ $t('transfers.detail.note') }}</p>
        </DetailHero>
        <SeoAnswer
          :name="t.service_title"
          :location="[t.airport_code, t.destination_area].filter(Boolean).join(' → ') || null"
          :price-label="Number(t.price_krw) > 0 ? `${formatKrw(Number(t.price_krw))} (${$t('transfers.list.perVehicle')})` : null"
          :path="route.path"
        />
        <ReviewsSection domain="TRANSFER" :target-id="t.id" />
        <RecoRail domain="TRANSFER" :item-id="t.id" />
      </div>
      <DetailBookingCard :item="t" domain="TRANSFER" :price-krw="t.price_krw" :unit-label="$t('transfers.list.perVehicle')" cancellation="FREE" people :max-people="Number(t.max_passengers) || 9" :alert-label="t.airport_code + ' ' + t.service_title" />
    </div>
  </DetailShell>
</template>
