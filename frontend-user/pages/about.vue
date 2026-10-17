<script setup lang="ts">
import { BRAND } from '~/config/brand'
</script>

<template>
  <div class="max-w-5xl mx-auto px-4 py-12 space-y-12">
    <!-- 상단 히어로 -->
    <div class="text-center space-y-4">
      <span class="px-3.5 py-1 bg-blue-50 text-trip-blue rounded-full text-xs font-black uppercase tracking-wider">
        About {{ BRAND.name }}
      </span>
      <h1 class="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">
        전 세계를 연결하는 가장 신뢰할 수 있는 스마트 여행 파트너
      </h1>
      <p class="text-sm sm:text-base text-slate-600 max-w-2xl mx-auto leading-relaxed">
        {{ BRAND.name }}은 호텔, 항공권, 기차표, 렌터카, 공항픽업, 투어·티켓까지 모든 여행 상품을 원스톱으로 직접 예약하고 결제할 수 있는 차세대 글로벌 OTA 플랫폼입니다.
      </p>
    </div>

    <!-- 핵심 가치 3대 기둥 -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div class="bg-white p-6 rounded-3xl border border-slate-200/90 shadow-sm space-y-3">
        <div class="w-12 h-12 rounded-2xl bg-blue-50 text-trip-blue flex items-center justify-center text-2xl font-black">
          💎
        </div>
        <h3 class="text-lg font-black text-slate-900">안심 특가 & 투명한 요금</h3>
        <p class="text-xs text-slate-600 leading-relaxed">
          숨겨진 추가 비용 없이 결제 단계에서 최종 금액을 명확하게 제시하며, 글로벌 공급사 직계약을 통한 실시간 특가를 제공합니다.
        </p>
      </div>

      <div class="bg-white p-6 rounded-3xl border border-slate-200/90 shadow-sm space-y-3">
        <div class="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-2xl font-black">
          🛡️
        </div>
        <h3 class="text-lg font-black text-slate-900">100% 확정 보장 & 안심 케어</h3>
        <p class="text-xs text-slate-600 leading-relaxed">
          모든 예약은 공급사 시스템과 실시간 연동되어 PNR 확정 번호와 모바일 전자 바우처를 즉시 발급하며 현장 입실을 보장합니다.
        </p>
      </div>

      <div class="bg-white p-6 rounded-3xl border border-slate-200/90 shadow-sm space-y-3">
        <div class="w-12 h-12 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center text-2xl font-black">
          🎧
        </div>
        <h3 class="text-lg font-black text-slate-900">24/7 글로벌 고객센터</h3>
        <p class="text-xs text-slate-600 leading-relaxed">
          해외 현지에서도 시차 걱정 없이 연중무휴 한국어 전문 상담원과 실시간 채팅 및 유선 지원을 통해 예약 변경 및 취소를 지원합니다.
        </p>
      </div>
    </div>

    <!-- 플랫폼 규모 통계 -->
    <div class="bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white rounded-3xl p-8 sm:p-10 shadow-xl border border-slate-800">
      <div class="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
        <div>
          <div class="text-3xl sm:text-4xl font-black text-blue-400 font-mono">140만+</div>
          <div class="text-xs text-slate-300 mt-1 font-bold">전 세계 호텔 & 리조트</div>
        </div>
        <div>
          <div class="text-3xl sm:text-4xl font-black text-emerald-400 font-mono">500+</div>
          <div class="text-xs text-slate-300 mt-1 font-bold">글로벌 제휴 항공사</div>
        </div>
        <div>
          <div class="text-3xl sm:text-4xl font-black text-amber-400 font-mono">200개국</div>
          <div class="text-xs text-slate-300 mt-1 font-bold">렌터카 & 픽업 네트워크</div>
        </div>
        <div>
          <div class="text-3xl sm:text-4xl font-black text-purple-400 font-mono">99.8%</div>
          <div class="text-xs text-slate-300 mt-1 font-bold">바우처 정상 발권률</div>
        </div>
      </div>
    </div>
  </div>
</template>

