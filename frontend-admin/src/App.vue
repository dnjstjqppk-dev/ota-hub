<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { apiUrl } from './config/api'

const route = useRoute()
const sseActive = ref(false)
const sseTime = ref('')

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

onMounted(() => {
  // Connect to Go backend SSE stream
  const eventSource = new EventSource(apiUrl('/sse/events'))
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
})
</script>

<template>
  <div class="flex h-screen bg-slate-100 font-sans antialiased text-slate-800">
    <!-- 사이드바 (getfortrip Deep Navy) -->
    <aside class="w-64 bg-trip-navy text-slate-200 flex flex-col justify-between shadow-xl flex-shrink-0 z-30">
      <div>
        <!-- 로고 -->
        <div class="p-6 border-b border-slate-700/60 flex items-center gap-3">
          <img src="/symbol.svg" alt="getfortrip" class="w-10 h-10 object-contain rounded-xl shadow-lg shadow-blue-500/30" />
          <div>
            <div class="text-base font-black tracking-tight text-white flex items-center gap-1.5">
              <span>getfor<span class="text-cyan-400">trip</span></span>
              <span class="text-[10px] uppercase font-bold bg-blue-500/20 text-cyan-300 px-1.5 py-0.5 rounded">Admin</span>
            </div>
            <div class="text-[11px] text-slate-400 font-medium">Global OMS & Backoffice</div>
          </div>
        </div>

        <!-- 메뉴 목록 -->
        <nav class="p-4 space-y-1">
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

      <!-- 하단 상태 및 관리자 프로필 -->
      <div class="p-4 border-t border-slate-800 space-y-3">
        <!-- 실시간 SSE 상태 뱃지 -->
        <div class="flex items-center justify-between px-3 py-2 bg-slate-900/60 rounded-lg text-xs">
          <span class="text-slate-400 font-medium flex items-center gap-1.5">
            <span :class="['w-2 h-2 rounded-full animate-pulse', sseActive ? 'bg-emerald-400' : 'bg-rose-500']"></span>
            SSE 스트림
          </span>
          <span class="text-emerald-400 font-bold font-mono">{{ sseActive ? 'ONLINE' : 'OFFLINE' }}</span>
        </div>

        <div class="flex items-center gap-3 px-2">
          <div class="w-9 h-9 rounded-full bg-slate-700 flex items-center justify-center font-bold text-white text-sm">
            AD
          </div>
          <div class="overflow-hidden">
            <div class="text-xs font-bold text-white truncate">admin_super (총괄)</div>
            <div class="text-[11px] text-slate-400 truncate">Go Backend v1.23</div>
          </div>
        </div>
      </div>
    </aside>

    <!-- 메인 콘텐츠 영역 -->
    <main class="flex-1 overflow-y-auto flex flex-col">
      <router-view />
    </main>
  </div>
</template>
