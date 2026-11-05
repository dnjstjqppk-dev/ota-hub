<script setup lang="ts">
// Legacy completion page: the booking outcome now comes only from the server (/booking/result).
import { onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()
onMounted(() => {
  const id = route.query.bookingId || route.query.id
  router.replace(id ? { path: '/booking/result', query: { bookingId: String(id) } } : '/my/bookings')
})
</script>

<template>
  <div class="min-h-[40vh] flex items-center justify-center text-sm text-slate-500">예약 상태를 확인하는 중…</div>
</template>
