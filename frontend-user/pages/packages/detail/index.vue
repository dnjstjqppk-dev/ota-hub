<script setup lang="ts">
const route = useRoute()
const id = (route.query.id || route.query.packageId || 'pkg_tokyo_4d3n') as string
await navigateTo(`/packages/detail/${id}`, { replace: true })
</script>

<template>
  <div class="max-w-6xl mx-auto px-4 py-24 text-center text-slate-400 font-bold">
    패키지 상세 정보를 불러오는 중입니다...
  </div>
</template>


