<script setup lang="ts">
import { useAuthStore } from '~/stores/auth'

useHead({
  title: '내 멤버십',
  meta: [{ name: 'description', content: 'getfortrip 멤버십 등급과 보유 코인 확인' }]
})

const authStore = useAuthStore()
</script>

<template>
  <div class="max-w-6xl mx-auto px-4 py-8 space-y-8">
    <!-- 회원 등급 카드 (로그인 시, 실데이터) -->
    <div v-if="authStore.isLoggedIn && authStore.user" class="bg-gradient-to-r from-slate-900 via-trip-navy to-slate-800 rounded-3xl p-8 text-white space-y-6 shadow-2xl relative overflow-hidden">
      <div class="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div class="flex items-center gap-4">
          <img v-if="authStore.user.avatarUrl" :src="authStore.user.avatarUrl" alt="" class="w-16 h-16 rounded-full border-2 border-amber-400 object-cover" />
          <span v-else class="w-16 h-16 rounded-full bg-trip-blue text-white text-xl font-black flex items-center justify-center" aria-hidden="true">{{ (authStore.user.fullName || authStore.user.email || '?').trim().charAt(0).toUpperCase() }}</span>
          <div>
            <div class="flex items-center gap-2">
              <h1 class="text-2xl font-black">{{ authStore.user.fullName }} 님</h1>
              <span class="inline-flex items-center gap-1 px-3 py-0.5 bg-amber-400 text-slate-950 font-black text-xs rounded-full">
                <AppIcon name="star" :size="12" /> {{ authStore.user.tier || 'SILVER' }} 등급
              </span>
            </div>
            <p class="text-xs text-slate-400 mt-1">getfortrip 멤버십 회원입니다</p>
          </div>
        </div>

        <div class="bg-white/10 backdrop-blur-md px-6 py-4 rounded-2xl border border-white/20 text-right">
          <div class="text-xs text-amber-300 font-bold">보유 getfortrip Coins</div>
          <div class="text-3xl font-black text-amber-400 font-mono">
            {{ (authStore.user.tripCoins || 0).toLocaleString() }} <span class="text-base">G</span>
          </div>
          <div class="text-[11px] text-slate-300 mt-0.5">코인은 이벤트 및 고객지원을 통해 적립됩니다</div>
        </div>
      </div>
    </div>

    <!-- 비로그인 게스트용 멤버십 안내 카드 -->
    <div v-else class="bg-gradient-to-r from-slate-900 via-trip-navy to-slate-800 rounded-3xl p-8 sm:p-12 text-white space-y-6 shadow-2xl relative overflow-hidden text-center max-w-3xl mx-auto">
      <div class="w-16 h-16 rounded-full bg-amber-400/20 text-amber-400 flex items-center justify-center mx-auto border border-amber-400/40">
        <AppIcon name="star" :size="28" />
      </div>
      <div class="space-y-2">
        <h1 class="text-2xl sm:text-3xl font-black">getfortrip 멤버십</h1>
        <p class="text-xs sm:text-sm text-slate-300 max-w-md mx-auto">
          로그인하시면 쿠폰함, 찜 목록, 가격 알림과 예약 관리를 이용하실 수 있습니다.
        </p>
      </div>
      <div class="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
        <NuxtLink to="/login" class="px-6 py-3 bg-trip-blue hover:bg-blue-600 text-white font-black rounded-xl text-xs shadow-md transition w-full sm:w-auto">
          로그인 및 혜택 확인
        </NuxtLink>
      </div>
    </div>

    <!-- 실제 회원 기능 안내 -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
      <NuxtLink to="/my/coupons" class="block bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-2 hover:shadow-md transition">
        <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-soft text-primary"><AppIcon name="gift" :size="22" /></div>
        <h3 class="font-bold text-slate-900 text-base">쿠폰함</h3>
        <p class="text-xs text-slate-500 leading-relaxed">받을 수 있는 할인 쿠폰을 확인하고 결제할 때 사용하세요.</p>
      </NuxtLink>

      <NuxtLink to="/my/wishlist" class="block bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-2 hover:shadow-md transition">
        <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-warning-soft text-warning"><AppIcon name="heart" :size="22" /></div>
        <h3 class="font-bold text-slate-900 text-base">찜 목록과 가격 알림</h3>
        <p class="text-xs text-slate-500 leading-relaxed">관심 상품을 저장하고 가격 변동 알림을 받아보세요.</p>
      </NuxtLink>

      <NuxtLink to="/my/bookings" class="block bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-2 hover:shadow-md transition">
        <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-success-soft text-success"><AppIcon name="bookings" :size="22" /></div>
        <h3 class="font-bold text-slate-900 text-base">내 예약 관리</h3>
        <p class="text-xs text-slate-500 leading-relaxed">예약 내역 조회와 바우처 확인, 취소를 한곳에서 하세요.</p>
      </NuxtLink>
    </div>
  </div>
</template>
