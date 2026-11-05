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

// Mirrors the server policy (worker/src/routes/auth.ts validatePassword); the server stays authoritative.
const policyOk = computed(() => pw.value.length >= 10 && pw.value.length <= 128 && /[A-Za-z]/.test(pw.value) && /\d/.test(pw.value))
const match = computed(() => pw.value === pw2.value)

onMounted(() => {
  token.value = String(route.query.token || '')
  if (token.value) router.replace({ path: '/reset-password' })
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
  <div class="min-h-[70vh] flex items-center justify-center px-4 py-12">
    <div class="max-w-md w-full rounded-3xl border border-slate-200 bg-white p-8 shadow-sm" data-testid="reset-password">
      <h1 class="text-xl font-bold text-slate-900">비밀번호 재설정</h1>

      <div v-if="done" class="mt-4 space-y-4" role="status">
        <p class="text-sm text-slate-700">비밀번호가 변경되었습니다. 새 비밀번호로 로그인해주세요.</p>
        <NuxtLink to="/login" class="inline-block rounded-xl bg-trip-blue px-5 py-2.5 text-sm font-semibold text-white">로그인</NuxtLink>
      </div>

      <div v-else-if="!token" class="mt-4 space-y-4">
        <p class="text-sm text-slate-700">재설정 링크가 올바르지 않거나 이미 사용되었습니다.</p>
        <NuxtLink to="/forgot-password" class="inline-block rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white">재설정 메일 다시 받기</NuxtLink>
      </div>

      <form v-else class="mt-4 space-y-3" @submit.prevent="submit">
        <label class="block text-sm">
          <span class="block text-xs font-semibold text-slate-600 mb-1">새 비밀번호</span>
          <input v-model="pw" type="password" autocomplete="new-password" required class="w-full rounded-lg border border-slate-300 px-3 py-2" data-testid="new-password" />
        </label>
        <label class="block text-sm">
          <span class="block text-xs font-semibold text-slate-600 mb-1">새 비밀번호 확인</span>
          <input v-model="pw2" type="password" autocomplete="new-password" required class="w-full rounded-lg border border-slate-300 px-3 py-2" data-testid="new-password-confirm" />
        </label>
        <p class="text-xs" :class="policyOk ? 'text-emerald-700' : 'text-slate-500'">10자 이상, 영문자와 숫자 포함</p>
        <p v-if="error" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{{ error }}</p>
        <button type="submit" :disabled="busy" class="w-full rounded-xl bg-trip-blue px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50" data-testid="reset-submit">
          {{ busy ? '처리 중…' : '비밀번호 변경' }}
        </button>
      </form>
    </div>
  </div>
</template>
