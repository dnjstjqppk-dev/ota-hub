<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { formatKrw } from '~/composables/useApi'
import { useCatalogDetail } from '~/composables/useCatalogDetail'
import { aggregateRatingOf, breadcrumbLd, jsonLdScript, offerLd } from '~/composables/useJsonLd'
import { hreflangLinks, ogMeta } from '~/composables/useSeoPage'
import { generatedFallback } from '~/composables/useGeneratedCatalog'

const route = useRoute()
const id = String(route.params.id || route.query.activityId || route.query.id || '')
const { item: a, state, reload, liveOk } = await useCatalogDetail('/activities', id, generatedFallback('ACTIVITY', id))
const seoSite = `https://${useRuntimeConfig().public.brandDomain}`
const { t, locale } = useI18n()

const catLabel = (c: string) => t(`todo.cat_${c}`, c)
const DUR_IDS = ['FULL_DAY', 'HALF_DAY', 'FLEXIBLE', 'HOURS'] as const
const durLabel = (v: string) => ((DUR_IDS as readonly string[]).includes(v) ? t(`todo.detail_dur_${v}`) : v)
const VCH_IDS = ['QR_CODE', 'MOBILE', 'PRINTED'] as const
const vchLabel = (v: string) => ((VCH_IDS as readonly string[]).includes(v) ? t(`todo.detail_vch_${v}`) : v)

const highlights = computed(() => String(a.value?.description || '').split(/;\s*/).map((s) => s.trim()).filter(Boolean))
const facts = computed(() => {
  const x = a.value
  if (!x) return []
  return ([
    [t('todo.detail_fArea'), [x.city, x.country].filter(Boolean).join(', ') || null],
    [t('todo.detail_fType'), catLabel(x.category)],
    [t('todo.detail_fDur'), durLabel(x.duration_type)],
    [t('todo.detail_fGuide'), x.guide_language],
    [t('todo.detail_fVoucher'), vchLabel(x.voucher_type)],
    [t('todo.detail_fConfirm'), x.instant_confirmed ? t('todo.instant') : t('todo.detail_confirmLater')]
  ] as [string, string | null][]).filter((f): f is [string, string] => !!f[1])
})

// S4: markdown fact sheet alternate for LLMs (hub serves it; same-origin on apex).
useHead(() => ({ link: [{ rel: 'alternate', type: 'text/markdown', href: `/api/v1/seo/md/ACTIVITY/${String(route.params.id || '')}` }] }))
useHead(() => {
  const x = a.value
  if (!x) return { title: t('todo.title') }
  const offer = liveOk.value ? offerLd(seoSite, `/things-to-do/detail/${id}`, x.price_krw, x.bookable, x.outlink_path) : null
  const rating = liveOk.value ? aggregateRatingOf(x.review_score, x.review_count) : null
  return {
    meta: [...ogMeta(seoSite, `/things-to-do/detail/${id}`, x.thumbnail_url || x.image_url || null, locale.value)],
    link: [{ rel: 'canonical', href: `${seoSite}/things-to-do/detail/${id}` }, ...hreflangLinks(seoSite, `/things-to-do/detail/${id}`)],
    title: x.title,
    script: [jsonLdScript(breadcrumbLd(`https://${useRuntimeConfig().public.brandDomain}`, [{ name: t('common.home'), path: '/' }, { name: t('nav.things-to-do'), path: '/things-to-do' }, { name: x.city || x.title, path: `/things-to-do/detail/${id}` }])), jsonLdScript({
      '@context': 'https://schema.org',
      '@type': 'TouristTrip',
      name: x.title,
      ...(x.description ? { description: highlights.value.join(' / ') } : {}),
      ...(x.image_url || x.thumbnail_url ? { image: x.image_url || x.thumbnail_url } : {}),
      ...(x.city ? { itinerary: { '@type': 'Place', name: x.city } } : {}),
      ...(x.updated_at ? { dateModified: String(x.updated_at) } : {}),
      ...(offer ? { offers: offer } : {}),
      ...(rating ? { aggregateRating: rating } : {})
    })]
  }
})
</script>

<template>
  <DetailShell :state="state" list-path="/things-to-do" :list-label="$t('todo.detail_back')" @retry="reload">
    <div v-if="a" class="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div class="min-w-0 space-y-8">
        <DetailHero :crumbs="[{ label: $t('common.home'), to: '/' }, { label: $t('nav.things-to-do'), to: '/things-to-do' }, { label: a.city || a.title }]" :title="a.title" :image="a.image_url || a.thumbnail_url || null" image-icon="ticket" :facts="facts" testid="activity-detail" :wishlist="{ domain: 'ACTIVITY', itemId: a.id, title: a.title, priceKrw: a.price_krw, thumbnailUrl: a.image_url || a.thumbnail_url || null, targetUrl: $route.fullPath }">
          <template #badges>
            <p v-if="a.review_score" class="mt-2 flex items-center gap-1.5 text-sm text-ink-muted">
              <span class="rounded-lg bg-primary px-2 py-0.5 text-sm font-bold text-primary-ink tabular">{{ Number(a.review_score).toFixed(1) }}</span>
              <span v-if="a.review_count">{{ $t('hotels.detail.verifiedCount', { n: $n(Number(a.review_count)) }) }}</span>
            </p>
            <p v-else class="mt-2 text-xs font-semibold text-ink-subtle">{{ $t('todo.detail_newNoReviews') }}</p>
          </template>
          <div v-if="highlights.length" class="mt-6">
            <h2 class="text-sm font-bold text-ink">{{ $t('todo.detail_intro') }}</h2>
            <ul class="mt-2 list-disc space-y-1 pl-5 text-sm text-ink"><li v-for="h in highlights" :key="h">{{ h }}</li></ul>
          </div>
          <div v-if="a.included?.length" class="mt-6">
            <h2 class="text-sm font-bold text-ink">{{ $t('todo.detail_included') }}</h2>
            <ul class="mt-2 space-y-1.5 text-sm text-ink"><li v-for="i in a.included" :key="i" class="flex items-center gap-2"><AppIcon name="check" :size="16" class="text-primary" />{{ i }}</li></ul>
          </div>
          <p class="mt-6 rounded-2xl bg-surface-sunken p-4 text-sm text-ink-muted">{{ $t('todo.detail_kidNote') }}</p>
        </DetailHero>
        <p v-if="a.updated_at" class="text-xs text-ink-subtle">{{ $t('common.updatedAt', { d: String(a.updated_at).slice(0, 10) }) }}</p>
        <SeoAnswer
          :name="a.title"
          :location="[a.city, a.country].filter(Boolean).join(', ') || null"
          :free-cancel="!!a.free_cancellation"
          :inclusions="a.included || []"
          :price-label="Number(a.price_krw) > 0 ? `${formatKrw(Number(a.price_krw))} (${$t('packages.detail.unit')})` : null"
          :path="route.path"
        />
        <ReviewsSection domain="ACTIVITY" :target-id="a.id" />
        <RecoRail domain="ACTIVITY" :item-id="a.id" />
      </div>
      <DetailBookingCard :item="a" domain="ACTIVITY" :price-krw="a.price_krw" :unit-label="$t('packages.detail.unit')" :cancellation="a.free_cancellation ? 'FREE' : 'NON_REFUNDABLE'" people :alert-label="a.title" />
    </div>
  </DetailShell>
</template>
