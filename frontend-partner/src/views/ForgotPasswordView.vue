<script setup lang="ts">
import { ref } from 'vue'
import { apiUrl } from '../config/api'

const email = ref('')
const loading = ref(false)
const message = ref('')
const errorMessage = ref('')

async function handleForgot() {
  loading.value = true
  message.value = ''
  errorMessage.value = ''
  try {
    const res = await fetch(apiUrl('/partner/forgot-password'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.value.trim() })
    })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error((j as any).error || '요청에 실패했습니다.')
    message.value = (j as any).message || '재설정 링크를 보냈어요.'
  } catch (e) {
    errorMessage.value = (e as Error).message
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="flex min-h-full flex-col justify-center px-6 py-12">
    <div class="text-center">
      <h1 class="text-2xl font-black tracking-tight text-white">비밀번호 찾기</h1>
      <p class="mt-2 text-sm font-medium text-sapphire-300">가입한 이메일로 재설정 링크를 보내드려요.</p>
    </div>

    <div class="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
      <div class="space-y-4 rounded-3xl border border-line bg-surface px-6 py-8 shadow-pop sm:px-10">
        <form class="space-y-4" @submit.prevent="handleForgot">
          <div v-if="errorMessage" class="rounded-2xl border border-danger/30 bg-danger-soft p-3.5 text-xs font-bold text-danger" role="alert">{{ errorMessage }}</div>
          <div class="space-y-1">
            <label class="label" for="ptn-forgot-email">파트너 이메일 계정</label>
            <input
              id="ptn-forgot-email"
              v-model="email"
              type="email"
              required
              autocomplete="username"
              class="input !text-xs"
              placeholder="partner@company.com"
            />
          </div>
          <button type="submit" :disabled="loading" class="btn-primary w-full !text-xs">
            <span v-if="loading">전송 중...</span>
            <span v-else>재설정 링크 보내기</span>
          </button>
        </form>
        <div v-if="message" class="rounded-2xl border border-success/30 bg-success-soft p-3.5 text-xs font-bold text-success" role="status">{{ message }}</div>
        <p class="text-center text-xs">
          <router-link to="/login" class="font-bold text-primary hover:underline">로그인으로 돌아가기</router-link>
        </p>
      </div>
    </div>
  </div>
</template>
