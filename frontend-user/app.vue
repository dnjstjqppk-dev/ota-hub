<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useAuthStore } from '~/stores/auth'
import { jsonLdScript, orgWebsiteLd } from '~/composables/useJsonLd'

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
    // P5: Organization + WebSite/SearchAction graph (single source: useJsonLd).
    jsonLdScript(orgWebsiteLd('https://getfortrip.com')),
  ]
})

onMounted(() => {
  // initAuth restores the session from the HttpOnly cookie jar via /auth/me (clears local state on 401).
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
    <MarketingPopup v-if="!showOnboarding" />
    <ToastHost />
  </div>
</template>
