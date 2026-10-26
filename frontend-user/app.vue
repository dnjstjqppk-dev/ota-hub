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

onMounted(async () => {
  authStore.initAuth()
  if (authStore.token && authStore.token !== 'demo_jwt_token_sample_2026') {
    try {
      const res = await fetch('/api/v1/auth/me', {
        headers: { Authorization: `Bearer ${authStore.token}` }
      })
      if (res.ok) {
        const data = await res.json()
        authStore.user = {
          id: data.id,
          email: data.email,
          fullName: data.fullName || data.full_name,
          phoneNumber: data.phoneNumber || data.phone_number,
          tier: data.tier || 'SILVER',
          tripCoins: data.tripCoins ?? data.trip_coins ?? 0,
          avatarUrl: data.avatarUrl || data.avatar_url,
        }
        localStorage.setItem('getfortrip_user', JSON.stringify(authStore.user))
      } else if (res.status === 401) {
        authStore.logout()
      }
    } catch (e) {
      // Offline fallback
    }
  }
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
