<script setup lang="ts">
/**
 * Admin console shell (design system "Horizon"): grouped sidebar on desktop, drawer on phones,
 * top bar with page title, theme toggle and the signed-in admin from the login response.
 */
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { clearSession, session } from './composables/session'
import ToastHost from './components/ToastHost.vue'

const route = useRoute()
const router = useRouter()

const NAV = [
  { group: '운영', items: [
    { path: '/dashboard', label: '대시보드', icon: 'dashboard' },
    { path: '/bookings', label: '예약 관리', icon: 'bookings' },
    { path: '/catalog', label: '상품', icon: 'package' },
    { path: '/suppliers', label: '공급사 연동', icon: 'server' },
    { path: '/affiliate', label: '제휴 전환', icon: 'swap' }
  ] },
  { group: '회원·파트너', items: [
    { path: '/partners', label: '파트너', icon: 'building' },
    { path: '/users', label: '회원', icon: 'users' }
  ] },
  { group: '콘텐츠', items: [
    { path: '/url-ingest', label: 'URL 상품 수집', icon: 'link' },
    { path: '/community', label: '커뮤니티', icon: 'chat' },
    { path: '/support', label: '공지사항', icon: 'megaphone' },
    { path: '/tickets', label: '1:1 문의', icon: 'support' },
    { path: '/promotions', label: '프로모션', icon: 'gift' }
  ] },
  { group: '재무·설정', items: [
    { path: '/settlements', label: '정산·감사 로그', icon: 'ledger' },
    { path: '/pricing', label: '환율', icon: 'exchange' },
    { path: '/feature-flags', label: '기능 플래그', icon: 'flag' },
    { path: '/legal', label: '약관 버전', icon: 'shield' }
  ] }
]
const flat = NAV.flatMap((g) => g.items)
const current = computed(() => flat.find((i) => route.path.startsWith(i.path)))
const isLogin = computed(() => route.path === '/login')

const drawer = ref(false)
watch(() => route.fullPath, () => { drawer.value = false })

const dark = ref(document.documentElement.classList.contains('dark'))
function toggleTheme() {
  dark.value = !dark.value
  document.documentElement.classList.toggle('dark', dark.value)
  try { localStorage.setItem('gft_admin_theme', dark.value ? 'dark' : 'light') } catch { /* ignore */ }
}

const initials = computed(() => (session.user?.name || session.user?.email || '?').trim().slice(0, 1).toUpperCase())
function logout() {
  clearSession()
  router.push('/login')
}
</script>

<template>
  <router-view v-if="isLogin" />
  <div v-else class="flex min-h-screen bg-canvas text-ink">
    <!-- Sidebar (drawer on < lg) -->
    <div v-if="drawer" class="fixed inset-0 z-30 bg-midnight-950/50 lg:hidden" aria-hidden="true" @click="drawer = false" />
    <aside
      id="admin-nav"
      :class="['fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-line bg-surface transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0', drawer ? 'translate-x-0' : '-translate-x-full']"
      aria-label="관리자 메뉴"
    >
      <div class="flex h-14 items-center gap-2.5 border-b border-line px-4">
        <img src="/symbol.svg" alt="" class="h-7 w-7" />
        <span class="text-[15px] font-extrabold tracking-tight">getfor<span class="text-primary">trip</span></span>
        <span class="rounded-md bg-primary-soft px-1.5 py-0.5 text-2xs font-bold text-primary">관리자</span>
      </div>
      <nav class="flex-1 overflow-y-auto px-3 py-4">
        <div v-for="g in NAV" :key="g.group" class="mb-5">
          <p class="mb-1.5 px-2 text-2xs font-semibold uppercase tracking-wide text-ink-subtle">{{ g.group }}</p>
          <router-link
            v-for="it in g.items"
            :key="it.path"
            :to="it.path"
            :aria-current="current?.path === it.path ? 'page' : undefined"
            :class="['mb-0.5 flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors', current?.path === it.path ? 'bg-primary-soft text-primary' : 'text-ink-muted hover:bg-surface-sunken hover:text-ink']"
          ><AppIcon :name="it.icon" :size="18" />{{ it.label }}</router-link>
        </div>
      </nav>
      <div class="flex items-center gap-2.5 border-t border-line p-3">
        <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-ink">{{ initials }}</span>
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-semibold text-ink">{{ session.user?.name || '이름 없음' }}</p>
          <p class="truncate text-2xs text-ink-subtle">{{ session.user?.email }}</p>
        </div>
        <button type="button" class="btn-ghost btn-sm px-2" title="로그아웃" aria-label="로그아웃" @click="logout"><AppIcon name="logout" :size="18" /></button>
      </div>
    </aside>

    <div class="flex min-w-0 flex-1 flex-col">
      <header class="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-line bg-surface/90 px-4 backdrop-blur lg:px-6">
        <button type="button" class="btn-ghost btn-sm -ml-2 px-2 lg:hidden" aria-label="메뉴 열기" aria-controls="admin-nav" :aria-expanded="drawer" @click="drawer = true"><AppIcon name="menu" :size="20" /></button>
        <p class="truncate text-sm font-semibold text-ink-muted">{{ current?.label }}</p>
        <div class="ml-auto flex items-center gap-1">
          <a href="https://ota-hub.dnjstjqppk.workers.dev" target="_blank" rel="noopener" class="btn-ghost btn-sm hidden sm:inline-flex">사용자 사이트 <AppIcon name="external" :size="14" /></a>
          <button type="button" class="btn-ghost btn-sm px-2" :aria-label="dark ? '라이트 모드' : '다크 모드'" :title="dark ? '라이트 모드' : '다크 모드'" @click="toggleTheme"><AppIcon :name="dark ? 'sun' : 'moon'" :size="18" /></button>
        </div>
      </header>
      <main class="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 lg:px-6">
        <router-view />
      </main>
    </div>
  </div>
  <ToastHost />
</template>
