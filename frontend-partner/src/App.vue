<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { clearPartnerSession } from './config/api'

const route = useRoute()
const router = useRouter()

const navItems = [
  { path: '/dashboard', label: '파트너 대시보드', icon: 'dashboard' },
  { path: '/products', label: '공급 상품 관리', icon: 'package' },
  { path: '/inventory', label: '가격/재고 캘린더', icon: 'calendar' },
  { path: '/orders', label: '주문/예약 접수', icon: 'bookings' },
  { path: '/settlements', label: '정산 명세서', icon: 'ledger' },
  { path: '/profile', label: '회사/계좌 정보', icon: 'building' },
  { path: '/staff', label: '직원 계정 관리', icon: 'users' },
  { path: '/api-keys', label: 'API & 웹훅', icon: 'link' },
]

const partner = computed(() => {
  try {
    const raw = localStorage.getItem('getfortrip_partner_info') || sessionStorage.getItem('getfortrip_partner_info')
    if (raw) return JSON.parse(raw)
  } catch (e) {}
  return { companyName: '공급사 파트너', email: 'partner@getfortrip.com' }
})

const PUBLIC_PATHS = ['/login', '/register', '/forgot-password', '/reset-password']
const isPublicPage = computed(() => PUBLIC_PATHS.includes(route.path))
const currentLabel = computed(() => navItems.find((i) => route.path === i.path)?.label ?? '')

// Drawer on phones/tablets (< lg), fixed sidebar on desktop — mirrors the admin shell.
const drawer = ref(false)
watch(() => route.fullPath, () => { drawer.value = false })

const dark = ref(false)
try { dark.value = document.documentElement.classList.contains('dark') } catch {}
function toggleTheme() {
  dark.value = !dark.value
  try { localStorage.setItem('gft_partner_theme', dark.value ? 'dark' : 'light') } catch {}
  document.documentElement.classList.toggle('dark', dark.value)
}

const handleLogout = () => {
  clearPartnerSession()
  router.push('/login')
}
</script>

<template>
  <div class="flex h-screen overflow-hidden bg-canvas font-sans text-ink antialiased">
    <!-- Partner Sidebar (drawer on < lg) -->
    <div v-if="drawer && !isPublicPage" class="fixed inset-0 z-30 bg-midnight-950/50 lg:hidden" aria-hidden="true" @click="drawer = false" />
    <aside
      v-if="!isPublicPage"
      id="partner-nav"
      :class="['fixed inset-y-0 left-0 z-40 flex w-64 select-none flex-col justify-between border-r border-midnight-800 bg-midnight-900 text-sapphire-200 shadow-2xl transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0', drawer ? 'translate-x-0' : '-translate-x-full']"
      aria-label="파트너 메뉴"
    >
      <div class="overflow-y-auto">
        <!-- Logo Header -->
        <div class="flex items-center gap-3 border-b border-midnight-800 p-5">
          <img src="/symbol.svg" alt="getfortrip" class="h-9 w-9 rounded-xl object-contain" />
          <div>
            <div class="flex items-center gap-1.5 text-base font-black tracking-tight text-white">
              <span>getfor<span class="text-sapphire-400">trip</span></span>
              <span class="rounded bg-sapphire-500/20 px-1.5 py-0.5 text-[10px] font-bold uppercase text-sapphire-300">Partner</span>
            </div>
            <div class="text-[11px] font-medium text-sapphire-300">Supplier Extranet</div>
          </div>
        </div>

        <!-- Navigation Menu -->
        <nav class="space-y-1 p-3" aria-label="파트너 메뉴">
          <router-link
            v-for="item in navItems"
            :key="item.path"
            :to="item.path"
            :class="[
              route.path === item.path
                ? 'bg-primary font-bold text-primary-ink shadow-md'
                : 'font-semibold text-sapphire-300 hover:bg-midnight-800 hover:text-white',
              'flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-xs transition'
            ]"
          >
            <AppIcon :name="item.icon" :size="18" />
            <span>{{ item.label }}</span>
          </router-link>
        </nav>
      </div>

      <!-- Partner Footer Profile -->
      <div class="border-t border-midnight-800 bg-midnight-950/60 p-4">
        <div class="flex items-center justify-between">
          <div class="truncate pr-2">
            <div class="truncate text-xs font-bold text-white">{{ partner.companyName }}</div>
            <div class="truncate text-[10px] text-sapphire-300">{{ partner.email }}</div>
          </div>
          <div class="flex items-center gap-1">
            <button
              type="button"
              :aria-label="dark ? '라이트 모드' : '다크 모드'"
              :title="dark ? '라이트 모드' : '다크 모드'"
              class="rounded-lg p-2 text-sapphire-300 transition hover:bg-midnight-800 hover:text-white"
              @click="toggleTheme"
            >
              <AppIcon :name="dark ? 'sun' : 'moon'" :size="16" />
            </button>
            <button
              type="button"
              title="로그아웃"
              aria-label="로그아웃"
              class="rounded-lg p-2 text-sapphire-300 transition hover:bg-midnight-800 hover:text-danger"
              @click="handleLogout"
            >
              <AppIcon name="logout" :size="16" />
            </button>
          </div>
        </div>
      </div>
    </aside>

    <!-- Main Content Area -->
    <main class="flex min-w-0 flex-1 flex-col overflow-y-auto">
      <header v-if="!isPublicPage" class="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b border-line bg-surface/90 px-4 backdrop-blur lg:hidden">
        <button type="button" class="-ml-1 rounded-lg p-2 text-ink-muted transition hover:bg-surface-sunken hover:text-ink" aria-label="메뉴 열기" aria-controls="partner-nav" :aria-expanded="drawer" @click="drawer = true"><AppIcon name="menu" :size="22" /></button>
        <p class="truncate text-sm font-bold text-ink">{{ currentLabel }}</p>
        <img src="/symbol.svg" alt="getfortrip" class="ml-auto h-7 w-7 rounded-lg object-contain" />
      </header>
      <div v-if="!isPublicPage" class="mx-auto w-full max-w-7xl p-4 sm:p-6 md:p-8">
        <router-view />
      </div>
      <div v-else class="flex-1">
        <router-view />
      </div>
    </main>
  </div>
</template>
