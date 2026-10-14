<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useCurrencyStore } from '~/stores/currency'
import { useAuthStore } from '~/stores/auth'

const currencyStore = useCurrencyStore()
const authStore = useAuthStore()

const showCurrencyDropdown = ref(false)

onMounted(() => {
  currencyStore.fetchRates()
})
</script>

<template>
  <header class="bg-white border-b border-trip-border sticky top-0 z-50">
    <div class="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
      <!-- 좌측 로고 & 주요 도메인 네비 -->
      <div class="flex items-center gap-8">
        <NuxtLink to="/" class="flex items-center gap-2">
          <div class="w-8 h-8 bg-trip-blue rounded-lg flex items-center justify-center text-white font-black text-lg shadow-md shadow-blue-500/30">
            T
          </div>
          <span class="text-2xl font-black tracking-tight text-trip-navy">
            Trip<span class="text-trip-blue">.com</span>
          </span>
        </NuxtLink>

        <nav class="hidden md:flex items-center gap-6 text-sm font-bold text-trip-navy">
          <NuxtLink to="/hotels/list" class="hover:text-trip-blue transition">숙소</NuxtLink>
          <NuxtLink to="/flights/search" class="hover:text-trip-blue transition">항공권</NuxtLink>
          <NuxtLink to="/trains" class="hover:text-trip-blue transition">기차표</NuxtLink>
          <NuxtLink to="/cars" class="hover:text-trip-blue transition">렌터카</NuxtLink>
          <NuxtLink to="/things-to-do" class="hover:text-trip-blue transition">투어·티켓</NuxtLink>
          <NuxtLink to="/packages" class="hover:text-trip-blue transition flex items-center gap-1">
            <span>항공+호텔</span>
            <span class="text-[10px] bg-trip-orange text-white px-1.5 py-0.2 rounded-full">특가</span>
          </NuxtLink>
          <NuxtLink to="/trip-best" class="hover:text-trip-blue transition text-amber-600 font-extrabold">Trip.Best</NuxtLink>
          <NuxtLink to="/moments" class="hover:text-trip-blue transition">트립 모먼트</NuxtLink>
        </nav>
      </div>

      <!-- 우측 다통화/다국어/회원 배지 -->
      <div class="flex items-center gap-4 text-xs font-semibold">
        <!-- 다통화 선택기 -->
        <div class="relative">
          <button
            @click="showCurrencyDropdown = !showCurrencyDropdown"
            class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:border-trip-blue text-trip-navy font-bold transition"
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
                'w-full text-left px-3 py-2 rounded-lg font-bold flex items-center justify-between text-xs',
                currencyStore.activeCurrency === curr ? 'bg-blue-50 text-trip-blue' : 'hover:bg-slate-50 text-slate-700'
              ]"
            >
              <span>{{ curr }}</span>
              <span class="text-slate-400">{{ currencyStore.rates[curr] ? `₩${currencyStore.rates[curr]}` : '' }}</span>
            </button>
          </div>
        </div>

        <NuxtLink to="/deals" class="hidden sm:inline-block text-trip-orange font-bold hover:underline">
          🎁 프로모션
        </NuxtLink>

        <NuxtLink to="/help" class="hidden sm:inline-block text-slate-600 hover:text-trip-blue">
          고객센터
        </NuxtLink>

        <!-- 트립코인 및 등급 배지 -->
        <NuxtLink to="/rewards" class="flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 border border-amber-200 rounded-full text-amber-700 font-bold">
          <span class="w-2 h-2 rounded-full bg-amber-500"></span>
          <span>{{ authStore.user.tier }}</span>
          <span class="text-amber-800 font-mono">{{ authStore.user.tripCoins.toLocaleString() }}C</span>
        </NuxtLink>

        <!-- 내 예약 -->
        <NuxtLink to="/my/bookings" class="font-bold text-trip-navy hover:text-trip-blue">
          내 예약
        </NuxtLink>

        <!-- 프로필 -->
        <div class="flex items-center gap-2 pl-2 border-l border-slate-200">
          <img :src="authStore.user.avatarUrl" class="w-8 h-8 rounded-full border border-slate-200 object-cover" />
          <span class="hidden md:inline font-bold text-trip-navy text-xs">{{ authStore.user.fullName }}</span>
        </div>
      </div>
    </div>
  </header>
</template>

