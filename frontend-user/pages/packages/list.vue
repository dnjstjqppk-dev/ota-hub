<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import { useCurrencyStore } from '~/stores/currency'
import { useApiUrl } from '~/composables/useApi'

const route = useRoute()
const currencyStore = useCurrencyStore()

const city = ref(route.query.city as string || '도쿄')
const origin = ref(route.query.origin as string || '서울/인천 (ICN)')

const fallbackPackages = [
  {
    id: 'pkg_tokyo_4d3n',
    title: '[항공+호텔 결합] 도쿄 롯폰기 하얏트 럭셔리 에어텔 4일 (대한항공 직항 왕복 + 5성급 3박)',
    city: '도쿄',
    country: '일본',
    duration_nights: 3,
    duration_days: 4,
    airline_name: '대한항공 (직항 왕복)',
    hotel_name: '그랜드 하얏트 도쿄 롯폰기 힐스 (5성급)',
    original_price_krw: 1400000,
    bundle_price_krw: 1150000,
    savings_percentage: 18,
    badge: '베스트셀러 에어텔',
    hero_image_url: 'https://images.unsplash.com/photo-1503899036084-c55cdd92da26?w=800',
    features: ['대한항공 직항 왕복 (위탁수하물 23kg)', '5성급 럭셔리 호텔 3박 (조식 포함)', '도쿄 시티뷰 디럭스 룸 확정', '24시간 안심 케어 서비스']
  },
  {
    id: 'pkg_osaka_3d2n',
    title: '[인기 에어텔] 오사카 난바 스위소텔 올인원 3일 (아시아나 직항 + 5성급 2박)',
    city: '오사카',
    country: '일본',
    duration_nights: 2,
    duration_days: 3,
    airline_name: '아시아나항공 (직항 왕복)',
    hotel_name: '스위소텔 난카이 오사카 (5성급)',
    original_price_krw: 920000,
    bundle_price_krw: 750000,
    savings_percentage: 20,
    badge: '난바역 직결 호텔',
    hero_image_url: 'https://images.unsplash.com/photo-1590559899731-a372a146979d?w=800',
    features: ['아시아나항공 직항 왕복', '난바역 직결 5성급 호텔', '간사이공항 라피트 급행권 증정', '무료 취소 가능']
  },
  {
    id: 'pkg_danang_4d3n',
    title: '[휴양 리조트 특가] 다낭 하얏트 리젠시 풀빌라 4일 (직항 왕복 + 오션뷰 3박)',
    city: '다낭',
    country: '베트남',
    duration_nights: 3,
    duration_days: 4,
    airline_name: '베트남항공 (직항 왕복)',
    hotel_name: '하얏트 리젠시 다낭 리조트 & 스파 (5성급)',
    original_price_krw: 1100000,
    bundle_price_krw: 860000,
    savings_percentage: 22,
    badge: '풀빌라 리조트',
    hero_image_url: 'https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=800',
    features: ['오션뷰 풀빌라 룸 업그레이드', '매일 전 일정 조식 뷔페 포함', '공항 왕복 픽업 무료 제공', '스파 60분 1회 무료']
  }
]

const packages = ref<any[]>(fallbackPackages)
const loading = ref(false)

const fetchPackages = async () => {
  loading.value = true
  try {
    const res = await fetch(useApiUrl('/packages'))
    const json = await res.json()
    packages.value = json.data && json.data.length ? json.data : fallbackPackages
  } catch (e) {
    packages.value = fallbackPackages
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  fetchPackages()
})
</script>

