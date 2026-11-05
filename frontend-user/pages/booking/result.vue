<script setup lang="ts">
import { onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '~/stores/auth'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const bookingId = String(route.query.bookingId || '')

onMounted(async () => {
  await auth.initAuth()
  if (!auth.isLoggedIn) router.replace(`/login?redirect=${encodeURIComponent(route.fullPath)}`)
})
</script>

<template>
  <ClientOnly>
    <BookingDetail v-if="bookingId && auth.isLoggedIn" :booking-id="bookingId" />
    <div v-else-if="!bookingId" class="max-w-lg mx-auto px-4 py-16 text-center text-sm text-slate-600">
      예약 정보가 없습니다. <NuxtLink to="/my/bookings" class="font-semibold text-trip-blue">내 예약 목록</NuxtLink>에서 확인해주세요.
    </div>
  </ClientOnly>
</template>
