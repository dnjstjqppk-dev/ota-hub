<script setup lang="ts">
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '~/stores/auth'
import { useApiUrl } from '~/composables/useApi'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()

const email = ref('')
const fullName = ref('')
const phoneNumber = ref('')
const password = ref('')
const passwordConfirm = ref('')
// Consent must be an affirmative action: never pre-ticked.
const agreeTerms = ref(false)
const agreePrivacy = ref(false)
const agreeMarketing = ref(false)

const errorMessage = ref('')
const successMessage = ref('')
const isSubmitting = ref(false)

const rawRedirect = (route.query.redirect as string) || ''
useHead({ title: '회원가입' })
const redirectPath = rawRedirect.startsWith('/') && !rawRedirect.startsWith('//') ? rawRedirect : '/my'

const handleRegister = async () => {
  if (!email.value || !password.value || !fullName.value) {
    errorMessage.value = '필수 입력 항목(이메일, 이름, 비밀번호)을 모두 입력해 주세요.'
    return
  }

  if (password.value.length < 10 || !/[A-Za-z]/.test(password.value) || !/\d/.test(password.value)) {
    errorMessage.value = '비밀번호는 영문과 숫자를 포함해 10자 이상이어야 합니다.'
    return
  }

  if (password.value !== passwordConfirm.value) {
    errorMessage.value = '비밀번호와 비밀번호 확인이 일치하지 않습니다.'
    return
  }

  if (!agreeTerms.value || !agreePrivacy.value) {
    errorMessage.value = '필수 항목(이용약관, 개인정보 수집·이용)에 동의해 주세요.'
    return
  }

  isSubmitting.value = true
  errorMessage.value = ''
  successMessage.value = ''

  try {
    const registerUrl = useApiUrl('/auth/register')
    const res = await $fetch<{
      success: boolean
      token: string
      user: {
        id: string
        email: string
        fullName: string
        tier: string
        tripCoins: number
      }
      message?: string
    }>(registerUrl, {
      method: 'POST',
      credentials: 'include', // accept the HttpOnly session jar (#35)
      body: {
        email: email.value,
        password: password.value,
        fullName: fullName.value,
        phoneNumber: phoneNumber.value,
        agreeTerms: agreeTerms.value,
        agreePrivacy: agreePrivacy.value,
        agreeMarketing: agreeMarketing.value
      }
    })

    if (res && res.success && res.user) {
      authStore.login(res.user, res.token)
      successMessage.value = res.message || '회원가입이 완료되었습니다! 잠시 후 이동합니다.'
      setTimeout(() => {
        router.push(redirectPath)
      }, 1000)
    }
  } catch (err: any) {
    const detail = err?.data?.error || err?.message || '회원가입 중 오류가 발생했습니다. 다시 시도해 주세요.'
    errorMessage.value = detail
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <AuthCard title="회원가입" subtitle="이메일로 가입하고 예약을 한곳에서 관리하세요.">
    <form class="space-y-4" novalidate @submit.prevent="handleRegister">
      <label class="block"><span class="field-label">이메일 (필수)</span><input v-model="email" type="email" autocomplete="email" required class="w-full rounded-xl border border-line bg-surface px-3.5 py-3 text-sm text-ink placeholder:text-ink-subtle focus:border-primary focus:outline-none focus:shadow-focus" placeholder="name@example.com" /></label>
      <label class="block"><span class="field-label">이름 (필수)</span><input v-model="fullName" autocomplete="name" required class="w-full rounded-xl border border-line bg-surface px-3.5 py-3 text-sm text-ink placeholder:text-ink-subtle focus:border-primary focus:outline-none focus:shadow-focus" /></label>
      <label class="block"><span class="field-label">휴대전화 (선택)</span><input v-model="phoneNumber" type="tel" autocomplete="tel" class="w-full rounded-xl border border-line bg-surface px-3.5 py-3 text-sm text-ink placeholder:text-ink-subtle focus:border-primary focus:outline-none focus:shadow-focus" placeholder="+82-10-0000-0000" /></label>
      <label class="block"><span class="field-label">비밀번호 (필수)</span><input v-model="password" type="password" autocomplete="new-password" required class="w-full rounded-xl border border-line bg-surface px-3.5 py-3 text-sm text-ink placeholder:text-ink-subtle focus:border-primary focus:outline-none focus:shadow-focus" /><span class="mt-1 block text-xs text-ink-subtle">영문과 숫자를 포함해 10자 이상</span></label>
      <label class="block"><span class="field-label">비밀번호 확인 (필수)</span><input v-model="passwordConfirm" type="password" autocomplete="new-password" required class="w-full rounded-xl border border-line bg-surface px-3.5 py-3 text-sm text-ink placeholder:text-ink-subtle focus:border-primary focus:outline-none focus:shadow-focus" /></label>
      <fieldset class="space-y-2 rounded-2xl bg-surface-sunken p-4 text-sm">
        <legend class="sr-only">약관 동의</legend>
        <label class="flex items-start gap-2.5"><input v-model="agreeTerms" type="checkbox" class="mt-0.5 h-4 w-4 accent-primary" /><span class="text-ink"><b>(필수)</b> <NuxtLink to="/terms" target="_blank" class="underline">이용약관</NuxtLink>에 동의합니다</span></label>
        <label class="flex items-start gap-2.5"><input v-model="agreePrivacy" type="checkbox" class="mt-0.5 h-4 w-4 accent-primary" /><span class="text-ink"><b>(필수)</b> <NuxtLink to="/privacy" target="_blank" class="underline">개인정보 수집·이용</NuxtLink>에 동의합니다</span></label>
        <label class="flex items-start gap-2.5"><input v-model="agreeMarketing" type="checkbox" class="mt-0.5 h-4 w-4 accent-primary" /><span class="text-ink-muted">(선택) 할인·이벤트 소식 받기</span></label>
      </fieldset>
      <p v-if="errorMessage" class="flex items-start gap-2 rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm font-medium text-danger" role="alert"><AppIcon name="close" :size="16" class="mt-0.5" />{{ errorMessage }}</p>
      <p v-if="successMessage" class="flex items-start gap-2 rounded-xl bg-success-soft px-3.5 py-2.5 text-sm font-medium text-success" role="status"><AppIcon name="check" :size="16" class="mt-0.5" />{{ successMessage }}</p>
      <button type="submit" :disabled="isSubmitting" class="btn-primary w-full py-3 text-base">{{ isSubmitting ? '가입 중…' : '가입하기' }}</button>
    </form>
    <p class="mt-6 text-center text-sm text-ink-muted">이미 계정이 있으신가요? <NuxtLink :to="{ path: '/login', query: route.query.redirect ? { redirect: route.query.redirect } : {} }" class="font-semibold text-primary hover:underline">로그인</NuxtLink></p>
  </AuthCard>
</template>
