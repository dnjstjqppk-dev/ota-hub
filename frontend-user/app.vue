<script setup lang="ts">
import { onMounted } from 'vue'
import { useAuthStore } from '~/stores/auth'

const authStore = useAuthStore()

useHead({
  titleTemplate: (titleChunk) => titleChunk ? `${titleChunk} - getfortrip` : 'getfortrip - 스마트한 전 세계 여행의 시작',
  script: [
    {
      type: 'application/ld+json',
      children: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'TravelAgency',
        'name': 'getfortrip',
        'url': 'https://getfortrip.com',
        'logo': 'https://getfortrip.com/logo.svg',
        'description': '스마트한 전 세계 여행의 시작, getfortrip. 항공권, 호텔, 기차표, 렌터카, 공항픽업, 투어·티켓 최저가 예약.',
        'priceRange': '₩₩',
        'currenciesAccepted': 'KRW, USD, JPY, EUR',
        'paymentAccepted': 'Credit Card, S2S Webhook',
        'address': {
          '@type': 'PostalAddress',
          'addressCountry': 'KR',
          'addressLocality': 'Seoul'
        }
      })
    }
  ]
})

onMounted(() => {
  // initAuth restores the session and verifies the token with /auth/me (logs out on 401).
  authStore.initAuth()
})
</script>

<template>
  <div class="min-h-screen flex flex-col bg-trip-bg font-sans antialiased text-trip-navy pb-16 md:pb-0">
    <GlobalHeader />
    <main class="flex-1">
      <NuxtPage />
    </main>
    <GlobalFooter />
    <MobileBottomNav />
  </div>
</template>
