<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { apiUrl } from '../config/api'

const router = useRouter()
// Demo credentials only in local development — never prefilled in production builds.
const isDev = import.meta.env.DEV === true
const email = ref(isDev ? 'hotel_partner@getfortrip.com' : '')
const password = ref(isDev ? 'Partner2026!SecureKey' : '')
const rememberMe = ref(true)
const loading = ref(false)
const errorMessage = ref('')

const handleLogin = async () => {
  errorMessage.value = ''
  loading.value = true
  try {
    const res = await fetch(apiUrl('/partner/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: email.value.trim().toLowerCase(),
        password: password.value
      })
    })

    const data = await res.json()
    if (!res.ok) {
      throw new Error(data.error || '로그인에 실패했습니다.')
    }

    const store = rememberMe.value ? localStorage : sessionStorage
    store.setItem('getfortrip_partner_token', data.token)
    store.setItem('getfortrip_partner_info', JSON.stringify(data.partner))

    // Set partner cookie for edge authorization
    document.cookie = `getfortrip_partner_jwt=${data.token}; path=/; max-age=86400; SameSite=Lax`

    // C1: PENDING owners finish onboarding (profile + docs) before they can
    // use the extranet; ACTIVE accounts go to the dashboard.
    const profileStatus = String(data.partner?.profileStatus || '').toUpperCase()
    if (profileStatus === 'PENDING_APPROVAL' || profileStatus === 'PENDING') {
      router.push({ path: '/profile', query: { onboarding: '1' } })
    } else {
      const redirect = typeof router.currentRoute.value.query.redirect === 'string'
        ? (router.currentRoute.value.query.redirect as string)
        : '/dashboard'
      router.push(redirect.startsWith('/') && !redirect.startsWith('//') ? redirect : '/dashboard')
    }
  } catch (err: any) {
    errorMessage.value = err.message || '로그인 중 오류가 발생했습니다.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="flex min-h-screen flex-col justify-center bg-midnight-900 py-12 font-sans sm:px-6 lg:px-8">
    <div class="space-y-3 text-center sm:mx-auto sm:w-full sm:max-w-md">
      <div class="inline-flex items-center gap-2 rounded-full border border-sapphire-500/30 bg-sapphire-500/10 px-4 py-1.5 text-xs font-bold text-horizon-300">
        <AppIcon name="building" :size="14" />
        <span>getfortrip Supplier Extranet</span>
      </div>
      <h1 class="flex items-center justify-center gap-2 text-3xl font-black tracking-tight text-white">
        <span>getfor<span class="text-sapphire-400">trip</span></span>
        <span class="rounded bg-primary px-2 py-0.5 text-xs font-black uppercase text-primary-ink">Partner</span>
      </h1>
      <p class="text-sm font-medium text-sapphire-300">
        글로벌 호텔, 모빌리티, 투어 공급사 전용 익스트라넷 콘솔
      </p>
    </div>

    <div class="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
      <div class="space-y-6 rounded-3xl border border-line bg-surface px-6 py-8 shadow-pop sm:px-10">
        <form class="space-y-4" @submit.prevent="handleLogin">
          <div v-if="errorMessage" class="flex items-center gap-2 rounded-2xl border border-danger/30 bg-danger-soft p-3.5 text-xs font-bold text-danger" role="alert">
            <AppIcon name="alert" :size="16" />
            <span>{{ errorMessage }}</span>
          </div>

          <div class="space-y-1">
            <label class="label" for="ptn-email">파트너 이메일 계정</label>
            <input
              id="ptn-email"
              v-model="email"
              type="email"
              required
              autocomplete="username"
              class="input !text-xs"
              placeholder="partner@company.com"
            />
          </div>

          <div class="space-y-1">
            <label class="label" for="ptn-password">비밀번호</label>
            <input
              id="ptn-password"
              v-model="password"
              type="password"
              required
              autocomplete="current-password"
              class="input !text-xs"
              placeholder="••••••••"
            />
          </div>

          <div class="flex items-center justify-between text-xs">
            <label class="flex cursor-pointer items-center gap-2 text-ink-muted">
              <input v-model="rememberMe" type="checkbox" class="h-4 w-4 rounded accent-primary" />
              <span>로그인 유지</span>
            </label>
            <span class="flex items-center gap-3">
              <router-link to="/forgot-password" class="font-bold text-ink-muted hover:text-primary hover:underline">
                비밀번호 찾기
              </router-link>
              <router-link to="/register" class="inline-flex items-center gap-1 font-bold text-primary hover:underline">
                입점 신청하기 <AppIcon name="arrow-right" :size="14" />
              </router-link>
            </span>
          </div>

          <button
            type="submit"
            :disabled="loading"
            class="btn-primary w-full !text-xs"
          >
            <span v-if="loading">로그인 인증 중...</span>
            <span v-else>익스트라넷 콘솔 로그인</span>
          </button>
        </form>

        <!-- Test credentials hint (local development only) -->
        <div v-if="isDev" class="space-y-1.5 rounded-2xl border border-line bg-surface-sunken p-3.5 text-[11px] text-ink-muted">
          <div class="flex items-center gap-1.5 font-bold text-ink">
            <AppIcon name="lock" :size="14" />
            <span>테스트 파트너 계정 (개발 전용)</span>
          </div>
          <div class="space-y-0.5 font-mono">
            <div>호텔: <code class="rounded border border-line bg-surface px-1 py-0.5">hotel_partner@getfortrip.com</code></div>
            <div>렌터카: <code class="rounded border border-line bg-surface px-1 py-0.5">car_partner@getfortrip.com</code></div>
            <div>비밀번호: <code class="rounded border border-line bg-surface px-1 py-0.5 font-bold">Partner2026!SecureKey</code></div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
