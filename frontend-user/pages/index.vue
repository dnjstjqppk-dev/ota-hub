<script setup lang="ts">
/**
 * Home (design system "Horizon").
 * Every product, price and promotion shown here comes from the API. Nothing is invented:
 * sections without data are hidden, prices are labelled as reference prices, and only
 * promotions that are active and not expired are advertised.
 */
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useCurrencyStore } from '~/stores/currency'
import { useApiUrl } from '~/composables/useApi'
import { CATEGORIES } from '~/config/navigation'

const route = useRoute()
const currency = useCurrencyStore()
const currentLocale = (route.query.locale as string) || 'ko-kr'

useHead({
  title: '항공권·호텔·기차·렌터카 예약',
  htmlAttrs: { lang: currentLocale === 'ko-kr' ? 'ko-KR' : 'en-US' },
  meta: [
    { name: 'description', content: '항공권, 호텔, 기차표, 렌터카, 공항 이동과 투어·티켓을 getfortrip에서 예약하세요. 결제 전 최종 금액을 확정하고, 공급사 확정 후에만 예약 확정을 안내합니다.' },
    { property: 'og:site_name', content: 'getfortrip' },
    { property: 'og:url', content: `https://kr.getfortrip.com/?locale=${currentLocale}` }
  ],
  link: [
    { rel: 'canonical', href: `https://kr.getfortrip.com/?locale=${currentLocale}` },
    { rel: 'alternate', hreflang: 'ko-kr', href: 'https://kr.getfortrip.com/?locale=ko-kr' },
    { rel: 'alternate', hreflang: 'en-us', href: 'https://www.getfortrip.com/?locale=en-us' },
    { rel: 'alternate', hreflang: 'x-default', href: 'https://kr.getfortrip.com/?locale=ko-kr' }
  ]
})

type Load = 'loading' | 'ready' | 'error'
const hotels = ref<any[]>([]); const hotelState = ref<Load>('loading')
const activities = ref<any[]>([]); const activityState = ref<Load>('loading')
const promos = ref<any[]>([])
const moments = ref<any[]>([])

async function getJson(path: string) {
  const r = await fetch(useApiUrl(path))
  if (!r.ok) throw new Error(`${path} ${r.status}`)
  return r.json()
}
async function loadHotels() {
  hotelState.value = 'loading'
  try { hotels.value = ((await getJson('/hotels?sortBy=score_desc&limit=8')).data || []).slice(0, 8); hotelState.value = 'ready' } catch { hotelState.value = 'error' }
}
async function loadActivities() {
  activityState.value = 'loading'
  try { activities.value = ((await getJson('/activities?limit=4')).data || []).slice(0, 4); activityState.value = 'ready' } catch { activityState.value = 'error' }
}

onMounted(() => {
  loadHotels()
  loadActivities()
  getJson('/promotions').then((j) => {
    const now = Date.now()
    promos.value = (j.promotions || []).filter((p: any) => p.is_active && (!p.valid_until || Date.parse(p.valid_until) > now) && !String(p.title || '').includes('[테스트]'))
  }).catch(() => {})
  getJson('/moments').then((j) => { moments.value = (j.moments || []).slice(0, 3) }).catch(() => {})
})

const promo = computed(() => promos.value[0])
const promoLabel = computed(() => {
  const p = promo.value
  if (!p) return ''
  return p.discount_type === 'PERCENTAGE' ? `${p.discount_value}% 할인` : `${currency.formatKRW(p.discount_value)} 할인`
})

/** Lowest room price, or the hotel base price. Never a made-up fallback. */
function fromPrice(h: any): number | null {
  const roomPrices = (h.rooms || []).map((r: any) => Number(r.base_price_krw)).filter((n: number) => n > 0)
  const n = roomPrices.length ? Math.min(...roomPrices) : Number(h.base_price_krw)
  return n > 0 ? n : null
}
function photos(m: any): string[] { try { return JSON.parse(m.photos_json || '[]').slice(0, 3) } catch { return [] } }

/** Editorial picks (no counts or rankings implied). Images: Unsplash. */
const DESTINATIONS = [
  { name: '도쿄', en: 'Tokyo', country: '일본', img: 'https://images.unsplash.com/photo-1503899036084-c55cdd92da26?w=640&q=70' },
  { name: '오사카', en: 'Osaka', country: '일본', img: 'https://images.unsplash.com/photo-1589452271712-64b8a66c7b71?w=640&q=70' },
  { name: '다낭', en: 'Da Nang', country: '베트남', img: 'https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=640&q=70' },
  { name: '방콕', en: 'Bangkok', country: '태국', img: 'https://images.unsplash.com/photo-1508009603885-50cf7c579365?w=640&q=70' },
  { name: '서울', en: 'Seoul', country: '대한민국', img: 'https://images.unsplash.com/photo-1534274988757-a28bf1a57c17?w=640&q=70' },
  { name: '파리', en: 'Paris', country: '프랑스', img: 'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=640&q=70' }
]

