<script setup lang="ts">
// Legacy entry point: forwards to the unified server-priced checkout.
useLegacyCheckoutRedirect('ACTIVITY', (q) => ({ itemId: q.activityId, startDate: q.date, adults: q.adults, children: q.children }))
</script>

<template>
  <div class="min-h-[40vh] flex items-center justify-center text-sm text-slate-500">{{ $t('redirect.checkout') }}</div>
</template>
