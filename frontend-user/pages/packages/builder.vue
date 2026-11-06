<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useCurrencyStore } from '~/stores/currency'
import { useApiUrl } from '~/composables/useApi'

const router = useRouter()
const currencyStore = useCurrencyStore()

// Builder Selection State
const selectedCity = ref('도쿄')
const departureDate = ref(new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10))
const returnDate = ref(new Date(Date.now() + 18 * 86400000).toISOString().slice(0, 10))
const travelersCount = ref(2)

const CITIES = ['도쿄', '오사카', '방콕', '파리', '다낭', '후쿠오카']

const availableFlights: Record<string, any[]> = {
  '도쿄': [
    { id: 'flt_ke703', airline: '대한항공 (KE)', route: 'ICN 09:30 → NRT 12:00', price: 340000, logo: '✈️' },
    { id: 'flt_7c1302', airline: '제주항공 (7C)', route: 'ICN 11:20 → NRT 13:50', price: 230000, logo: '✈️' },
    { id: 'flt_oz102', airline: '아시아나항공 (OZ)', route: 'ICN 14:00 → HND 16:25', price: 320000, logo: '✈️' }
  ],
  '오사카': [
    { id: 'flt_oz112', airline: '아시아나항공 (OZ)', route: 'ICN 08:30 → KIX 10:20', price: 280000, logo: '✈️' },
    { id: 'flt_lj211', airline: '진에어 (LJ)', route: 'ICN 13:00 → KIX 14:50', price: 195000, logo: '✈️' }
  ],
  '방콕': [
    { id: 'flt_tg659', airline: '타이항공 (TG)', route: 'ICN 09:35 → BKK 13:30', price: 450000, logo: '✈️' },
    { id: 'flt_ke651', airline: '대한항공 (KE)', route: 'ICN 18:00 → BKK 22:00', price: 520000, logo: '✈️' }
  ],
  '파리': [
    { id: 'flt_af267', airline: '에어프랑스 (AF)', route: 'ICN 10:50 → CDG 17:00', price: 1100000, logo: '✈️' },
    { id: 'flt_ke901', airline: '대한항공 (KE)', route: 'ICN 12:15 → CDG 18:30', price: 1250000, logo: '✈️' }
  ]
}

const availableHotels: Record<string, any[]> = {
  '도쿄': [
    { id: 'htl_tokyo_01', name: '그랜드 하얏트 도쿄 (Grand Hyatt Tokyo)', stars: 5, room: '클럽 킹 룸', pricePerNight: 280000 },
    { id: 'htl_tokyo_02', name: '호텔 그로서리 신주쿠', stars: 4, room: '모던 더블 룸', pricePerNight: 160000 }
  ],
  '오사카': [
    { id: 'htl_osaka_01', name: '스위소텔 난카이 오사카', stars: 5, room: '어드밴티지 더블', pricePerNight: 220000 },
    { id: 'htl_osaka_02', name: '칸데오 호텔즈 오사카 난바', stars: 4, room: '스탠다드 트윈', pricePerNight: 140000 }
  ],
  '방콕': [
    { id: 'htl_bkk_01', name: '방콕 메리어트 마르퀴스 퀸즈 파크', stars: 5, room: '디럭스 풀뷰', pricePerNight: 140000 }
  ],
  '파리': [
    { id: 'htl_paris_01', name: '풀만 파리 투르 에펠', stars: 5, room: '에펠탑 뷰 딜럭스', pricePerNight: 420000 }
  ]
}

const selectedFlight = ref(availableFlights['도쿄'][0])
const selectedHotel = ref(availableHotels['도쿄'][0])

const updateCity = (city: string) => {
  selectedCity.value = city
  selectedFlight.value = (availableFlights[city] || availableFlights['도쿄'])[0]
  selectedHotel.value = (availableHotels[city] || availableHotels['도쿄'])[0]
}

const originalTotal = computed(() => {
  const flightCost = (selectedFlight.value?.price || 300000) * travelersCount.value
  const hotelCost = (selectedHotel.value?.pricePerNight || 200000) * 3 // 3박 기준
  return flightCost + hotelCost
})

const bundleDiscount = computed(() => Math.round(originalTotal.value * 0.18)) // 18% 할인
const packageTotal = computed(() => originalTotal.value - bundleDiscount.value)

const handleBookPackage = () => {
  router.push({
    path: '/checkout',
    query: {
      domain: 'PACKAGE',
      itemId: `pkg_${selectedCity.value}_custom`,
      startDate: departureDate.value,
      adults: String(travelersCount.value)
    }
  })
}

