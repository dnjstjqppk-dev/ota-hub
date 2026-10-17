<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useCurrencyStore } from '~/stores/currency'
import { useApiUrl } from '~/composables/useApi'

const DEFAULT_HOTELS = [
  {
    id: 'htl_tokyo_01',
    name_ko: '그랜드 하얏트 도쿄 롯폰기 힐스',
    city: '도쿄',
    country: '일본',
    star_rating: 5,
    review_score: 4.9,
    thumbnail_url: 'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=800',
    rooms: [{ base_price_krw: 385000 }]
  },
  {
    id: 'htl_seoul_01',
    name_ko: '시그니엘 서울 롯데월드타워',
    city: '서울',
    country: '대한민국',
    star_rating: 5,
    review_score: 4.9,
    thumbnail_url: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800',
    rooms: [{ base_price_krw: 550000 }]
  },
  {
    id: 'htl_osaka_01',
    name_ko: '스위소텔 난카이 오사카',
    city: '오사카',
    country: '일본',
    star_rating: 5,
    review_score: 4.8,
    thumbnail_url: 'https://images.unsplash.com/photo-1590559899731-a372a146979d?w=800',
    rooms: [{ base_price_krw: 275000 }]
  },
  {
    id: 'htl_singapore_01',
    name_ko: '마리나 베이 샌즈 싱가포르',
    city: '싱가포르',
    country: '싱가포르',
    star_rating: 5,
    review_score: 4.9,
    thumbnail_url: 'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=800',
    rooms: [{ base_price_krw: 690000 }]
  }
]

const DEFAULT_MOMENTS = [
  {
    id: 'mm_01',
    user_name: '이지민 (여행 크리에이터)',
    user_avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200',
    city: '도쿄',
    title: '롯폰기 힐스에서 바라본 도쿄 타워 야경 & getfortrip 특가 호텔 솔직 후기',
    content: '도쿄 여행 때 그랜드 하얏트에 묵었는데 역과 바로 연결되어 쇼핑과 이동이 너무 편했어요! getfortrip 타임딜로 30% 할인받고 예약했습니다.',
    photos: [
      'https://images.unsplash.com/photo-1503899036084-c55cdd92da26?w=600',
      'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=600'
    ]
  },
  {
    id: 'mm_02',
    user_name: '박준형 (자유여행 매니아)',
    user_avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200',
    city: '오사카',
    title: '오사카 도톤보리와 난바역 직결 스위소텔 호캉스 브이로그',
    content: '간사이 공항에서 라피트로 환승 없이 난바역에 내려서 바로 체크인! 밤에는 도톤보리 글리코상 앞 산책까지 완벽한 동선이었습니다.',
    photos: [
      'https://images.unsplash.com/photo-1590559899731-a372a146979d?w=600',
      'https://images.unsplash.com/photo-1508009603885-50cf7c579365?w=600'
    ]
  }
]

const currencyStore = useCurrencyStore()
const hotels = ref<any[]>(DEFAULT_HOTELS)
const moments = ref<any[]>(DEFAULT_MOMENTS)

import { useRoute } from 'vue-router'
import { BRAND } from '~/config/brand'

const route = useRoute()
const currentLocale = (route.query.locale as string) || 'ko-kr'

