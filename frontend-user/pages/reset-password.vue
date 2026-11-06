<script setup lang="ts">
/**
 * Landing page for the emailed reset link: /reset-password?token=...
 * The token is read once, then removed from the address bar, and the page sends no Referer,
 * so it does not linger in history or leak to third parties.
 */
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { apiFetch } from '~/composables/useApi'

useHead({ title: '비밀번호 재설정', meta: [{ name: 'referrer', content: 'no-referrer' }, { name: 'robots', content: 'noindex' }] })

const route = useRoute()
const router = useRouter()
const token = ref('')
const pw = ref('')
const pw2 = ref('')
const busy = ref(false)
const error = ref('')
const done = ref(false)
const ready = ref(false)

// Mirrors the server policy (worker/src/routes/auth.ts validatePassword); the server stays authoritative.
const policyOk = computed(() => pw.value.length >= 10 && pw.value.length <= 128 && /[A-Za-z]/.test(pw.value) && /\d/.test(pw.value))
const match = computed(() => pw.value === pw2.value)

onMounted(() => {
  token.value = String(route.query.token || '')
  if (token.value) router.replace({ path: '/reset-password' })
  ready.value = true
})

async function submit() {
  error.value = ''
  if (!policyOk.value) { error.value = '비밀번호는 10자 이상이며 영문자와 숫자를 각각 1자 이상 포함해야 합니다.'; return }
  if (!match.value) { error.value = '비밀번호가 서로 일치하지 않습니다.'; return }
  busy.value = true
  const r = await apiFetch('/auth/reset-password', { method: 'POST', body: { token: token.value, newPassword: pw.value } })
  busy.value = false
  if (!r.ok) { error.value = r.data.error || '비밀번호를 재설정하지 못했습니다.'; return }
  token.value = ''
  pw.value = pw2.value = ''
  done.value = true
}
</script>

<template>
  <AuthCard title="새 비밀번호 설정" icon="lock">
    <div v-if="done" class="space-y-4 text-center">
      <p class="rounded-2xl bg-success-soft px-4 py-3 text-sm text-success" role="status">비밀번호를 바꿨어요. 새 비밀번호로 로그인해 주세요.</p>
      <NuxtLink to="/login" class="btn-primary w-full">로그인</NuxtLink>
    </div>
    <div v-else-if="ready && !token" class="space-y-4 text-center">
      <p class="rounded-2xl bg-warning-soft px-4 py-3 text-sm text-ink" role="alert">재설정 링크가 올바르지 않거나 만료되었어요. 다시 요청해 주세요.</p>
      <NuxtLink to="/forgot-password" class="btn-primary w-full">비밀번호 찾기</NuxtLink>
    </div>
    <form v-else-if="ready" class="space-y-4" novalidate @submit.prevent="submit">
      <label class="block"><span class="field-label">새 비밀번호</span><input v-model="pw" type="password" autocomplete="new-password" required class="w-full rounded-xl border border-line bg-surface px-3.5 py-3 text-sm text-ink placeholder:text-ink-subtle focus:border-primary focus:outline-none focus:shadow-focus" /><span :class="['mt-1 block text-xs', pw && !policyOk ? 'text-danger' : 'text-ink-subtle']">영문과 숫자를 포함해 10자 이상</span></label>
      <label class="block"><span class="field-label">새 비밀번호 확인</span><input v-model="pw2" type="password" autocomplete="new-password" required class="w-full rounded-xl border border-line bg-surface px-3.5 py-3 text-sm text-ink placeholder:text-ink-subtle focus:border-primary focus:outline-none focus:shadow-focus" /><span v-if="pw2 && !match" class="mt-1 block text-xs text-danger">비밀번호가 서로 달라요</span></label>
      <p v-if="error" class="flex items-start gap-2 rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm font-medium text-danger" role="alert"><AppIcon name="close" :size="16" class="mt-0.5" />{{ error }}</p>
      <button type="submit" :disabled="busy" class="btn-primary w-full py-3 text-base">{{ busy ? '변경 중…' : '비밀번호 변경' }}</button>
    </form>
  </AuthCard>
</template>
