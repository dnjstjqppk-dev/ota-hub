<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useAuthStore } from '~/stores/auth'

const authStore = useAuthStore()

// First-visit onboarding: shown once per browser, never blocks returning users.
const showOnboarding = ref(false)
function dismissOnboarding() {
  showOnboarding.value = false
  try { localStorage.setItem('getfortrip_onboarded_v1', '1') } catch {}
}

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
  try {
    if (!localStorage.getItem('getfortrip_onboarded_v1')) showOnboarding.value = true
  } catch {}
})
</script>

<template>
  <div class="flex min-h-screen flex-col bg-canvas font-sans text-ink antialiased">
    <GlobalHeader />
    <main id="main" class="flex-1">
      <NuxtPage />
    </main>
    <GlobalFooter />
    <MobileBottomNav />
    <OnboardingModal :open="showOnboarding" @close="dismissOnboarding" />
  </div>
</template>
