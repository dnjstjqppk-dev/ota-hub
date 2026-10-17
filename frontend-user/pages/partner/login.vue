<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { usePartnerStore } from '~/stores/partner'

const router = useRouter()
const partnerStore = usePartnerStore()

const email = ref('')
const password = ref('')
const rememberMe = ref(false)
const errorMessage = ref('')
const loading = ref(false)

const handleLogin = async () => {
  errorMessage.value = ''
  if (!email.value || !password.value) {
    errorMessage.value = '파트너 아이디(이메일)와 비밀번호를 모두 입력해 주세요.'
    return
  }

  loading.value = true
  try {
    const success = partnerStore.login(email.value, password.value)
    if (success) {
      router.push('/partner')
    } else {
      errorMessage.value = '아이디 또는 비밀번호가 일치하지 않습니다. 인가된 파트너 계정으로 로그인해 주세요.'
    }
  } catch (err) {
    errorMessage.value = '로그인 처리 중 시스템 오류가 발생했습니다.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="min-h-[85vh] bg-slate-900 flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden">
    <!-- 배경 은은한 데코 -->
    <div class="absolute -top-40 -left-40 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none"></div>
    <div class="absolute -bottom-40 -right-40 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none"></div>

    <div class="sm:mx-auto sm:w-full sm:max-w-md relative z-10 text-center">
      <NuxtLink to="/" class="inline-flex items-center gap-2 mb-4" title="getfortrip 홈으로">
        <img src="/logo-white.svg" alt="getfortrip" class="h-9 w-auto" />
      </NuxtLink>
      <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-400/20 text-blue-400 text-xs font-bold mb-3">
        <span>🏢</span>
        <span>getfortrip B2B Partner Hub</span>
      </div>
      <h2 class="text-2xl font-black text-white tracking-tight">파트너사 비즈니스 센터 로그인</h2>
      <p class="mt-2 text-xs text-slate-400">호텔, 항공, 렌터카, 투어 공급사 및 현지 제휴사를 위한 통합 관리 포털</p>
    </div>

    <div class="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10">
      <div class="bg-slate-800/90 border border-slate-700/80 backdrop-blur-xl py-8 px-6 shadow-2xl rounded-3xl sm:px-10">
        <!-- 오류 메시지 -->
        <div v-if="errorMessage" class="mb-5 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-bold flex items-center gap-2">
          <span>⚠️</span>
          <span>{{ errorMessage }}</span>
        </div>

        <form class="space-y-5" @submit.prevent="handleLogin">
          <div>
            <label class="block text-xs font-bold text-slate-300 mb-1.5">파트너 아이디 (이메일)</label>
            <div class="relative">
              <input
                v-model="email"
                type="email"
                required
                autocomplete="username"
                placeholder="partner@company.getfortrip.com"
                class="w-full px-4 py-3 bg-slate-900/80 border border-slate-700 text-white placeholder-slate-500 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
              />
            </div>
          </div>

          <div>
            <div class="flex items-center justify-between mb-1.5">
              <label class="block text-xs font-bold text-slate-300">비밀번호</label>
              <a href="#" class="text-[11px] text-blue-400 hover:text-blue-300 font-medium">비밀번호 재설정</a>
            </div>
            <div class="relative">
              <input
                v-model="password"
                type="password"
                required
                autocomplete="current-password"
                placeholder="••••••••"
                class="w-full px-4 py-3 bg-slate-900/80 border border-slate-700 text-white placeholder-slate-500 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
              />
            </div>
          </div>

          <div class="flex items-center justify-between">
            <label class="flex items-center gap-2 cursor-pointer">
              <input v-model="rememberMe" type="checkbox" class="w-4 h-4 rounded text-blue-600 bg-slate-900 border-slate-700 focus:ring-blue-500 focus:ring-offset-slate-800" />
              <span class="text-xs text-slate-400 font-medium">로그인 정보 기억하기</span>
            </label>
            <span class="text-[11px] text-slate-500 font-mono">TLS 256-bit 보안</span>
          </div>

          <button
            type="submit"
            :disabled="loading"
            class="w-full flex justify-center py-3.5 px-4 rounded-xl shadow-lg text-xs font-black text-white bg-blue-600 hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition disabled:opacity-50"
          >
            <span v-if="loading">인증 확인 중...</span>
            <span v-else>파트너 센터 입장하기</span>
          </button>
        </form>

        <!-- 데모 파트너 간편 계정 선택기 -->
        <!-- B2B 공급사 입점 및 보안 안내 -->
        <div class="mt-8 pt-6 border-t border-slate-700/80 space-y-3">
          <div class="bg-slate-900/60 p-4 rounded-2xl border border-slate-700/60 text-left space-y-1.5">
            <div class="text-[11px] font-bold text-slate-300 flex items-center gap-1.5">
              <span>🛡️</span>
              <span>파트너 보안 및 인증 안내</span>
            </div>
            <p class="text-[11px] text-slate-400 leading-relaxed">
              getfortrip 파트너 콘솔은 사업자등록 및 공급 계약이 승인된 파트너사 전용 시스템입니다. 미인가 접근은 관련 법령에 의해 엄격히 제한됩니다.
            </p>
          </div>

          <div class="flex items-center justify-between text-xs pt-1">
            <NuxtLink to="/partner/api-docs" class="text-blue-400 hover:text-blue-300 font-bold transition">
              OpenAPI 명세서 보기 →
            </NuxtLink>
            <a href="mailto:partner@getfortrip.com" class="text-slate-400 hover:text-white transition">
              입점 신청 문의
            </a>
          </div>
        </div>

        <div class="mt-6 text-center text-xs text-slate-500">
          신규 공급사 입점 문의: <a href="mailto:partner@getfortrip.com" class="text-blue-400 font-bold hover:underline">partner@getfortrip.com</a>
        </div>
      </div>
    </div>
  </div>
</template>

