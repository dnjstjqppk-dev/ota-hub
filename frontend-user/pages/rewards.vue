<script setup lang="ts">
import { useAuthStore } from '~/stores/auth'

const authStore = useAuthStore()
</script>

<template>
  <div class="max-w-6xl mx-auto px-4 py-8 space-y-8">
    <!-- 회원 등급 히어로 카드 -->
    <div class="bg-gradient-to-r from-slate-900 via-trip-navy to-slate-800 rounded-3xl p-8 text-white space-y-6 shadow-2xl relative overflow-hidden">
      <div class="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div class="flex items-center gap-4">
          <img :src="authStore.user.avatarUrl" class="w-16 h-16 rounded-full border-2 border-amber-400 object-cover" />
          <div>
            <div class="flex items-center gap-2">
              <h1 class="text-2xl font-black">{{ authStore.user.fullName }} 님</h1>
              <span class="px-3 py-0.5 bg-amber-400 text-slate-950 font-black text-xs rounded-full">
                👑 {{ authStore.user.tier }} 등급
              </span>
            </div>
            <p class="text-xs text-slate-400 mt-1">getfortrip 최상위 VIP 멤버십 혜택 적용 중</p>
          </div>
        </div>

        <div class="bg-white/10 backdrop-blur-md px-6 py-4 rounded-2xl border border-white/20 text-right">
          <div class="text-xs text-amber-300 font-bold">보유 getfortrip Coins</div>
          <div class="text-3xl font-black text-amber-400 font-mono">
            {{ authStore.user.tripCoins.toLocaleString() }} <span class="text-base">G</span>
          </div>
          <div class="text-[11px] text-slate-300 mt-0.5">₩{{ (authStore.user.tripCoins * 10).toLocaleString() }}원 상당 결제 할인 가능</div>
        </div>
      </div>

      <!-- 등급 달성 프로그레스 바 -->
      <div class="space-y-2 pt-4 border-t border-slate-700">
        <div class="flex justify-between text-xs font-semibold text-slate-300">
          <span>Silver</span>
          <span>Gold</span>
          <span>Platinum</span>
          <span class="text-amber-400 font-bold">Diamond (현재)</span>
          <span>Diamond+</span>
        </div>
        <div class="w-full h-3 bg-slate-800 rounded-full overflow-hidden border border-slate-700">
          <div class="h-full bg-gradient-to-r from-blue-500 via-amber-400 to-amber-500 w-4/5 rounded-full"></div>
        </div>
        <div class="text-right text-[11px] text-slate-400">다음 Diamond+ 등급까지 예약 2건 남음</div>
      </div>
    </div>

    <!-- 멤버십 혜택 안내 -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div class="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-2">
        <div class="text-2xl">🏨</div>
        <h3 class="font-bold text-slate-900 text-base">호텔 최대 20% 추가 VIP 특가</h3>
        <p class="text-xs text-slate-500 leading-relaxed">전 세계 10만 개 이상 호텔에서 전용 회원가 할인이 자동 적용됩니다.</p>
      </div>

      <div class="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-2">
        <div class="text-2xl">☕</div>
        <h3 class="font-bold text-slate-900 text-base">공항 VIP 라운지 연 2회 무료</h3>
        <p class="text-xs text-slate-500 leading-relaxed">다이아몬드 회원은 전 세계 주요 국제공항 라운지 무료 이용 혜택이 제공됩니다.</p>
      </div>

      <div class="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-2">
        <div class="text-2xl">💰</div>
        <h3 class="font-bold text-slate-900 text-base">getfortrip Coins 적립률 3배 보너스</h3>
        <p class="text-xs text-slate-500 leading-relaxed">숙박 및 탑승 완료 시 일반 회원 대비 3배 많은 getfortrip 코인이 확정 적립됩니다.</p>
      </div>
    </div>
  </div>
</template>

