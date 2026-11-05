<script setup lang="ts">
import { onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '~/stores/auth'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const bookingId = String(route.params.id || '')

onMounted(async () => {
  await auth.initAuth()
  if (!auth.isLoggedIn) router.replace(`/login?redirect=${encodeURIComponent(route.fullPath)}`)
})
</script>

<template>
  <ClientOnly>
    <BookingDetail v-if="auth.isLoggedIn" :booking-id="bookingId" />
  </ClientOnly>
</template>
