<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { apiUrl } from '../config/api'

const route = useRoute()
const router = useRouter()
const token = String(route.query.token || '')
const password = ref('')
const confirm = ref('')
const loading = ref(false)
const errorMessage = ref('')

async function handleReset() {
  errorMessage.value = ''
  if (password.value.length < 8) {
    errorMessage.value = '비밀번호는 8자 이상이어야 합니다.'
    return
  }
  if (password.value !== confirm.value) {
    errorMessage.value = '비밀번호 확인이 일치하지 않습니다.'
    return
  }
  loading.value = true
  try {
    const res = await fetch(apiUrl('/partner/reset-password'), {
      credentials: 'include',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, newPassword: password.value })
    })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error((j as any).error || '재설정에 실패했습니다.')
    router.replace({ path: '/login', query: { reset: 'done' } })
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
      <h1 class="text-2xl font-black tracking-tight text-white">새 비밀번호 설정</h1>
      <p class="mt-2 text-sm font-medium text-sapphire-300">8자 이상의 새 비밀번호를 입력해 주세요.</p>
    </div>

    <div class="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
      <div class="space-y-4 rounded-3xl border border-line bg-surface px-6 py-8 shadow-pop sm:px-10">
        <div v-if="!token" class="rounded-2xl border border-danger/30 bg-danger-soft p-3.5 text-xs font-bold text-danger" role="alert">
          재설정 링크가 올바르지 않아요. 메일의 링크를 다시 확인하거나
          <router-link to="/forgot-password" class="underline">다시 요청</router-link>해 주세요.
        </div>
        <form v-else class="space-y-4" @submit.prevent="handleReset">
          <div v-if="errorMessage" class="rounded-2xl border border-danger/30 bg-danger-soft p-3.5 text-xs font-bold text-danger" role="alert">{{ errorMessage }}</div>
          <div class="space-y-1">
            <label class="label" for="ptn-new-password">새 비밀번호</label>
            <input
              id="ptn-new-password"
              v-model="password"
              type="password"
              required
              minlength="8"
              autocomplete="new-password"
              class="input !text-xs"
              placeholder="8자 이상"
            />
          </div>
          <div class="space-y-1">
            <label class="label" for="ptn-confirm-password">새 비밀번호 확인</label>
            <input
              id="ptn-confirm-password"
              v-model="confirm"
              type="password"
              required
              autocomplete="new-password"
              class="input !text-xs"
              placeholder="다시 입력"
            />
          </div>
          <button type="submit" :disabled="loading" class="btn-primary w-full !text-xs">
            <span v-if="loading">변경 중...</span>
            <span v-else>비밀번호 변경하기</span>
          </button>
        </form>
      </div>
    </div>
  </div>
</template>
