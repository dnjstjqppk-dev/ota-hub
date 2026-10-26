<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useCurrencyStore } from '~/stores/currency'
import { useAuthStore } from '~/stores/auth'
import { useLocaleStore, type SupportedLocale } from '~/stores/locale'
import { BRAND } from '~/config/brand'

const route = useRoute()
const currencyStore = useCurrencyStore()
const authStore = useAuthStore()
const localeStore = useLocaleStore()

const showCurrencyDropdown = ref(false)
const showLocaleDropdown = ref(false)
const isMobileDrawerOpen = ref(false)

onMounted(() => {
  currencyStore.fetchRates()
  localeStore.initLocale()
})

const categories = [
  { to: '/hotels', label: '호텔', icon: '🏨' },
  { to: '/flights', label: '항공권', icon: '✈️' },
  { to: '/trains', label: '기차표', icon: '🚅' },
  { to: '/cars', label: '렌터카', icon: '🚗' },
  { to: '/transfers', label: '공항픽업', icon: '🚐' },
  { to: '/things-to-do', label: '투어·티켓', icon: '🎡' },
  { to: '/packages', label: '항공+호텔', icon: '🌴', badge: '특가' },
  { to: '/esim', label: '해외 eSIM', icon: '📱' },
  { to: '/insurance', label: '여행자보험', icon: '🛡️' },
  { to: '/trip-best', label: 'getfortrip Best', icon: '🏆' },
  { to: '/moments', label: '여행 모먼트', icon: '📸' }
]

const closeDrawer = () => {
  isMobileDrawerOpen.value = false
}
</script>

