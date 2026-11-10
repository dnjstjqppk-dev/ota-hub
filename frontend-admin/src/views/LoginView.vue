<script setup lang="ts">
/** Admin sign-in (#35: dedicated /admin/login jar + memory token, never localStorage). Admits only ADMIN accounts. */
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { apiUrl } from '../config/api'
import { saveSession } from '../composables/session'

const router = useRouter()
const route = useRoute()
const email = ref('')
const password = ref('')
const show = ref(false)
const busy = ref(false)
const error = ref('')

async function submit() {
  error.value = ''
  if (!email.value.trim() || !password.value) { error.value = '이메일과 비밀번호를 입력해 주세요.'; return }
  busy.value = true
  try {
    const res = await fetch(apiUrl('/admin/login'), {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.value.trim(), password: password.value })
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.token || !data.user) { error.value = data.error || '이메일 또는 비밀번호가 올바르지 않아요.'; return }
    if (data.user.role !== 'ADMIN') { error.value = '관리자 권한이 없는 계정이에요.'; return }
    saveSession(data.token, { id: data.user.id, name: data.user.fullName || '', email: data.user.email, role: data.user.role })
    const to = typeof route.query.redirect === 'string' && route.query.redirect.startsWith('/') && !route.query.redirect.startsWith('//') ? route.query.redirect : '/dashboard'
    router.replace(to)
  } catch {
    error.value = '서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-gradient-to-b from-sapphire-50 to-canvas px-4 py-10 dark:from-midnight-900">
    <div class="w-full max-w-sm">
      <div class="mb-6 flex items-center justify-center gap-2.5">
        <img src="/symbol.svg" alt="" class="h-9 w-9" />
        <span class="text-xl font-extrabold tracking-tight text-ink">getfor<span class="text-primary">trip</span></span>
        <span class="rounded-md bg-primary-soft px-1.5 py-0.5 text-2xs font-bold text-primary">관리자</span>
      </div>
      <form class="card space-y-4 p-6 shadow-card" novalidate @submit.prevent="submit">
        <h1 class="text-lg font-bold text-ink">관리자 로그인</h1>
        <div>
          <label for="login-email" class="label">이메일</label>
          <input id="login-email" v-model="email" type="email" autocomplete="username" class="input" required />
        </div>
        <div>
          <label for="login-pw" class="label">비밀번호</label>
          <div class="relative">
            <input id="login-pw" v-model="password" :type="show ? 'text' : 'password'" autocomplete="current-password" class="input pr-10" required />
            <button type="button" class="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-ink-subtle hover:text-ink" :aria-label="show ? '비밀번호 숨기기' : '비밀번호 보기'" @click="show = !show"><AppIcon :name="show ? 'eye-off' : 'eye'" :size="16" /></button>
          </div>
        </div>
        <p v-if="error" class="rounded-field bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">{{ error }}</p>
        <button type="submit" class="btn-primary w-full" :disabled="busy">{{ busy ? '확인 중…' : '로그인' }}</button>
        <p class="text-center text-2xs text-ink-subtle">관리자 계정만 접속할 수 있어요. 모든 변경 작업은 감사 로그에 기록돼요.</p>
      </form>
    </div>
  </div>
</template>
