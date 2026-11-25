<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useCatalogDetail } from '~/composables/useCatalogDetail'
import { aggregateRatingOf, breadcrumbLd, jsonLdScript, offerLd } from '~/composables/useJsonLd'
import { hreflangLinks, ogMeta } from '~/composables/useSeoPage'
import { generatedFallback } from '~/composables/useGeneratedCatalog'
// Resolved once in setup: head getters run at render time, outside the Nuxt context.
const seoSite = `https://${useRuntimeConfig().public.brandDomain}`

const route = useRoute()
const id = String(route.params.id || route.query.id || '')
const { item: f, state, reload, liveOk } = await useCatalogDetail('/flights', id, generatedFallback('FLIGHT', id))
const { t, locale } = useI18n()

const cabinLabel = (c: string) => t(`flights.search.cabin_${c}`, c)
const hm = (m: number) => (m % 60 ? t('flights.search.durHM', { h: Math.floor(m / 60), m: m % 60 }) : t('flights.search.durH', { h: Math.floor(m / 60) }))

const facts = computed(() => {
  const x = f.value
  if (!x) return []
  return ([
    [t('flights.detail.fRoute'), `${x.departure_city || x.departure_airport} → ${x.arrival_city || x.arrival_airport}`],
    [t('flights.detail.fTimes'), x.departure_time && x.arrival_time ? `${x.departure_time} → ${x.arrival_time}` : null],
    [t('flights.detail.fDur'), x.duration_minutes ? hm(Number(x.duration_minutes)) : null],
    [t('flights.detail.fStops'), x.stops === 0 ? t('flights.search.nonstop') : x.stops ? t('flights.search.stopsN', { n: x.stops }) : null],
    [t('flights.detail.fCabin'), cabinLabel(x.cabin_class)],
    [t('flights.detail.fBag'), x.free_baggage_kg ? t('flights.detail.bagKg', { kg: x.free_baggage_kg }) : null],
    [t('flights.detail.fSeats'), Number.isFinite(x.available_seats) ? t('flights.detail.seatsN', { n: x.available_seats }) : null]
  ] as [string, string | null][]).filter((f): f is [string, string] => !!f[1])
})

// S4: markdown fact sheet alternate for LLMs (hub serves it; same-origin on apex).
useHead(() => ({ link: [{ rel: 'alternate', type: 'text/markdown', href: `/api/v1/seo/md/FLIGHT/${String(route.params.id || '')}` }] }))
useHead(() => {
  const x = f.value
  if (!x) return { title: t('flights.search.title') }
  const offer = liveOk.value ? offerLd(seoSite, `/flights/detail/${id}`, x.base_price_krw, x.bookable, x.outlink_path) : null
  const rating = liveOk.value ? aggregateRatingOf(x.review_score, x.review_count) : null
  return {
    meta: [...ogMeta(seoSite, `/flights/detail/${id}`, x.thumbnail_url || x.image_url || null, locale.value)],
    link: [{ rel: 'canonical', href: `${seoSite}/flights/detail/${id}` }, ...hreflangLinks(seoSite, `/flights/detail/${id}`)],
    title: `${x.airline_name} ${x.flight_number} ${x.departure_airport}→${x.arrival_airport}`,
    script: [jsonLdScript(breadcrumbLd(seoSite, [{ name: t('common.home'), path: '/' }, { name: t('nav.flights'), path: '/flights' }, { name: x.flight_number, path: `/flights/detail/${id}` }])), jsonLdScript({
      '@context': 'https://schema.org',
      '@type': 'Flight',
      flightNumber: x.flight_number,
      provider: { '@type': 'Airline', name: x.airline_name, ...(x.airline_code ? { iataCode: x.airline_code } : {}) },
      departureAirport: { '@type': 'Airport', iataCode: x.departure_airport },
      arrivalAirport: { '@type': 'Airport', iataCode: x.arrival_airport },
      ...(x.updated_at ? { dateModified: String(x.updated_at) } : {}),
      ...(offer ? { offers: offer } : {}),
      ...(rating ? { aggregateRating: rating } : {})
    })]
  }
})
</script>

<template>
  <DetailShell :state="state" list-path="/flights" :list-label="$t('flights.detail.backToSearch')" @retry="reload">
    <div v-if="f" class="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div class="min-w-0 space-y-8">
        <DetailHero :crumbs="[{ label: $t('common.home'), to: '/' }, { label: $t('nav.flights'), to: '/flights' }, { label: f.flight_number }]" :eyebrow="f.airline_name + ' · ' + f.flight_number" :title="f.departure_airport + ' → ' + f.arrival_airport" :facts="facts" testid="flight-detail" :wishlist="{ domain: 'FLIGHT', itemId: f.id, title: `${f.departure_airport} → ${f.arrival_airport} ${f.flight_number}`, priceKrw: f.base_price_krw, thumbnailUrl: null, targetUrl: $route.fullPath }">
          <p class="mt-5 rounded-2xl bg-surface-sunken p-4 text-sm text-ink-muted">{{ $t('flights.detail.note') }}</p>
        </DetailHero>
        <p v-if="f.updated_at" class="text-xs text-ink-subtle">{{ $t('common.updatedAt', { d: String(f.updated_at).slice(0, 10) }) }}</p>
        <ReviewsSection domain="FLIGHT" :target-id="f.id" />
        <RecoRail domain="FLIGHT" :item-id="f.id" />
      </div>
      <DetailBookingCard :item="f" domain="FLIGHT" :price-krw="f.base_price_krw" :unit-label="$t('flights.detail.unit')" cancellation="NON_REFUNDABLE" :start-label="$t('checkout.startFlight')" people :alert-label="f.departure_airport + '-' + f.arrival_airport + ' ' + f.flight_number" />
    </div>
  </DetailShell>
</template>
