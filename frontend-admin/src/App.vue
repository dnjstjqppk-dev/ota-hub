<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { apiUrl } from './config/api'

const route = useRoute()
const router = useRouter()
const sseActive = ref(false)
const sseTime = ref('')
let eventSource: EventSource | null = null

const navItems = [
  { path: '/dashboard', label: '통합 대시보드', icon: '📊' },
  { path: '/catalog', label: '상품/인벤토리 관리', icon: '📦' },
  { path: '/pricing', label: '가격/환율/마크업', icon: '💱' },
  { path: '/bookings', label: '예약/발권 OMS', icon: '✈️' },
  { path: '/promotions', label: '마케팅/쿠폰/리워드', icon: '🎁' },
  { path: '/community', label: '커뮤니티/리뷰 CMS', icon: '💬' },
  { path: '/support', label: '고객지원/공지사항', icon: '🎧' },
  { path: '/settlements', label: '정산/감사로그', icon: '📑' }
]

const currentUser = computed(() => {
  try {
    const raw = localStorage.getItem('getfortrip_admin_user')
    if (raw) return JSON.parse(raw)
  } catch (e) {}
  return { name: '총괄 관리자', email: 'admin@getfortrip.com', role: 'SUPER_ADMIN' }
})

const isLoginPage = computed(() => route.path === '/login')

const connectSSE = () => {
  if (isLoginPage.value || eventSource) return
  try {
    eventSource = new EventSource(apiUrl('/sse/events'))
    eventSource.onopen = () => {
      sseActive.value = true
    }
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        sseTime.value = data.time
      } catch (e) {}
    }
    eventSource.onerror = () => {
      sseActive.value = false
    }
  } catch (e) {
    sseActive.value = false
  }
}

const handleLogout = () => {
  if (eventSource) {
    eventSource.close()
    eventSource = null
  }
  localStorage.removeItem('getfortrip_admin_token')
  localStorage.removeItem('getfortrip_admin_user')
  router.push('/login')
}

watch(
  () => route.path,
  (newPath) => {
    if (newPath !== '/login' && !eventSource) {
      connectSSE()
    }
  }
)

onMounted(() => {
  if (!isLoginPage.value) {
    connectSSE()
  }
})
</script>

<template>
  <div class="h-screen bg-slate-100 font-sans antialiased text-slate-800 flex overflow-hidden">
    <!-- 사이드바 (로그인 페이지에서는 숨김) -->
    <aside
      v-if="!isLoginPage"
      class="w-64 bg-trip-navy text-slate-200 flex flex-col justify-between shadow-xl flex-shrink-0 z-30 select-none"
    >
      <div class="overflow-y-auto">
        <!-- 로고 -->
        <div class="p-5 border-b border-slate-700/60 flex items-center gap-3">
          <img src="/symbol.svg" alt="getfortrip" class="w-9 h-9 object-contain rounded-xl shadow-lg shadow-blue-500/30" />
          <div>
            <div class="text-base font-black tracking-tight text-white flex items-center gap-1.5">
              <span>getfor<span class="text-cyan-400">trip</span></span>
              <span class="text-[10px] uppercase font-bold bg-blue-500/20 text-cyan-300 px-1.5 py-0.5 rounded">Admin</span>
            </div>
            <div class="text-[11px] text-slate-400 font-medium">Global OMS & Backoffice</div>
          </div>
        </div>

        <!-- 메뉴 목록 -->
        <nav class="p-3 space-y-1">
          <router-link
            v-for="item in navItems"
            :key="item.path"
            :to="item.path"
            :class="[
              'flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all',
              route.path.startsWith(item.path)
                ? 'bg-trip-blue text-white shadow-md shadow-blue-600/30'
                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            ]"
          >
            <span class="text-base">{{ item.icon }}</span>
            <span>{{ item.label }}</span>
          </router-link>
        </nav>
      </div>

      <!-- 하단 상태 및 관리자 프로필 & 로그아웃 -->
      <div class="p-4 border-t border-slate-800 space-y-3 bg-slate-950/40">
        <!-- 실시간 SSE 상태 뱃지 -->
        <div class="flex items-center justify-between px-3 py-2 bg-slate-900/80 rounded-lg text-xs">
          <span class="text-slate-400 font-medium flex items-center gap-1.5">
            <span :class="['w-2 h-2 rounded-full animate-pulse', sseActive ? 'bg-emerald-400' : 'bg-rose-500']"></span>
            SSE 스트림
          </span>
          <span :class="['font-bold font-mono', sseActive ? 'text-emerald-400' : 'text-slate-400']">
            {{ sseActive ? 'ONLINE' : 'STANDBY' }}
          </span>
        </div>

        <!-- 관리자 계정 정보 -->
        <div class="flex items-center justify-between px-1">
          <div class="flex items-center gap-2.5 min-w-0">
            <div class="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center font-bold text-white text-xs shadow flex-shrink-0">
              AD
            </div>
            <div class="overflow-hidden">
              <div class="text-xs font-bold text-white truncate">{{ currentUser.name }}</div>
              <div class="text-[10px] text-slate-400 truncate">{{ currentUser.email }}</div>
            </div>
          </div>
          <!-- 로그아웃 버튼 -->
          <button
            @click="handleLogout"
            title="관리자 로그아웃"
            class="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors flex-shrink-0"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      </div>
    </aside>

    <!-- 메인 콘텐츠 영역 -->
    <main class="flex-1 overflow-y-auto flex flex-col min-w-0">
      <router-view />
    </main>
  </div>
</template>
