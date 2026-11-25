<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { formatKrw } from '~/composables/useApi'
import { useCatalogDetail } from '~/composables/useCatalogDetail'
import { jsonLdScript } from '~/composables/useJsonLd'
import { generatedFallback } from '~/composables/useGeneratedCatalog'

const route = useRoute()
const id = String(route.params.id || route.query.id || '')
const { item: c, state, reload } = await useCatalogDetail('/cars', id, generatedFallback('CAR', id))
const { t } = useI18n()

const TYPE_IDS = ['COMPACT', 'SEDAN', 'SUV', 'VAN', 'LUXURY', 'EV'] as const
const typeLabel = (v: string) => ((TYPE_IDS as readonly string[]).includes(v) ? t(`cars.list.type_${v}`) : v)
const facts = computed(() => {
  const x = c.value
  if (!x) return []
  return ([
    [t('cars.detail.fCompany'), x.company_name],
    [t('cars.detail.fType'), typeLabel(x.vehicle_type)],
    [t('cars.detail.fSeats'), x.seats ? t('cars.list.seats', { n: x.seats }) : null],
    [t('cars.detail.fTrans'), x.transmission === 'AUTO' ? t('cars.list.auto') : x.transmission === 'MANUAL' ? t('cars.list.manual') : x.transmission],
    [t('cars.detail.fPickup'), x.pickup_location],
    [t('cars.detail.fIns'), x.insurance_included ? t('cars.list.insurance') : t('cars.detail.insNo')]
  ] as [string, string | null][]).filter((f): f is [string, string] => !!f[1])
})

useHead(() => {
  const x = c.value
  if (!x) return { title: t('cars.list.title') }
  return {
    title: `${x.vehicle_model} · ${x.company_name}`,
    script: [jsonLdScript({
      '@context': 'https://schema.org',
      '@type': 'Car',
      name: x.vehicle_model,
      ...(x.image_url ? { image: x.image_url } : {}),
      ...(x.seats ? { seatingCapacity: Number(x.seats) } : {}),
      brand: { '@type': 'Organization', name: x.company_name }
    })]
  }
})
</script>

<template>
  <DetailShell :state="state" list-path="/cars" :list-label="$t('cars.detail.backToSearch')" @retry="reload">
    <div v-if="c" class="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div class="min-w-0 space-y-8">
        <DetailHero :crumbs="[{ label: $t('common.home'), to: '/' }, { label: $t('nav.cars'), to: '/cars' }, { label: c.vehicle_model }]" :eyebrow="c.company_name" :title="c.vehicle_model" :image="c.image_url || null" image-icon="car" :facts="facts" testid="car-detail" :wishlist="{ domain: 'CAR', itemId: c.id, title: `${c.company_name} ${c.vehicle_model}`, priceKrw: c.daily_price_krw, thumbnailUrl: c.image_url || null, targetUrl: $route.fullPath }">
          <p class="mt-5 rounded-2xl bg-surface-sunken p-4 text-sm text-ink-muted">{{ $t('cars.detail.note') }}</p>
        </DetailHero>
        <SeoAnswer
          :name="`${c.company_name} ${c.vehicle_model}`"
          :location="c.pickup_location || null"
          :inclusions="c.insurance_included ? [$t('cars.list.insurance')] : []"
          :price-label="Number(c.daily_price_krw) > 0 ? `${formatKrw(Number(c.daily_price_krw))} (${$t('cars.detail.unit')})` : null"
          :path="route.path"
        />
        <ReviewsSection domain="CAR" :target-id="c.id" />
        <RecoRail domain="CAR" :item-id="c.id" />
      </div>
      <DetailBookingCard :item="c" domain="CAR" :price-krw="c.daily_price_krw" :unit-label="$t('cars.detail.unit')" cancellation="FREE" date-mode="range" :start-label="$t('checkout.startCar')" :end-label="$t('checkout.endDefault')" :alert-label="c.company_name + ' ' + c.vehicle_model" />
    </div>
  </DetailShell>
</template>
