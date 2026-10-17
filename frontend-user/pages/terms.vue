<script setup lang="ts">
import { BRAND } from '~/config/brand'
</script>

<template>
  <div class="max-w-4xl mx-auto px-4 py-12 space-y-8">
    <div class="space-y-2 border-b border-slate-200 pb-6">
      <span class="text-xs font-bold text-trip-blue">Terms of Service</span>
      <h1 class="text-3xl font-black text-slate-900 tracking-tight">{{ BRAND.name }} 서비스 이용약관</h1>
      <p class="text-xs text-slate-400">최종 개정일: 2026년 10월 1일</p>
    </div>

    <div class="prose prose-slate max-w-none text-xs leading-relaxed text-slate-700 space-y-6">
      <section class="space-y-2">
        <h2 class="text-sm font-black text-slate-900">제1조 (목적)</h2>
        <p>
          본 약관은 {{ BRAND.name }} Inc.(이하 "회사")가 제공하는 온라인 여행 플랫폼 서비스(웹사이트, 모바일 앱 등 제반 서비스)의 이용과 관련하여 회사와 이용자 간의 권리, 의무 및 책임사항을 규정함을 목적으로 합니다.
        </p>
      </section>

      <section class="space-y-2">
        <h2 class="text-sm font-black text-slate-900">제2조 (용어의 정의)</h2>
        <p>1. "서비스"란 회사가 제공하는 호텔, 항공권, 기차표, 렌터카, 공항픽업, 투어·티켓 등의 여행 상품 검색, 예약, 결제 및 사후 관리 플랫폼을 말합니다.</p>
        <p>2. "이용자"란 본 약관에 따라 회사가 제공하는 서비스를 이용하는 회원 및 비회원을 말합니다.</p>
        <p>3. "공급사/파트너"란 회사와 정식 제휴 계약을 체결하고 여행 상품 및 서비스를 직접 제공하는 항공사, 호텔, 철도청, 현지 여행사를 말합니다.</p>
      </section>

      <section class="space-y-2">
        <h2 class="text-sm font-black text-slate-900">제3조 (예약 및 계약의 성립)</h2>
        <p>
          이용자가 상품을 선택하고 결제 정보를 입력하여 결제를 완료한 후, 회사의 예약 확인 시스템을 통해 예약번호(PNR) 및 전자 바우처가 발급된 시점에 이용자와 공급사 간의 여행 서비스 이용 계약이 성립됩니다.
        </p>
      </section>

      <section class="space-y-2">
        <h2 class="text-sm font-black text-slate-900">제4조 (취소 및 환불)</h2>
        <p>
          각 여행 상품의 취소 및 환불 기준은 해당 상품의 상세 페이지 및 바우처에 사전 고지된 공급사의 개별 취소 규정을 우선하여 적용합니다. 무료 취소 기한 내 취소 시 회사는 위약금 없이 전액 환불합니다.
        </p>
      </section>

      <section class="space-y-2">
        <h2 class="text-sm font-black text-slate-900">제5조 (면책 조항 및 분쟁 해결)</h2>
        <p>
          회사는 천재지변, 항공사 파업, 현지 기상 악화 등 불가항력적 사유로 인한 서비스 이행 장애에 대해 합리적 범위 내에서 최선의 변경/환불 지원을 제공하며, 관련 법령에 따른 분쟁 조정을 적극 지원합니다.
        </p>
      </section>
    </div>
  </div>
</template>

