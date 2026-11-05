<script setup lang="ts">
/**
 * 항공+호텔 landing (design system "Horizon"). Search goes through the shared widget; the rails show real
 * catalogue items; the facts describe rules the server enforces (worker/src/domain/pricing.ts).
 */
const FACTS = [
  {
    icon: 'users',
    title: '1인 요금',
    body: '요금은 여행자 1명 기준이에요. 포함된 항공편과 호텔은 각 상품 페이지에서 확인할 수 있어요.'
  },
  {
    icon: 'lock',
    title: '환불 불가',
    body: '패키지는 예약 후 환불할 수 없는 상품이에요. 출발일과 인원을 꼭 확인해 주세요.'
  },
  {
    icon: 'check',
    title: '여행자 정보',
    body: '예약할 때 여행자 전원의 영문 성명이 필요해요.'
  }
]
useHead({
  title: '항공+호텔 패키지',
  meta: [{ name: 'description', content: '항공권과 호텔이 함께 포함된 여행 상품을 비교하고 예약하세요.' }]
})
</script>

<template>
  <ProductLanding tab="packages" crumb="항공+호텔" title="항공권과 호텔을 한 번에" subtitle="정해진 항공편과 호텔을 묶은 상품이에요. 여행지와 출발일을 골라 보세요." :facts="FACTS">
    <ProductRail kind="packages" title="판매 중인 패키지" hint="1인 참고가" />
  </ProductLanding>
</template>
