<script setup lang="ts">
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '~/stores/auth'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()

const email = ref('')
const password = ref('')
const rememberMe = ref(true)
const errorMessage = ref('')
const isSubmitting = ref(false)

const redirectPath = (route.query.redirect as string) || '/my'

const handleLogin = async () => {
  if (!email.value || !password.value) {
    errorMessage.value = '이메일과 비밀번호를 모두 입력해 주세요.'
    return
  }

  isSubmitting.value = true
  errorMessage.value = ''

  // Simulate authentication
  setTimeout(() => {
    authStore.login({
      id: 'usr_' + Math.random().toString(36).substring(2, 9),
      email: email.value,
      fullName: email.value.split('@')[0] || '여행회원',
      tier: 'SILVER',
      tripCoins: 1000,
      avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200'
    })
    isSubmitting.value = false
    router.push(redirectPath)
  }, 400)
}

const handleDemoLogin = () => {
  authStore.loginAsDemo()
  router.push(redirectPath)
}
</script>

<template>
  <div class="min-h-[80vh] flex items-center justify-center px-4 py-12">
    <div class="max-w-md w-full space-y-8 bg-white p-8 sm:p-10 rounded-3xl border border-slate-200/90 shadow-xl">
      <!-- 로고 및 안내 -->
      <div class="text-center space-y-2">
        <NuxtLink to="/" class="inline-block">
          <img src="/logo.svg" alt="getfortrip" class="h-9 w-auto mx-auto object-contain" />
        </NuxtLink>
        <h1 class="text-2xl font-black text-slate-900 pt-2">반갑습니다!</h1>
        <p class="text-xs text-slate-500">getforTrip 계정으로 로그인하여 특가 혜택과 예약을 확인하세요.</p>
      </div>

      <!-- 로그인 폼 -->
      <form @submit.prevent="handleLogin" class="space-y-4 text-xs">
        <div v-if="errorMessage" class="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-600 font-bold text-center">
          {{ errorMessage }}
        </div>

        <div>
          <label class="block font-bold text-slate-700 mb-1">이메일 주소</label>
          <input
            v-model="email"
            type="email"
            placeholder="example@getfortrip.com"
            required
            class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-trip-blue focus:bg-white transition"
          />
        </div>

        <div>
          <div class="flex items-center justify-between mb-1">
            <label class="block font-bold text-slate-700">비밀번호</label>
            <a href="#" class="text-[11px] font-bold text-trip-blue hover:underline">비밀번호 찾기</a>
          </div>
          <input
            v-model="password"
            type="password"
            placeholder="비밀번호 8자리 이상"
            required
            class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-trip-blue focus:bg-white transition"
          />
        </div>

        <div class="flex items-center justify-between pt-1">
          <label class="flex items-center gap-2 cursor-pointer">
            <input v-model="rememberMe" type="checkbox" class="w-4 h-4 rounded text-trip-blue" />
            <span class="text-slate-600 font-medium">로그인 상태 유지</span>
          </label>
        </div>

        <button
          type="submit"
          :disabled="isSubmitting"
          class="w-full py-3.5 bg-trip-blue hover:bg-blue-600 text-white font-black rounded-xl text-sm shadow-md transition disabled:opacity-50"
        >
          {{ isSubmitting ? '로그인 처리 중...' : '로그인' }}
        </button>
      </form>

      <!-- 구분선 -->
      <div class="relative flex items-center justify-center my-4">
        <div class="border-t border-slate-200 w-full"></div>
        <span class="bg-white px-3 text-[11px] font-bold text-slate-400 absolute">또는 간편 로그인</span>
      </div>

      <!-- 간편 데모 로그인 & B2B 바로가기 -->
      <div class="space-y-3">
        <button
          @click="handleDemoLogin"
          class="w-full py-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-black rounded-xl text-xs shadow-sm transition flex items-center justify-center gap-2"
        >
          <span>👑</span>
          <span>VIP 체험 계정으로 1초 로그인 (데모)</span>
        </button>

        <div class="pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <span>공급사 및 제휴 파트너이신가요?</span>
          <NuxtLink to="/partner/login" class="font-bold text-trip-blue hover:underline">
            파트너 센터 로그인 ›
          </NuxtLink>
        </div>
      </div>
    </div>
  </div>
</template>
