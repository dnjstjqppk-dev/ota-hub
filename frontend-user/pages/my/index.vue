<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useAuthStore } from '~/stores/auth'
import { useCurrencyStore } from '~/stores/currency'
import { getUserBookings, type BookingRecord } from '~/data/initialBookings'

const authStore = useAuthStore()
const currencyStore = useCurrencyStore()

const activeTab = ref<'bookings' | 'coupons' | 'passengers' | 'payments'>('bookings')

const upcomingBookings = ref<BookingRecord[]>([])

onMounted(() => {
  upcomingBookings.value = getUserBookings()
})

const coupons = ref([
  {
    code: 'WELCOME-HOTEL-10',
    title: '전 세계 5성급 호텔 10% 즉시 할인 쿠폰',
    discount: '10% OFF',
    validUntil: '2026.11.30까지',
    condition: '최대 100,000원 할인 · 최소 주문 금액 200,000원'
  },
  {
    code: 'AIR-INTL-20K',
    title: '국제선 항공권 20,000원 즉시 할인권',
    discount: '₩20,000',
    validUntil: '2026.11.15까지',
    condition: '대한항공/아시아나/외항사 전 노선 적용 가능'
  },
  {
    code: 'RENT-SUPER-CDW',
    title: '국내/해외 렌터카 슈퍼자차(완전자차) 무료 업그레이드권',
    discount: '무료 업그레이드',
    validUntil: '2026.12.31까지',
    condition: '제주/일본/동남아 전 지역 렌터카 대상'
  },
  {
    code: 'VIP-TRANSFER-15',
    title: '공항 픽업 & 샌딩 VIP 리무진 15% 우대 쿠폰',
    discount: '15% OFF',
    validUntil: '2026.12.15까지',
    condition: '인천/간사이/나리타/수완나품 전 공항 적용'
  }
])

const savedPassengers = computed(() => {
  if (authStore.user?.email === 'vip@getfortrip.com') {
    return [
      {
        nameKo: '김여행',
        nameEn: 'KIM YEOHAENG',
        gender: 'MALE',
        birth: '1990-05-15',
        passportNumber: 'M88192049',
        passportExpiry: '2031-10-12',
        nationality: '대한민국 (KOR)',
        isPrimary: true
      },
      {
        nameKo: '이수진',
        nameEn: 'LEE SOOJIN',
        gender: 'FEMALE',
        birth: '1992-08-20',
        passportNumber: 'M44910293',
        passportExpiry: '2029-05-18',
        nationality: '대한민국 (KOR)',
        isPrimary: false
      }
    ]
  }
  return []
})

const savedCards = ref([
  {
    cardName: '현대카드 (VISA 플래티넘)',
    cardNumber: '•••• •••• •••• 8821',
    expiry: '08/29',
    isDefault: true,
    type: 'VISA'
  },
  {
    cardName: '카카오페이 원클릭 간편결제',
    cardNumber: 'kakao-pay-linked',
    expiry: '상시 연동',
    isDefault: false,
    type: 'KAKAOPAY'
  }
])
</script>

