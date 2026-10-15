<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useCurrencyStore } from '~/stores/currency'
import { useApiUrl } from '~/composables/useApi'

const route = useRoute()
const currencyStore = useCurrencyStore()

const pkg = ref<any>(null)
const loading = ref(true)

const fallbackPackage = {
  id: 'pkg_tokyo_4d3n',
  title: '[항공+호텔 결합] 도쿄 롯폰기 하얏트 럭셔리 에어텔 4일 (대한항공 직항 왕복 + 5성급 3박)',
  city: '도쿄',
  country: '일본',
  duration_nights: 3,
  duration_days: 4,
  airline_name: '대한항공 (Korean Air)',
  flight_outbound: 'KE703 (ICN 10:10 → NRT 12:35)',
  flight_inbound: 'KE704 (NRT 13:55 → ICN 16:30)',
  free_baggage: '위탁수하물 23kg 무료',
  hotel_name: '그랜드 하얏트 도쿄 롯폰기 힐스 (Grand Hyatt Tokyo)',
  hotel_star: 5,
  room_name: '디럭스 킹 룸 (시티뷰, 조식 뷔페 2인 매일 포함)',
  original_price_krw: 1400000,
  bundle_price_krw: 1150000,
  savings_percentage: 18,
  badge: '베스트셀러 에어텔',
  hero_image_url: 'https://images.unsplash.com/photo-1503899036084-c55cdd92da26?w=800',
  gallery: [
    'https://images.unsplash.com/photo-1503899036084-c55cdd92da26?w=800',
    'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=800',
    'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=800'
  ],
  itinerary: [
    { day: 'Day 1', title: '인천 출발 → 도쿄 나리타 도착 & 호텔 체크인', desc: '대한항공 전용기 탑승 후 나리타 도착. 전용 리무진 버스로 롯폰기 힐스 이동 후 그랜드 하얏트 체크인 및 자유 일정.' },
    { day: 'Day 2', title: '도쿄 도심 명소 탐방 (긴자, 시부야 스카이, 모리 미술관)', desc: '호텔 조식 뷔페 후 롯폰기 힐스 전망대 및 긴자 쇼핑 거리 자유 관람.' },
    { day: 'Day 3', title: '오다이바 또는 디즈니랜드 1일 자유 투어', desc: '전 일정 개별 맞춤 자유 여행. 호텔 라운지 및 피트니스/사우나 무료 이용.' },
    { day: 'Day 4', title: '호텔 체크아웃 → 나리타 공항 이동 → 인천 귀국', desc: '여유로운 조식 후 12:00 레이트 체크아웃. 공항 이동 후 KE704 탑승하여 인천 도착.' }
  ]
}

