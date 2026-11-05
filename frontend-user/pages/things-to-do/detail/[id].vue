<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useCatalogDetail, jsonLdScript } from '~/composables/useCatalogDetail'

const route = useRoute()
const id = String(route.params.id || route.query.activityId || route.query.id || '')
const { item: a, state, reload } = useCatalogDetail('/activities', id)

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
    ['확정 방식', x.instant_confirmation ? '즉시 확정' : '공급사 확인 후 확정']
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
    <template v-if="a">
      <nav class="mb-3 text-xs text-slate-400"><NuxtLink to="/" class="hover:underline">홈</NuxtLink> › <NuxtLink to="/things-to-do" class="hover:underline">투어·티켓</NuxtLink> › {{ a.city }}</nav>
      <div class="grid gap-6 md:grid-cols-[1fr_320px]">
        <div class="space-y-6">
          <section class="overflow-hidden rounded-3xl border border-slate-200 bg-white" data-testid="activity-detail">
            <img v-if="a.image_url || a.thumbnail_url" :src="a.image_url || a.thumbnail_url" :alt="a.title" class="h-64 w-full object-cover md:h-80" />
            <div class="p-6 md:p-8">
              <h1 class="text-2xl font-black text-slate-900">{{ a.title }}</h1>
              <p v-if="a.review_score" class="mt-1 text-sm text-slate-600">
                <span class="text-amber-500">★ {{ Number(a.review_score).toFixed(1) }}</span>
                <span v-if="a.review_count"> · 평가 {{ Number(a.review_count).toLocaleString('ko-KR') }}건</span>
                <span class="text-xs text-slate-400"> (공급사 제공 평점)</span>
              </p>
              <dl class="mt-5 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                <div v-for="[k, v] in facts" :key="k"><dt class="text-xs text-slate-500">{{ k }}</dt><dd class="font-semibold text-slate-900">{{ v }}</dd></div>
              </dl>
              <div v-if="highlights.length" class="mt-6">
                <h2 class="text-sm font-bold text-slate-900">상품 소개</h2>
                <ul class="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700"><li v-for="h in highlights" :key="h">{{ h }}</li></ul>
              </div>
              <div v-if="a.included?.length" class="mt-6">
                <h2 class="text-sm font-bold text-slate-900">포함 사항</h2>
                <ul class="mt-2 space-y-1 text-sm text-slate-700"><li v-for="i in a.included" :key="i">✓ {{ i }}</li></ul>
              </div>
              <p class="mt-6 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">이용일과 인원은 예약 단계에서 선택합니다. 아동도 성인과 같은 요금이 적용됩니다.</p>
            </div>
          </section>
          <ReviewsSection domain="ACTIVITY" :target-id="a.id" />
        </div>
        <DetailBookingCard :item="a" domain="ACTIVITY" :price-krw="a.price_krw" unit-label="1인" :cancellation="a.free_cancellation ? 'FREE' : 'NON_REFUNDABLE'" :alert-label="a.title" />
      </div>
    </template>
  </DetailShell>
</template>
