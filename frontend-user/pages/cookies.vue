<script setup lang="ts">
import { BRAND } from '~/config/brand'
</script>

<template>
  <div class="max-w-4xl mx-auto px-4 py-12 space-y-8">
    <div class="space-y-2 border-b border-slate-200 pb-6">
      <span class="text-xs font-bold text-trip-blue">Cookie Policy</span>
      <h1 class="text-3xl font-black text-slate-900 tracking-tight">{{ BRAND.name }} 쿠키 정책</h1>
      <p class="text-xs text-slate-400">최종 개정일: 2026년 10월 1일</p>
    </div>

    <div class="prose prose-slate max-w-none text-xs leading-relaxed text-slate-700 space-y-6">
      <section class="space-y-2">
        <h2 class="text-sm font-black text-slate-900">1. 쿠키의 사용 목적</h2>
        <p>
          {{ BRAND.name }}은 이용자에게 보다 빠르고 최적화된 웹사이트 경험을 제공하기 위해 쿠키(Cookie) 및 유사 기술을 사용합니다. 쿠키는 이용자가 웹사이트를 방문할 때 웹 브라우저에 저장되는 작은 텍스트 파일입니다.
        </p>
      </section>

      <section class="space-y-2">
        <h2 class="text-sm font-black text-slate-900">2. 사용하는 쿠키의 종류</h2>
        <ul class="list-disc list-inside space-y-2">
          <li><strong>필수 쿠키:</strong> 로그인 세션 유지, 보안 토큰 검증 및 장바구니/예약 프로세스 유지에 반드시 필요한 쿠키입니다.</li>
          <li><strong>기능성 쿠키:</strong> 이용자가 선택한 통화(KRW, USD 등), 언어 설정 및 최근 검색 목적지 기록을 기억하여 편의를 제공합니다.</li>
          <li><strong>성능 및 분석 쿠키:</strong> 웹사이트 방문자 수, 오류 발생 지점 및 페이지 로딩 성능을 측정하여 서비스 품질을 개선합니다.</li>
        </ul>
      </section>

      <section class="space-y-2">
        <h2 class="text-sm font-black text-slate-900">3. 쿠키 설정 및 관리 방법</h2>
        <p>
          이용자는 웹 브라우저의 옵션 설정을 통해 모든 쿠키를 허용하거나, 쿠키가 저장될 때마다 확인을 거치거나, 모든 쿠키의 저장을 거부할 수 있습니다. 단, 필수 쿠키를 비활성화할 경우 로그인이 필요한 예약 기능 이용에 제약이 있을 수 있습니다.
        </p>
      </section>
    </div>
  </div>
</template>

