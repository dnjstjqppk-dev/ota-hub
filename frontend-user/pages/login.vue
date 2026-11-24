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

const { t } = useI18n()
const rawRedirect = (route.query.redirect as string) || ''
// Only same-site relative paths (prevents open redirect via ?redirect=//evil.com).
useHead({ title: t('auth.loginTitle'), meta: [{ name: 'robots', content: 'noindex' }] })
const redirectPath = rawRedirect.startsWith('/') && !rawRedirect.startsWith('//') ? rawRedirect : '/my'

const handleLogin = async () => {
  if (!email.value || !password.value) {
    errorMessage.value = t('auth.needBoth')
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
      credentials: 'include', // accept the HttpOnly session jar (#35)
      body: {
        email: email.value,
        password: password.value
      }
    })

    if (res && res.success && res.user) {
      authStore.login(res.user, res.token)
      router.push(redirectPath)
    } else {
      throw new Error(t('auth.badResponse'))
    }
  } catch (err: any) {
    // If backend returns 401 or network error
    const detail = err?.data?.error || err?.message || t('auth.loginFail')
    errorMessage.value = detail
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <AuthCard :title="$t('auth.loginTitle')" :subtitle="$t('auth.loginSub')">
    <form class="space-y-4" novalidate @submit.prevent="handleLogin">
      <label class="block"><span class="field-label">{{ $t('auth.email') }}</span><input v-model="email" type="email" autocomplete="email" required class="w-full rounded-xl border border-line bg-surface px-3.5 py-3 text-sm text-ink placeholder:text-ink-subtle focus:border-primary focus:outline-none focus:shadow-focus" placeholder="name@example.com" /></label>
      <label class="block"><span class="field-label">{{ $t('auth.password') }}</span><input v-model="password" type="password" autocomplete="current-password" required class="w-full rounded-xl border border-line bg-surface px-3.5 py-3 text-sm text-ink placeholder:text-ink-subtle focus:border-primary focus:outline-none focus:shadow-focus" /></label>
      <p v-if="route.query.changed === '1'" class="rounded-xl bg-success-soft px-3.5 py-2.5 text-sm font-medium text-success" role="status">{{ $t('auth.changedOk') }}</p>
      <div class="flex justify-end text-sm"><NuxtLink :to="$localePath('/forgot-password')" class="font-semibold text-primary hover:underline">{{ $t('auth.forgotQ') }}</NuxtLink></div>
      <p v-if="errorMessage" class="flex items-start gap-2 rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm font-medium text-danger" role="alert"><AppIcon name="close" :size="16" class="mt-0.5" />{{ errorMessage }}</p>
      <button type="submit" :disabled="isSubmitting" class="btn-primary w-full py-3 text-base">{{ isSubmitting ? $t('auth.loggingIn') : $t('auth.login') }}</button>
    </form>
    <SocialLoginButtons :redirect="redirectPath" />
    <p class="mt-6 text-center text-sm text-ink-muted">{{ $t('auth.noAccount') }} <NuxtLink :to="$localePath({ path: '/register', query: route.query.redirect ? { redirect: route.query.redirect } : {} })" class="font-semibold text-primary hover:underline">{{ $t('auth.register') }}</NuxtLink></p>
    <p class="mt-6 border-t border-line pt-5 text-center text-xs text-ink-subtle">{{ $t('auth.partnerPrefix') }} <a :href="BRAND.partnerConsoleUrl" class="font-semibold text-ink-muted hover:text-primary">{{ $t('auth.partnerConsole') }}</a>{{ $t('auth.partnerSuffix') }}</p>
  </AuthCard>
</template>
