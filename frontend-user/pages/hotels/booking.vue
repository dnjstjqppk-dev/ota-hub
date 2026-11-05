<script setup lang="ts">
// Legacy entry point: forwards to the unified server-priced checkout.
useLegacyCheckoutRedirect('HOTEL', (q) => ({ itemId: q.hotelId, unitId: q.roomId, ratePlanId: q.rate, startDate: q.checkIn, endDate: q.checkOut, adults: q.adults, rooms: q.rooms }))
</script>

<template>
  <div class="min-h-[40vh] flex items-center justify-center text-sm text-slate-500">예약 화면으로 이동 중…</div>
</template>
