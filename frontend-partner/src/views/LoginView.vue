<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { apiUrl } from '../config/api'

const router = useRouter()
const email = ref('hotel_partner@getfortrip.com')
const password = ref('Partner2026!SecureKey')
const rememberMe = ref(true)
const loading = ref(false)
const errorMessage = ref('')

const handleLogin = async () => {
  errorMessage.value = ''
  loading.value = true
  try {
    const res = await fetch(apiUrl('/partner/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: email.value.trim().toLowerCase(),
        password: password.value
      })
    })

    const data = await res.json()
    if (!res.ok) {
      throw new Error(data.error || '로그인에 실패했습니다.')
    }

    localStorage.setItem('getfortrip_partner_token', data.token)
    localStorage.setItem('getfortrip_partner_info', JSON.stringify(data.partner))

    // Set partner cookie for edge authorization
    document.cookie = `getfortrip_partner_jwt=${data.token}; path=/; max-age=86400; SameSite=Lax`

    router.push('/dashboard')
  } catch (err: any) {
    errorMessage.value = err.message || '로그인 중 오류가 발생했습니다.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-slate-900 flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans">
    <div class="sm:mx-auto sm:w-full sm:max-w-md text-center space-y-3">
      <div class="inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-cyan-400 text-xs font-bold">
        <span>🏢</span>
        <span>GetForTrip Supplier Extranet</span>
      </div>
      <h1 class="text-3xl font-black text-white tracking-tight flex items-center justify-center gap-2">
        <span>getfor<span class="text-blue-500">trip</span></span>
        <span class="text-xs uppercase bg-blue-600 text-white px-2 py-0.5 rounded font-black">Partner</span>
      </h1>
      <p class="text-sm text-slate-400 font-medium">
        글로벌 호텔, 모빌리티, 투어 공급사 전용 익스트라넷 콘솔
      </p>
    </div>

    <div class="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
      <div class="bg-white py-8 px-6 shadow-2xl rounded-3xl sm:px-10 border border-slate-100 space-y-6">
        <form @submit.prevent="handleLogin" class="space-y-4">
          <div v-if="errorMessage" class="p-3.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl text-xs font-bold flex items-center gap-2">
            <span>⚠️</span>
            <span>{{ errorMessage }}</span>
          </div>

          <div class="space-y-1">
            <label class="block text-xs font-bold text-slate-700">파트너 이메일 계정</label>
            <input
              v-model="email"
              type="email"
              required
              class="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="partner@company.com"
            />
          </div>

          <div class="space-y-1">
            <label class="block text-xs font-bold text-slate-700">비밀번호</label>
            <input
              v-model="password"
              type="password"
              required
              class="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="••••••••"
            />
          </div>

          <div class="flex items-center justify-between text-xs">
            <label class="flex items-center gap-2 cursor-pointer text-slate-600">
              <input type="checkbox" v-model="rememberMe" class="rounded text-blue-600" />
              <span>로그인 유지</span>
            </label>
            <router-link to="/register" class="text-blue-600 font-bold hover:underline">
              입점 신청하기 →
            </router-link>
          </div>

          <button
            type="submit"
            :disabled="loading"
            class="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs rounded-xl shadow-lg shadow-blue-500/25 transition flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <span v-if="loading">로그인 인증 중...</span>
            <span v-else>익스트라넷 콘솔 로그인</span>
          </button>
        </form>

        <!-- Test credentials hint -->
        <div class="p-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl text-[11px] text-slate-600 space-y-1.5">
          <div class="font-bold text-slate-800 flex items-center gap-1.5">
            <span>🔑</span>
            <span>테스트 파트너 계정</span>
          </div>
          <div class="font-mono text-slate-500 space-y-0.5">
            <div>호텔: <code class="bg-white px-1 py-0.5 rounded border">hotel_partner@getfortrip.com</code></div>
            <div>렌터카: <code class="bg-white px-1 py-0.5 rounded border">car_partner@getfortrip.com</code></div>
            <div>비밀번호: <code class="bg-white px-1 py-0.5 rounded border font-bold">Partner2026!SecureKey</code></div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
