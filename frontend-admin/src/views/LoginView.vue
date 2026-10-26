<script setup lang="ts">
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { apiUrl } from '../config/api'

const router = useRouter()
const route = useRoute()

const email = ref('')
const password = ref('')
const rememberMe = ref(true)
const showPassword = ref(false)
const isLoading = ref(false)
const errorMessage = ref('')

const handleLogin = async () => {
  if (!email.value || !password.value) {
    errorMessage.value = '관리자 아이디(이메일)와 비밀번호를 모두 입력해주세요.'
    return
  }

  isLoading.value = true
  errorMessage.value = ''

  try {
    const resp = await fetch(apiUrl('/admin/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.value.trim(), password: password.value })
    })

    const data = await resp.json().catch(() => ({}))

    if (!resp.ok || !data.token) {
      errorMessage.value = data.error || '등록되지 않은 관리자 계정이거나 비밀번호가 일치하지 않습니다.'
      return
    }

    const userRole = data.user?.role || data.admin?.role || ''
    if (userRole !== 'ADMIN' && userRole !== 'SUPER_ADMIN') {
      errorMessage.value = '관리자(ADMIN) 권한이 없는 계정입니다.'
      return
    }

    const adminInfo = data.admin || {
      id: data.user?.id || 'usr-admin-001',
      name: data.user?.fullName || '총괄 관리자',
      email: data.user?.email || email.value,
      role: 'ADMIN'
    }

    localStorage.setItem('getfortrip_admin_token', data.token)
    localStorage.setItem('getfortrip_admin_user', JSON.stringify(adminInfo))

    const redirectPath = (route.query.redirect as string) || '/dashboard'
    router.push(redirectPath)
  } catch (err: any) {
    errorMessage.value = err.message || '서버 인증 통신 중 오류가 발생했습니다.'
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-[#0b1a30] text-slate-100 p-4 sm:p-6 font-sans">
    <div class="absolute inset-0 overflow-hidden pointer-events-none">
      <div class="absolute -top-40 -right-40 w-96 h-96 bg-blue-600/20 rounded-full blur-3xl"></div>
      <div class="absolute -bottom-40 -left-40 w-96 h-96 bg-cyan-500/15 rounded-full blur-3xl"></div>
    </div>

    <div class="relative w-full max-w-md bg-slate-900/90 border border-slate-700/80 rounded-2xl shadow-2xl p-8 backdrop-blur-md">
      <div class="text-center mb-8">
        <div class="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-tr from-blue-600 to-cyan-500 shadow-lg shadow-blue-500/25 mb-4">
          <img src="/symbol.svg" alt="getfortrip" class="w-10 h-10 object-contain drop-shadow" />
        </div>
        <h1 class="text-2xl font-black tracking-tight text-white flex items-center justify-center gap-1.5">
          <span>getfor<span class="text-cyan-400">trip</span></span>
          <span class="text-[11px] uppercase font-bold bg-blue-500/20 text-cyan-300 px-2 py-0.5 rounded-full border border-cyan-500/30">Admin</span>
        </h1>
        <p class="text-sm text-slate-400 mt-1">글로벌 OTA 운영 콘솔 & 백오피스 (PBKDF2 RBAC 인증)</p>
      </div>

      <div v-if="errorMessage" class="mb-5 p-3.5 bg-rose-500/15 border border-rose-500/40 rounded-xl flex items-start gap-2.5 text-xs text-rose-300">
        <svg class="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <span>{{ errorMessage }}</span>
      </div>

      <form @submit.prevent="handleLogin" class="space-y-5">
        <div>
          <label class="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
            관리자 아이디 (이메일)
          </label>
          <input
            v-model="email"
            type="email"
            required
            autocomplete="username"
            placeholder="admin@getfortrip.com"
            class="w-full px-4 py-2.5 bg-slate-800/80 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
          />
        </div>

        <div>
          <label class="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
            비밀번호
          </label>
          <div class="relative">
            <input
              v-model="password"
              :type="showPassword ? 'text' : 'password'"
              required
              autocomplete="current-password"
              placeholder="••••••••"
              class="w-full px-4 pr-10 py-2.5 bg-slate-800/80 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all font-mono"
            />
            <button
              type="button"
              @click="showPassword = !showPassword"
              class="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-500 hover:text-slate-300 transition-colors"
            >
              <span class="text-xs">{{ showPassword ? '숨김' : '표시' }}</span>
            </button>
          </div>
        </div>

        <div class="flex items-center justify-between text-xs">
          <label class="flex items-center gap-2 cursor-pointer select-none text-slate-400 hover:text-slate-300">
            <input
              type="checkbox"
              v-model="rememberMe"
              class="w-4 h-4 rounded bg-slate-800 border-slate-700 text-blue-600 focus:ring-0 focus:ring-offset-0"
            />
            <span>로그인 상태 유지</span>
          </label>
          <span class="text-slate-500">보안 감사 로그 기록중</span>
        </div>

        <button
          type="submit"
          :disabled="isLoading"
          class="w-full py-3 px-4 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white font-bold text-sm rounded-xl shadow-lg shadow-blue-600/30 active:scale-[0.99] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <span>{{ isLoading ? 'PBKDF2 보안 인증 확인 중...' : '관리자 콘솔 로그인' }}</span>
        </button>
      </form>
    </div>
  </div>
</template>
