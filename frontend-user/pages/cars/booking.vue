<script setup lang="ts">
// Legacy entry point: forwards to the unified server-priced checkout.
useLegacyCheckoutRedirect('CAR', (q) => ({ itemId: q.carId, startDate: q.pickup, endDate: q.return }))
</script>

<template>
  <div class="min-h-[40vh] flex items-center justify-center text-sm text-slate-500">예약 화면으로 이동 중…</div>
</template>