<template>
  <div class="max-w-7xl mx-auto px-4 py-8 space-y-6">
    <!-- 상단 브레드크럼 -->
    <div class="bg-white rounded-2xl border border-slate-200 p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
      <div class="flex items-center gap-4">
        <div class="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center font-black text-xl">
          🏖️
        </div>
        <div>
          <div class="flex items-center gap-2 text-xs text-slate-400">
            <NuxtLink to="/" class="hover:underline">홈</NuxtLink> <span>›</span>
            <NuxtLink to="/packages" class="hover:underline">항공+호텔</NuxtLink> <span>›</span>
            <span class="text-slate-800 font-bold">특가 패키지</span>
          </div>
          <div class="text-base font-black text-slate-900 mt-0.5">
            {{ origin }} 출발 · {{ city }} 결합 패키지
          </div>
        </div>
      </div>

      <NuxtLink
        to="/packages/builder"
        class="px-4 py-2 bg-rose-500 hover:bg-rose-600 text-white rounded-xl text-xs font-bold transition shadow-md"
      >
        내 맞춤 일정으로 직접 조합하기 🛠️
      </NuxtLink>
    </div>

    <!-- 패키지 리스트 카드 -->
    <div class="space-y-6">
      <div
        v-for="pkg in packages"
        :key="pkg.id"
        class="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-xl transition flex flex-col md:flex-row items-stretch"
      >
        <img :src="pkg.hero_image_url" class="w-full md:w-80 h-56 md:h-auto object-cover flex-shrink-0" />
        
        <div class="p-6 md:p-8 flex-1 flex flex-col justify-between space-y-6">
          <div class="space-y-3">
            <div class="flex items-center gap-2">
              <span class="px-2.5 py-0.5 bg-rose-50 text-rose-700 text-xs font-bold rounded-full">
                {{ pkg.badge }}
              </span>
              <span class="text-xs text-slate-400">• {{ pkg.duration_nights }}박 {{ pkg.duration_days }}일</span>
              <span class="px-2 py-0.5 bg-amber-50 text-amber-800 text-[11px] font-black rounded">
                ⚡ {{ pkg.savings_percentage }}% 결합 할인
              </span>
            </div>

            <h2 class="text-xl md:text-2xl font-black text-slate-900 leading-tight">
              {{ pkg.title }}
            </h2>

            <!-- 포함 구성 -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-600 pt-2 border-t border-slate-100">
              <div class="flex items-center gap-2 font-bold text-slate-800">
                <span>✈️ {{ pkg.airline_name }}</span>
              </div>
              <div class="flex items-center gap-2 font-bold text-slate-800">
                <span>🏨 {{ pkg.hotel_name }}</span>
              </div>
            </div>

            <!-- 특징 혜택 -->
            <ul class="text-xs space-y-1 text-slate-500 pt-1">
              <li v-for="feat in pkg.features" :key="feat" class="flex items-center gap-1.5">
                <span class="text-rose-500 font-bold">✓</span>
                <span>{{ feat }}</span>
              </li>
            </ul>
          </div>

          <!-- 가격 및 선택 버튼 -->
          <div class="pt-4 border-t border-slate-100 flex items-center justify-between gap-4">
            <div>
              <div class="text-xs text-slate-400 line-through">
                개별 구매가: {{ currencyStore.formatKRW(pkg.original_price_krw) }}
              </div>
              <div class="flex items-baseline gap-2">
                <span class="text-2xl md:text-3xl font-black text-rose-600 font-mono">
                  {{ currencyStore.formatKRW(pkg.bundle_price_krw) }}
                </span>
                <span class="text-xs text-slate-400">/ 1인 기준 패키지 총액</span>
              </div>
            </div>

            <div class="flex items-center gap-2">
              <NuxtLink
                :to="`/packages/detail/${pkg.id}`"
                class="px-5 py-3 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-2xl transition whitespace-nowrap"
              >
                패키지 상세
              </NuxtLink>
              <NuxtLink
                :to="`/packages/booking?packageId=${pkg.id}`"
                class="px-6 py-3 bg-rose-600 hover:bg-rose-700 text-white font-black text-xs rounded-2xl shadow-lg transition whitespace-nowrap"
              >
                결합 예약하기
              </NuxtLink>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
