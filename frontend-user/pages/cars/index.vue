<script setup lang="ts">
/**
 * 렌터카 landing (design system "Horizon"). Search goes through the shared widget; the rails show real
 * catalogue items; the facts describe rules the server enforces (worker/src/domain/pricing.ts).
 */
const FACTS = [
  {
    icon: 'calendar',
    title: '대여 기간',
    body: '1일부터 60일까지 빌릴 수 있어요. 요금은 대여 일수 × 1일 요금에 세금 10%가 더해져요.'
  },
  {
    icon: 'refund',
    title: '무료 취소',
    body: '무료 취소 상품은 인수 전날까지 수수료 없이 취소할 수 있어요. 정확한 기한은 결제 전 화면에 표시돼요.'
  },
  {
    icon: 'shield',
    title: '보험과 운전 자격',
    body: '기본 보험 포함 여부는 차량마다 표시돼요. 운전자 자격과 현장 보증금은 렌터카 회사 규정을 따라요.'
  }
]
useHead({
  title: '렌터카 예약',
  meta: [{ name: 'description', content: '공항과 도시의 렌터카를 차종, 좌석 수, 요금으로 비교하고 예약하세요.' }]
})
</script>

<template>
  <ProductLanding tab="cars" crumb="렌터카" title="여행지에서 차를 빌리세요" subtitle="인수 장소와 대여 기간을 고르면 차종별 요금을 비교할 수 있어요." :facts="FACTS">
    <ProductRail kind="cars" title="예약할 수 있는 차량" hint="1일 참고가 · 세금 10% 별도" />
  </ProductLanding>
</template>
