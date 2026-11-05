<script setup lang="ts">
/**
 * 공항 이동 landing (design system "Horizon"). Search goes through the shared widget; the rails show real
 * catalogue items; the facts describe rules the server enforces (worker/src/domain/pricing.ts).
 */
const FACTS = [
  {
    icon: 'transfer',
    title: '차량 1대 요금',
    body: '요금은 인원과 관계없이 차량 1대 편도 기준이며 세금 10%가 더해져요.'
  },
  {
    icon: 'users',
    title: '탑승 인원',
    body: '차량마다 최대 탑승 인원이 정해져 있어요. 인원이 넘으면 예약할 수 없으니 더 큰 차량을 골라 주세요.'
  },
  {
    icon: 'refund',
    title: '무료 취소',
    body: '무료 취소 상품은 이용 전날까지 수수료 없이 취소할 수 있어요. 정확한 기한은 결제 전 화면에 표시돼요.'
  }
]
useHead({
  title: '공항 픽업·샌딩 예약',
  meta: [{ name: 'description', content: '공항과 시내를 오가는 전용 차량을 인원과 수하물에 맞춰 예약하세요.' }]
})
</script>

<template>
  <ProductLanding tab="transfers" crumb="공항 이동" title="공항에서 숙소까지 편하게" subtitle="공항과 인원을 고르면 함께 탈 수 있는 차량만 보여드려요." :facts="FACTS">
    <ProductRail kind="transfers" title="예약할 수 있는 차량" hint="차량 1대 편도 참고가 · 세금 10% 별도" />
  </ProductLanding>
</template>
