<script setup lang="ts">
const route = useRoute()
const id = (route.query.id || route.query.transferId || 'tf_icn_van_01') as string
await navigateTo(`/transfers/detail/${id}`, { replace: true })
</script>

<template>
  <div class="max-w-6xl mx-auto px-4 py-24 text-center text-slate-400 font-bold">
    공항픽업 차량 정보를 불러오는 중입니다...
  </div>
</template>


