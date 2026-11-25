<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { formatKrw } from '~/composables/useApi'
import { useCatalogDetail } from '~/composables/useCatalogDetail'
import { aggregateRatingOf, breadcrumbLd, jsonLdScript, offerLd } from '~/composables/useJsonLd'
import { hreflangLinks, ogMeta } from '~/composables/useSeoPage'
import { generatedFallback } from '~/composables/useGeneratedCatalog'
// Resolved once in setup: head getters run at render time, outside the Nuxt context.
const seoSite = `https://${useRuntimeConfig().public.brandDomain}`

const route = useRoute()
const id = String(route.params.id || route.query.id || '')
const { item: t, state, reload, liveOk } = await useCatalogDetail('/transfers', id, generatedFallback('TRANSFER', id))
const { t: tr, locale } = useI18n()

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

// S4: markdown fact sheet alternate for LLMs (hub serves it; same-origin on apex).
useHead(() => ({ link: [{ rel: 'alternate', type: 'text/markdown', href: `/api/v1/seo/md/TRANSFER/${String(route.params.id || '')}` }] }))
useHead(() => {
  const x = t.value
  if (!x) return { title: tr('transfers.list.title') }
  const offer = liveOk.value ? offerLd(seoSite, `/transfers/detail/${id}`, x.price_krw, x.bookable, x.outlink_path) : null
  const rating = liveOk.value ? aggregateRatingOf(x.review_score, x.review_count) : null
  return {
    meta: [...ogMeta(seoSite, `/transfers/detail/${id}`, x.thumbnail_url || x.image_url || null, locale.value)],
    link: [{ rel: 'canonical', href: `${seoSite}/transfers/detail/${id}` }, ...hreflangLinks(seoSite, `/transfers/detail/${id}`)],
    title: `${x.airport_code} → ${x.destination_area} · ${x.service_title}`,
    script: [jsonLdScript(breadcrumbLd(seoSite, [{ name: tr('common.home'), path: '/' }, { name: tr('nav.transfers'), path: '/transfers' }, { name: x.service_title, path: `/transfers/detail/${id}` }])), jsonLdScript({
      '@context': 'https://schema.org',
      '@type': 'TaxiService',
      name: x.service_title,
      areaServed: x.destination_area,
      ...(x.image_url ? { image: x.image_url } : {}),
      ...(x.updated_at ? { dateModified: String(x.updated_at) } : {}),
      ...(offer ? { offers: offer } : {}),
      ...(rating ? { aggregateRating: rating } : {})
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
        <p v-if="t.updated_at" class="text-xs text-ink-subtle">{{ $t('common.updatedAt', { d: String(t.updated_at).slice(0, 10) }) }}</p>
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
