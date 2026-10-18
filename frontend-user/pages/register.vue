<script setup lang="ts">
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '~/stores/auth'
import { useApiUrl } from '~/composables/useApi'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()

const email = ref('')
const fullName = ref('')
const phoneNumber = ref('')
const password = ref('')
const passwordConfirm = ref('')
const agreeTerms = ref(true)
const agreeMarketing = ref(false)

const errorMessage = ref('')
const successMessage = ref('')
const isSubmitting = ref(false)

const redirectPath = (route.query.redirect as string) || '/my'

const handleRegister = async () => {
  if (!email.value || !password.value || !fullName.value) {
    errorMessage.value = '필수 입력 항목(이메일, 이름, 비밀번호)을 모두 입력해 주세요.'
    return
  }

  if (password.value.length < 8) {
    errorMessage.value = '비밀번호는 최소 8자 이상이어야 합니다.'
    return
  }

  if (password.value !== passwordConfirm.value) {
    errorMessage.value = '비밀번호와 비밀번호 확인이 일치하지 않습니다.'
    return
  }

  if (!agreeTerms.value) {
    errorMessage.value = '이용약관 및 개인정보 처리방침에 동의해 주세요.'
    return
  }

  isSubmitting.value = true
  errorMessage.value = ''
  successMessage.value = ''

  try {
    const registerUrl = useApiUrl('/auth/register')
    const res = await $fetch<{
      success: boolean
      token: string
      user: {
        id: string
        email: string
        fullName: string
        tier: string
        tripCoins: number
      }
      message?: string
    }>(registerUrl, {
      method: 'POST',
      body: {
        email: email.value,
        password: password.value,
        fullName: fullName.value,
        phoneNumber: phoneNumber.value
      }
    })

    if (res && res.success && res.user) {
      authStore.login(res.user, res.token)
      successMessage.value = res.message || '회원가입이 완료되었습니다! 잠시 후 이동합니다.'
      setTimeout(() => {
        router.push(redirectPath)
      }, 1000)
    }
  } catch (err: any) {
    const detail = err?.data?.error || err?.message || '회원가입 중 오류가 발생했습니다. 다시 시도해 주세요.'
    errorMessage.value = detail
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <div class="min-h-[85vh] flex items-center justify-center px-4 py-12">
    <div class="max-w-md w-full space-y-6 bg-white p-8 sm:p-10 rounded-3xl border border-slate-200/90 shadow-xl">
      <!-- 헤더 -->
      <div class="text-center space-y-2">
        <NuxtLink to="/" class="inline-block">
          <img src="/logo.svg" alt="getfortrip" class="h-9 w-auto mx-auto object-contain" />
        </NuxtLink>
        <h1 class="text-2xl font-black text-slate-900 pt-2">새 계정 만들기</h1>
        <p class="text-xs text-slate-500">getforTrip에 가입하고 전 세계 최저가 특가와 5,000 코인 혜택을 받으세요.</p>
      </div>

      <!-- 에러 / 성공 메시지 -->
      <div v-if="errorMessage" class="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-600 font-bold text-xs text-center">
        {{ errorMessage }}
      </div>
      <div v-if="successMessage" class="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 font-bold text-xs text-center">
        {{ successMessage }}
      </div>

      <!-- 가입 폼 -->
      <form @submit.prevent="handleRegister" class="space-y-4 text-xs">
        <div>
          <label class="block font-bold text-slate-700 mb-1">이메일 주소 <span class="text-rose-500">*</span></label>
          <input
            v-model="email"
            type="email"
            placeholder="example@getfortrip.com"
            required
            class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-trip-blue focus:bg-white transition"
          />
        </div>

        <div>
          <label class="block font-bold text-slate-700 mb-1">이름(실명) <span class="text-rose-500">*</span></label>
          <input
            v-model="fullName"
            type="text"
            placeholder="홍길동 (예약자명 일치)"
            required
            class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-trip-blue focus:bg-white transition"
          />
        </div>

        <div>
          <label class="block font-bold text-slate-700 mb-1">휴대폰 번호 (선택)</label>
          <input
            v-model="phoneNumber"
            type="tel"
            placeholder="010-1234-5678"
            class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-trip-blue focus:bg-white transition"
          />
        </div>

        <div>
          <label class="block font-bold text-slate-700 mb-1">비밀번호 <span class="text-rose-500">*</span></label>
          <input
            v-model="password"
            type="password"
            placeholder="8자 이상 영문, 숫자 조합"
            required
            class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-trip-blue focus:bg-white transition"
          />
        </div>

        <div>
          <label class="block font-bold text-slate-700 mb-1">비밀번호 확인 <span class="text-rose-500">*</span></label>
          <input
            v-model="passwordConfirm"
            type="password"
            placeholder="비밀번호 다시 입력"
            required
            class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-trip-blue focus:bg-white transition"
          />
        </div>

        <!-- 약관 동의 -->
        <div class="space-y-2 pt-2 border-t border-slate-100">
          <label class="flex items-start gap-2 cursor-pointer">
            <input v-model="agreeTerms" type="checkbox" required class="mt-0.5 w-4 h-4 rounded text-trip-blue" />
            <span class="text-slate-600 font-medium leading-relaxed">
              [필수] <NuxtLink to="/terms" target="_blank" class="text-trip-blue underline">이용약관</NuxtLink> 및 
              <NuxtLink to="/privacy" target="_blank" class="text-trip-blue underline">개인정보 수집·이용</NuxtLink>에 동의합니다.
            </span>
          </label>
          <label class="flex items-start gap-2 cursor-pointer">
            <input v-model="agreeMarketing" type="checkbox" class="mt-0.5 w-4 h-4 rounded text-trip-blue" />
            <span class="text-slate-500 font-medium leading-relaxed">
              [선택] 특가 항공권 및 할인 쿠폰 마케팅 알림 수신에 동의합니다.
            </span>
          </label>
        </div>

        <button
          type="submit"
          :disabled="isSubmitting"
          class="w-full py-3.5 px-4 bg-trip-blue hover:bg-blue-600 active:scale-[0.99] text-white font-black rounded-xl shadow-lg shadow-blue-500/25 transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
        >
          <span v-if="!isSubmitting">가입하고 5,000 코인 받기</span>
          <span v-else class="animate-pulse">가입 처리 중...</span>
        </button>
      </form>

      <!-- 로그인 링크 -->
      <div class="text-center pt-2 border-t border-slate-100 text-xs text-slate-500">
        이미 getforTrip 계정이 있으신가요? 
        <NuxtLink :to="{ path: '/login', query: route.query }" class="font-bold text-trip-blue hover:underline ml-1">
          로그인하기
        </NuxtLink>
      </div>
    </div>
  </div>
</template>
