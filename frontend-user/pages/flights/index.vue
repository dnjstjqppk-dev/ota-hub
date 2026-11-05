<script setup lang="ts">
/**
 * 항공권 landing (design system "Horizon"). Search goes through the shared widget; the rails show real
 * catalogue items; the facts describe rules the server enforces (worker/src/domain/pricing.ts).
 */
const FACTS = [
  {
    icon: 'users',
    title: '탑승객별 운임',
    body: '성인과 소아는 같은 운임이 적용되고, 좌석을 차지하지 않는 유아는 성인 운임의 10%예요.'
  },
  {
    icon: 'flight',
    title: '왕복 예약',
    body: '같은 판매처의 역방향 노선이면 가는 편과 오는 편을 한 번에 예약해요. 판매처가 다르면 편도로 각각 예약해 주세요.'
  },
  {
    icon: 'lock',
    title: '여권 정보와 환불',
    body: '예약할 때 탑승객 전원의 영문 성명·여권번호·만료일이 필요해요. 항공권은 발권 후 환불할 수 없어요.'
  }
]
useHead({
  title: '항공권 예약',
  meta: [{ name: 'description', content: '국내외 항공권을 비교하고 편도·왕복으로 예약하세요.' }]
})
</script>

<template>
  <ProductLanding tab="flights" crumb="항공권" title="어디로 날아갈까요?" subtitle="도시를 고르면 그 도시의 모든 공항을 함께 찾아요. 왕복도 한 번에 예약할 수 있어요." :facts="FACTS">
    <ProductRail kind="flights" title="판매 중인 노선" hint="노선별 현재 최저 참고가 · 성인 1명 편도 기준" />
  </ProductLanding>
</template>
