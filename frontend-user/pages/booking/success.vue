<script setup lang="ts">
// Legacy completion page: the booking outcome now comes only from the server (/booking/result).
import { onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()
const localePath = useLocalePath()
onMounted(() => {
  const id = route.query.bookingId || route.query.id
  router.replace(id ? localePath({ path: '/booking/result', query: { bookingId: String(id) } }) : localePath('/my/bookings'))
})
</script>

<template>
  <div class="min-h-[40vh] flex items-center justify-center text-sm text-slate-500">{{ $t('booking.checking') }}</div>
</template>
