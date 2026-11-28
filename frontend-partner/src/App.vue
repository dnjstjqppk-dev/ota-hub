<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { clearPartnerSession, partnerState } from './config/api'

const route = useRoute()
const router = useRouter()

const lang = ref<'ko' | 'en'>('ko')
try {
  const saved = localStorage.getItem('gft_partner_lang')
  if (saved === 'en' || saved === 'ko') lang.value = saved
} catch {}
function toggleLang() {
  lang.value = lang.value === 'ko' ? 'en' : 'ko'
  try { localStorage.setItem('gft_partner_lang', lang.value) } catch {}
  document.documentElement.lang = lang.value
}
const L = (ko: string, en: string) => (lang.value === 'en' ? en : ko)

const navItems = computed(() => [
  { path: '/dashboard', label: L('파트너 대시보드', 'Dashboard'), icon: 'dashboard' },
  { path: '/products', label: L('공급 상품 관리', 'Products'), icon: 'package' },
  { path: '/inventory', label: L('가격/재고 캘린더', 'Inventory & Rates'), icon: 'calendar' },
  { path: '/orders', label: L('주문/예약 접수', 'Orders'), icon: 'bookings' },
  { path: '/messages', label: L('고객 메시지', 'Messages'), icon: 'mail' },
  { path: '/reviews', label: L('리뷰 관리', 'Reviews'), icon: 'star' },
  { path: '/settlements', label: L('정산 명세서', 'Settlements'), icon: 'ledger' },
  { path: '/profile', label: L('회사/계좌 정보', 'Company & Payout'), icon: 'building' },
  { path: '/staff', label: L('직원 계정 관리', 'Staff'), icon: 'users' },
  { path: '/api-keys', label: L('API & 웹훅', 'API & Webhooks'), icon: 'link' },
])

const partner = computed(() => partnerState.value || { companyName: L('공급사 파트너', 'Supplier Partner'), email: 'partner@getfortrip.com' })

const PUBLIC_PATHS = ['/login', '/register', '/forgot-password', '/reset-password', '/terms']
const isPublicPage = computed(() => route.meta?.public === true || PUBLIC_PATHS.includes(route.path))
const currentLabel = computed(() => navItems.value.find((i) => route.path === i.path)?.label ?? '')

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
  <div class="flex min-h-screen bg-canvas font-sans text-ink antialiased">
    <!-- Mobile / Tablet Backdrop -->
    <div v-if="drawer && !isPublicPage" class="fixed inset-0 z-30 bg-midnight-950/50 backdrop-blur-sm lg:hidden" aria-hidden="true" @click="drawer = false" />

    <!-- Terra Nord Architectural Partner Sidebar -->
    <aside
      v-if="!isPublicPage"
      id="partner-nav"
      :class="['fixed inset-y-0 left-0 z-40 flex w-[min(86vw,268px)] select-none flex-col justify-between border-r border-line bg-surface text-ink transition-transform lg:sticky lg:top-0 lg:h-screen lg:w-64 lg:translate-x-0', drawer ? 'translate-x-0 shadow-pop' : '-translate-x-full max-lg:invisible']"
      aria-label="Partner Navigation"
    >
      <div class="overflow-y-auto">
        <div class="flex h-16 items-center justify-between gap-2 border-b border-line px-4">
          <div class="flex items-center gap-2">
            <img src="/logo.svg" alt="getfortrip" class="h-7 w-auto dark:hidden" />
            <img src="/logo-white.svg" alt="getfortrip" class="hidden h-7 w-auto dark:block" />
            <span class="rounded-md bg-accent-soft px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-accent">Partner</span>
          </div>
          <button type="button" class="flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted hover:bg-surface-sunken lg:hidden" :aria-label="L('메뉴 닫기', 'Close menu')" @click="drawer = false"><AppIcon name="close" :size="18" /></button>
        </div>

        <nav class="space-y-1 p-3" aria-label="Partner Menu">
          <router-link
            v-for="item in navItems"
            :key="item.path"
            :to="item.path"
            :class="[
              route.path === item.path
                ? 'bg-primary font-bold text-primary-ink shadow-sm'
                : 'font-semibold text-ink-muted hover:bg-surface-sunken hover:text-ink',
              'flex items-center gap-3 rounded-field px-3.5 py-2.5 text-xs transition-all sm:text-[13px]'
            ]"
          >
            <AppIcon :name="item.icon" :size="16" />
            <span>{{ item.label }}</span>
          </router-link>
        </nav>
      </div>

      <div class="border-t border-line bg-surface-sunken/50 p-4">
        <div class="flex items-center justify-between gap-2">
          <div class="min-w-0 truncate">
            <div class="truncate text-xs font-bold text-ink">{{ partner.companyName }}</div>
            <div class="truncate text-[11px] text-ink-subtle">{{ partner.email }}</div>
          </div>
          <button
            type="button"
            :title="L('로그아웃', 'Sign out')"
            :aria-label="L('로그아웃', 'Sign out')"
            class="shrink-0 rounded-lg p-2 text-ink-muted transition hover:bg-surface hover:text-danger"
            @click="handleLogout"
          >
            <AppIcon name="logout" :size="16" />
          </button>
        </div>
      </div>
    </aside>

    <!-- Main Content Area with Unified Topbar -->
    <main class="flex min-w-0 flex-1 flex-col">
      <header v-if="!isPublicPage" class="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-3 border-b border-line bg-surface/92 px-4 backdrop-blur-md lg:px-8">
        <button type="button" class="-ml-1 rounded-lg p-2 text-ink-muted transition hover:bg-surface-sunken hover:text-ink lg:hidden" :aria-label="L('메뉴 열기', 'Open menu')" aria-controls="partner-nav" :aria-expanded="drawer" @click="drawer = true"><AppIcon name="menu" :size="22" /></button>
        <div class="flex min-w-0 items-center gap-2">
          <span class="h-2 w-2 shrink-0 rounded-full bg-primary" />
          <p class="truncate font-display text-sm font-extrabold tracking-tight text-ink sm:text-base">{{ currentLabel }}</p>
        </div>
        <div class="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            class="flex h-9 items-center gap-1 rounded-field border border-line bg-surface px-3 text-xs font-bold text-ink-muted transition-colors hover:border-primary hover:text-primary"
            @click="toggleLang"
          >
            {{ lang === 'ko' ? 'EN' : 'KO' }}
          </button>
          <a href="https://getfortrip.com" target="_blank" rel="noopener" class="hidden h-9 items-center gap-1.5 rounded-field border border-line bg-surface px-3.5 text-xs font-bold text-ink-muted transition-colors hover:border-primary hover:text-primary sm:inline-flex">{{ L('사용자 사이트', 'Live Site') }} <AppIcon name="external" :size="13" /></a>
          <button
            type="button"
            class="flex h-9 w-9 items-center justify-center rounded-field border border-line bg-surface text-ink-muted transition-colors hover:text-ink"
            :aria-label="dark ? L('라이트 모드', 'Light mode') : L('다크 모드', 'Dark mode')"
            :title="dark ? L('라이트 모드', 'Light mode') : L('다크 모드', 'Dark mode')"
            @click="toggleTheme"
          >
            <AppIcon :name="dark ? 'sun' : 'moon'" :size="17" />
          </button>
        </div>
      </header>
      <div v-if="!isPublicPage" class="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6 lg:p-8">
        <router-view />
      </div>
      <div v-else class="flex-1">
        <router-view />
      </div>
    </main>
  </div>
</template>
