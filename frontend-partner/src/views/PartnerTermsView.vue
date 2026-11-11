<script setup lang="ts">
// Partner supply & settlement terms v1.0 (#64). Every clause below mirrors
// implemented platform behavior — approval gates, manual settlement, the
// 24h supplier SLA — not aspirations. Counsel review still pending.
</script>

<template>
  <div class="flex min-h-full flex-col px-6 py-12">
    <div class="text-center">
      <h1 class="text-2xl font-black tracking-tight text-white">파트너 공급 규정 및 정산 정책</h1>
      <p class="mt-2 text-sm font-medium text-sapphire-300">v1.0 · 시행 2026-11-11 · 법무 검토 전 초안</p>
    </div>

    <div class="mt-8 sm:mx-auto sm:w-full sm:max-w-2xl">
      <div class="space-y-6 rounded-3xl border border-line bg-surface px-6 py-8 shadow-pop sm:px-10">
        <section class="space-y-2">
          <h2 class="text-sm font-black">제1조 (입점과 승인)</h2>
          <p class="text-xs leading-relaxed">
            입점 신청 후 회사의 승인이 있어야 판매할 수 있습니다. 승인 전에는 프로필·서류
            보완과 상품 초안 등록만 가능하고, 주문 수신·정산 메뉴는 열리지 않습니다.
            대표자(대표 계정) 1인과 매니저·직원을 둘 수 있으며, API 키 발급과
            웹훅 설정·로테이션은 대표 계정만 할 수 있습니다.
          </p>
        </section>

        <section class="space-y-2">
          <h2 class="text-sm font-black">제2조 (상품 등록과 판매 개시)</h2>
          <p class="text-xs leading-relaxed">
            등록한 상품은 회사의 계약·연동 확인이 끝나기 전까지 판매 불가 상태로
            노출되지 않습니다. 객실·좌석·일정형 상품은 판매 캘린더(마감일·잔여
            수량·일자별 요금)를 정확히 유지해야 하며, 마감일을 넘긴 판매가
            발생하지 않도록 플랫폼이 예약·결제 시점에 재고를 재확인합니다.
            상품 중단은 삭제가 아니라 판매중지 처리이며, 이미 확정된 예약은
            끝까지 이행해야 합니다.
          </p>
        </section>

        <section class="space-y-2">
          <h2 class="text-sm font-black">제3조 (주문 확정과 공급 이행)</h2>
          <p class="text-xs leading-relaxed">
            결제된 주문은 익스트라넷 주문함에서 확정번호와 함께 확정하거나,
            불가 시 사유와 함께 거절해야 합니다. 확정 후 24시간 안에 공급사
            확정이 확인되지 않으면 고객에게 자동 전액환불되고 주문은 취소됩니다.
            즉시확정 표시는 실시간 연동이 갖춰진 상품에만 붙으며, 그 외 상품은
            운영자 확정 후 바우처가 발급됩니다.
          </p>
        </section>

        <section class="space-y-2">
          <h2 class="text-sm font-black">제4조 (수수료와 정산)</h2>
          <p class="text-xs leading-relaxed">
            플랫폼 수수료는 상품별 정산율(기본 10%)을 따르며, 주문별 정산 내역은
            정산 메뉴에서 수시로 확인할 수 있습니다. 정산금은 이용 완료 확인 후
            회사가 건별로 승인·지급하며, 자동이체는 하지 않습니다. 지급 시
            정산서(공급가·수수료·실지급액·세금계산서 수신 메일)가 발급됩니다.
            고객 취소·환불이 발생하면 해당분은 정산에서 차감되거나 환수됩니다.
          </p>
        </section>

        <section class="space-y-2">
          <h2 class="text-sm font-black">제5조 (정산 정보와 보안)</h2>
          <p class="text-xs leading-relaxed">
            정산 계좌·세금계산서 메일은 프로필에서 대표 계정이 직접 관리해야
            합니다. 직원은 계좌번호 전체를 볼 수 없습니다. 비밀번호·API 키·
            웹훅 시크릿은 타인에게 공유하지 않으며, 유출이 의심되면 즉시
            재발급·로테이션해야 합니다.
          </p>
        </section>

        <p class="text-center text-xs">
          <router-link to="/register" class="font-bold text-primary hover:underline">입점 신청으로 돌아가기</router-link>
        </p>
      </div>
    </div>
  </div>
</template>
