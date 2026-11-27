<script setup lang="ts">
/**
 * Admin console shell (design system "Solstice Ops"): grouped sidebar on desktop, drawer on phones,
 * top bar with page title, KO/EN console switcher, theme toggle, and signed-in admin profile.
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
    <!-- Sidebar (Solstice Ops Celestial Rail, drawer on < lg) -->
    <div v-if="drawer" class="fixed inset-0 z-30 bg-midnight-950/60 backdrop-blur-sm lg:hidden" aria-hidden="true" @click="drawer = false" />
    <aside
      id="admin-nav"
      :class="['fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-midnight-700 bg-midnight-900 text-white/80 transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 lg:shadow-pop', drawer ? 'translate-x-0 shadow-pop' : '-translate-x-full max-lg:invisible']"
      aria-label="Admin Navigation"
    >
      <div class="flex h-16 items-center gap-2.5 border-b border-white/10 px-4">
        <img src="/symbol.svg" alt="" class="h-8 w-8 rounded-xl" />
        <span class="font-display text-[15px] font-extrabold tracking-tight text-white">getfor<span class="text-horizon-300">trip</span></span>
        <span class="ml-auto rounded-full bg-primary/25 px-2 py-0.5 text-2xs font-bold text-horizon-300">OPS</span>
      </div>
      <nav class="flex-1 overflow-y-auto px-3 py-4">
        <div v-for="g in NAV" :key="g.group" class="mb-5">
          <p class="mb-1.5 px-2.5 text-2xs font-bold uppercase tracking-widest text-white/40">{{ g.group }}</p>
          <router-link
            v-for="it in g.items"
            :key="it.path"
            :to="it.path"
            :aria-current="current?.path === it.path ? 'page' : undefined"
            :class="['mb-0.5 flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-semibold transition-all', current?.path === it.path ? 'bg-primary text-primary-ink shadow-sm' : 'text-white/70 hover:bg-white/5 hover:text-white']"
          ><AppIcon :name="it.icon" :size="17" />{{ it.label }}</router-link>
        </div>
      </nav>
      <div class="flex items-center gap-2.5 border-t border-white/10 bg-midnight-950/50 p-3.5">
        <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-coral-500 text-xs font-bold text-white">{{ initials }}</span>
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-bold text-white">{{ session.user?.name || L('이름 없음', 'Admin') }}</p>
          <p class="truncate text-2xs text-white/50">{{ session.user?.email }}</p>
        </div>
        <button type="button" class="rounded-lg p-2 text-white/60 transition-colors hover:bg-white/10 hover:text-danger" :title="L('로그아웃', 'Sign out')" :aria-label="L('로그아웃', 'Sign out')" @click="logout"><AppIcon name="logout" :size="17" /></button>
      </div>
    </aside>

    <div class="flex min-w-0 flex-1 flex-col">
      <header class="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-line bg-canvas/90 px-4 backdrop-blur-md lg:px-6">
        <button type="button" class="btn-ghost btn-sm -ml-2 px-2 lg:hidden" :aria-label="L('메뉴 열기', 'Open menu')" aria-controls="admin-nav" :aria-expanded="drawer" @click="drawer = true"><AppIcon name="menu" :size="20" /></button>
        <div class="flex items-center gap-2">
          <span class="h-2 w-2 rounded-full bg-primary" />
          <p class="truncate font-display text-sm font-extrabold tracking-tight text-ink">{{ current?.label }}</p>
        </div>
        <div class="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            class="flex h-9 items-center gap-1 rounded-full border border-line bg-surface px-3 text-xs font-bold text-ink-muted transition-colors hover:border-primary hover:text-primary"
            @click="toggleLang"
          >
            {{ lang === 'ko' ? 'EN' : 'KO' }}
          </button>
          <a href="https://getfortrip.com" target="_blank" rel="noopener" class="hidden items-center gap-1.5 rounded-full border border-line bg-surface px-3.5 py-1.5 text-xs font-bold text-ink-muted transition-colors hover:border-primary hover:text-primary sm:inline-flex">{{ L('사용자 사이트', 'Live Site') }} <AppIcon name="external" :size="13" /></a>
          <button type="button" class="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-surface text-ink-muted transition-colors hover:text-ink" :aria-label="dark ? L('라이트 모드', 'Light mode') : L('다크 모드', 'Dark mode')" :title="dark ? L('라이트 모드', 'Light mode') : L('다크 모드', 'Dark mode')" @click="toggleTheme"><AppIcon :name="dark ? 'sun' : 'moon'" :size="17" /></button>
        </div>
      </header>
      <main class="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 lg:px-8">
        <router-view />
      </main>
    </div>
  </div>
  <ToastHost />
</template>
