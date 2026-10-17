<script setup lang="ts">
import { ref } from 'vue'
import { useAuthStore } from '~/stores/auth'

const authStore = useAuthStore()

const fullName = ref(authStore.user.fullName)
const email = ref(authStore.user.email)
const phone = ref('010-1234-5678')
const birth = ref('1990-05-15')
const gender = ref('MALE')
const marketingConsent = ref(true)

const saveProfile = () => {
  authStore.user.fullName = fullName.value
  alert('회원 프로필 정보가 성공적으로 수정되었습니다.')
}
</script>

<template>
  <div class="max-w-3xl mx-auto px-4 py-8 space-y-6">
    <div class="flex items-center gap-3 border-b border-slate-200 pb-4">
      <NuxtLink to="/my" class="text-xs font-bold text-slate-400 hover:text-slate-600">‹ 마이 콘솔</NuxtLink>
      <h1 class="text-xl font-black text-slate-900">회원 프로필 및 계정 설정</h1>
    </div>

    <div class="bg-white rounded-3xl border border-slate-200/90 p-6 sm:p-8 shadow-sm space-y-6">
      <div class="flex items-center gap-4 border-b border-slate-100 pb-6">
        <img :src="authStore.user.avatarUrl" class="w-16 h-16 rounded-full border-2 border-slate-200 object-cover" />
        <div>
          <h2 class="text-base font-black text-slate-900">{{ authStore.user.fullName }}</h2>
          <span class="px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[10px] font-black border border-amber-200">
            💎 {{ authStore.user.tier }} VIP 회원
          </span>
        </div>
      </div>

      <div class="space-y-4 text-xs">
        <div>
          <label class="block font-bold text-slate-700 mb-1">성명 (실명)</label>
          <input v-model="fullName" type="text" class="w-full p-2.5 border border-slate-200 rounded-xl font-bold text-slate-800" />
        </div>

        <div>
          <label class="block font-bold text-slate-700 mb-1">이메일 주소 (로그인 계정)</label>
          <input :value="email" disabled class="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-slate-500" />
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block font-bold text-slate-700 mb-1">휴대전화번호</label>
            <input v-model="phone" type="tel" class="w-full p-2.5 border border-slate-200 rounded-xl font-mono text-slate-800" />
          </div>
          <div>
            <label class="block font-bold text-slate-700 mb-1">생년월일</label>
            <input v-model="birth" type="date" class="w-full p-2.5 border border-slate-200 rounded-xl font-mono text-slate-800" />
          </div>
        </div>

        <div class="pt-2">
          <label class="flex items-center gap-2 cursor-pointer">
            <input v-model="marketingConsent" type="checkbox" class="w-4 h-4 rounded text-blue-600" />
            <span class="text-slate-600 font-medium text-xs">특가 프로모션 및 리워드 코인 적립 안내 수신 동의 (선택)</span>
          </label>
        </div>
      </div>

      <div class="pt-4 border-t border-slate-100 flex justify-end">
        <button
          @click="saveProfile"
          class="px-6 py-2.5 bg-trip-blue hover:bg-blue-600 text-white font-black rounded-xl text-xs shadow-sm transition"
        >
          변경사항 저장
        </button>
      </div>
    </div>
  </div>
</template>

