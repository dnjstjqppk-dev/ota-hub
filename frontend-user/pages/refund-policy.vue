<script setup lang="ts">
import { BRAND } from '~/config/brand'
</script>

<template>
  <div class="max-w-4xl mx-auto px-4 py-12 space-y-10">
    <div class="text-center space-y-3">
      <span class="px-3.5 py-1 bg-blue-50 text-trip-blue rounded-full text-xs font-black uppercase tracking-wider">
        Cancellation & Refund Policy
      </span>
      <h1 class="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">
        카테고리별 취소 및 환불 규정
      </h1>
      <p class="text-sm text-slate-500 max-w-xl mx-auto">
        {{ BRAND.name }}은 투명하고 공정한 취소/환불 기준을 준수하며 모바일 마이페이지에서 간편한 원클릭 취소를 지원합니다.
      </p>
    </div>

    <div class="space-y-6">
      <!-- 1. 호텔 -->
      <div class="bg-white p-6 rounded-3xl border border-slate-200/90 shadow-sm space-y-3">
        <h2 class="text-base font-black text-slate-900 flex items-center gap-2">
          <span>🏨</span>
          <span>호텔 및 숙소 취소 규정</span>
        </h2>
        <div class="text-xs text-slate-600 leading-relaxed space-y-2">
          <p><strong>무료 취소 상품:</strong> 각 호텔 바우처에 명시된 무료 취소 마감 일시(통상 체크인 24~72시간 전) 이전 취소 시 위약금 없이 100% 전액 환불됩니다.</p>
          <p><strong>환불 불가 특가:</strong> 예약 확정 즉시 취소 수수료 100%가 부과되며 변경 및 취소가 제한됩니다.</p>
          <p><strong>환불 입금 소요 기간:</strong> 신용카드 결제 취소는 영업일 기준 3~5일, 간편결제(카카오/네이버페이)는 당일 또는 익일 처리됩니다.</p>
        </div>
      </div>

      <!-- 2. 항공권 -->
      <div class="bg-white p-6 rounded-3xl border border-slate-200/90 shadow-sm space-y-3">
        <h2 class="text-base font-black text-slate-900 flex items-center gap-2">
          <span>✈️</span>
          <span>항공권 취소 및 환불 규정</span>
        </h2>
        <div class="text-xs text-slate-600 leading-relaxed space-y-2">
          <p><strong>당일 취소:</strong> 발권 당일 자정(KST 23:50) 이전 취소 시 항공사 취소 수수료 없이 전액 취소 가능합니다(단, 일부 특가 운임 제외).</p>
          <p><strong>발권 이후 취소:</strong> 항공사 운임 규정에 따른 환불 위약금이 차감된 후 잔여 금액이 환불됩니다.</p>
          <p><strong>결항/지연:</strong> 기상 악화나 항공사 사정으로 인한 결항 시 증빙서류 확인 후 전액 면제 환불됩니다.</p>
        </div>
      </div>

      <!-- 3. 기차표/렌터카/투어 -->
      <div class="bg-white p-6 rounded-3xl border border-slate-200/90 shadow-sm space-y-3">
        <h2 class="text-base font-black text-slate-900 flex items-center gap-2">
          <span>🚗</span>
          <span>렌터카, 기차표, 투어·티켓 취소 규정</span>
        </h2>
        <div class="text-xs text-slate-600 leading-relaxed space-y-2">
          <p><strong>렌터카/공항픽업:</strong> 픽업 24~48시간 전까지 100% 무료 취소 가능하며, 노쇼(No-show) 시 환불이 불가합니다.</p>
          <p><strong>투어·체험:</strong> 상품별 사전 안내된 취소 규정에 따라 3~7일 전 100%, 1~2일 전 부분 차감 환불됩니다.</p>
          <p><strong>e-티켓(테마파크/전망대):</strong> 즉시 발권 QR 코드가 생성된 e-티켓은 공급사 정책상 발권 후 취소 및 교환이 불가합니다.</p>
        </div>
      </div>
    </div>
  </div>
</template>

