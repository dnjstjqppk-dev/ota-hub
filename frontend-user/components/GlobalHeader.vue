<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useCurrencyStore } from '~/stores/currency'
import { useAuthStore } from '~/stores/auth'
import { BRAND } from '~/config/brand'

const currencyStore = useCurrencyStore()
const authStore = useAuthStore()

const showCurrencyDropdown = ref(false)

onMounted(() => {
  currencyStore.fetchRates()
})
</script>

<template>
  <header class="bg-white border-b border-trip-border sticky top-0 z-50 shadow-sm">
    <div class="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
      <!-- 좌측 로고 & 주요 도메인 네비 -->
      <div class="flex items-center gap-4 lg:gap-8 flex-shrink-0">
        <NuxtLink to="/" class="flex items-center gap-2 group flex-shrink-0" :title="BRAND.name">
          <img src="/logo.svg" alt="getfortrip" class="h-8 lg:h-9 w-auto object-contain flex-shrink-0" />
        </NuxtLink>

        <nav class="hidden md:flex items-center gap-3 lg:gap-5 text-sm font-bold text-trip-navy whitespace-nowrap">
          <NuxtLink to="/hotels" class="hover:text-trip-blue transition whitespace-nowrap flex-shrink-0">호텔</NuxtLink>
          <NuxtLink to="/flights" class="hover:text-trip-blue transition whitespace-nowrap flex-shrink-0">항공권</NuxtLink>
          <NuxtLink to="/trains" class="hover:text-trip-blue transition whitespace-nowrap flex-shrink-0">기차표</NuxtLink>
          <NuxtLink to="/cars" class="hover:text-trip-blue transition whitespace-nowrap flex-shrink-0">렌터카</NuxtLink>
          <NuxtLink to="/transfers" class="hover:text-trip-blue transition whitespace-nowrap flex-shrink-0">공항픽업</NuxtLink>
          <NuxtLink to="/things-to-do" class="hover:text-trip-blue transition whitespace-nowrap flex-shrink-0">투어·티켓</NuxtLink>
          <NuxtLink to="/packages" class="hover:text-trip-blue transition flex items-center gap-1 whitespace-nowrap flex-shrink-0">
            <span>항공+호텔</span>
            <span class="text-[10px] bg-trip-orange text-white px-1.5 py-0.2 rounded-full font-black">특가</span>
          </NuxtLink>
          <NuxtLink to="/trip-best" class="hover:text-trip-blue transition text-amber-600 font-extrabold flex items-center gap-1 whitespace-nowrap flex-shrink-0">
            <span>🏆 getfortrip Best</span>
          </NuxtLink>
          <NuxtLink to="/moments" class="hover:text-trip-blue transition whitespace-nowrap flex-shrink-0">여행 모먼트</NuxtLink>
        </nav>
      </div>

      <!-- 우측 다통화/다국어/회원 배지 -->
      <div class="flex items-center gap-2.5 lg:gap-4 text-xs font-semibold flex-shrink-0 whitespace-nowrap">
        <!-- 다통화 선택기 -->
        <div class="relative flex-shrink-0">
          <button
            @click="showCurrencyDropdown = !showCurrencyDropdown"
            class="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:border-trip-blue text-trip-navy font-bold transition whitespace-nowrap"
          >
            <span>{{ currencyStore.symbol }}</span>
            <span>{{ currencyStore.activeCurrency }}</span>
            <svg class="w-3 h-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
          </button>

          <div
            v-if="showCurrencyDropdown"
            class="absolute right-0 mt-1 w-36 bg-white border border-trip-border rounded-xl shadow-xl p-1 z-50 space-y-0.5"
          >
            <button
              v-for="curr in ['KRW', 'USD', 'JPY', 'EUR', 'CNY', 'GBP']"
              :key="curr"
              @click="currencyStore.setCurrency(curr); showCurrencyDropdown = false"
              :class="[
                'w-full text-left px-3 py-2 rounded-lg font-bold flex items-center justify-between text-xs whitespace-nowrap',
                currencyStore.activeCurrency === curr ? 'bg-blue-50 text-trip-blue' : 'hover:bg-slate-50 text-slate-700'
              ]"
            >
              <span>{{ curr }}</span>
              <span class="text-slate-400">{{ currencyStore.rates[curr] ? `₩${currencyStore.rates[curr]}` : '' }}</span>
            </button>
          </div>
        </div>

        <NuxtLink to="/deals" class="hidden sm:inline-block text-trip-orange font-bold hover:underline whitespace-nowrap flex-shrink-0">
          🎁 프로모션
        </NuxtLink>

        <NuxtLink to="/help" class="hidden sm:inline-block text-slate-600 hover:text-trip-blue whitespace-nowrap flex-shrink-0">
          고객센터
        </NuxtLink>

        <!-- 파트너 센터 -->
        <NuxtLink to="/partner/login" class="hidden lg:inline-flex items-center gap-1 text-slate-600 hover:text-trip-blue whitespace-nowrap flex-shrink-0 font-bold" title="공급사 및 파트너사 비즈니스 센터">
          <span>🏢</span>
          <span>파트너 센터</span>
        </NuxtLink>

        <!-- getfortrip 코인 및 등급 배지 -->
        <NuxtLink to="/rewards" class="flex items-center gap-1 px-2.5 py-1 bg-amber-50 border border-amber-200 rounded-full text-amber-700 font-bold whitespace-nowrap flex-shrink-0" title="getfortrip 멤버십 리워드">
          <span class="w-2 h-2 rounded-full bg-amber-500"></span>
          <span>{{ authStore.user.tier }}</span>
          <span class="text-amber-800 font-mono">{{ authStore.user.tripCoins.toLocaleString() }}G</span>
        </NuxtLink>

        <!-- 사용자 콘솔 / 내 예약 -->
        <NuxtLink to="/my" class="font-bold text-trip-navy hover:text-trip-blue whitespace-nowrap flex-shrink-0 flex items-center gap-1">
          <span>마이 콘솔</span>
        </NuxtLink>

        <!-- 프로필 (사용자 콘솔 링크) -->
        <NuxtLink to="/my" class="flex items-center gap-2 pl-2 border-l border-slate-200 flex-shrink-0 whitespace-nowrap hover:opacity-80 transition group" title="사용자 콘솔 (마이페이지)">
          <img :src="authStore.user.avatarUrl" class="w-8 h-8 rounded-full border border-slate-200 object-cover flex-shrink-0 group-hover:border-trip-blue transition" />
          <span class="hidden md:inline font-bold text-trip-navy text-xs whitespace-nowrap group-hover:text-trip-blue transition">{{ authStore.user.fullName }}</span>
        </NuxtLink>
      </div>
    </div>
  </header>
</template>