<template>
  <header class="bg-white border-b border-trip-border sticky top-0 z-40 shadow-sm">
    <div class="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between gap-3">
      <!-- 좌측: 모바일 햄버거 메뉴 + 브랜드 로고 -->
      <div class="flex items-center gap-3 lg:gap-8 flex-shrink-0">
        <!-- 모바일 햄버거 버튼 -->
        <button
          @click="isMobileDrawerOpen = true"
          class="md:hidden p-2 -ml-2 rounded-xl text-slate-700 hover:bg-slate-100 transition flex items-center justify-center focus:outline-none"
          aria-label="전체 메뉴 열기"
        >
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        <NuxtLink to="/" class="flex items-center gap-2 group flex-shrink-0" :title="BRAND.name">
          <img src="/logo.svg" alt="getfortrip" class="h-8 lg:h-9 w-auto object-contain flex-shrink-0" />
        </NuxtLink>

        <!-- 데스크톱 GNB 카테고리 네비게이션 -->
        <nav class="hidden md:flex items-center gap-2 lg:gap-4 text-xs font-bold text-trip-navy whitespace-nowrap overflow-x-auto py-1">
          <NuxtLink to="/hotels" class="hover:text-trip-blue transition whitespace-nowrap flex-shrink-0">호텔</NuxtLink>
          <NuxtLink to="/flights" class="hover:text-trip-blue transition whitespace-nowrap flex-shrink-0">항공권</NuxtLink>
          <NuxtLink to="/trains" class="hover:text-trip-blue transition whitespace-nowrap flex-shrink-0">기차표</NuxtLink>
          <NuxtLink to="/cars" class="hover:text-trip-blue transition whitespace-nowrap flex-shrink-0">렌터카</NuxtLink>
          <NuxtLink to="/transfers" class="hover:text-trip-blue transition whitespace-nowrap flex-shrink-0">공항픽업</NuxtLink>
          <NuxtLink to="/things-to-do" class="hover:text-trip-blue transition whitespace-nowrap flex-shrink-0">투어·티켓</NuxtLink>
          <NuxtLink to="/packages" class="hover:text-trip-blue transition flex items-center gap-1 whitespace-nowrap flex-shrink-0">
            <span>항공+호텔</span>
            <span class="text-[9px] bg-trip-orange text-white px-1.5 py-0.2 rounded-full font-black">특가</span>
          </NuxtLink>
          <NuxtLink to="/esim" class="hover:text-trip-blue transition whitespace-nowrap flex-shrink-0">eSIM</NuxtLink>
          <NuxtLink to="/insurance" class="hover:text-trip-blue transition whitespace-nowrap flex-shrink-0">여행자보험</NuxtLink>
          <NuxtLink to="/trip-best" class="hover:text-trip-blue transition text-amber-600 font-extrabold flex items-center gap-1 whitespace-nowrap flex-shrink-0">
            <span>🏆 Best</span>
          </NuxtLink>
          <NuxtLink to="/moments" class="hover:text-trip-blue transition whitespace-nowrap flex-shrink-0">모먼트</NuxtLink>
        </nav>
      </div>

      <!-- 우측 다통화 / 마이 / 회원 상태 -->
      <div class="flex items-center gap-2 lg:gap-3 text-xs font-semibold flex-shrink-0 whitespace-nowrap">
        <!-- 다통화 선택기 -->
        <div class="relative flex-shrink-0">
          <button
            @click="showCurrencyDropdown = !showCurrencyDropdown"
            class="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:border-trip-blue text-trip-navy font-bold transition whitespace-nowrap text-xs"
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
              <span class="text-slate-400 font-mono">{{ currencyStore.rates[curr] ? `₩${currencyStore.rates[curr]}` : '' }}</span>
            </button>
          </div>
        </div>

        <!-- 언어 선택기 -->
        <div class="relative flex-shrink-0">
          <button
            @click="showLocaleDropdown = !showLocaleDropdown"
            class="flex items-center gap-1 px-2 py-1.5 rounded-lg border border-slate-200 hover:border-trip-blue text-trip-navy font-bold transition whitespace-nowrap text-xs"
          >
            <span>🌐</span>
            <span>{{ localeStore.activeLocale.toUpperCase() }}</span>
          </button>
          <div
            v-if="showLocaleDropdown"
            class="absolute right-0 mt-1 w-28 bg-white border border-trip-border rounded-xl shadow-xl p-1 z-50 space-y-0.5"
          >
            <button
              v-for="loc in [
                { id: 'ko-kr', label: '한국어 (KO)' },
                { id: 'en-us', label: 'English (EN)' },
                { id: 'ja-jp', label: '日本語 (JA)' },
                { id: 'zh-cn', label: '中文 (ZH)' }
              ]"
              :key="loc.id"
              @click="localeStore.setLocale(loc.id as any); showLocaleDropdown = false"
              :class="[
                'w-full text-left px-2.5 py-1.5 rounded-lg font-bold text-xs whitespace-nowrap',
                localeStore.activeLocale === loc.id ? 'bg-blue-50 text-trip-blue' : 'hover:bg-slate-50 text-slate-700'
              ]"
            >
              {{ loc.label }}
            </button>
          </div>
        </div>

        <!-- 위시리스트 (데스크톱) -->
        <NuxtLink to="/my/wishlist" class="hidden md:inline-flex items-center gap-1 font-bold text-trip-navy hover:text-trip-blue whitespace-nowrap flex-shrink-0" title="위시리스트 & 최저가 알림">
          <span>❤️</span>
          <span>위시리스트</span>
        </NuxtLink>

        <!-- 특가 프로모션 (데스크톱) -->
        <NuxtLink to="/deals" class="hidden sm:inline-block text-trip-orange font-bold hover:underline whitespace-nowrap flex-shrink-0">
          🎁 프로모션
        </NuxtLink>

        <!-- B2B 파트너 센터 (데스크톱) -->
        <NuxtLink to="/partner/login" class="hidden lg:inline-flex items-center gap-1 text-slate-600 hover:text-trip-blue whitespace-nowrap flex-shrink-0 font-bold" title="공급사 및 파트너사 비즈니스 센터">
          <span>🏢</span>
          <span>파트너 센터</span>
        </NuxtLink>

        <!-- getfortrip 코인 및 등급 배지 (데스크톱) -->
        <NuxtLink v-if="authStore.isLoggedIn && authStore.user" to="/rewards" class="hidden sm:flex items-center gap-1 px-2.5 py-1 bg-amber-50 border border-amber-200 rounded-full text-amber-700 font-bold whitespace-nowrap flex-shrink-0" title="getfortrip 멤버십 리워드">
          <span class="w-2 h-2 rounded-full bg-amber-500"></span>
          <span>{{ authStore.user.tier }}</span>
          <span class="text-amber-800 font-mono">{{ authStore.user.tripCoins.toLocaleString() }}G</span>
        </NuxtLink>

        <!-- 내 예약 링크 (데스크톱) -->
        <NuxtLink to="/my/bookings" class="hidden md:inline-block font-bold text-trip-navy hover:text-trip-blue whitespace-nowrap flex-shrink-0">
          내 예약
        </NuxtLink>

        <!-- 사용자 프로필 링크 -->
        <NuxtLink v-if="authStore.isLoggedIn && authStore.user" to="/my" class="flex items-center gap-1.5 pl-1.5 sm:pl-2 sm:border-l sm:border-slate-200 flex-shrink-0 whitespace-nowrap hover:opacity-80 transition group" title="사용자 콘솔 (마이페이지)">
          <img :src="authStore.user.avatarUrl" class="w-8 h-8 rounded-full border border-slate-200 object-cover flex-shrink-0 group-hover:border-trip-blue transition" />
          <span class="hidden md:inline font-bold text-trip-navy text-xs whitespace-nowrap group-hover:text-trip-blue transition">{{ authStore.user.fullName }}</span>
        </NuxtLink>
        <NuxtLink v-else to="/my" class="flex items-center gap-1.5 pl-1.5 sm:pl-2 sm:border-l sm:border-slate-200 flex-shrink-0 whitespace-nowrap hover:opacity-80 transition group text-xs font-bold text-slate-700 hover:text-trip-blue" title="로그인 및 마이페이지">
          <span>👤 로그인</span>
        </NuxtLink>
      </div>
    </div>

    <!-- 모바일 사이드 드로어 네비게이션 (모바일 뷰포트 대응) -->
    <div
      v-if="isMobileDrawerOpen"
      class="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm transition-opacity md:hidden"
      @click="closeDrawer"
    >
      <div
        class="fixed top-0 bottom-0 left-0 w-[82vw] max-w-xs bg-white shadow-2xl flex flex-col justify-between overflow-y-auto"
        @click.stop
      >
        <!-- 드로어 헤더: 사용자 프로필 카드 -->
        <div class="p-5 bg-gradient-to-r from-slate-900 to-blue-950 text-white space-y-3">
          <div class="flex items-center justify-between">
            <img src="/logo-white.svg" alt="getfortrip" class="h-6 w-auto" />
            <button @click="closeDrawer" class="text-slate-300 hover:text-white p-1 text-lg font-bold">✕</button>
          </div>

          <NuxtLink v-if="authStore.isLoggedIn && authStore.user" to="/my" @click="closeDrawer" class="flex items-center gap-3 pt-2">
            <img :src="authStore.user.avatarUrl" class="w-12 h-12 rounded-full border-2 border-amber-400 object-cover" />
            <div class="space-y-0.5">
              <div class="font-black text-sm flex items-center gap-1.5">
                <span>{{ authStore.user.fullName }} 님</span>
                <span class="px-1.5 py-0.2 rounded bg-amber-400 text-slate-950 text-[9px] font-black">
                  {{ authStore.user.tier }}
                </span>
              </div>
              <div class="text-[11px] text-amber-300 font-mono">
                보유 코인: {{ authStore.user.tripCoins.toLocaleString() }}G
              </div>
            </div>
          </NuxtLink>
          <div v-else class="pt-2 flex items-center justify-between">
            <div class="text-xs text-slate-300">로그인하고 회원 혜택을 확인하세요</div>
            <NuxtLink to="/my" @click="closeDrawer" class="px-3 py-1.5 bg-trip-blue text-white text-xs font-bold rounded-xl hover:bg-blue-600 transition">
              로그인
            </NuxtLink>
          </div>
        </div>

        <!-- 전체 카테고리 링크 목록 -->
        <div class="p-4 space-y-1 flex-1">
          <p class="text-[10px] font-bold text-slate-400 px-3 uppercase mb-2">여행 상품 카테고리</p>
          <NuxtLink
            v-for="cat in categories"
            :key="cat.to"
            :to="cat.to"
            @click="closeDrawer"
            class="flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-slate-50 text-slate-800 font-bold text-xs transition"
          >
            <div class="flex items-center gap-3">
              <span class="text-base">{{ cat.icon }}</span>
              <span>{{ cat.label }}</span>
            </div>
            <span v-if="cat.badge" class="px-1.5 py-0.2 bg-trip-orange text-white text-[9px] font-black rounded-full">
              {{ cat.badge }}
            </span>
          </NuxtLink>

          <div class="pt-3 border-t border-slate-100 my-2"></div>
          <p class="text-[10px] font-bold text-slate-400 px-3 uppercase mb-2">고객 서비스 & 제휴</p>

          <NuxtLink to="/my/bookings" @click="closeDrawer" class="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-slate-50 text-slate-700 text-xs font-bold">
            <span>📄</span>
            <span>내 예약 관리</span>
          </NuxtLink>
          <NuxtLink to="/my/wishlist" @click="closeDrawer" class="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-slate-50 text-slate-700 text-xs font-bold">
            <span>❤️</span>
            <span>위시리스트 & 최저가 알림</span>
          </NuxtLink>
          <NuxtLink to="/deals" @click="closeDrawer" class="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-slate-50 text-slate-700 text-xs font-bold">
            <span>🎁</span>
            <span>타임특가 프로모션</span>
          </NuxtLink>
          <NuxtLink to="/partner/login" @click="closeDrawer" class="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-slate-50 text-blue-600 text-xs font-bold">
            <span>🏢</span>
            <span>파트너 센터 로그인 (B2B)</span>
          </NuxtLink>
          <NuxtLink to="/help" @click="closeDrawer" class="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-slate-50 text-slate-700 text-xs font-bold">
            <span>🎧</span>
            <span>24/7 고객센터</span>
          </NuxtLink>
          <NuxtLink to="/faq" @click="closeDrawer" class="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-slate-50 text-slate-700 text-xs font-bold">
            <span>❓</span>
            <span>자주 묻는 질문 (FAQ)</span>
          </NuxtLink>
        </div>

        <!-- 드로어 푸터: 통화 및 고객센터 안내 -->
        <div class="p-4 bg-slate-50 border-t border-slate-100 text-[11px] text-slate-500 space-y-2">
          <div class="flex items-center justify-between">
            <span class="font-bold">통화 변경</span>
            <div class="flex gap-1">
              <button
                v-for="curr in ['KRW', 'USD', 'JPY']"
                :key="curr"
                @click="currencyStore.setCurrency(curr)"
                :class="[
                  'px-2 py-1 rounded text-[10px] font-bold',
                  currencyStore.activeCurrency === curr ? 'bg-slate-900 text-white' : 'bg-white border text-slate-600'
                ]"
              >
                {{ curr }}
              </button>
            </div>
          </div>
          <div class="text-[10px] text-slate-400 text-center pt-2">
            고객센터 24시간 연중무휴 지원: 1588-0000
          </div>
        </div>
      </div>
    </div>
  </header>
</template>
