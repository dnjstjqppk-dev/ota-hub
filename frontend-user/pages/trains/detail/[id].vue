<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useCatalogDetail } from '~/composables/useCatalogDetail'
import { jsonLdScript } from '~/composables/useJsonLd'
import { generatedFallback } from '~/composables/useGeneratedCatalog'

const route = useRoute()
const id = String(route.params.id || route.query.id || '')
const { item: t, state, reload } = await useCatalogDetail('/trains', id, generatedFallback('TRAIN', id))
const { t: tr } = useI18n()
const hm = (m: number) => (m % 60 ? tr('flights.search.durHM', { h: Math.floor(m / 60), m: m % 60 }) : tr('flights.search.durH', { h: Math.floor(m / 60) }))

const facts = computed(() => {
  const x = t.value
  if (!x) return []
  return ([
    [tr('trains.detail.fRoute'), `${x.departure_station} → ${x.arrival_station}`],
    [tr('trains.detail.fTimes'), x.departure_time && x.arrival_time ? `${x.departure_time} → ${x.arrival_time}` : null],
    [tr('trains.detail.fDur'), x.duration_minutes ? hm(Number(x.duration_minutes)) : null],
    [tr('trains.detail.fSeat'), x.seat_class],
    [tr('trains.detail.fSeats'), Number.isFinite(x.available_seats) ? tr('flights.detail.seatsN', { n: x.available_seats }) : null]
  ] as [string, string | null][]).filter((f): f is [string, string] => !!f[1])
})

// S4: markdown fact sheet alternate for LLMs (hub serves it; same-origin on apex).
useHead(() => ({ link: [{ rel: 'alternate', type: 'text/markdown', href: `/api/v1/seo/md/TRAIN/${String(route.params.id || '')}` }] }))
useHead(() => {
  const x = t.value
  if (!x) return { title: tr('trains.search.title') }
  return {
    title: `${x.train_type} ${x.train_number} ${x.departure_station}→${x.arrival_station}`,
    script: [jsonLdScript({
      '@context': 'https://schema.org',
      '@type': 'TrainTrip',
      trainNumber: x.train_number,
      trainName: x.train_type,
      departureStation: { '@type': 'TrainStation', name: x.departure_station },
      arrivalStation: { '@type': 'TrainStation', name: x.arrival_station }
    })]
  }
})
</script>

<template>
  <DetailShell :state="state" list-path="/trains" :list-label="$t('trains.detail.backToSearch')" @retry="reload">
    <div v-if="t" class="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div class="min-w-0 space-y-8">
        <DetailHero :crumbs="[{ label: $t('common.home'), to: '/' }, { label: $t('nav.trains'), to: '/trains' }, { label: t.train_number }]" :eyebrow="t.train_type + ' · ' + t.train_number" :title="t.departure_station + ' → ' + t.arrival_station" :facts="facts" testid="train-detail" :wishlist="{ domain: 'TRAIN', itemId: t.id, title: `${t.departure_station} → ${t.arrival_station} ${t.train_number}`, priceKrw: t.price_krw, thumbnailUrl: null, targetUrl: $route.fullPath }">
          <p class="mt-5 rounded-2xl bg-surface-sunken p-4 text-sm text-ink-muted">{{ $t('trains.detail.note', { seat: t.seat_class }) }}</p>
        </DetailHero>
        <ReviewsSection domain="TRAIN" :target-id="t.id" />
        <RecoRail domain="TRAIN" :item-id="t.id" />
      </div>
      <DetailBookingCard :item="t" domain="TRAIN" :price-krw="t.price_krw" :unit-label="$t('trains.detail.unit')" cancellation="FREE" :start-label="$t('trains.search.rideDate')" people :alert-label="t.departure_station + '-' + t.arrival_station + ' ' + t.train_number" />
    </div>
  </DetailShell>
</template>
