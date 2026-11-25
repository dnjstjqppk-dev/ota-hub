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
    { path: '/insights', label: '비즈니스 분석', icon: 'coins' },
    { path: '/slo', label: 'SLO·장애', icon: 'shield' },
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
    { path: '/reviews', label: '리뷰 검수', icon: 'star' },
    { path: '/marketing', label: '배너·기획전', icon: 'megaphone' },
    { path: '/support', label: '공지사항', icon: 'megaphone' },
    { path: '/tickets', label: '1:1 문의', icon: 'support' },
    { path: '/promotions', label: '프로모션', icon: 'gift' }
  ] },
  { group: '재무·설정', items: [
    { path: '/settlements', label: '정산·감사 로그', icon: 'ledger' },
    { path: '/pricing', label: '환율', icon: 'exchange' },
    { path: '/feature-flags', label: '기능 플래그', icon: 'flag' },
    { path: '/entities', label: '사업자·계약', icon: 'briefcase' },
    { path: '/legal', label: '약관 버전', icon: 'shield' },
    { path: '/security', label: '내 보안', icon: 'lock' }
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
    <!-- Sidebar (Meridian Ops Obsidian Rail, drawer on < lg) -->
    <div v-if="drawer" class="fixed inset-0 z-30 bg-midnight-950/60 backdrop-blur-sm lg:hidden" aria-hidden="true" @click="drawer = false" />
    <aside
      id="admin-nav"
      :class="['fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-midnight-700 bg-midnight-900 text-white/80 transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 lg:shadow-pop', drawer ? 'translate-x-0 shadow-pop' : '-translate-x-full max-lg:invisible']"
      aria-label="관리자 메뉴"
    >
      <div class="flex h-16 items-center gap-2.5 border-b border-white/10 px-4">
        <img src="/symbol.svg" alt="" class="h-8 w-8 rounded-xl" />
        <span class="text-[15px] font-extrabold tracking-tight text-white">getfor<span class="text-horizon-300">trip</span></span>
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
          <p class="truncate text-sm font-bold text-white">{{ session.user?.name || '이름 없음' }}</p>
          <p class="truncate text-2xs text-white/50">{{ session.user?.email }}</p>
        </div>
        <button type="button" class="rounded-lg p-2 text-white/60 transition-colors hover:bg-white/10 hover:text-danger" title="로그아웃" aria-label="로그아웃" @click="logout"><AppIcon name="logout" :size="17" /></button>
      </div>
    </aside>

    <div class="flex min-w-0 flex-1 flex-col">
      <header class="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-line bg-canvas/85 px-4 backdrop-blur-xl lg:px-6">
        <button type="button" class="btn-ghost btn-sm -ml-2 px-2 lg:hidden" aria-label="메뉴 열기" aria-controls="admin-nav" :aria-expanded="drawer" @click="drawer = true"><AppIcon name="menu" :size="20" /></button>
        <div class="flex items-center gap-2">
          <span class="h-2 w-2 rounded-full bg-primary" />
          <p class="truncate text-sm font-extrabold tracking-tight text-ink">{{ current?.label }}</p>
        </div>
        <div class="ml-auto flex items-center gap-1.5">
          <a href="https://getfortrip.com" target="_blank" rel="noopener" class="hidden items-center gap-1.5 rounded-full border border-line bg-surface px-3.5 py-1.5 text-xs font-bold text-ink-muted transition-colors hover:border-primary hover:text-primary sm:inline-flex">사용자 사이트 <AppIcon name="external" :size="13" /></a>
          <button type="button" class="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-surface text-ink-muted transition-colors hover:text-ink" :aria-label="dark ? '라이트 모드' : '다크 모드'" :title="dark ? '라이트 모드' : '다크 모드'" @click="toggleTheme"><AppIcon :name="dark ? 'sun' : 'moon'" :size="17" /></button>
        </div>
      </header>
      <main class="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 lg:px-8">
        <router-view />
      </main>
    </div>
  </div>
  <ToastHost />
</template>