onMounted(async () => {
  try {
    const pkgId = route.params.id || route.query.id || 'pkg_tokyo_4d3n'
    const res = await fetch(useApiUrl(`/packages/${pkgId}`))
    if (res.ok) {
      const json = await res.json()
      pkg.value = json.data ? { ...fallbackPackage, ...json.data } : fallbackPackage
    } else {
      pkg.value = fallbackPackage
    }
  } catch (e) {
    pkg.value = fallbackPackage
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div v-if="loading" class="max-w-6xl mx-auto px-4 py-24 text-center text-slate-400 font-bold">
    패키지 상세 구성 및 결합 할인 내역을 불러오는 중입니다...
  </div>

  <div v-else-if="pkg" class="max-w-6xl mx-auto px-4 py-8 space-y-8">
    <!-- 상단 브레드크럼 -->
    <div>
      <div class="flex items-center gap-2 text-xs text-slate-400 mb-2">
        <NuxtLink to="/" class="hover:underline">홈</NuxtLink> <span>›</span>
        <NuxtLink to="/packages" class="hover:underline">항공+호텔</NuxtLink> <span>›</span>
        <NuxtLink to="/packages/list" class="hover:underline">패키지 목록</NuxtLink> <span>›</span>
        <span class="text-slate-800 font-bold">{{ pkg.city }} 에어텔</span>
      </div>

      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div class="flex items-center gap-2 mb-1">
            <span class="px-2.5 py-0.5 bg-rose-50 text-rose-700 text-xs font-bold rounded-full">
              {{ pkg.badge }}
            </span>
            <span class="text-xs text-slate-400">• {{ pkg.duration_nights }}박 {{ pkg.duration_days }}일 일정</span>
            <span class="px-2 py-0.5 bg-amber-50 text-amber-800 text-xs font-bold rounded">
              ⚡ {{ pkg.savings_percentage }}% 절약
            </span>
          </div>
          <h1 class="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">
            {{ pkg.title }}
          </h1>
        </div>

        <div class="text-right">
          <div class="text-xs text-slate-400 line-through">
            개별가: {{ currencyStore.formatKRW(pkg.original_price_krw) }}
          </div>
          <div class="text-3xl font-black text-rose-600 font-mono">
            {{ currencyStore.formatKRW(pkg.bundle_price_krw) }}
          </div>
          <div class="text-[11px] text-slate-400">1인 기준 항공+호텔 총 결합가</div>
        </div>
      </div>
    </div>

    <!-- 사진 갤러리 -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-3 h-80 rounded-3xl overflow-hidden shadow-sm">
      <img :src="pkg.hero_image_url" class="md:col-span-2 w-full h-full object-cover" />
      <div class="hidden md:grid grid-rows-2 gap-3 h-full">
        <img v-for="(img, idx) in pkg.gallery.slice(1, 3)" :key="idx" :src="img" class="w-full h-full object-cover" />
      </div>
    </div>

    <!-- 결합 포함 내역 (Air+Hotel Bundle Details) -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <!-- 항공편 내역 -->
      <div class="bg-white rounded-3xl border border-slate-200 p-6 space-y-4 shadow-sm">
        <div class="flex items-center gap-3">
          <span class="text-2xl">✈️</span>
          <div>
            <span class="text-xs font-bold text-slate-400 block">포함 항공편</span>
            <h3 class="font-black text-slate-900 text-base">{{ pkg.airline_name }} 직항 왕복</h3>
          </div>
        </div>
        <div class="space-y-2 text-xs bg-slate-50 p-4 rounded-2xl">
          <div class="flex justify-between">
            <span class="text-slate-500">가는 편</span>
            <span class="font-mono font-bold text-slate-900">{{ pkg.flight_outbound }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-500">오는 편</span>
            <span class="font-mono font-bold text-slate-900">{{ pkg.flight_inbound }}</span>
          </div>
          <div class="flex justify-between pt-2 border-t border-slate-200">
            <span class="text-slate-500">수하물</span>
            <span class="font-bold text-emerald-600">✓ {{ pkg.free_baggage }}</span>
          </div>
        </div>
      </div>

      <!-- 호텔 내역 -->
      <div class="bg-white rounded-3xl border border-slate-200 p-6 space-y-4 shadow-sm">
        <div class="flex items-center gap-3">
          <span class="text-2xl">🏨</span>
          <div>
            <span class="text-xs font-bold text-slate-400 block">포함 호텔 ({{ pkg.duration_nights }}박)</span>
            <h3 class="font-black text-slate-900 text-base">{{ pkg.hotel_name }}</h3>
          </div>
        </div>
        <div class="space-y-2 text-xs bg-slate-50 p-4 rounded-2xl">
          <div class="flex justify-between">
            <span class="text-slate-500">객실 유형</span>
            <span class="font-bold text-slate-900">{{ pkg.room_name }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-500">성급 및 위치</span>
            <span class="text-slate-700">★ {{ pkg.hotel_star }}성급 · 도심 중심 롯폰기 힐스</span>
          </div>
          <div class="flex justify-between pt-2 border-t border-slate-200">
            <span class="text-slate-500">조식 혜택</span>
            <span class="font-bold text-emerald-600">✓ 2인 조식 뷔페 무료</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 일자별 추천 일정표 (Trip-style Timeline) -->
    <div class="bg-white rounded-3xl border border-slate-200 p-6 md:p-8 space-y-6 shadow-sm">
      <h2 class="text-xl font-black text-slate-900">추천 여행 일정 ({{ pkg.duration_days }}일 코스)</h2>
      <div class="space-y-6">
        <div v-for="it in pkg.itinerary" :key="it.day" class="flex gap-4 items-start">
          <div class="w-16 flex-shrink-0">
            <span class="px-2.5 py-1 bg-rose-50 text-rose-700 font-mono font-black text-xs rounded-lg">
              {{ it.day }}
            </span>
          </div>
          <div class="space-y-1">
            <h4 class="text-sm font-bold text-slate-900">{{ it.title }}</h4>
            <p class="text-xs text-slate-600 leading-relaxed">{{ it.desc }}</p>
          </div>
        </div>
      </div>
    </div>

    <!-- 하단 결합 예약 CTA 바 -->
    <div class="bg-white rounded-3xl border border-slate-200 p-6 flex items-center justify-between gap-4 shadow-sm">
      <div>
        <div class="text-xs text-slate-400 line-through">
          개별가: {{ currencyStore.formatKRW(pkg.original_price_krw) }}
        </div>
        <div class="text-2xl md:text-3xl font-black text-rose-600 font-mono">
          {{ currencyStore.formatKRW(pkg.bundle_price_krw) }}
        </div>
      </div>

      <NuxtLink
        :to="`/packages/booking?packageId=${pkg.id}`"
        class="px-8 py-4 bg-rose-600 hover:bg-rose-700 text-white font-black text-sm rounded-2xl shadow-lg transition"
      >
        항공+호텔 결합 예약하기 →
      </NuxtLink>
    </div>
  </div>
</template>

