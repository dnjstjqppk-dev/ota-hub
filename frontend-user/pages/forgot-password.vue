<!-- frontend-user/pages/forgot-password.vue -->
<script setup lang="ts">
import { ref } from 'vue'
import { useApiUrl } from '~/composables/useApi'
import { BRAND } from '~/config/brand'

useHead({ title: '비밀번호 찾기', meta: [{ name: 'robots', content: 'noindex' }] })

const email = ref('')
const isSubmitted = ref(false)
const isSubmitting = ref(false)
const message = ref('')
const errorMessage = ref('')
/** Server-reported delivery state; NOT_CONFIGURED means no email can be sent yet. */
const emailDelivery = ref('')

const handleRequestReset = async () => {
  if (!email.value || !email.value.includes('@')) {
    errorMessage.value = '가입하신 이메일 주소를 정확히 입력해 주세요.'
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
    message.value = data.message || '요청을 접수했어요.'
    isSubmitted.value = true
  } catch (e: any) {
    errorMessage.value = '요청 처리 중 오류가 발생했습니다.'
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <AuthCard title="비밀번호 찾기" subtitle="가입한 이메일을 입력해 주세요." icon="lock">
    <div v-if="isSubmitted" class="space-y-4 text-center">
      <p :class="['rounded-2xl px-4 py-3 text-sm', emailDelivery === 'NOT_CONFIGURED' ? 'bg-warning-soft text-ink' : 'bg-success-soft text-success']" role="status">{{ message }}</p>
      <a v-if="emailDelivery === 'NOT_CONFIGURED'" :href="'mailto:' + BRAND.supportEmail" class="btn-secondary w-full"><AppIcon name="mail" :size="16" />{{ BRAND.supportEmail }}</a>
      <NuxtLink to="/login" class="btn-primary w-full">로그인으로 돌아가기</NuxtLink>
    </div>
    <form v-else class="space-y-4" novalidate @submit.prevent="handleRequestReset">
      <label class="block"><span class="field-label">이메일</span><input v-model="email" type="email" autocomplete="email" required class="w-full rounded-xl border border-line bg-surface px-3.5 py-3 text-sm text-ink placeholder:text-ink-subtle focus:border-primary focus:outline-none focus:shadow-focus" placeholder="name@example.com" /></label>
      <p v-if="errorMessage" class="flex items-start gap-2 rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm font-medium text-danger" role="alert"><AppIcon name="close" :size="16" class="mt-0.5" />{{ errorMessage }}</p>
      <button type="submit" :disabled="isSubmitting" class="btn-primary w-full py-3 text-base">{{ isSubmitting ? '요청 중…' : '재설정 요청' }}</button>
      <p class="text-center text-sm"><NuxtLink to="/login" class="font-semibold text-primary hover:underline">로그인으로 돌아가기</NuxtLink></p>
    </form>
  </AuthCard>
</template>
