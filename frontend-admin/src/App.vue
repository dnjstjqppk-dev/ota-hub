<script setup lang="ts">
/**
 * Admin console shell (design system "Terra Nord Ops"): architectural studio sidebar on desktop,
 * responsive slide-over drawer on mobile & tablet (<lg), KO/EN console switcher, and theme toggle.
 */
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { clearSession, session } from './composables/session'
import ToastHost from './components/ToastHost.vue'

const route = useRoute()
const router = useRouter()

const lang = ref<'ko' | 'en'>('ko')
try {
  const saved = localStorage.getItem('gft_admin_lang')
  if (saved === 'en' || saved === 'ko') lang.value = saved
} catch { /* ignore */ }
function toggleLang() {
  lang.value = lang.value === 'ko' ? 'en' : 'ko'
  try { localStorage.setItem('gft_admin_lang', lang.value) } catch { /* ignore */ }
  document.documentElement.lang = lang.value
}
const L = (ko: string, en: string) => (lang.value === 'en' ? en : ko)

const NAV = computed(() => [
  { group: L('운영', 'Operations'), items: [
    { path: '/dashboard', label: L('대시보드', 'Dashboard'), icon: 'dashboard' },
    { path: '/insights', label: L('비즈니스 분석', 'Insights'), icon: 'coins' },
    { path: '/slo', label: L('SLO·장애', 'SLO & Cache'), icon: 'shield' },
    { path: '/bookings', label: L('예약 관리', 'Bookings OMS'), icon: 'bookings' },
    { path: '/catalog', label: L('상품', 'Catalog'), icon: 'package' },
    { path: '/suppliers', label: L('공급사 연동', 'Suppliers'), icon: 'server' },
    { path: '/affiliate', label: L('제휴 전환', 'Affiliate'), icon: 'swap' }
  ] },
  { group: L('회원·파트너', 'Accounts'), items: [
    { path: '/partners', label: L('파트너', 'Partners'), icon: 'building' },
    { path: '/users', label: L('회원', 'Users'), icon: 'users' }
  ] },
  { group: L('콘텐츠', 'Content'), items: [
    { path: '/url-ingest', label: L('URL 상품 수집', 'URL Ingestion'), icon: 'link' },
    { path: '/community', label: L('커뮤니티', 'Community'), icon: 'chat' },
    { path: '/reviews', label: L('리뷰 검수', 'Reviews'), icon: 'star' },
    { path: '/marketing', label: L('배너·기획전', 'Marketing'), icon: 'megaphone' },
    { path: '/support', label: L('공지사항', 'Notices'), icon: 'megaphone' },
    { path: '/tickets', label: L('1:1 문의', 'Support Tickets'), icon: 'support' },
    { path: '/promotions', label: L('프로모션', 'Promotions'), icon: 'gift' }
  ] },
  { group: L('재무·설정', 'Finance & System'), items: [
    { path: '/settlements', label: L('정산·감사 로그', 'Settlements'), icon: 'ledger' },
    { path: '/pricing', label: L('환율', 'FX Rates'), icon: 'exchange' },
    { path: '/feature-flags', label: L('기능 플래그', 'Feature Flags'), icon: 'flag' },
    { path: '/entities', label: L('사업자·계약', 'Entities'), icon: 'briefcase' },
    { path: '/legal', label: L('약관 버전', 'Legal Docs'), icon: 'shield' },
    { path: '/security', label: L('내 보안', 'MFA Security'), icon: 'lock' }
  ] }
])
const flat = computed(() => NAV.value.flatMap((g) => g.items))
const current = computed(() => flat.value.find((i) => route.path.startsWith(i.path)))
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
    <!-- Mobile / Tablet Backdrop -->
    <div v-if="drawer" class="fixed inset-0 z-30 bg-midnight-950/50 backdrop-blur-sm lg:hidden" aria-hidden="true" @click="drawer = false" />

    <!-- Terra Nord Architectural Sidebar -->
    <aside
      id="admin-nav"
      :class="['fixed inset-y-0 left-0 z-40 flex w-[min(86vw,268px)] flex-col border-r border-line bg-surface text-ink transition-transform lg:sticky lg:top-0 lg:h-screen lg:w-64 lg:translate-x-0', drawer ? 'translate-x-0 shadow-pop' : '-translate-x-full max-lg:invisible']"
      aria-label="Admin Navigation"
    >
      <div class="flex h-16 shrink-0 items-center justify-between gap-2 border-b border-line px-4">
        <div class="flex items-center gap-2">
          <img src="/logo.svg" alt="getfortrip" class="h-7 w-auto dark:hidden" />
          <img src="/logo-white.svg" alt="getfortrip" class="hidden h-7 w-auto dark:block" />
          <span class="rounded-md bg-primary-soft px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-primary">OPS</span>
        </div>
        <button type="button" class="flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted hover:bg-surface-sunken lg:hidden" :aria-label="L('메뉴 닫기', 'Close menu')" @click="drawer = false"><AppIcon name="close" :size="18" /></button>
      </div>

      <nav class="flex-1 overflow-y-auto px-3 py-4">
        <div v-for="g in NAV" :key="g.group" class="mb-5">
          <p class="mb-1.5 px-2.5 text-[10px] font-bold uppercase tracking-[0.16em] text-ink-subtle">{{ g.group }}</p>
          <router-link
            v-for="it in g.items"
            :key="it.path"
            :to="it.path"
            :aria-current="current?.path === it.path ? 'page' : undefined"
            :class="['mb-0.5 flex items-center gap-2.5 rounded-field px-3 py-2 text-xs font-bold transition-all sm:text-[13px]', current?.path === it.path ? 'bg-primary text-primary-ink shadow-sm' : 'text-ink-muted hover:bg-surface-sunken hover:text-ink']"
          ><AppIcon :name="it.icon" :size="16" />{{ it.label }}</router-link>
        </div>
      </nav>

      <div class="flex items-center gap-2.5 border-t border-line bg-surface-sunken/50 p-3.5">
        <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent text-xs font-bold text-white">{{ initials }}</span>
        <div class="min-w-0 flex-1">
          <p class="truncate text-xs font-bold text-ink">{{ session.user?.name || L('관리자', 'Admin') }}</p>
          <p class="truncate text-[11px] text-ink-subtle">{{ session.user?.email }}</p>
        </div>
        <button type="button" class="rounded-lg p-2 text-ink-muted transition-colors hover:bg-surface hover:text-danger" :title="L('로그아웃', 'Sign out')" :aria-label="L('로그아웃', 'Sign out')" @click="logout"><AppIcon name="logout" :size="16" /></button>
      </div>
    </aside>

    <div class="flex min-w-0 flex-1 flex-col">
      <header class="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-line bg-surface/92 px-4 backdrop-blur-md lg:px-6">
        <button type="button" class="btn-ghost btn-sm -ml-1 px-2 lg:hidden" :aria-label="L('메뉴 열기', 'Open menu')" aria-controls="admin-nav" :aria-expanded="drawer" @click="drawer = true"><AppIcon name="menu" :size="20" /></button>
        <div class="flex min-w-0 items-center gap-2">
          <span class="h-2 w-2 shrink-0 rounded-full bg-primary" />
          <p class="truncate font-display text-sm font-extrabold tracking-tight text-ink sm:text-base">{{ current?.label }}</p>
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
          <button type="button" class="flex h-9 w-9 items-center justify-center rounded-field border border-line bg-surface text-ink-muted transition-colors hover:text-ink" :aria-label="dark ? L('라이트 모드', 'Light mode') : L('다크 모드', 'Dark mode')" :title="dark ? L('라이트 모드', 'Light mode') : L('다크 모드', 'Dark mode')" @click="toggleTheme"><AppIcon :name="dark ? 'sun' : 'moon'" :size="17" /></button>
        </div>
      </header>
      <main class="mx-auto w-full max-w-[1440px] flex-1 px-4 py-5 sm:px-6 lg:px-8">
        <router-view />
      </main>
    </div>
  </div>
  <ToastHost />
</template>
