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

const { t } = useI18n()
const rawRedirect = (route.query.redirect as string) || ''
useHead({ title: t('auth.regTitle') })
const redirectPath = rawRedirect.startsWith('/') && !rawRedirect.startsWith('//') ? rawRedirect : '/my'

const handleRegister = async () => {
  if (!email.value || !password.value || !fullName.value) {
    errorMessage.value = t('auth.regNeedFields')
    return
  }

  if (password.value.length < 10 || !/[A-Za-z]/.test(password.value) || !/\d/.test(password.value)) {
    errorMessage.value = t('auth.regPwRule')
    return
  }

  if (password.value !== passwordConfirm.value) {
    errorMessage.value = t('auth.regPwMismatch')
    return
  }

  if (!agreeTerms.value || !agreePrivacy.value) {
    errorMessage.value = t('auth.regNeedConsent')
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
      successMessage.value = res.message || t('auth.regDone')
      setTimeout(() => {
        router.push(redirectPath)
      }, 1000)
    }
  } catch (err: any) {
    const detail = err?.data?.error || err?.message || t('auth.regFail')
    errorMessage.value = detail
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <AuthCard :title="$t('auth.regTitle')" :subtitle="$t('auth.regSub')">
    <form class="space-y-4" novalidate @submit.prevent="handleRegister">
      <label class="block"><span class="field-label">{{ $t('auth.emailReq') }}</span><input v-model="email" type="email" autocomplete="email" required class="w-full rounded-xl border border-line bg-surface px-3.5 py-3 text-sm text-ink placeholder:text-ink-subtle focus:border-primary focus:outline-none focus:shadow-focus" placeholder="name@example.com" /></label>
      <label class="block"><span class="field-label">{{ $t('auth.nameReq') }}</span><input v-model="fullName" autocomplete="name" required class="w-full rounded-xl border border-line bg-surface px-3.5 py-3 text-sm text-ink placeholder:text-ink-subtle focus:border-primary focus:outline-none focus:shadow-focus" /></label>
      <label class="block"><span class="field-label">{{ $t('auth.phoneOpt') }}</span><input v-model="phoneNumber" type="tel" autocomplete="tel" class="w-full rounded-xl border border-line bg-surface px-3.5 py-3 text-sm text-ink placeholder:text-ink-subtle focus:border-primary focus:outline-none focus:shadow-focus" placeholder="+82-10-0000-0000" /></label>
      <label class="block"><span class="field-label">{{ $t('auth.pwReq') }}</span><input v-model="password" type="password" autocomplete="new-password" required class="w-full rounded-xl border border-line bg-surface px-3.5 py-3 text-sm text-ink placeholder:text-ink-subtle focus:border-primary focus:outline-none focus:shadow-focus" /><span class="mt-1 block text-xs text-ink-subtle">{{ $t('auth.pwHint') }}</span></label>
      <label class="block"><span class="field-label">{{ $t('auth.pwConfirmReq') }}</span><input v-model="passwordConfirm" type="password" autocomplete="new-password" required class="w-full rounded-xl border border-line bg-surface px-3.5 py-3 text-sm text-ink placeholder:text-ink-subtle focus:border-primary focus:outline-none focus:shadow-focus" /></label>
      <fieldset class="space-y-2 rounded-2xl bg-surface-sunken p-4 text-sm">
        <legend class="sr-only">{{ $t('auth.consentLegend') }}</legend>
        <label class="flex items-start gap-2.5"><input v-model="agreeTerms" type="checkbox" class="mt-0.5 h-4 w-4 accent-primary" /><span class="text-ink"><b>{{ $t('auth.req') }}</b> {{ $t('auth.agreePrefix') }}<NuxtLink :to="$localePath('/terms')" target="_blank" class="underline">{{ $t('auth.termsLink') }}</NuxtLink>{{ $t('auth.agreeSuffix') }}</span></label>
        <label class="flex items-start gap-2.5"><input v-model="agreePrivacy" type="checkbox" class="mt-0.5 h-4 w-4 accent-primary" /><span class="text-ink"><b>{{ $t('auth.req') }}</b> {{ $t('auth.agreePrefix') }}<NuxtLink :to="$localePath('/privacy')" target="_blank" class="underline">{{ $t('auth.privacyLink') }}</NuxtLink>{{ $t('auth.agreeSuffix') }}</span></label>
        <label class="flex items-start gap-2.5"><input v-model="agreeMarketing" type="checkbox" class="mt-0.5 h-4 w-4 accent-primary" /><span class="text-ink-muted">{{ $t('auth.opt') }} {{ $t('auth.marketingSub') }}</span></label>
      </fieldset>
      <p v-if="errorMessage" class="flex items-start gap-2 rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm font-medium text-danger" role="alert"><AppIcon name="close" :size="16" class="mt-0.5" />{{ errorMessage }}</p>
      <p v-if="successMessage" class="flex items-start gap-2 rounded-xl bg-success-soft px-3.5 py-2.5 text-sm font-medium text-success" role="status"><AppIcon name="check" :size="16" class="mt-0.5" />{{ successMessage }}</p>
      <button type="submit" :disabled="isSubmitting" class="btn-primary w-full py-3 text-base">{{ isSubmitting ? $t('auth.joining') : $t('auth.join') }}</button>
    </form>
    <SocialLoginButtons :redirect="redirectPath" />
    <p class="mt-6 text-center text-sm text-ink-muted">{{ $t('auth.haveAccount') }} <NuxtLink :to="$localePath({ path: '/login', query: route.query.redirect ? { redirect: route.query.redirect } : {} })" class="font-semibold text-primary hover:underline">{{ $t('auth.login') }}</NuxtLink></p>
  </AuthCard>
</template>