useHead({
  title: 'getfortrip | 호텔, 항공권, 기차표, 투어 티켓 최저가 예약',
  htmlAttrs: {
    lang: currentLocale === 'ko-kr' ? 'ko-KR' : 'en-US'
  },
  meta: [
    { name: 'description', content: '전 세계 호텔, 최저가 항공권, KTX/신칸센 기차표, 공항 픽업 및 액티비티를 getfortrip에서 실시간 예약하세요.' },
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

onMounted(async () => {
  try {
    const [hotelRes, momentRes] = await Promise.all([
      fetch(useApiUrl('/hotels')),
      fetch(useApiUrl('/moments'))
    ])
    if (hotelRes.ok) {
      const hotelJson = await hotelRes.json()
      if (hotelJson.data && hotelJson.data.length > 0) {
        hotels.value = hotelJson.data
      }
    }
    if (momentRes.ok) {
      const momentJson = await momentRes.json()
      if (momentJson.data && momentJson.data.length > 0) {
        moments.value = momentJson.data
      }
    }
  } catch (e) {
    // Keep DEFAULT_HOTELS and DEFAULT_MOMENTS
  }
})
</script>

<template>
  <div>
    <!-- 히어로 배너 섹션 -->
    <div class="relative bg-gradient-to-r from-blue-900 via-trip-navy to-blue-800 text-white pt-10 pb-12 md:pt-20 md:pb-32 px-4 overflow-hidden">
      <div class="absolute -top-40 -right-40 w-96 h-96 bg-trip-blue/30 rounded-full blur-3xl pointer-events-none"></div>
      
      <div class="max-w-6xl mx-auto text-center space-y-3 relative z-10">
        <span class="inline-block px-3 py-1 bg-white/10 backdrop-blur-md rounded-full text-xs font-bold tracking-wider text-blue-200 border border-white/20 uppercase">
          ✈️ 2026 Global Mega Travel Season
        </span>
        <h1 class="text-2xl sm:text-3xl md:text-5xl font-black tracking-tight">
          전 세계 어디든, getfortrip과 함께
        </h1>
        <p class="text-xs sm:text-sm md:text-base text-blue-100 font-medium">
          최저가 항공권, 특가 호텔, 기차표부터 현지 eSIM까지 한 번에 예약하세요.
        </p>
      </div>
    </div>

    <!-- 모바일 전용 Trip-style 10대 카테고리 퀵 그리드 (2열 x 5행 카드) -->
    <div class="md:hidden px-3 -mt-6 mb-4 relative z-30">
      <div class="bg-white/95 backdrop-blur-md rounded-2xl p-2.5 shadow-lg border border-slate-100 grid grid-cols-5 gap-1.5 text-center">
        <NuxtLink
          v-for="cat in [
            { label: '호텔', icon: '🏨', to: '/hotels/list', color: 'bg-blue-50 text-blue-600' },
            { label: '항공권', icon: '✈️', to: '/flights/search', color: 'bg-indigo-50 text-indigo-600' },
            { label: '기차표', icon: '🚄', to: '/trains/search', color: 'bg-emerald-50 text-emerald-600' },
            { label: '렌터카', icon: '🚗', to: '/cars', color: 'bg-amber-50 text-amber-600' },
            { label: '공항픽업', icon: '🚐', to: '/transfers', color: 'bg-teal-50 text-teal-600' },
            { label: '투어·티켓', icon: '🎟️', to: '/things-to-do', color: 'bg-purple-50 text-purple-600' },
            { label: '항공+호텔', icon: '🏖️', to: '/packages/list', color: 'bg-rose-50 text-rose-600' },
            { label: 'eSIM', icon: '📶', to: '/esim', color: 'bg-cyan-50 text-cyan-600' },
            { label: '여행자보험', icon: '🛡️', to: '/insurance', color: 'bg-green-50 text-green-600' },
            { label: '특가혜택', icon: '🏷️', to: '/deals', color: 'bg-orange-50 text-orange-600' }
          ]"
          :key="cat.label"
          :to="cat.to"
          class="flex flex-col items-center justify-center p-1 rounded-xl hover:bg-slate-50 transition active:scale-95"
        >
          <div :class="['w-9 h-9 rounded-xl flex items-center justify-center text-base mb-1 shadow-sm', cat.color]">
            {{ cat.icon }}
          </div>
          <span class="text-[10px] font-black text-slate-800 tracking-tight whitespace-nowrap">{{ cat.label }}</span>
        </NuxtLink>
      </div>
    </div>

    <!-- 7대 도메인 통합 검색 위젯 -->
    <HomeSearchWidget />

    <!-- 프로모션 타임딜 배너 -->
    <div class="max-w-6xl mx-auto px-4 mt-16">
      <div class="bg-gradient-to-r from-orange-500 to-amber-500 rounded-3xl p-6 md:p-8 text-white flex flex-col md:flex-row items-center justify-between shadow-xl gap-4">
        <div class="space-y-1">
          <span class="px-2.5 py-0.5 bg-black/20 rounded-full text-[11px] font-black uppercase tracking-wider">
            ⚡ 타임딜 메가세일
          </span>
          <h3 class="text-2xl font-black">신규 회원 첫 예약 10% 웰컴 쿠폰 즉시 지급!</h3>
          <p class="text-xs text-orange-100 font-medium">코드 <code>WELCOME2026</code> 입력 시 전 세계 호텔 & 항공권 최대 30,000원 추가 할인</p>
        </div>
        <NuxtLink to="/deals" class="px-6 py-3 bg-white text-orange-600 font-black rounded-2xl hover:bg-orange-50 transition shadow-lg text-sm whitespace-nowrap">
          쿠폰 다운로드
        </NuxtLink>
      </div>
    </div>

    <!-- 인기 도시 카드 섹션 -->
    <div class="max-w-6xl mx-auto px-4 mt-16 space-y-6">
      <div class="flex items-end justify-between">
        <div>
          <h2 class="text-2xl font-black text-trip-navy tracking-tight">인기 여행지 추천</h2>
          <p class="text-xs text-slate-500 mt-1">지금 가장 많은 여행자가 떠나는 추천 도시</p>
        </div>
      </div>

      <div class="grid grid-cols-2 md:grid-cols-6 gap-4">
        <NuxtLink
          v-for="city in [
            { name: '서울', en: 'Seoul', img: 'https://images.unsplash.com/photo-1534274988757-a28bf1a57c17?w=400' },
            { name: '도쿄', en: 'Tokyo', img: 'https://images.unsplash.com/photo-1503899036084-c55cdd92da26?w=400' },
            { name: '오사카', en: 'Osaka', img: 'https://images.unsplash.com/photo-1590559899731-a372a146979d?w=400' },
            { name: '방콕', en: 'Bangkok', img: 'https://images.unsplash.com/photo-1508009603885-50cf7c579365?w=400' },
            { name: '파리', en: 'Paris', img: 'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=400' },
            { name: '다낭', en: 'Danang', img: 'https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=400' }
          ]"
          :key="city.name"
          :to="`/hotels/list?city=${city.name}`"
          class="group relative h-48 rounded-2xl overflow-hidden shadow-md"
        >
          <img :src="city.img" class="w-full h-full object-cover group-hover:scale-110 transition duration-500" />
          <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent flex flex-col justify-end p-3 text-white">
            <span class="text-base font-black">{{ city.name }}</span>
            <span class="text-[10px] text-slate-300 font-mono">{{ city.en }}</span>
          </div>
        </NuxtLink>
      </div>
    </div>

    <!-- 특가 호텔 리스트 (getfortrip Best) -->
    <div class="max-w-6xl mx-auto px-4 mt-16 space-y-6">
      <div class="flex items-end justify-between">
        <div>
          <div class="flex items-center gap-2">
            <span class="text-amber-500 font-black text-sm">getfortrip Best 2026</span>
            <span class="px-2 py-0.5 bg-amber-50 text-amber-700 rounded text-[10px] font-bold">인기 호텔 TOP</span>
          </div>
          <h2 class="text-2xl font-black text-trip-navy tracking-tight mt-0.5">최고 평점 럭셔리 호텔 특가</h2>
        </div>
        <NuxtLink to="/hotels/list" class="text-xs font-bold text-trip-blue hover:underline">
          전체 호텔 보기 →
        </NuxtLink>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-4 gap-6">
        <NuxtLink
          v-for="h in hotels.slice(0, 4)"
          :key="h.id"
          :to="`/hotels/detail/${h.id}`"
          class="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-sm hover:shadow-xl transition group"
        >
          <div class="h-44 relative overflow-hidden">
            <img :src="h.thumbnail_url" class="w-full h-full object-cover group-hover:scale-105 transition duration-500" />
            <div class="absolute top-3 left-3 bg-trip-navy/80 backdrop-blur-md text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
              ★ {{ h.star_rating }}성급
            </div>
            <div class="absolute bottom-3 right-3 bg-trip-blue text-white text-[11px] font-black px-2 py-0.5 rounded-lg">
              {{ h.review_score }} / 5.0
            </div>
          </div>

          <div class="p-4 space-y-2">
            <div class="text-[11px] text-slate-400 font-semibold">{{ h.city }}, {{ h.country }}</div>
            <h4 class="font-black text-slate-900 text-sm line-clamp-1 group-hover:text-trip-blue transition">
              {{ h.name_ko }}
            </h4>
            <div class="flex items-center justify-between pt-2 border-t border-slate-100">
              <span class="text-[11px] text-slate-400 font-medium">1박 기준</span>
              <span class="text-base font-black text-trip-blue">
                {{ currencyStore.formatKRW(h.rooms?.[0]?.base_price_krw || 300000) }}
              </span>
            </div>
          </div>
        </NuxtLink>
      </div>
    </div>

    <!-- 여행 모먼트 커뮤니티 피드 프리뷰 -->
    <div class="max-w-6xl mx-auto px-4 mt-16 space-y-6">
      <div class="flex items-end justify-between">
        <div>
          <h2 class="text-2xl font-black text-trip-navy tracking-tight">여행자들의 생생한 getfortrip 모먼트</h2>
          <p class="text-xs text-slate-500 mt-1">실제 여행자들이 공유하는 여행 사진과 필수 팁</p>
        </div>
        <NuxtLink to="/moments" class="text-xs font-bold text-trip-blue hover:underline">
          더 많은 모먼트 보기 →
        </NuxtLink>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div v-for="m in moments" :key="m.id" class="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm space-y-3">
          <div class="flex items-center gap-3">
            <img :src="m.user_avatar" class="w-9 h-9 rounded-full object-cover" />
            <div>
              <div class="text-xs font-bold text-slate-900">{{ m.user_name }}</div>
              <div class="text-[11px] text-slate-400">{{ m.city }} 여행기</div>
            </div>
          </div>
          <h4 class="font-bold text-slate-900 text-sm">{{ m.title }}</h4>
          <p class="text-xs text-slate-600 line-clamp-2 leading-relaxed">{{ m.content }}</p>
          <div class="flex gap-2">
            <img v-for="p in m.photos" :key="p" :src="p" class="w-24 h-16 rounded-xl object-cover" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
