<script setup lang="ts">
// Legacy entry point: forwards to the unified server-priced checkout.
useLegacyCheckoutRedirect('TRANSFER', (q) => ({ itemId: q.vehicleId, startDate: q.date, adults: q.passengers }))
</script>

<template>
  <div class="min-h-[40vh] flex items-center justify-center text-sm text-slate-500">예약 화면으로 이동 중…</div>
</template>
