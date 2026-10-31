<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import { useCurrencyStore } from '~/stores/currency'
import { useApiUrl } from '~/composables/useApi'

const route = useRoute()
const currencyStore = useCurrencyStore()

const city = ref((route.query.city || route.query.dest) as string || '도쿄')
const origin = ref(route.query.origin as string || '서울/인천 (ICN)')

import { searchPackageCatalog, type PackageBundle } from '~/data/packageCatalog'

const packages = ref<PackageBundle[]>(searchPackageCatalog({ city: city.value }))
const loading = ref(false)

const fetchPackages = async () => {
  loading.value = true
  try {
    const res = await fetch(`${useApiUrl('/packages')}?city=${encodeURIComponent(city.value)}`, { signal: AbortSignal.timeout(1500) })
    if (res.ok) {
      const json = await res.json()
      if (Array.isArray(json.data) && json.data.length > 0) {
        packages.value = json.data.map((p: any) => ({
          ...p,
          hero_image_url: p.hero_image_url || p.thumbnail_url,
          savings_percentage: p.savings_percentage || p.package_discount_rate || 15,
          bundle_price_krw: p.bundle_price_krw || p.total_package_krw,
          original_price_krw: p.original_price_krw || p.total_original_krw,
          badge: p.badge || '특가 번들',
          duration_nights: p.duration_nights || 3,
          duration_days: p.duration_days || 4,
          flight: p.flight || { airline_name: '대한항공 (KE)', departure_city: '서울/인천', arrival_city: p.destination_city || city.value },
          hotel: p.hotel || { name_ko: `${p.destination_city || city.value} 5성급 럭셔리 호텔`, city: p.destination_city || city.value }
        }))
        loading.value = false
        return
      }
    }
  } catch (e) {
    // Keep verified package catalog
  }

  packages.value = searchPackageCatalog({ city: city.value })
  loading.value = false
}

watch(() => [route.query.city, route.query.dest], ([newCity, newDest]) => {
  const c = newCity || newDest
  if (c !== undefined) {
    city.value = (c as string) || ''
    fetchPackages()
  }
})

watch(city, () => {
  fetchPackages()
})

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
          <div class="pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
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

            <div class="flex items-center gap-2 w-full sm:w-auto">
              <NuxtLink
                :to="`/packages/detail/${pkg.id}`"
                class="flex-1 sm:flex-initial text-center px-4 sm:px-5 py-3 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-2xl transition whitespace-nowrap"
              >
                패키지 상세
              </NuxtLink>
              <NuxtLink
                :to="`/packages/booking?packageId=${pkg.id}`"
                class="flex-1 sm:flex-initial text-center px-5 sm:px-6 py-3 bg-rose-600 hover:bg-rose-700 text-white font-black text-xs rounded-2xl shadow-lg transition whitespace-nowrap"
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

