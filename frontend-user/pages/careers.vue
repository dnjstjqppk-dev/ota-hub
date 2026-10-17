<script setup lang="ts">
import { BRAND } from '~/config/brand'

const positions = [
  {
    title: 'Senior Frontend Engineer (Vue 3 / TypeScript)',
    team: 'Web Platform Squad',
    location: '서울 강남구 (하이브리드 근무)',
    type: '정규직'
  },
  {
    title: 'Senior Backend Architect (Go / High-Concurrency)',
    team: 'Core OMS & Settlement Team',
    location: '서울 강남구 (하이브리드 근무)',
    type: '정규직'
  },
  {
    title: 'Global Travel Supplier Partnership Manager',
    team: 'B2B Hospitality Biz Dev',
    location: '서울 / 글로벌 출장',
    type: '정규직'
  },
  {
    title: 'Product Designer (UI/UX - Mobile & Web)',
    team: 'Customer Experience Squad',
    location: '서울 강남구',
    type: '정규직'
  }
]
</script>

<template>
  <div class="max-w-4xl mx-auto px-4 py-12 space-y-10">
    <div class="text-center space-y-3">
      <span class="px-3.5 py-1 bg-blue-50 text-trip-blue rounded-full text-xs font-black uppercase tracking-wider">
        Careers at {{ BRAND.name }}
      </span>
      <h1 class="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">
        글로벌 여행의 미래를 함께 설계할 동료를 찾습니다
      </h1>
      <p class="text-sm text-slate-500 max-w-xl mx-auto">
        수백만 여행자의 감동을 만드는 테크 드리븐 OTA {{ BRAND.name }}에서 최고의 역량을 펼치세요.
      </p>
    </div>

    <!-- 채용 공고 목록 -->
    <div class="bg-white rounded-3xl border border-slate-200/90 shadow-sm divide-y divide-slate-100 overflow-hidden">
      <div v-for="pos in positions" :key="pos.title" class="p-6 hover:bg-slate-50/80 transition flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div class="space-y-1">
          <div class="flex items-center gap-2">
            <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-trip-blue">{{ pos.type }}</span>
            <span class="text-xs text-slate-400 font-medium">{{ pos.team }}</span>
          </div>
          <h3 class="text-base font-black text-slate-900">{{ pos.title }}</h3>
          <p class="text-xs text-slate-500">📍 {{ pos.location }}</p>
        </div>
        <a
          href="mailto:careers@getfortrip.com"
          class="px-4 py-2.5 bg-trip-blue hover:bg-blue-600 text-white rounded-xl text-xs font-black shadow-sm transition whitespace-nowrap text-center self-start sm:self-center"
        >
          지원하기 →
        </a>
      </div>
    </div>
  </div>
</template>

