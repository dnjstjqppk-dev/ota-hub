<script setup lang="ts">
import { BRAND } from '~/config/brand'
</script>

<template>
  <footer class="bg-trip-navy text-slate-300 pt-16 pb-12 mt-20 border-t border-slate-800">
    <div class="max-w-7xl mx-auto px-4 space-y-12">
      <!-- 브랜드 로고 및 4열 링크 그리드 -->
      <div class="flex flex-col md:flex-row gap-12 justify-between">
        <div class="space-y-4 max-w-xs">
          <NuxtLink to="/" class="inline-block" :title="BRAND.name">
            <img src="/logo-white.svg" alt="getfortrip" class="h-9 w-auto" />
          </NuxtLink>
          <p class="text-xs text-slate-400 leading-relaxed">
            {{ BRAND.tagline }}.<br/>
            전 세계 언제 어디서나 가장 신뢰할 수 있는 스마트 여행 파트너.
          </p>
          <div class="text-[11px] text-slate-500 font-mono">
            예정 도메인: {{ BRAND.plannedDomain }}
          </div>
        </div>

        <div class="grid grid-cols-2 md:grid-cols-4 gap-8 text-xs flex-1">
          <div class="space-y-3">
            <h4 class="text-white font-bold text-sm">getfortrip 소개</h4>
            <ul class="space-y-2 text-slate-400">
              <li><NuxtLink to="/about" class="hover:text-white">회사 소개</NuxtLink></li>
              <li><NuxtLink to="/careers" class="hover:text-white">채용 정보</NuxtLink></li>
              <li><NuxtLink to="/news" class="hover:text-white">뉴스룸</NuxtLink></li>
              <li><NuxtLink to="/sustainability" class="hover:text-white">지속 가능 여행</NuxtLink></li>
            </ul>
          </div>

          <div class="space-y-3">
            <h4 class="text-white font-bold text-sm">고객 지원</h4>
            <ul class="space-y-2 text-slate-400">
              <li><NuxtLink to="/help" class="hover:text-white">24/7 고객센터</NuxtLink></li>
              <li><NuxtLink to="/safety" class="hover:text-white">안전 여행 가이드</NuxtLink></li>
              <li><NuxtLink to="/refund-policy" class="hover:text-white">취소 및 환불 규정</NuxtLink></li>
              <li><NuxtLink to="/faq" class="hover:text-white">자주 묻는 질문(FAQ)</NuxtLink></li>
            </ul>
          </div>

          <div class="space-y-3">
            <h4 class="text-white font-bold text-sm">파트너십</h4>
            <ul class="space-y-2 text-slate-400">
              <li><NuxtLink to="/partner/login" class="hover:text-white font-bold text-blue-400">파트너 센터 로그인 (B2B)</NuxtLink></li>
              <li><NuxtLink to="/partner" class="hover:text-white">호텔·공급사 입점 관리</NuxtLink></li>
              <li><NuxtLink to="/partner/settings" class="hover:text-white">파트너 OpenAPI 연동</NuxtLink></li>
              <li><a href="mailto:partner@getfortrip.com" class="hover:text-white">제휴 및 공급 문의</a></li>
            </ul>
          </div>

          <div class="space-y-3">
            <h4 class="text-white font-bold text-sm">보안 및 결제 인증</h4>
            <p class="text-slate-400 leading-relaxed text-[11px]">
              {{ BRAND.name }}은 256비트 SSL/TLS 엔드투엔드 보안 암호화와 글로벌 전자상거래 표준 규격을 준수하여 고객님의 결제 정보를 안전하게 보호합니다.
            </p>
            <div class="flex flex-wrap gap-2 pt-2">
              <span class="px-2 py-1 bg-slate-800 rounded text-[10px] text-slate-300 font-bold">VISA</span>
              <span class="px-2 py-1 bg-slate-800 rounded text-[10px] text-slate-300 font-bold">Mastercard</span>
              <span class="px-2 py-1 bg-slate-800 rounded text-[10px] text-slate-300 font-bold">네이버페이</span>
              <span class="px-2 py-1 bg-slate-800 rounded text-[10px] text-slate-300 font-bold">카카오페이</span>
              <span class="px-2 py-1 bg-slate-800 rounded text-[10px] text-slate-300 font-bold">토스페이</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 하단 저작권 및 법적 고지 -->
      <div class="pt-8 border-t border-slate-800 flex flex-col md:flex-row items-center justify-between text-xs text-slate-500 gap-4">
        <div>
          {{ BRAND.copyright }}
        </div>
        <div class="flex items-center gap-6">
          <NuxtLink to="/privacy" class="hover:text-slate-300">개인정보 처리방침</NuxtLink>
          <NuxtLink to="/terms" class="hover:text-slate-300">이용약관</NuxtLink>
          <NuxtLink to="/cookies" class="hover:text-slate-300">쿠키 설정</NuxtLink>
        </div>
      </div>
    </div>
  </footer>
</template>