const PROMISES = [
  { icon: 'lock', title: '결제 전 금액 확정', body: '견적 단계에서 서버가 최종 금액을 계산합니다. 결제 화면에서 금액이 바뀌지 않아요.' },
  { icon: 'check', title: '공급사 확정 후 확정 안내', body: '결제만으로 확정 처리하지 않습니다. 호텔·항공사 확정이 끝나야 바우처와 티켓을 발급해요.' },
  { icon: 'refund', title: '규정대로 자동 환불', body: '무료 취소 기간 안이면 전액, 확정에 실패하면 결제 금액 전액을 환불합니다.' }
]
</script>

<template>
  <div>
    <!-- Hero -->
    <section class="relative">
      <div class="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true"><div class="absolute inset-0 bg-gradient-to-b from-sapphire-50 via-canvas to-canvas" />
      <svg class="pointer-events-none absolute inset-x-0 top-0 h-[420px] w-full text-sapphire-200" viewBox="0 0 1440 420" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <path d="M0 300 Q 720 200 1440 300" fill="none" stroke="currentColor" stroke-width="1.5" />
        <path d="M0 340 Q 720 250 1440 340" fill="none" stroke="currentColor" stroke-width="1" opacity=".6" />
        <path d="M0 380 Q 720 300 1440 380" fill="none" stroke="currentColor" stroke-width="1" opacity=".35" />
      </svg></div>

      <div class="relative mx-auto max-w-7xl px-4 pb-10 pt-10 sm:pt-14 lg:px-6 lg:pb-14 lg:pt-20">
        <div class="max-w-2xl">
          <h1 class="text-[32px] font-extrabold leading-[1.15] tracking-tight text-ink sm:text-5xl">어디로든,<br class="sm:hidden" /> 확실하게 떠나요.</h1>
          <p class="mt-4 max-w-xl text-base leading-relaxed text-ink-muted sm:text-lg">항공권과 호텔부터 기차, 렌터카, 현지 투어까지 한 번에 예약하세요.</p>
        </div>
        <div class="mt-8">
          <HomeSearchWidget />
        </div>
      </div>
    </section>

    <!-- Categories -->
    <nav class="mx-auto max-w-7xl px-4 lg:px-6" aria-label="상품 카테고리">
      <ul class="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-9 sm:px-0 [&::-webkit-scrollbar]:hidden">
        <li v-for="c in CATEGORIES" :key="c.key" class="shrink-0">
          <NuxtLink :to="c.to" class="group flex w-[76px] flex-col items-center gap-2 rounded-2xl py-3 text-center text-xs font-semibold text-ink-muted transition-colors hover:bg-surface hover:text-ink sm:w-auto">
            <span class="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface text-primary shadow-card transition-transform group-hover:-translate-y-0.5"><AppIcon :name="c.icon" :size="22" /></span>
            {{ c.label }}
          </NuxtLink>
        </li>
      </ul>
    </nav>

    <!-- Active promotion (only when a real, unexpired one exists) -->
    <section v-if="promo" class="mx-auto mt-10 max-w-7xl px-4 lg:px-6">
      <div class="flex flex-col items-start gap-4 rounded-card bg-midnight-900 px-6 py-6 text-white sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <div class="flex items-center gap-4">
          <span class="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-coral-500 text-white"><AppIcon name="gift" :size="24" /></span>
          <div>
            <p class="text-lg font-bold">{{ promo.title }}</p>
            <p class="mt-0.5 text-sm text-white/70">
              {{ promoLabel }}<template v-if="promo.max_discount_krw"> · 최대 {{ currency.formatKRW(promo.max_discount_krw) }}</template><template v-if="promo.min_order_amount_krw"> · {{ currency.formatKRW(promo.min_order_amount_krw) }} 이상 결제 시</template><template v-if="promo.valid_until"> · {{ promo.valid_until.slice(0, 10) }}까지</template>
            </p>
          </div>
        </div>
        <NuxtLink to="/deals" class="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-midnight-900 hover:bg-sapphire-50">쿠폰 받기<AppIcon name="arrow-right" :size="16" /></NuxtLink>
      </div>
    </section>

    <!-- Destinations -->
    <section class="mx-auto mt-16 max-w-7xl px-4 lg:px-6" aria-labelledby="h-dest">
      <div class="mb-5 flex items-end justify-between">
        <h2 id="h-dest" class="text-2xl font-bold tracking-tight text-ink">추천 여행지</h2>
      </div>
      <div class="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 lg:grid-cols-6 [&::-webkit-scrollbar]:hidden">
        <NuxtLink v-for="d in DESTINATIONS" :key="d.name" :to="`/hotels/list?city=${encodeURIComponent(d.name)}`" class="group relative aspect-[3/4] w-[42vw] max-w-[200px] shrink-0 snap-start overflow-hidden rounded-card bg-surface-sunken sm:w-auto sm:max-w-none">
          <SmartImg :src="d.img" :alt="`${d.name} 풍경`" img-class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
          <div class="absolute inset-0 bg-gradient-to-t from-midnight-950/80 via-midnight-950/10 to-transparent" />
          <div class="absolute inset-x-0 bottom-0 p-4 text-white">
            <p class="text-xs font-medium text-white/70">{{ d.country }}</p>
            <p class="text-lg font-bold">{{ d.name }}</p>
          </div>
        </NuxtLink>
      </div>
    </section>

    <!-- Hotels -->
    <section class="mx-auto mt-16 max-w-7xl px-4 lg:px-6" aria-labelledby="h-hotels">
      <div class="mb-5 flex items-end justify-between gap-4">
        <div>
          <h2 id="h-hotels" class="text-2xl font-bold tracking-tight text-ink">평점 높은 호텔</h2>
          <p class="mt-1 text-sm text-ink-muted">투숙객 평점 순 · 표시 가격은 1박 참고가이며 날짜를 선택하면 확정됩니다</p>
        </div>
        <NuxtLink to="/hotels/list" class="hidden shrink-0 items-center gap-1 text-sm font-semibold text-primary hover:underline sm:flex">전체 보기<AppIcon name="chevron-right" :size="16" /></NuxtLink>
      </div>

      <div v-if="hotelState === 'loading'" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div v-for="n in 4" :key="n" class="overflow-hidden rounded-card bg-surface shadow-card">
          <div class="aspect-[4/3] animate-pulse bg-surface-sunken" />
          <div class="space-y-2 p-4"><div class="h-3 w-1/3 rounded bg-surface-sunken" /><div class="h-4 w-3/4 rounded bg-surface-sunken" /><div class="h-4 w-1/2 rounded bg-surface-sunken" /></div>
        </div>
      </div>
      <div v-else-if="hotelState === 'error'" class="rounded-card border border-dashed border-line-strong p-8 text-center">
        <p class="font-semibold text-ink">호텔 정보를 불러오지 못했어요</p>
        <button type="button" class="mt-3 rounded-lg border border-line px-4 py-2 text-sm font-semibold text-primary hover:bg-primary-soft" @click="loadHotels">다시 시도</button>
      </div>
      <p v-else-if="!hotels.length" class="rounded-card border border-dashed border-line-strong p-8 text-center text-sm text-ink-muted">지금 예약할 수 있는 호텔이 없어요.</p>
      <div v-else class="-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-4 [&::-webkit-scrollbar]:hidden">
        <NuxtLink v-for="h in hotels" :key="h.id" :to="`/hotels/detail/${h.id}`" class="group w-[78vw] max-w-[320px] shrink-0 snap-start overflow-hidden rounded-card bg-surface shadow-card transition-shadow hover:shadow-pop sm:w-auto sm:max-w-none">
          <div class="relative aspect-[4/3] overflow-hidden bg-surface-sunken">
            <SmartImg :src="h.thumbnail_url" :alt="h.name_ko" icon="hotel" img-class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
            <span v-if="h.free_cancellation" class="absolute left-3 top-3 rounded-full bg-surface/95 px-2.5 py-1 text-2xs font-semibold text-success">무료 취소</span>
          </div>
          <div class="p-4">
            <p class="text-xs text-ink-subtle">{{ h.city }}, {{ h.country }}<template v-if="h.star_rating"> · {{ h.star_rating }}성급</template></p>
            <h3 class="mt-1 line-clamp-1 font-bold text-ink group-hover:text-primary">{{ h.name_ko }}</h3>
            <p v-if="h.review_score" class="mt-1.5 flex items-center gap-1.5 text-sm">
              <span class="rounded-md bg-primary px-1.5 py-0.5 text-xs font-bold text-primary-ink tabular">{{ Number(h.review_score).toFixed(1) }}</span>
              <span v-if="h.review_count" class="text-xs text-ink-subtle">후기 {{ Number(h.review_count).toLocaleString() }}개</span>
            </p>
            <div class="mt-3 flex items-end justify-between border-t border-line pt-3">
              <span class="text-xs text-ink-subtle">{{ h.bookable === false ? '현재 직접 예약 불가' : '1박 참고가' }}</span>
              <span v-if="fromPrice(h)" class="text-right"><span class="text-lg font-bold text-ink tabular">{{ currency.formatKRW(fromPrice(h)!) }}</span><span class="text-xs text-ink-subtle">~</span></span>
            </div>
          </div>
        </NuxtLink>
      </div>
    </section>

    <!-- Activities -->
    <section v-if="activityState !== 'ready' || activities.length" class="mx-auto mt-16 max-w-7xl px-4 lg:px-6" aria-labelledby="h-act">
      <div class="mb-5 flex items-end justify-between gap-4">
        <h2 id="h-act" class="text-2xl font-bold tracking-tight text-ink">투어·티켓</h2>
        <NuxtLink to="/things-to-do" class="flex shrink-0 items-center gap-1 text-sm font-semibold text-primary hover:underline">전체 보기<AppIcon name="chevron-right" :size="16" /></NuxtLink>
      </div>
      <div v-if="activityState === 'loading'" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div v-for="n in 4" :key="n" class="h-28 animate-pulse rounded-card bg-surface-sunken" />
      </div>
      <div v-else-if="activityState === 'error'" class="rounded-card border border-dashed border-line-strong p-6 text-center text-sm">
        <span class="text-ink-muted">투어 정보를 불러오지 못했어요.</span>
        <button type="button" class="ml-2 font-semibold text-primary" @click="loadActivities">다시 시도</button>
      </div>
      <div v-else class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <NuxtLink v-for="a in activities" :key="a.id" :to="`/things-to-do/detail/${a.id}`" class="group flex gap-3 rounded-card bg-surface p-3 shadow-card transition-shadow hover:shadow-pop">
          <SmartImg :src="a.thumbnail_url" :alt="a.title" icon="ticket" img-class="h-24 w-24 shrink-0 rounded-xl object-cover" />
          <div class="flex min-w-0 flex-col">
            <p class="text-xs text-ink-subtle">{{ a.city }}</p>
            <h3 class="mt-0.5 line-clamp-2 text-sm font-bold leading-snug text-ink group-hover:text-primary">{{ a.title }}</h3>
            <div class="mt-auto flex items-center gap-2 pt-2">
              <span v-if="a.instant_confirmation" class="flex items-center gap-0.5 text-2xs font-semibold text-success"><AppIcon name="bolt" :size="12" />즉시 확정</span>
              <span v-if="Number(a.price_krw) > 0" class="ml-auto text-sm font-bold text-ink tabular">{{ currency.formatKRW(Number(a.price_krw)) }}~</span>
            </div>
          </div>
        </NuxtLink>
      </div>
    </section>

    <!-- Promises (describe how booking actually works) -->
    <section class="mx-auto mt-20 max-w-7xl px-4 lg:px-6" aria-labelledby="h-promise">
      <h2 id="h-promise" class="sr-only">getfortrip 예약 원칙</h2>
      <div class="grid gap-px overflow-hidden rounded-card border border-line bg-line md:grid-cols-3">
        <div v-for="p in PROMISES" :key="p.title" class="bg-surface p-6">
          <span class="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-soft text-primary"><AppIcon :name="p.icon" /></span>
          <h3 class="mt-4 font-bold text-ink">{{ p.title }}</h3>
          <p class="mt-1.5 text-sm leading-relaxed text-ink-muted">{{ p.body }}</p>
        </div>
      </div>
    </section>

    <!-- Moments (user posts, only when there are any) -->
    <section v-if="moments.length" class="mx-auto mt-16 max-w-7xl px-4 lg:px-6" aria-labelledby="h-moments">
      <div class="mb-5 flex items-end justify-between gap-4">
        <h2 id="h-moments" class="text-2xl font-bold tracking-tight text-ink">여행 모먼트</h2>
        <NuxtLink to="/moments" class="flex shrink-0 items-center gap-1 text-sm font-semibold text-primary hover:underline">더 보기<AppIcon name="chevron-right" :size="16" /></NuxtLink>
      </div>
      <div class="grid gap-4 md:grid-cols-3">
        <article v-for="m in moments" :key="m.id" class="rounded-card bg-surface p-5 shadow-card">
          <div class="flex items-center gap-3">
            <img v-if="m.user_avatar" :src="m.user_avatar" alt="" class="h-9 w-9 rounded-full object-cover" />
            <div><p class="text-sm font-semibold text-ink">{{ m.user_name }}</p><p class="text-xs text-ink-subtle">{{ m.city }}</p></div>
          </div>
          <h3 class="mt-3 line-clamp-1 font-bold text-ink">{{ m.title }}</h3>
          <p class="mt-1 line-clamp-2 text-sm text-ink-muted">{{ m.content }}</p>
          <div v-if="photos(m).length" class="mt-3 flex gap-2">
            <img v-for="p in photos(m)" :key="p" :src="p" alt="" loading="lazy" class="h-16 w-20 rounded-lg object-cover" />
          </div>
        </article>
      </div>
    </section>
  </div>
</template>
