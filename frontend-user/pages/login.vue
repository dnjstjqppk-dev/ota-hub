<script setup lang="ts">
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '~/stores/auth'
import { useApiUrl } from '~/composables/useApi'
import { BRAND } from '~/config/brand'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()

const email = ref('')
const password = ref('')
const errorMessage = ref('')
const isSubmitting = ref(false)

const rawRedirect = (route.query.redirect as string) || ''
// Only same-site relative paths (prevents open redirect via ?redirect=//evil.com).
useHead({ title: '로그인', meta: [{ name: 'robots', content: 'noindex' }] })
const redirectPath = rawRedirect.startsWith('/') && !rawRedirect.startsWith('//') ? rawRedirect : '/my'

const handleLogin = async () => {
  if (!email.value || !password.value) {
    errorMessage.value = '이메일과 비밀번호를 모두 입력해 주세요.'
    return
  }

  isSubmitting.value = true
  errorMessage.value = ''

  try {
    const loginUrl = useApiUrl('/auth/login')
    const res = await $fetch<{
      success: boolean
      token: string
      user: {
        id: string
        email: string
        fullName: string
        tier: string
        tripCoins: number
        avatarUrl?: string
      }
    }>(loginUrl, {
      method: 'POST',
      body: {
        email: email.value,
        password: password.value
      }
    })

    if (res && res.success && res.user) {
      authStore.login(res.user, res.token)
      router.push(redirectPath)
    } else {
      throw new Error('로그인 응답 형식이 올바르지 않습니다.')
    }
  } catch (err: any) {
    // If backend returns 401 or network error
    const detail = err?.data?.error || err?.message || '로그인에 실패했습니다. 이메일과 비밀번호를 확인해주세요.'
    errorMessage.value = detail
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <AuthCard title="로그인" subtitle="예약 내역과 쿠폰은 로그인 후 확인할 수 있어요.">
    <form class="space-y-4" novalidate @submit.prevent="handleLogin">
      <label class="block"><span class="field-label">이메일</span><input v-model="email" type="email" autocomplete="email" required class="w-full rounded-xl border border-line bg-surface px-3.5 py-3 text-sm text-ink placeholder:text-ink-subtle focus:border-primary focus:outline-none focus:shadow-focus" placeholder="name@example.com" /></label>
      <label class="block"><span class="field-label">비밀번호</span><input v-model="password" type="password" autocomplete="current-password" required class="w-full rounded-xl border border-line bg-surface px-3.5 py-3 text-sm text-ink placeholder:text-ink-subtle focus:border-primary focus:outline-none focus:shadow-focus" /></label>
      <div class="flex justify-end text-sm"><NuxtLink to="/forgot-password" class="font-semibold text-primary hover:underline">비밀번호를 잊으셨나요?</NuxtLink></div>
      <p v-if="errorMessage" class="flex items-start gap-2 rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm font-medium text-danger" role="alert"><AppIcon name="close" :size="16" class="mt-0.5" />{{ errorMessage }}</p>
      <button type="submit" :disabled="isSubmitting" class="btn-primary w-full py-3 text-base">{{ isSubmitting ? '로그인 중…' : '로그인' }}</button>
    </form>
    <p class="mt-6 text-center text-sm text-ink-muted">아직 회원이 아니신가요? <NuxtLink :to="{ path: '/register', query: route.query.redirect ? { redirect: route.query.redirect } : {} }" class="font-semibold text-primary hover:underline">회원가입</NuxtLink></p>
    <p class="mt-6 border-t border-line pt-5 text-center text-xs text-ink-subtle">공급사·제휴 파트너는 <a :href="BRAND.partnerConsoleUrl" class="font-semibold text-ink-muted hover:text-primary">파트너 콘솔</a>에서 로그인해 주세요.</p>
  </AuthCard>
</template>
