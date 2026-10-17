<script setup lang="ts">
const route = useRoute()
const activityId = (route.query.activityId || route.query.id || 'act_disney_tokyo') as string
await navigateTo(`/things-to-do/detail/${activityId}`, { replace: true })
</script>

<template>
  <div class="max-w-6xl mx-auto px-4 py-24 text-center text-slate-400 font-bold">
    투어 및 티켓 상세 정보를 불러오는 중입니다...
  </div>
</template>

