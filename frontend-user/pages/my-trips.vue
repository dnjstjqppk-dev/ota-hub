<script setup lang="ts">
import { navigateTo } from '#app'

await navigateTo('/my/bookings', { replace: true })
</script>

<template>
  <div class="min-h-[50vh] flex items-center justify-center text-slate-400 text-xs">
    <span>예약 내역으로 이동 중...</span>
  </div>
</template>

