<script setup lang="ts">
import { onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '~/stores/auth'
const localePath = useLocalePath()

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const bookingId = String(route.query.bookingId || '')

onMounted(async () => {
  await auth.initAuth()
  if (!auth.isLoggedIn) router.replace(localePath(`/login?redirect=${encodeURIComponent(route.fullPath)}`))
})
</script>

<template>
  <ClientOnly>
    <BookingDetail v-if="bookingId && auth.isLoggedIn" :booking-id="bookingId" />
    <div v-else-if="!bookingId" class="mx-auto max-w-lg px-4 py-16 text-center text-sm text-ink-muted">
      {{ $t('booking.noInfo') }} <NuxtLink :to="$localePath('/my/bookings')" class="font-semibold text-primary hover:underline">{{ $t('booking.myList') }}</NuxtLink>{{ $t('booking.noInfoPost') }}
    </div>
  </ClientOnly>
</template>
