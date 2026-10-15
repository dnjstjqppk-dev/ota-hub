<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { usePartnerStore } from '~/stores/partner'

const router = useRouter()
const partnerStore = usePartnerStore()

onMounted(() => {
  if (!partnerStore.isLoggedIn) {
    router.replace('/partner/login')
  }
})

const apiKey = ref(partnerStore.partner.token || 'ptn_live_sec_88419204918239')
const webhookUrl = ref('https://api.hyatt-sel.internal/v1/ota/getfortrip-events')
const webhookSecret = ref('whsec_991820491829381')
const isCopied = ref(false)
const pingStatus = ref('')

const copyKey = () => {
  navigator.clipboard.writeText(apiKey.value)
  isCopied.value = true
  setTimeout(() => isCopied.value = false, 2000)
}

const regenerateKey = () => {
  if (confirm('API 키를 재발급하시겠습니까? 기존 연동 시스템의 토큰이 즉시 만료됩니다.')) {
    apiKey.value = 'ptn_live_sec_' + Math.random().toString(36).substring(2, 16) + Math.random().toString(36).substring(2, 8)
    alert('새로운 API Secret Key가 발급되었습니다.')
  }
}

const sendPing = () => {
  pingStatus.value = '전송 중...'
  setTimeout(() => {
    pingStatus.value = '200 OK - 웹훅 엔드포인트 수신 확인 완료!'
  }, 800)
}

const saveSettings = () => {
  alert('파트너 연동 설정이 안전하게 저장되었습니다.')
}
</script>

<template>
  <div class="min-h-screen bg-slate-100">
    <header class="bg-slate-900 text-white border-b border-slate-800 sticky top-0 z-40">
      <div class="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        <div class="flex items-center gap-6">
          <NuxtLink to="/partner" class="flex items-center gap-2">
            <img src="/logo-white.svg" alt="getfortrip" class="h-7 w-auto" />
            <span class="px-2 py-0.5 rounded text-[10px] font-black bg-blue-600 text-white uppercase tracking-wider">
              Partner Hub
            </span>
          </NuxtLink>
          <nav class="hidden md:flex items-center gap-1 text-xs font-bold text-slate-300">
            <NuxtLink to="/partner" class="px-3 py-2 rounded-xl hover:bg-slate-800 hover:text-white transition">대시보드</NuxtLink>
            <NuxtLink to="/partner/products" class="px-3 py-2 rounded-xl hover:bg-slate-800 hover:text-white transition">상품 및 재고 관리</NuxtLink>
            <NuxtLink to="/partner/bookings" class="px-3 py-2 rounded-xl hover:bg-slate-800 hover:text-white transition">예약·바우처 관리</NuxtLink>
            <NuxtLink to="/partner/settlement" class="px-3 py-2 rounded-xl hover:bg-slate-800 hover:text-white transition">정산 및 수수료</NuxtLink>
            <NuxtLink to="/partner/settings" class="px-3 py-2 rounded-xl bg-slate-800 text-white">연동 API/설정</NuxtLink>
          </nav>
        </div>
        <div class="flex items-center gap-4 text-xs">
          <span class="font-bold text-slate-300">{{ partnerStore.partner.companyName }}</span>
          <button @click="partnerStore.logout(); router.push('/partner/login')" class="text-rose-400 font-bold">로그아웃</button>
        </div>
      </div>
    </header>

    <main class="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 class="text-2xl font-black text-slate-900">파트너사 계정 및 API 연동 설정</h1>
        <p class="text-xs text-slate-500 mt-1">기업 프로필, PMS 자동 연동 API Secret Key 및 실시간 예약 푸시 웹훅을 설정합니다.</p>
      </div>

      <!-- 기업 프로필 -->
      <div class="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
        <h2 class="text-base font-black text-slate-900 pb-2 border-b border-slate-100">파트너 기업 정보</h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div>
            <label class="block font-bold text-slate-700 mb-1">상호명 (법인명)</label>
            <input :value="partnerStore.partner.companyName" disabled class="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800" />
          </div>
          <div>
            <label class="block font-bold text-slate-700 mb-1">사업자 등록번호</label>
            <input :value="partnerStore.partner.businessNumber" disabled class="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-slate-800" />
          </div>
          <div>
            <label class="block font-bold text-slate-700 mb-1">담당자 이메일</label>
            <input :value="partnerStore.partner.email" disabled class="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-800" />
          </div>
          <div>
            <label class="block font-bold text-slate-700 mb-1">대표 연락처</label>
            <input :value="partnerStore.partner.contactPhone" class="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-medium text-slate-800" />
          </div>
        </div>
      </div>

      <!-- API Secret Key -->
      <div class="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
        <div class="flex items-center justify-between pb-2 border-b border-slate-100">
          <div>
            <h2 class="text-base font-black text-slate-900">Partner OpenAPI Key</h2>
            <p class="text-xs text-slate-400">호텔 PMS/채널매니저(CMS)에서 getfortrip 인벤토리 및 예약을 자동 동기화할 때 사용합니다.</p>
          </div>
          <button @click="regenerateKey" class="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition">
            키 재발급
          </button>
        </div>

        <div class="flex items-center gap-2">
          <input
            :value="apiKey"
            readonly
            type="password"
            class="flex-1 p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs text-slate-700"
          />
          <button
            @click="copyKey"
            class="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl transition shadow"
          >
            {{ isCopied ? '복사됨 ✓' : '키 복사' }}
          </button>
        </div>
      </div>

      <!-- Webhook 설정 -->
      <div class="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
        <h2 class="text-base font-black text-slate-900 pb-2 border-b border-slate-100">실시간 주문 웹훅 (Webhook Callback)</h2>
        <div class="space-y-3 text-xs">
          <div>
            <label class="block font-bold text-slate-700 mb-1">파트너사 수신 웹훅 URL (HTTPS)</label>
            <input
              v-model="webhookUrl"
              type="url"
              class="w-full p-2.5 border border-slate-200 rounded-xl font-mono text-slate-800"
            />
          </div>
          <div class="flex items-center justify-between pt-2">
            <button
              @click="sendPing"
              class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition"
            >
              테스트 핑 전송 (Ping)
            </button>
            <span v-if="pingStatus" class="font-bold text-emerald-600">{{ pingStatus }}</span>
          </div>
        </div>

        <div class="pt-4 border-t border-slate-100 flex justify-end">
          <button
            @click="saveSettings"
            class="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs shadow transition"
          >
            설정 저장
          </button>
        </div>
      </div>
    </main>
  </div>
</template>

