<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '~/stores/auth'
import { apiFetch, formatKrw } from '~/composables/useApi'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const DOMAIN_LABEL: Record<string, string> = { HOTEL: '숙소', FLIGHT: '항공권', TRAIN: '기차', CAR: '렌터카', TRANSFER: '공항 이동', ACTIVITY: '투어·티켓', PACKAGE: '패키지' }
const toneOf = (s: string) =>
  ['VOUCHER_ISSUED', 'TICKETED', 'COMPLETED'].includes(s) ? 'bg-emerald-50 text-emerald-700'
    : ['FAILED', 'EXPIRED', 'MANUAL_REVIEW_REQUIRED'].includes(s) ? 'bg-red-50 text-red-700'
      : ['CANCELLED', 'REFUNDED'].includes(s) ? 'bg-slate-100 text-slate-600'
        : 'bg-blue-50 text-blue-700'

const bookings = ref<any[]>([])
const loading = ref(true)
const error = ref('')

async function load() {
  loading.value = true
  error.value = ''
  const r = await apiFetch('/bookings')
  loading.value = false
  if (r.status === 401) return router.replace(`/login?redirect=${encodeURIComponent(route.fullPath)}`)
  if (!r.ok) { error.value = r.data.error || '예약 내역을 불러오지 못했습니다.'; return }
  bookings.value = r.data.bookings || []
}

onMounted(async () => {
  await auth.initAuth()
  if (!auth.isLoggedIn) return router.replace(`/login?redirect=${encodeURIComponent(route.fullPath)}`)
  await load()
})
</script>

<template>
  <div class="max-w-4xl mx-auto px-4 py-6 md:py-10 space-y-4">
    <div class="flex items-center justify-between">
      <h1 class="text-xl md:text-2xl font-bold text-slate-900">내 예약</h1>
      <button class="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold" :disabled="loading" @click="load">새로고침</button>
    </div>

    <div v-if="loading" class="py-16 text-center text-sm text-slate-400">예약 내역을 불러오는 중…</div>
    <p v-else-if="error" class="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{{ error }}</p>
    <div v-else-if="bookings.length === 0" class="rounded-2xl border border-slate-200 bg-white p-10 text-center" data-testid="no-bookings">
      <p class="font-semibold text-slate-700">예약 내역이 없습니다.</p>
      <NuxtLink to="/" class="mt-4 inline-block rounded-xl bg-trip-blue px-4 py-2.5 text-sm font-semibold text-white">여행 상품 둘러보기</NuxtLink>
    </div>

    <ul v-else class="space-y-3" data-testid="booking-list">
      <li v-for="b in bookings" :key="b.id">
        <NuxtLink :to="`/my/bookings/${b.id}`" class="block rounded-2xl border border-slate-200 bg-white p-4 md:p-5 hover:border-slate-300 hover:shadow-sm transition">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="text-xs text-slate-500">{{ DOMAIN_LABEL[b.domain] || b.domain }} · <span class="font-mono">{{ b.bookingNumber }}</span></div>
              <div class="mt-0.5 font-semibold text-slate-900 truncate">{{ b.title }}</div>
              <div class="mt-0.5 text-xs text-slate-600">{{ b.serviceStart }}<span v-if="b.serviceEnd && b.serviceEnd !== b.serviceStart"> → {{ b.serviceEnd }}</span></div>
            </div>
            <div class="shrink-0 text-right">
              <span :class="['inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold', toneOf(b.status)]">{{ b.statusLabel }}</span>
              <div class="mt-1 text-sm font-bold text-slate-900">{{ formatKrw(b.totalMinor) }}</div>
            </div>
          </div>
        </NuxtLink>
      </li>
    </ul>
  </div>
</template>