// Pre-made Curated Packages
const preMadePackages = ref([
  {
    id: 'pkg_tokyo_4d3n',
    title: '[인기 에어텔] 도쿄 롯폰기 하얏트 올인원 4일 (대한항공 직항 + 5성급 3박)',
    discountRate: 18,
    thumbnail: 'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=800',
    originalPrice: 1250000,
    packagePrice: 1025000,
    airline: '대한항공 (KE)',
    hotel: '그랜드 하얏트 도쿄'
  },
  {
    id: 'pkg_osaka_3d2n',
    title: '[인기 에어텔] 오사카 난바 스위소텔 올인원 3일 (아시아나 직항 + 5성급 2박)',
    discountRate: 20,
    thumbnail: 'https://images.unsplash.com/photo-1590559899731-a372a146979d?w=800',
    originalPrice: 920000,
    packagePrice: 750000,
    airline: '아시아나항공 (OZ)',
    hotel: '스위소텔 난카이 오사카'
  }
])
</script>

<template>
  <div class="max-w-6xl mx-auto px-4 py-8 space-y-10 font-sans">
    <!-- Hero Banner -->
    <div class="bg-gradient-to-r from-blue-700 via-indigo-700 to-blue-900 rounded-3xl p-8 text-white space-y-3 shadow-xl">
      <span class="px-3 py-1 bg-white/20 backdrop-blur-md rounded-full text-xs font-black uppercase tracking-wider text-blue-100">
        🏖️ Dynamic Packaging Engine (항공+호텔 DIY)
      </span>
      <h1 class="text-3xl md:text-4xl font-black tracking-tight">원하는 항공권과 호텔을 내 맘대로 조합하고 18% 즉시 할인!</h1>
      <p class="text-xs md:text-sm text-blue-100 font-medium">
        정해진 패키지 일정에 얽매이지 않고, 원하는 항공편과 숙소를 직접 골라 동적 패키지 특별가로 예약하세요.
      </p>
    </div>

    <!-- Step 1: Destination Cities -->
    <div class="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4">
      <div class="flex items-center justify-between border-b border-slate-100 pb-3">
        <h2 class="text-sm font-black text-slate-900 flex items-center gap-2">
          <span>1️⃣</span>
          <span>여행 목적지 도시 선택</span>
        </h2>
        <div class="flex items-center gap-3 text-xs">
          <label class="text-slate-500 font-bold">인원:</label>
          <select v-model.number="travelersCount" class="px-2 py-1 border border-slate-200 rounded-lg font-bold">
            <option :value="1">성인 1명</option>
            <option :value="2">성인 2명</option>
            <option :value="3">성인 3명</option>
            <option :value="4">성인 4명</option>
          </select>
        </div>
      </div>

      <div class="flex items-center gap-2 overflow-x-auto pb-1">
        <button
          v-for="c in CITIES"
          :key="c"
          @click="updateCity(c)"
          :class="[
            selectedCity === c
              ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
            'px-4 py-2 rounded-xl text-xs font-black transition flex-shrink-0'
          ]"
        >
          {{ c }}
        </button>
      </div>
    </div>

    <!-- Step 2: Flight & Hotel Selector -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <!-- Flight Selection Card -->
      <div class="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4">
        <h3 class="text-sm font-black text-slate-900 flex items-center gap-2">
          <span>✈️</span>
          <span>항공편 선택 (서울 ↔ {{ selectedCity }} 왕복)</span>
        </h3>

        <div class="space-y-2.5">
          <div
            v-for="f in (availableFlights[selectedCity] || availableFlights['도쿄'])"
            :key="f.id"
            @click="selectedFlight = f"
            :class="[
              selectedFlight?.id === f.id
                ? 'border-blue-600 bg-blue-50/40 ring-2 ring-blue-500/20'
                : 'border-slate-200 hover:border-slate-300',
              'p-4 rounded-2xl border cursor-pointer transition flex items-center justify-between text-xs'
            ]"
          >
            <div class="space-y-1">
              <div class="font-bold text-slate-900 flex items-center gap-1.5">
                <span>{{ f.airline }}</span>
                <span class="text-[10px] font-bold px-1.5 py-0.2 bg-slate-100 text-slate-600 rounded">직항</span>
              </div>
              <div class="text-slate-500 font-mono text-[11px]">{{ f.route }}</div>
            </div>
            <div class="text-right">
              <div class="font-black text-slate-900 text-sm">{{ currencyStore.formatKRW(f.price) }}</div>
              <div class="text-[10px] text-slate-400">1인 왕복 기준</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Hotel Selection Card -->
      <div class="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4">
        <h3 class="text-sm font-black text-slate-900 flex items-center gap-2">
          <AppIcon name="hotel" :size="18" class="text-primary" />
          <span>호텔 선택 (3박 기준)</span>
        </h3>

        <div class="space-y-2.5">
          <div
            v-for="h in (availableHotels[selectedCity] || availableHotels['도쿄'])"
            :key="h.id"
            @click="selectedHotel = h"
            :class="[
              selectedHotel?.id === h.id
                ? 'border-blue-600 bg-blue-50/40 ring-2 ring-blue-500/20'
                : 'border-slate-200 hover:border-slate-300',
              'p-4 rounded-2xl border cursor-pointer transition flex items-center justify-between text-xs'
            ]"
          >
            <div class="space-y-1">
              <div class="font-bold text-slate-900">{{ h.name }}</div>
              <div class="text-slate-500 text-[11px] flex items-center gap-2">
                <span>{{ '★'.repeat(h.stars) }}</span>
                <span>·</span>
                <span>{{ h.room }}</span>
              </div>
            </div>
            <div class="text-right">
              <div class="font-black text-slate-900 text-sm">{{ currencyStore.formatKRW(h.pricePerNight * 3) }}</div>
              <div class="text-[10px] text-slate-400">3박 총액</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Step 3: Bundle Summary & Checkout Bar -->
    <div class="bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 rounded-3xl p-6 text-white shadow-2xl flex flex-col md:flex-row md:items-center justify-between gap-6">
      <div class="space-y-1.5">
        <div class="flex items-center gap-2">
          <span class="px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-black">
            -18% 번들 결합 특가 적용
          </span>
          <span class="text-xs text-slate-400 font-bold">
            정가 {{ currencyStore.formatKRW(originalTotal) }}
          </span>
        </div>
        <div class="text-3xl font-black text-white flex items-baseline gap-2">
          <span>{{ currencyStore.formatKRW(packageTotal) }}</span>
          <span class="text-xs font-medium text-slate-400">
            (절약 금액: <strong class="text-rose-400 font-black">-{{ currencyStore.formatKRW(bundleDiscount) }}</strong>)
          </span>
        </div>
        <p class="text-[11px] text-slate-400">
          {{ selectedCity }} {{ travelersCount }}인 · {{ selectedFlight?.airline }} 왕복 + {{ selectedHotel?.name }} 3박 결합 패키지
        </p>
      </div>

      <div>
        <button
          @click="handleBookPackage"
          class="w-full md:w-auto px-8 py-3.5 bg-blue-600 hover:bg-blue-500 text-white font-black text-sm rounded-2xl shadow-xl shadow-blue-500/30 transition flex items-center justify-center gap-2"
        >
          <span>✨</span>
          <span>조합 패키지 바로 예약하기</span>
        </button>
      </div>
    </div>

    <!-- Curated Recommended Packages -->
    <div class="space-y-4 pt-4 border-t border-slate-200">
      <h2 class="text-lg font-black text-slate-900">GetForTrip 추천 인기 에어텔 패키지</h2>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div
          v-for="pkg in preMadePackages"
          :key="pkg.id"
          class="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-xl transition"
        >
          <div class="h-48 relative">
            <img :src="pkg.thumbnail" class="w-full h-full object-cover" />
            <span class="absolute top-3 right-3 bg-rose-600 text-white text-xs font-black px-3 py-1 rounded-full shadow-lg">
              {{ pkg.discountRate }}% 결합 할인
            </span>
          </div>
          <div class="p-6 space-y-3 text-xs">
            <h3 class="font-black text-slate-900 text-sm leading-snug">{{ pkg.title }}</h3>
            <div class="bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-1 text-slate-600">
              <div class="flex items-center gap-1.5"><AppIcon name="flight" :size="14" />항공: {{ pkg.airline }}</div>
              <div class="flex items-center gap-1.5"><AppIcon name="hotel" :size="14" />호텔: {{ pkg.hotel }}</div>
            </div>
            <div class="flex items-center justify-between pt-2 border-t border-slate-100">
              <div>
                <div class="text-[11px] text-slate-400 line-through">{{ currencyStore.formatKRW(pkg.originalPrice) }}</div>
                <div class="text-xl font-black text-blue-600">{{ currencyStore.formatKRW(pkg.packagePrice) }}</div>
              </div>
              <NuxtLink
                :to="`/packages/booking?packageId=${pkg.id}`"
                class="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-xl text-xs transition"
              >
                예약하기
              </NuxtLink>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
