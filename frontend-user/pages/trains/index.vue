<script setup lang="ts">
/**
 * 기차 landing (design system "Horizon"). Search goes through the shared widget; the rails show real
 * catalogue items; the facts describe rules the server enforces (worker/src/domain/pricing.ts).
 */
const FACTS = [
  {
    icon: 'users',
    title: '1인 요금',
    body: '요금은 승객 1명 기준이며 아동도 성인과 같은 요금이 적용돼요.'
  },
  {
    icon: 'check',
    title: '탑승객 정보',
    body: '예약할 때 탑승객 전원의 영문 성명이 필요해요.'
  },
  {
    icon: 'lock',
    title: '결제 전 금액 확정',
    body: '최종 금액은 결제 전 확인 화면에서 확정되고 결제 화면에서 바뀌지 않아요.'
  }
]
useHead({
  title: '기차표 예약',
  meta: [{ name: 'description', content: 'KTX, 신칸센, 유로스타 열차 시간표와 요금을 비교하고 예약하세요.' }]
})
</script>

<template>
  <ProductLanding tab="trains" crumb="기차" title="기차표를 예약하세요" subtitle="출발역과 도착역을 고르면 운행 중인 열차와 좌석 등급을 비교할 수 있어요." :facts="FACTS">
    <ProductRail kind="trains" title="판매 중인 구간" hint="구간별 현재 최저 참고가 · 1인 편도 기준" />
  </ProductLanding>
</template>
