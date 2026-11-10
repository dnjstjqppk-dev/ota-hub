<script setup lang="ts">
import { BRAND } from '~/config/brand'
</script>

<template>
  <div class="max-w-4xl mx-auto px-4 py-12 space-y-10">
    <div class="text-center space-y-3">
      <span class="px-3.5 py-1 bg-blue-50 text-trip-blue rounded-full text-xs font-black uppercase tracking-wider">
        Safe Travel Guide
      </span>
      <h1 class="text-3xl sm:text-4xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
        안전한 여행을 위한 가이드 & 비상 지원
      </h1>
      <p class="text-sm text-slate-500 dark:text-slate-400 max-w-xl mx-auto">
        출국 전 체크리스트부터 해외 현지 비상 상황 대처까지 {{ BRAND.name }}이 항상 함께합니다.
      </p>
    </div>

    <div class="space-y-6">
      <div class="bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-200 dark:border-slate-700/90 shadow-sm space-y-4">
        <h2 class="text-base font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <span>📋</span>
          <span>출국 전 필수 점검 4단계</span>
        </h2>
        <ul class="space-y-3 text-xs text-slate-600 dark:text-slate-300 leading-relaxed list-disc list-inside">
          <li><strong>여권 유효기간 확인:</strong> 대부분의 국가는 입국일 기준 6개월 이상의 잔여 유효기간을 요구합니다.</li>
          <li><strong>비자 및 전자입국신고서(ETA):</strong> 미국(ESTA), 일본(Visit Japan Web), 유럽(ETIAS) 등 목적지 사전 신고 여부를 확인하세요.</li>
          <li><strong>해외여행자 보험 가입:</strong> 해외 현지 갑작스러운 상해나 질병, 수하물 분실에 대비해 필수 보험에 가입하세요.</li>
          <li><strong>모바일 전자 바우처 오프라인 저장:</strong> 인터넷이 불안정한 현지에 대비하여 getfortrip 앱에서 바우처를 미리 캡처하거나 PDF로 저장해 두세요.</li>
        </ul>
      </div>

      <div class="bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-200 dark:border-slate-700/90 shadow-sm space-y-4">
        <h2 class="text-base font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <span>🚨</span>
          <span>해외 현지 긴급 상황 지원</span>
        </h2>
        <p class="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
          예약된 호텔 입실에 문제가 발생하거나 항공편 결항/지연 시 도움 센터에 문의해 주세요. 접수된 순서대로 확인하고 예약 내역에서 답변을 안내해 드립니다.
        </p>
        <div class="pt-2 flex flex-wrap gap-3">
          <NuxtLink to="/help" class="px-4 py-2 bg-trip-blue text-white rounded-xl text-xs font-bold shadow-sm">
            도움 센터 문의하기 →
          </NuxtLink>
        </div>
      </div>
    </div>
  </div>
</template>

