<script setup lang="ts">
import { BRAND } from '~/config/brand'
</script>

<template>
  <div class="max-w-4xl mx-auto px-4 py-12 space-y-8">
    <div class="space-y-2 border-b border-slate-200 pb-6">
      <span class="text-xs font-bold text-trip-blue">Privacy Policy</span>
      <h1 class="text-3xl font-black text-slate-900 tracking-tight">{{ BRAND.name }} 개인정보 처리방침</h1>
      <p class="text-xs text-slate-400">최종 개정일: 2026년 10월 1일</p>
    </div>

    <div class="prose prose-slate max-w-none text-xs leading-relaxed text-slate-700 space-y-6">
      <section class="space-y-2">
        <h2 class="text-sm font-black text-slate-900">1. 개인정보의 수집 및 이용 목적</h2>
        <p>
          {{ BRAND.name }} Inc.(이하 "회사")는 호텔, 항공권, 기차, 렌터카, 투어 상품 예약 및 발권, 본인 확인, 결제 및 정산, 고객 상담(24/7 CS)을 위해 최소한의 개인정보를 수집합니다.
        </p>
      </section>

      <section class="space-y-2">
        <h2 class="text-sm font-black text-slate-900">2. 수집하는 개인정보 항목</h2>
        <ul class="list-disc list-inside space-y-1">
          <li><strong>회원 가입 시:</strong> 성명, 이메일 주소, 휴대전화번호, 비밀번호(암호화 저장)</li>
          <li><strong>여행 예약 및 발권 시:</strong> 탑승객/투숙객 영문 성명, 생년월일, 성별, 국적, 여권번호 및 만료일(국제선 항공권 등 필수 발권 시에 한함)</li>
          <li><strong>결제 시:</strong> 카드사명, 결제 승인 기록(신용카드 번호는 PCI-DSS 준수 PG사 토큰화 처리되어 회사 서버에 직접 저장되지 않음)</li>
        </ul>
      </section>

      <section class="space-y-2">
        <h2 class="text-sm font-black text-slate-900">3. 개인정보의 보유 및 파기</h2>
        <p>
          회사는 원칙적으로 개인정보의 수집 및 이용 목적이 달성된 후에는 해당 정보를 지체 없이 파기합니다. 단, 전자상거래 등에서의 소비자보호에 관한 법률 등 관계 법령의 규정에 의하여 보존할 필요가 있는 경우 정해진 기간 동안 안전하게 보관합니다.
        </p>
      </section>

      <section class="space-y-2">
        <h2 class="text-sm font-black text-slate-900">4. 기술적·관리적 보호 조치</h2>
        <p>
          회사는 이용자의 개인정보를 전송 구간 및 저장소 전반에서 TLS 256-bit 표준 암호화 알고리즘으로 보호하며, 침입탐지 시스템 및 데이터베이스 접근 권한 통제를 엄격히 시행하고 있습니다.
        </p>
      </section>
    </div>
  </div>
</template>

