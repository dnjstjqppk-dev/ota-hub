<script setup lang="ts">
import { BRAND } from '~/config/brand'
const VERSION = '2.1'
const EFFECTIVE = '2026년 11월 10일'
</script>

<template>
  <div class="max-w-4xl mx-auto px-4 py-12 space-y-8">
    <div class="space-y-2 border-b border-slate-200 dark:border-slate-700 pb-6">
      <span class="text-xs font-bold text-trip-blue">Terms of Service · v{{ VERSION }}</span>
      <h1 class="text-3xl font-black text-slate-900 dark:text-slate-100 tracking-tight">{{ BRAND.name }} 서비스 이용약관</h1>
      <p class="text-xs text-slate-400">시행일: {{ EFFECTIVE }}</p>
    </div>

    <div class="prose prose-slate dark:prose-invert max-w-none text-xs leading-relaxed text-slate-700 dark:text-slate-200 space-y-6">
      <section class="space-y-2">
        <h2 class="text-sm font-black text-slate-900 dark:text-slate-100">제1조 (목적)</h2>
        <p>
          본 약관은 {{ BRAND.name }} Inc.(이하 "회사")가 제공하는 온라인 여행 플랫폼 서비스(웹사이트, 모바일 웹 등 제반 서비스의 이용과 관련하여 회사와 이용자 간의 권리, 의무 및 책임사항 규정을 목적으로 합니다.
        </p>
      </section>

      <section class="space-y-2">
        <h2 class="text-sm font-black text-slate-900 dark:text-slate-100">제2조 (용어의 정의)</h2>
        <p>
          1. "서비스"란 회사가 제공하는 호텔, 항공, 기차, 렌터카, 공항이동, 투어·티켓, 패키지의 여행 상품 검색, 예약, 결제 및 관리 플랫폼을 말합니다. eSIM·여행자보험은 공급 계약 체결 전까지 요금제 조회만 제공하며 견적·예약·결제 대상이 아닙니다.
          2. "이용자"란 본 약관에 따라 회사가 제공하는 서비스를 이용하는 회원 및 비회원을 말합니다.
          3. "공급사/제휴사"란 회사와 정식 제휴 계약을 체결하고 여행 상품 및 서비스를 직접 제공하는 항공사, 호텔, 철도청, 현지 여행사를 말합니다.
          4. "직판 상품"이란 회사가 판매자로서 직접 판매하는 상품을 말합니다.
          5. "중개 상품"이란 회사 결제 시스템을 통해 결제하고 회사가 예약 이행을 관리하되, 판매자는 공급사인 상품을 말합니다.
          6. "제휴 링크"란 이용자를 제휴사 사이트로 연결하는 아웃링크로서, 실제 거래는 해당 제휴사와 이용자 간에 성립합니다.
        </p>
      </section>

      <section class="space-y-2">
        <h2 class="text-sm font-black text-slate-900 dark:text-slate-100">제3조 (판매 형태 및 플랫폼의 역할)</h2>
        <p>
          1. 직판 상품 거래에서 회사는 통신판매업자로서 판매자이며, 여행 서비스 제공 책임을 집니다.
          2. 중개 상품 거래에서 회사는 통신판매중개업자로서 공급사와 이용자 사이의 거래를 중개합니다. 여행 상품 자체(운송, 숙박, 체험)의 제공 책임은 각 공급사에 있습니다.
          3. 제휴 링크 영역에서 회사는 메타서치 정보제공자로서 상품 정보의 검색·비교 편의를 제공하며, 링크 이동 후의 예약·결제·취소 조건은 해당 제휴사의 약관이 적용됩니다.
          4. 각 주문의 판매 형태(직판·중개)는 예약 상세 화면에서 확인할 수 있습니다.
          5. 회사는 직접 결제되는 예약(직판·중개)에 대해 결제 금액 확정, 공급사 확정 여부 확인, 바우처 발급, 취소·환불 처리를 본 약관과 취소·환불 규정에 따라 이행합니다.
        </p>
      </section>

      <section class="space-y-2">
        <h2 class="text-sm font-black text-slate-900 dark:text-slate-100">제4조 (예약 및 계약의 성립)</h2>
        <p>
          이용자가 상품을 선택하고 결제 정보를 입력하여 결제를 완료한 후, 예약번호(PNR) 및 전자 바우처가 발급된 시점에 여행 서비스 이용 계약이 성립됩니다.
          직판 상품은 이용자와 회사 간에, 중개 상품은 이용자와 공급사 간에 계약이 성립됩니다.
        </p>
      </section>

      <section class="space-y-2">
        <h2 class="text-sm font-black text-slate-900 dark:text-slate-100">제5조 (취소 및 환불)</h2>
        <p>
          각 예약의 취소 및 환불 기준은 해당 상품의 상세 페이지 및 바우처에 기재된 판매자(회사 또는 공급사)의 개별 취소 규정을 우선하여 적용합니다. 무료 취소 기한 내 취소 시 회사는 위약금 없이 전액 환불합니다. 상품별 구조화된 취소 구간이 표시된 경우 그 기준이 본 조의 일반 기준에 우선합니다. 상세 기준은 취소·환불 규정 페이지를 따릅니다.
        </p>
      </section>

      <section class="space-y-2">
        <h2 class="text-sm font-black text-slate-900 dark:text-slate-100">제6조 (요금과 수수료)</h2>
        <p>
          1. 표시 요금은 객실 1박·성인 1인 등 기준 조건의 참고가이며, 세금 10%가 별도로 붙어요. 최종 결제 금액은 예약 단계에서 날짜·인원 기준으로 확정됩니다.
          2. 중개 상품의 경우 회사는 중개 수수료를 공급사 정산에서 수취하며, 이용자에게 별도 중개 수수료를 부과하지 않습니다. 단, 특가 운임의 변경·취소 시 판매자의 위약금이 발생할 수 있습니다.
          3. 외화 표시는 결제 시점 환율과 다를 수 있으며, 원화 결제 금액이 최종 청구 기준입니다.
        </p>
      </section>

      <section class="space-y-2">
        <h2 class="text-sm font-black text-slate-900 dark:text-slate-100">제7조 (책임의 한계)</h2>
        <p>
          1. 회사는 천재지변, 항공사·호텔의 운항 중단, 정부 조치 등 불가항력으로 인한 예약 이행 불가에 대해 책임을 지지 않으며, 이 경우 기결제 금액의 환불을 성실히 지원합니다.
          2. 이용자가 여권 정보 등 예약 필수 정보를 오기재하여 발생한 불이익은 이용자가 부담합니다.
          3. 제휴 링크로 이동한 후 제휴사 사이트에서 발생한 거래 분쟁은 해당 제휴사의 약관과 정책에 따릅니다.
          4. 회사는 무료로 제공되는 정보·콘텐츠의 완전성·정확성에 대해 보증하지 않습니다.
        </p>
      </section>

      <section class="space-y-2">
        <h2 class="text-sm font-black text-slate-900 dark:text-slate-100">제8조 (면책 조항 및 분쟁 해결)</h2>
        <p>
          서비스 이용 중 발생한 분쟁은 이용자와 회사가 성실히 협의하여 해결하며, 협의가 이루어지지 않을 경우 민사소송법상 관할 법원을 전속 관할로 합니다. 본 약관의 해석에는 대한민국 법을 적용합니다.
        </p>
      </section>

      <section class="space-y-2">
        <h2 class="text-sm font-black text-slate-900 dark:text-slate-100">부칙 (약관의 변경)</h2>
        <p>
          회사가 본 약관을 개정하는 경우 적용일자 7일 전부터 서비스 내 공지사항과 본 페이지의 버전 표시를 통해 고지합니다. 이용자에게 불리한 중대한 변경은 30일 전에 고지합니다. 본 약관 v{{ VERSION }}은 {{ EFFECTIVE }}부터 시행됩니다.
        </p>
      </section>
    </div>
  </div>
</template>
