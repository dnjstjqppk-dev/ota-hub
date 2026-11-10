<script setup lang="ts">
import { BRAND } from '~/config/brand'
</script>

<template>
  <div class="max-w-4xl mx-auto px-4 py-12 space-y-10">
    <div class="text-center space-y-3">
      <span class="px-3.5 py-1 bg-emerald-50 text-emerald-600 rounded-full text-xs font-black uppercase tracking-wider">
        🌱 Sustainable Travel
      </span>
      <h1 class="text-3xl sm:text-4xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
        지속 가능한 미래를 위한 {{ BRAND.name }}의 약속
      </h1>
      <p class="text-sm text-slate-500 dark:text-slate-400 max-w-xl mx-auto">
        지금 getfortrip에서 실제로 하고 있는 것들만 적었습니다. 인증·발권 제휴가 생기면 이 페이지에 근거와 함께 추가합니다.
      </p>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div class="bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-200 dark:border-slate-700/90 shadow-sm space-y-3">
        <div class="text-3xl">📄</div>
        <h3 class="text-base font-black text-slate-900 dark:text-slate-100">종이 없는 전자 바우처</h3>
        <p class="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
          공급사 확정 후 예약 코드 형태의 전자 바우처를 발급합니다. 종이 인쇄물 없이 마이페이지에서 바로 확인할 수 있습니다.
        </p>
      </div>

      <div class="bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-200 dark:border-slate-700/90 shadow-sm space-y-3">
        <div class="text-3xl">🤝</div>
        <h3 class="text-base font-black text-slate-900 dark:text-slate-100">현지 로컬 커뮤니티 상생</h3>
        <p class="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
          소규모 로컬 투어 가이드와 소상공인 렌터카 업체가 직접 입점해 상품을 등록·판매할 수 있습니다. 입점 심사와 정산은 플랫폼이 투명하게 공개합니다.
        </p>
      </div>
    </div>
  </div>
</template>

