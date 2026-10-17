<script setup lang="ts">
import { BRAND } from '~/config/brand'
</script>

<template>
  <div class="max-w-4xl mx-auto px-4 py-12 space-y-10">
    <div class="text-center space-y-3">
      <span class="px-3.5 py-1 bg-emerald-50 text-emerald-600 rounded-full text-xs font-black uppercase tracking-wider">
        🌱 Sustainable Travel
      </span>
      <h1 class="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">
        지속 가능한 미래를 위한 {{ BRAND.name }}의 약속
      </h1>
      <p class="text-sm text-slate-500 max-w-xl mx-auto">
        환경을 보호하고 지역 사회와 상생하는 친환경 여행 생태계를 만들어갑니다.
      </p>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div class="bg-white p-6 rounded-3xl border border-slate-200/90 shadow-sm space-y-3">
        <div class="text-3xl">🌿</div>
        <h3 class="text-base font-black text-slate-900">탄소 배출 저감 친환경 숙소 인증</h3>
        <p class="text-xs text-slate-600 leading-relaxed">
          재생 에너지 사용, 일회용 어메니티 감축 등 국제 지속가능성 기준을 충족한 친환경 호텔에 녹색 에코 배지를 부여하여 선택을 지원합니다.
        </p>
      </div>

      <div class="bg-white p-6 rounded-3xl border border-slate-200/90 shadow-sm space-y-3">
        <div class="text-3xl">🚅</div>
        <h3 class="text-base font-black text-slate-900">저탄소 철도 여행 장려</h3>
        <p class="text-xs text-slate-600 leading-relaxed">
          항공편 대비 80% 이상 탄소 배출이 적은 KTX, 신칸센, 유로스타 등 친환경 고속철도 노선 발권을 적극 지원합니다.
        </p>
      </div>

      <div class="bg-white p-6 rounded-3xl border border-slate-200/90 shadow-sm space-y-3">
        <div class="text-3xl">📄</div>
        <h3 class="text-base font-black text-slate-900">100% 디지털 페이퍼리스 바우처</h3>
        <p class="text-xs text-slate-600 leading-relaxed">
          종이 인쇄물 없이 모바일 QR 및 전자 바우처로 체크인할 수 있는 모바일 퍼스트 발권 시스템을 운영합니다.
        </p>
      </div>

      <div class="bg-white p-6 rounded-3xl border border-slate-200/90 shadow-sm space-y-3">
        <div class="text-3xl">🤝</div>
        <h3 class="text-base font-black text-slate-900">현지 로컬 커뮤니티 상생</h3>
        <p class="text-xs text-slate-600 leading-relaxed">
          소규모 로컬 투어 가이드와 소상공인 렌터카 업체를 직접 입점시켜 여행 수익이 현지 경제로 환원되도록 돕습니다.
        </p>
      </div>
    </div>
  </div>
</template>

