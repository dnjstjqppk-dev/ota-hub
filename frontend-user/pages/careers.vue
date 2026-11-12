<script setup lang="ts">
// #91: no open roles and no ATS integration exist, so the page honestly says
// so instead of listing fabricated postings with a mailto apply button.
import { BRAND } from '~/config/brand'
</script>

<template>
  <div class="max-w-4xl mx-auto px-4 py-12 space-y-10">
    <div class="text-center space-y-3">
      <span class="px-3.5 py-1 bg-blue-50 text-trip-blue rounded-full text-xs font-black uppercase tracking-wider">
        Careers at {{ BRAND.name }}
      </span>
      <h1 class="text-3xl sm:text-4xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
        현재 진행 중인 채용이 없어요
      </h1>
      <p class="text-sm text-slate-500 dark:text-slate-400 max-w-xl mx-auto">
        새로운 포지션이 열리면 이 페이지에서 안내해 드릴게요. 채용 관련 문의는 1:1 문의를 이용해 주세요.
      </p>
    </div>

    <div class="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700/90 shadow-sm p-8 text-center">
      <p class="text-sm font-semibold text-slate-700 dark:text-slate-200">열린 포지션이 없습니다</p>
      <NuxtLink to="/help" class="mt-4 inline-block px-4 py-2.5 bg-trip-blue hover:bg-blue-600 text-white rounded-xl text-xs font-black shadow-sm transition">
        1:1 문의하기
      </NuxtLink>
    </div>
  </div>
</template>

