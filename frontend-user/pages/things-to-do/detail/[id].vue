<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useCatalogDetail, jsonLdScript } from '~/composables/useCatalogDetail'
import { generatedFallback } from '~/composables/useGeneratedCatalog'

const route = useRoute()
const id = String(route.params.id || route.query.activityId || route.query.id || '')
const { item: a, state, reload } = useCatalogDetail('/activities', id, generatedFallback('ACTIVITY', id))

const CATEGORY_KO: Record<string, string> = { THEME_PARK: '테마파크', DAY_TOUR: '일일 투어', TICKET: '입장권', EXPERIENCE: '체험', CRUISE: '크루즈', SHOW: '공연' }
const DURATION_KO: Record<string, string> = { FULL_DAY: '종일', HALF_DAY: '반나절', FLEXIBLE: '자유 이용', HOURS: '몇 시간' }
const VOUCHER_KO: Record<string, string> = { QR_CODE: '모바일 QR 바우처', MOBILE: '모바일 바우처', PRINTED: '종이 바우처 출력' }

const highlights = computed(() => String(a.value?.description || '').split(/;\s*/).map((s) => s.trim()).filter(Boolean))
const facts = computed(() => {
  const x = a.value
  if (!x) return []
  return ([
    ['지역', [x.city, x.country].filter(Boolean).join(', ') || null],
    ['유형', CATEGORY_KO[x.category] || x.category],
    ['소요 시간', DURATION_KO[x.duration_type] || x.duration_type],
    ['가이드', x.guide_language],
    ['바우처', VOUCHER_KO[x.voucher_type] || x.voucher_type],
    ['확정 방식', x.instant_confirmed ? '즉시 확정' : '공급사 확인 후 확정']
  ] as [string, string | null][]).filter(([, v]) => v)
})

useHead(() => {
  const x = a.value
  if (!x) return { title: '투어·티켓' }
  return {
    title: x.title,
    script: [jsonLdScript({
      '@context': 'https://schema.org',
      '@type': 'TouristTrip',
      name: x.title,
      ...(x.description ? { description: highlights.value.join(' / ') } : {}),
      ...(x.image_url || x.thumbnail_url ? { image: x.image_url || x.thumbnail_url } : {}),
      ...(x.city ? { itinerary: { '@type': 'Place', name: x.city } } : {})
    })]
  }
})
</script>

<template>
  <DetailShell :state="state" list-path="/things-to-do" list-label="투어·티켓 둘러보기" @retry="reload">
    <div v-if="a" class="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div class="min-w-0 space-y-8">
        <DetailHero :crumbs="[{ label: '홈', to: '/' }, { label: '투어·티켓', to: '/things-to-do' }, { label: a.city || a.title }]" :title="a.title" :image="a.image_url || a.thumbnail_url || null" image-icon="ticket" :facts="facts" testid="activity-detail" :wishlist="{ domain: 'ACTIVITY', itemId: a.id, title: a.title, priceKrw: a.price_krw, thumbnailUrl: a.image_url || a.thumbnail_url || null, targetUrl: $route.fullPath }">
          <template #badges>
            <p v-if="a.review_score" class="mt-2 flex items-center gap-1.5 text-sm text-ink-muted">
              <span class="rounded-lg bg-primary px-2 py-0.5 text-sm font-bold text-primary-ink tabular">{{ Number(a.review_score).toFixed(1) }}</span>
              <span v-if="a.review_count">인증 후기 {{ Number(a.review_count).toLocaleString('ko-KR') }}건</span>
            </p>
            <p v-else class="mt-2 text-xs font-semibold text-ink-subtle">신규 상품 · 아직 인증 후기가 없어요</p>
          </template>
          <div v-if="highlights.length" class="mt-6">
            <h2 class="text-sm font-bold text-ink">상품 소개</h2>
            <ul class="mt-2 list-disc space-y-1 pl-5 text-sm text-ink"><li v-for="h in highlights" :key="h">{{ h }}</li></ul>
          </div>
          <div v-if="a.included?.length" class="mt-6">
            <h2 class="text-sm font-bold text-ink">포함 사항</h2>
            <ul class="mt-2 space-y-1.5 text-sm text-ink"><li v-for="i in a.included" :key="i" class="flex items-center gap-2"><AppIcon name="check" :size="16" class="text-primary" />{{ i }}</li></ul>
          </div>
          <p class="mt-6 rounded-2xl bg-surface-sunken p-4 text-sm text-ink-muted">아동도 성인과 같은 요금이 적용돼요.</p>
        </DetailHero>
        <ReviewsSection domain="ACTIVITY" :target-id="a.id" />
      </div>
      <DetailBookingCard :item="a" domain="ACTIVITY" :price-krw="a.price_krw" unit-label="1인" :cancellation="a.free_cancellation ? 'FREE' : 'NON_REFUNDABLE'" people :alert-label="a.title" />
    </div>
  </DetailShell>
</template>