<template>
  <div class="max-w-7xl mx-auto px-4 py-8 space-y-8">
    <div v-if="authStore.isLoggedIn && authStore.user" class="space-y-8">
      <!-- 1. 상단 프로필 및 VIP 멤버십 배너 (사용자 콘솔 헤더) -->
      <div class="bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden border border-slate-800">
        <div class="absolute -right-10 -bottom-10 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl pointer-events-none"></div>

        <div class="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div class="flex items-center gap-5">
            <div class="relative">
              <img :src="authStore.user?.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200'" class="w-16 h-16 sm:w-20 sm:h-20 rounded-full object-cover border-2 border-amber-400 shadow-md" />
              <span class="absolute bottom-0 right-0 w-5 h-5 bg-amber-400 text-slate-900 rounded-full flex items-center justify-center text-xs font-black" title="VIP 다이아몬드">
                ★
              </span>
            </div>

            <div class="space-y-1">
              <div class="flex items-center gap-2">
                <h1 class="text-xl sm:text-2xl font-black">{{ authStore.user?.fullName }} 님</h1>
                <span class="px-2.5 py-0.5 rounded-full bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950 text-[11px] font-black uppercase tracking-wider shadow-sm">
                  💎 {{ authStore.user?.tier }} VIP
                </span>
              </div>
              <p class="text-xs text-slate-300 font-mono">{{ authStore.user?.email }}</p>
              <div class="text-[11px] text-slate-400 pt-1">
                getfortrip 회원 가입 2년차 · 누적 여행 14회 완료 · VIP 전용 고객센터 우선 지원
              </div>
            </div>
          </div>

          <div class="flex flex-wrap items-center gap-4 bg-slate-800/80 backdrop-blur-md p-4 rounded-2xl border border-slate-700/80">
            <div class="text-right">
              <div class="text-[11px] text-slate-400 font-bold">보유 getfortrip 코인</div>
              <div class="text-2xl font-black text-amber-400 font-mono">
                {{ (authStore.user?.tripCoins || 0).toLocaleString() }} <span class="text-xs font-bold text-slate-300">G</span>
              </div>
              <div class="text-[10px] text-slate-400">(₩{{ (authStore.user?.tripCoins || 0).toLocaleString() }} 상당 가치)</div>
            </div>
            <NuxtLink
              to="/rewards"
              class="px-3.5 py-2 bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs rounded-xl transition shadow"
            >
              코인 사용·교환
            </NuxtLink>
          </div>
        </div>
      </div>

    <!-- 2. 콘솔 서브 네비게이션 탭 -->
    <div class="flex items-center gap-2 border-b border-slate-200 pb-3 text-xs font-bold overflow-x-auto">
      <button
        @click="activeTab = 'bookings'"
        :class="[
          'px-4 py-2 rounded-xl transition whitespace-nowrap flex items-center gap-1.5',
          activeTab === 'bookings' ? 'bg-trip-blue text-white shadow-sm' : 'bg-white hover:bg-slate-100 text-slate-600 border border-slate-200'
        ]"
      >
        <span>📅</span>
        <span>전체 예약 관리 ({{ upcomingBookings.length }})</span>
      </button>

      <button
        @click="activeTab = 'coupons'"
        :class="[
          'px-4 py-2 rounded-xl transition whitespace-nowrap flex items-center gap-1.5',
          activeTab === 'coupons' ? 'bg-trip-blue text-white shadow-sm' : 'bg-white hover:bg-slate-100 text-slate-600 border border-slate-200'
        ]"
      >
        <span>🎁</span>
        <span>보유 쿠폰함 ({{ coupons.length }})</span>
      </button>

      <button
        @click="activeTab = 'passengers'"
        :class="[
          'px-4 py-2 rounded-xl transition whitespace-nowrap flex items-center gap-1.5',
          activeTab === 'passengers' ? 'bg-trip-blue text-white shadow-sm' : 'bg-white hover:bg-slate-100 text-slate-600 border border-slate-200'
        ]"
      >
        <span>👤</span>
        <span>자주 쓰는 여행자 정보 ({{ savedPassengers.length }})</span>
      </button>

      <button
        @click="activeTab = 'payments'"
        :class="[
          'px-4 py-2 rounded-xl transition whitespace-nowrap flex items-center gap-1.5',
          activeTab === 'payments' ? 'bg-trip-blue text-white shadow-sm' : 'bg-white hover:bg-slate-100 text-slate-600 border border-slate-200'
        ]"
      >
        <span>💳</span>
        <span>등록된 간편 결제 수단 ({{ savedCards.length }})</span>
      </button>

      <NuxtLink
        to="/partner"
        class="ml-auto px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white transition whitespace-nowrap flex items-center gap-1.5 border border-slate-700"
      >
        <span>🏢</span>
        <span>파트너 센터 바로가기 ↗</span>
      </NuxtLink>
    </div>

    <!-- 3-A. 탭: 7대 도메인 예약 내역 관리 (관리자 OMS와 1:1 매핑) -->
    <div v-if="activeTab === 'bookings'" class="space-y-4">
      <div class="flex items-center justify-between">
        <h2 class="text-base font-black text-slate-900">7대 전 도메인 실시간 예약 및 전자 바우처 목록</h2>
        <span class="text-xs text-slate-400">총 {{ upcomingBookings.length }}건의 예약이 안전하게 관리되고 있습니다.</span>
      </div>

      <div class="grid grid-cols-1 gap-4">
        <div
          v-for="b in upcomingBookings"
          :key="b.id"
          class="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-sm hover:shadow-md transition flex flex-col md:flex-row md:items-center justify-between gap-5"
        >
          <div class="space-y-2 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <span class="px-2.5 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[11px] font-black">
                {{ b.domainName }}
              </span>
              <span :class="['px-2.5 py-0.5 rounded-full text-[10px] font-black border', b.badgeClass]">
                {{ b.statusLabel }}
              </span>
              <span class="text-xs text-slate-400 font-mono font-bold">예약코드: {{ b.id }}</span>
              <span v-if="b.pnr" class="text-xs text-blue-600 font-mono font-bold">PNR: {{ b.pnr }}</span>
            </div>

            <h3 class="text-base font-black text-slate-900">{{ b.title }}</h3>
            <p class="text-xs text-slate-600 flex items-center gap-2">
              <span>🗓️ {{ b.schedule }}</span>
              <span class="text-slate-300">|</span>
              <span class="text-slate-500">{{ b.roomInfo }}</span>
            </p>
          </div>

          <div class="flex md:flex-col items-center md:items-end justify-between border-t md:border-t-0 pt-3 md:pt-0 border-slate-100 gap-3">
            <div class="text-right">
              <span class="text-[10px] text-slate-400 block">결제 완료 금액</span>
              <span class="text-lg font-black text-trip-blue font-mono">₩{{ b.amountKrw.toLocaleString() }}</span>
            </div>

            <div class="flex items-center gap-2">
              <NuxtLink
                :to="`/my/bookings/${b.id}`"
                class="px-3.5 py-2 rounded-xl bg-trip-blue hover:bg-blue-600 text-white text-xs font-bold shadow-sm transition whitespace-nowrap"
              >
                전자 바우처 보기 📄
              </NuxtLink>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 3-B. 탭: 보유 쿠폰함 -->
    <div v-else-if="activeTab === 'coupons'" class="space-y-4">
      <div class="flex items-center justify-between">
        <h2 class="text-base font-black text-slate-900">사용 가능한 VIP 할인 쿠폰</h2>
        <span class="text-xs text-slate-400">결제 단계에서 자동 적용 가능합니다.</span>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div
          v-for="c in coupons"
          :key="c.code"
          class="bg-white rounded-2xl p-5 border-2 border-dashed border-blue-200 shadow-sm flex items-start justify-between gap-4"
        >
          <div class="space-y-1">
            <div class="flex items-center gap-2">
              <span class="px-2 py-0.5 rounded bg-blue-50 text-blue-600 font-black text-xs font-mono">{{ c.code }}</span>
              <span class="text-[11px] text-slate-400">{{ c.validUntil }}</span>
            </div>
            <h3 class="text-sm font-black text-slate-900">{{ c.title }}</h3>
            <p class="text-xs text-slate-500">{{ c.condition }}</p>
          </div>
          <div class="text-right flex-shrink-0">
            <span class="text-lg font-black text-trip-orange font-mono">{{ c.discount }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 3-C. 탭: 자주 쓰는 여행자 정보 -->
    <div v-else-if="activeTab === 'passengers'" class="space-y-4">
      <div class="flex items-center justify-between">
        <h2 class="text-base font-black text-slate-900">저장된 탑승객 및 투숙객 명단</h2>
        <button class="px-3 py-1.5 bg-slate-900 text-white rounded-xl text-xs font-bold">+ 새 여행자 추가</button>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div
          v-for="p in savedPassengers"
          :key="p.passportNumber"
          class="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-3"
        >
          <div class="flex items-center justify-between border-b border-slate-100 pb-2">
            <div class="flex items-center gap-2">
              <span class="font-black text-sm text-slate-900">{{ p.nameKo }} ({{ p.nameEn }})</span>
              <span v-if="p.isPrimary" class="px-2 py-0.5 rounded bg-blue-50 text-blue-600 text-[10px] font-bold">대표</span>
            </div>
            <span class="text-xs text-slate-400">{{ p.nationality }}</span>
          </div>
          <div class="grid grid-cols-2 gap-2 text-xs text-slate-600 font-mono">
            <div><span class="text-slate-400">생년월일:</span> {{ p.birth }}</div>
            <div><span class="text-slate-400">성별:</span> {{ p.gender }}</div>
            <div><span class="text-slate-400">여권번호:</span> {{ p.passportNumber }}</div>
            <div><span class="text-slate-400">만료일:</span> {{ p.passportExpiry }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- 3-D. 탭: 등록된 결제 수단 -->
    <div v-else-if="activeTab === 'payments'" class="space-y-4">
      <div class="flex items-center justify-between">
        <h2 class="text-base font-black text-slate-900">원클릭 간편 결제 수단</h2>
        <button class="px-3 py-1.5 bg-slate-900 text-white rounded-xl text-xs font-bold">+ 새 카드 등록</button>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div
          v-for="card in savedCards"
          :key="card.cardNumber"
          class="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center justify-between"
        >
          <div class="flex items-center gap-4">
            <div class="w-12 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center font-black text-xs">
              {{ card.type }}
            </div>
            <div>
              <div class="font-black text-sm text-slate-900">{{ card.cardName }}</div>
              <div class="text-xs text-slate-400 font-mono">{{ card.cardNumber }} · 유효기간: {{ card.expiry }}</div>
            </div>
          </div>
          <span v-if="card.isDefault" class="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-600 text-[10px] font-black border border-emerald-200">
            기본 결제
          </span>
        </div>
      </div>
    </div>

    <!-- 4. 파트너사 입점 및 B2B 제휴 안내 배너 -->
    <div class="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white rounded-3xl p-6 sm:p-8 flex flex-col md:flex-row items-center justify-between gap-6 shadow-md border border-slate-800">
      <div class="space-y-1">
        <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/20 text-blue-400 text-xs font-bold border border-blue-400/20 mb-1">
          <span>🏢</span>
          <span>getfortrip 공식 파트너 네트워크</span>
        </div>
        <h3 class="text-lg font-black tracking-tight">호텔, 렌터카, 투어 공급사이신가요?</h3>
        <p class="text-xs text-slate-300">
          전 세계 200만 getfortrip 고객에게 상품을 판매하고 실시간 예약 승인 및 월 2회 자동 정산을 경험하세요.
        </p>
      </div>
      <div class="flex items-center gap-3">
        <NuxtLink
          to="/partner/login"
          class="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-black transition shadow-lg whitespace-nowrap"
        >
          파트너 센터 로그인
        </NuxtLink>
        <NuxtLink
          to="/partner"
          class="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold border border-slate-700 transition whitespace-nowrap"
        >
          파트너 대시보드 바로가기
        </NuxtLink>
      </div>
    </div>
  </div>

  <!-- 비로그인 상태 안내 (개인정보 보호 및 보안 격리) -->
  <div v-else class="max-w-xl mx-auto py-16 px-4 text-center">
    <div class="bg-white rounded-3xl border border-slate-200 p-8 sm:p-12 shadow-sm space-y-6">
      <div class="w-16 h-16 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center text-3xl mx-auto">
        🔒
      </div>
      <div class="space-y-2">
        <h2 class="text-xl sm:text-2xl font-black text-slate-900">로그인이 필요한 서비스입니다</h2>
        <p class="text-xs sm:text-sm text-slate-500 leading-relaxed">
          고객님의 개인정보 및 예약 내역을 안전하게 보호하기 위해 인증이 필요합니다.<br>
          getfortrip 계정으로 로그인하여 예약, 쿠폰, getfortrip 코인(G-Coins)을 관리하세요.
        </p>
      </div>
      <div class="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
        <button
          @click="authStore.loginAsDemo()"
          class="w-full sm:w-auto px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-md transition"
        >
          체험 계정으로 빠른 로그인 ⚡
        </button>
        <NuxtLink
          to="/login"
          class="w-full sm:w-auto px-6 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition"
        >
          이메일 로그인
        </NuxtLink>
      </div>
    </div>
  </div>
</div>
</template>

