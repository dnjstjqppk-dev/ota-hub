<!-- frontend-user/pages/forgot-password.vue -->
<script setup lang="ts">
import { ref } from 'vue'
import { useApiUrl } from '~/composables/useApi'
import { BRAND } from '~/config/brand'

const { t } = useI18n()
useHead({ title: t('auth.forgotTitle'), meta: [{ name: 'robots', content: 'noindex' }] })

const email = ref('')
const isSubmitted = ref(false)
const isSubmitting = ref(false)
const message = ref('')
const errorMessage = ref('')
/** Server-reported delivery state; NOT_CONFIGURED means no email can be sent yet. */
const emailDelivery = ref('')

const handleRequestReset = async () => {
  if (!email.value || !email.value.includes('@')) {
    errorMessage.value = t('auth.needEmail')
    return
  }
  isSubmitting.value = true
  errorMessage.value = ''
  try {
    const res = await fetch(useApiUrl('/auth/forgot-password'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.value })
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || String(res.status))
    emailDelivery.value = data.emailDelivery || ''
    message.value = data.message || t('auth.reqReceived')
    isSubmitted.value = true
  } catch (e: any) {
    errorMessage.value = t('auth.reqFail')
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <AuthCard :title="$t('auth.forgotTitle')" :subtitle="$t('auth.forgotSub')" icon="lock">
    <div v-if="isSubmitted" class="space-y-4 text-center">
      <p :class="['rounded-2xl px-4 py-3 text-sm', emailDelivery === 'NOT_CONFIGURED' ? 'bg-warning-soft text-ink' : 'bg-success-soft text-success']" role="status">{{ message }}</p>
      <a v-if="emailDelivery === 'NOT_CONFIGURED'" :href="'mailto:' + BRAND.supportEmail" class="btn-secondary w-full"><AppIcon name="mail" :size="16" />{{ BRAND.supportEmail }}</a>
      <NuxtLink :to="$localePath('/login')" class="btn-primary w-full">{{ $t('auth.backToLogin') }}</NuxtLink>
    </div>
    <form v-else class="space-y-4" novalidate @submit.prevent="handleRequestReset">
      <label class="block"><span class="field-label">{{ $t('auth.email') }}</span><input v-model="email" type="email" autocomplete="email" required class="w-full rounded-xl border border-line bg-surface px-3.5 py-3 text-sm text-ink placeholder:text-ink-subtle focus:border-primary focus:outline-none focus:shadow-focus" placeholder="name@example.com" /></label>
      <p v-if="errorMessage" class="flex items-start gap-2 rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm font-medium text-danger" role="alert"><AppIcon name="close" :size="16" class="mt-0.5" />{{ errorMessage }}</p>
      <button type="submit" :disabled="isSubmitting" class="btn-primary w-full py-3 text-base">{{ isSubmitting ? $t('auth.requesting') : $t('auth.reqReset') }}</button>
      <p class="text-center text-sm"><NuxtLink :to="$localePath('/login')" class="font-semibold text-primary hover:underline">{{ $t('auth.backToLogin') }}</NuxtLink></p>
    </form>
  </AuthCard>
</template>
