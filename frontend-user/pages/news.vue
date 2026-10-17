<script setup lang="ts">
import { BRAND } from '~/config/brand'

const articles = [
  {
    id: 1,
    date: '2026.10.15',
    category: '보도자료',
    title: `${BRAND.name}, 전 세계 140만 호텔 실시간 직계약 재고 및 패싯 필터 엔진 전격 오픈`,
    summary: 'Trip 스타일의 7대 도메인 다차원 패싯 필터와 고속 인메모리 검색 엔진을 결합하여 0.2초대 검색 속도를 달성했습니다.'
  },
  {
    id: 2,
    date: '2026.10.01',
    category: '서비스 업데이트',
    title: `${BRAND.name} B2B 파트너 비즈니스 허브 출시... 공급사 정산 자동화 지원`,
    summary: '호텔, 투어, 렌터카 파트너사가 직접 재고와 요금을 실시간 관리하고 월 2회 90% 정산 명세서를 확인하는 공급사 포털을 공개했습니다.'
  },
  {
    id: 3,
    date: '2026.09.15',
    category: '기업 소식',
    title: `${BRAND.name}, 글로벌 주요 항공사 및 KTX/신칸센 철도망 다이렉트 API 연동 완료`,
    summary: '해외 항공권과 아시아/유럽 고속철도망을 결합한 스마트 여행 상품 예약 서비스를 정식 개시했습니다.'
  }
]
</script>

<template>
  <div class="max-w-4xl mx-auto px-4 py-12 space-y-10">
    <div class="text-center space-y-3">
      <span class="px-3.5 py-1 bg-blue-50 text-trip-blue rounded-full text-xs font-black uppercase tracking-wider">
        Newsroom
      </span>
      <h1 class="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">
        {{ BRAND.name }} 뉴스룸
      </h1>
      <p class="text-sm text-slate-500">
        {{ BRAND.name }}의 최신 보도자료, 파트너십 소식 및 기술 혁신 업데이트를 확인하세요.
      </p>
    </div>

    <div class="space-y-4">
      <article
        v-for="a in articles"
        :key="a.id"
        class="bg-white p-6 rounded-3xl border border-slate-200/90 shadow-sm hover:shadow-md transition space-y-2"
      >
        <div class="flex items-center gap-2">
          <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">{{ a.category }}</span>
          <span class="text-xs text-slate-400 font-mono">{{ a.date }}</span>
        </div>
        <h2 class="text-lg font-black text-slate-900">{{ a.title }}</h2>
        <p class="text-xs text-slate-600 leading-relaxed">{{ a.summary }}</p>
      </article>
    </div>
  </div>
</template>

