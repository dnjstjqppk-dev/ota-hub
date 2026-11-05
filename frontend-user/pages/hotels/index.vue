<script setup lang="ts">
/**
 * 호텔 landing (design system "Horizon"). Search goes through the shared widget; the rails show real
 * catalogue items; the facts describe rules the server enforces (worker/src/domain/pricing.ts).
 */
const FACTS = [
  {
    icon: 'lock',
    title: '결제 전 금액 확정',
    body: '날짜·객실 수·인원을 반영한 최종 금액(세금 10% 포함)은 결제 전 확인 화면에서 확정되고, 결제 화면에서 바뀌지 않아요.'
  },
  {
    icon: 'refund',
    title: '무료 취소 요금',
    body: '무료 취소 요금제는 체크인 전날까지 수수료 없이 취소할 수 있어요. 정확한 기한은 결제 전 화면에 표시돼요.'
  },
  {
    icon: 'users',
    title: '객실 정원',
    body: '객실마다 최대 인원이 정해져 있어요. 인원이 정원을 넘으면 객실 수를 늘려야 예약할 수 있어요. 한 번에 최대 30박까지 예약돼요.'
  }
]
useHead({
  title: '호텔·숙소 예약',
  meta: [{ name: 'description', content: '전 세계 호텔과 리조트를 평점, 성급, 요금으로 비교하고 예약하세요.' }]
})
</script>

<template>
  <ProductLanding tab="hotels" crumb="호텔" title="머물 곳을 찾아보세요" subtitle="날짜와 인원을 고르면 객실별 요금을 비교할 수 있어요." :facts="FACTS">
    <ProductRail kind="hotels" title="평점 높은 숙소" hint="투숙객 평점 순 · 1박 참고가이며 세금 10%가 별도로 붙어요" />
  </ProductLanding>
</template>
