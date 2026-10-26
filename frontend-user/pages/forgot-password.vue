<!-- frontend-user/pages/forgot-password.vue -->
<script setup lang="ts">
import { ref } from 'vue'
import { useApiUrl } from '~/composables/useApi'

const email = ref('')
const isSubmitted = ref(false)
const isSubmitting = ref(false)
const message = ref('')
const errorMessage = ref('')

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
    message.value = data.message || '입력하신 이메일로 비밀번호 재설정 안내 링크가 발송되었습니다.'
    isSubmitted.value = true
  } catch (e: any) {
    errorMessage.value = '요청 처리 중 오류가 발생했습니다.'
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <div class="min-h-[75vh] flex items-center justify-center px-4 py-12">
    <div class="max-w-md w-full bg-white p-8 sm:p-10 rounded-3xl border border-slate-200 shadow-xl space-y-6">
      <div class="text-center space-y-2">
        <NuxtLink to="/" class="inline-block">
          <img src="/logo.svg" alt="getfortrip" class="h-8 w-auto mx-auto" />
        </NuxtLink>
        <h1 class="text-2xl font-black text-slate-900 pt-2">비밀번호 찾기 및 재설정</h1>
        <p class="text-xs text-slate-500">가입하신 이메일 주소를 입력하시면 비밀번호 재설정 링크를 보내드립니다.</p>
      </div>

      <div v-if="isSubmitted" class="p-5 bg-emerald-50 border border-emerald-200 rounded-2xl text-center space-y-3">
        <div class="text-2xl">📧</div>
        <p class="text-xs font-bold text-emerald-800 leading-relaxed">{{ message }}</p>
        <NuxtLink to="/login" class="inline-block px-6 py-2.5 bg-trip-blue text-white text-xs font-black rounded-xl">
          로그인 화면으로 돌아가기
        </NuxtLink>
      </div>

      <form v-else @submit.prevent="handleRequestReset" class="space-y-4 text-xs">
        <div v-if="errorMessage" class="p-3 bg-rose-50 border border-rose-200 text-rose-600 rounded-xl font-bold text-center">
          {{ errorMessage }}
        </div>
        <div>
          <label class="block font-bold text-slate-700 mb-1">가입 이메일 주소</label>
          <input
            v-model="email"
            type="email"
            required
            placeholder="example@getfortrip.com"
            class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-medium"
          />
        </div>
        <button
          type="submit"
          :disabled="isSubmitting"
          class="w-full py-3.5 bg-trip-blue hover:bg-blue-600 text-white font-black rounded-xl text-sm shadow-md transition"
        >
          {{ isSubmitting ? '발송 처리 중...' : '재설정 링크 발송하기' }}
        </button>
        <div class="text-center pt-2">
          <NuxtLink to="/login" class="text-xs font-bold text-slate-500 hover:text-trip-blue">
            ← 로그인 화면으로 돌아가기
          </NuxtLink>
        </div>
      </form>
    </div>
  </div>
</template>
