<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()

const navItems = [
  { path: '/dashboard', label: '파트너 대시보드', icon: '📊' },
  { path: '/products', label: '공급 상품 관리', icon: '📦' },
  { path: '/inventory', label: '가격/재고 캘린더', icon: '📅' },
  { path: '/orders', label: '주문/예약 접수', icon: '📑' },
  { path: '/settlements', label: '정산 명세서', icon: '💰' },
  { path: '/profile', label: '회사/계좌 정보', icon: '🏢' },
  { path: '/staff', label: '직원 계정 관리', icon: '👥' },
  { path: '/api-keys', label: 'API & 웹훅', icon: '🔌' },
]

const partner = computed(() => {
  try {
    const raw = localStorage.getItem('getfortrip_partner_info')
    if (raw) return JSON.parse(raw)
  } catch (e) {}
  return { companyName: '공급사 파트너', email: 'partner@getfortrip.com' }
})

const isPublicPage = computed(() => route.path === '/login' || route.path === '/register')

const handleLogout = () => {
  localStorage.removeItem('getfortrip_partner_token')
  localStorage.removeItem('getfortrip_partner_info')
  document.cookie = 'getfortrip_partner_jwt=; path=/; max-age=0'
  router.push('/login')
}
</script>

<template>
  <div class="h-screen bg-slate-100 font-sans antialiased text-slate-800 flex overflow-hidden">
    <!-- Partner Sidebar -->
    <aside
      v-if="!isPublicPage"
      class="w-64 bg-slate-900 text-slate-200 flex flex-col justify-between shadow-2xl flex-shrink-0 z-30 select-none border-r border-slate-800"
    >
      <div class="overflow-y-auto">
        <!-- Logo Header -->
        <div class="p-5 border-b border-slate-800 flex items-center gap-3">
          <img src="/symbol.svg" alt="getfortrip" class="w-9 h-9 object-contain rounded-xl shadow-lg shadow-blue-500/20" />
          <div>
            <div class="text-base font-black tracking-tight text-white flex items-center gap-1.5">
              <span>getfor<span class="text-blue-500">trip</span></span>
              <span class="text-[10px] uppercase font-bold bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded">Partner</span>
            </div>
            <div class="text-[11px] text-slate-400 font-medium">Supplier Extranet</div>
          </div>
        </div>

        <!-- Navigation Menu -->
        <nav class="p-3 space-y-1">
          <router-link
            v-for="item in navItems"
            :key="item.path"
            :to="item.path"
            :class="[
              route.path === item.path
                ? 'bg-blue-600 text-white font-black shadow-md shadow-blue-500/20'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60 font-bold',
              'flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs transition'
            ]"
          >
            <span class="text-base">{{ item.icon }}</span>
            <span>{{ item.label }}</span>
          </router-link>
        </nav>
      </div>

      <!-- Partner Footer Profile -->
      <div class="p-4 border-t border-slate-800 bg-slate-950/60">
        <div class="flex items-center justify-between">
          <div class="truncate pr-2">
            <div class="text-xs font-bold text-white truncate">{{ partner.companyName }}</div>
            <div class="text-[10px] text-slate-400 truncate">{{ partner.email }}</div>
          </div>
          <button
            @click="handleLogout"
            title="로그아웃"
            class="p-2 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition text-xs"
          >
            🚪
          </button>
        </div>
      </div>
    </aside>

    <!-- Main Content Area -->
    <main class="flex-1 flex flex-col min-w-0 overflow-y-auto">
      <div v-if="!isPublicPage" class="p-6 md:p-8 max-w-7xl w-full mx-auto">
        <router-view />
      </div>
      <div v-else class="flex-1">
        <router-view />
      </div>
    </main>
  </div>
</template>

