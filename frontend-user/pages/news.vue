<script setup lang="ts">
import { BRAND } from '~/config/brand'

const articles: Array<{ id: number; date: string; category: string; title: string; summary: string }> = []
</script>

<template>
  <div class="max-w-4xl mx-auto px-4 py-12 space-y-10">
    <div class="text-center space-y-3">
      <span class="px-3.5 py-1 bg-blue-50 text-trip-blue rounded-full text-xs font-black uppercase tracking-wider">
        Newsroom
      </span>
      <h1 class="text-3xl sm:text-4xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
        {{ BRAND.name }} 뉴스룸
      </h1>
      <p class="text-sm text-slate-500 dark:text-slate-400">
        {{ BRAND.name }}의 최신 보도자료, 파트너십 소식 및 기술 혁신 업데이트를 확인하세요.
      </p>
    </div>

    <div v-if="articles.length" class="space-y-4">
      <article
        v-for="a in articles"
        :key="a.id"
        class="bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-200 dark:border-slate-700/90 shadow-sm hover:shadow-md transition space-y-2"
      >
        <div class="flex items-center gap-2">
          <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200">{{ a.category }}</span>
          <span class="text-xs text-slate-400 font-mono">{{ a.date }}</span>
        </div>
        <h2 class="text-lg font-black text-slate-900 dark:text-slate-100">{{ a.title }}</h2>
        <p class="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{{ a.summary }}</p>
      </article>
    </div>
    <div v-else class="bg-white dark:bg-slate-800 p-10 rounded-3xl border border-slate-200 dark:border-slate-700/90 shadow-sm text-center">
      <p class="text-sm text-slate-500 dark:text-slate-400 font-bold">아직 등록된 소식이 없습니다.</p>
      <p class="text-xs text-slate-400 dark:text-slate-500 mt-2">서비스 소식이 나오는 대로 이곳에 안내해 드립니다.</p>
    </div>
  </div>
</template>

