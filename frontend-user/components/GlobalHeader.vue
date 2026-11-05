<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useCurrencyStore } from '~/stores/currency'
import { useAuthStore } from '~/stores/auth'
import { useLocaleStore, type SupportedLocale } from '~/stores/locale'
import { BRAND } from '~/config/brand'
import { CATEGORIES, CURRENCIES, DISCOVER_LINKS, LOCALES, SUPPORT_LINKS } from '~/config/navigation'

const route = useRoute()
const router = useRouter()
const currency = useCurrencyStore()
const auth = useAuthStore()
const locale = useLocaleStore()

type Pop = 'more' | 'region' | 'account' | null
const pop = ref<Pop>(null)
const drawer = ref(false)
const scrolled = ref(false)
const headerEl = ref<HTMLElement | null>(null)

const primary = CATEGORIES.filter(c => c.primary)
const secondary = CATEGORIES.filter(c => !c.primary)
const localeLabel = computed(() => LOCALES.find(l => l.id === locale.activeLocale)?.label || '한국어')
const initial = computed(() => (auth.user?.fullName || auth.user?.email || '?').trim().charAt(0).toUpperCase())
const isActive = (to: string) => route.path === to || route.path.startsWith(`${to}/`)

function toggle(p: Exclude<Pop, null>) { pop.value = pop.value === p ? null : p }
function closeAll() { pop.value = null; drawer.value = false }
function setLocale(id: string) { locale.setLocale(id as SupportedLocale) }
function logout() { auth.logout(); closeAll(); router.push('/') }

function onDoc(e: Event) {
  if (pop.value && headerEl.value && !headerEl.value.contains(e.target as Node)) pop.value = null
}
function onKey(e: KeyboardEvent) { if (e.key === 'Escape') closeAll() }
function onScroll() { scrolled.value = window.scrollY > 4 }

watch(() => route.fullPath, closeAll)
watch(drawer, (open) => { if (typeof document !== 'undefined') document.documentElement.style.overflow = open ? 'hidden' : '' })

onMounted(() => {
  currency.fetchRates()
  locale.initLocale()
  document.addEventListener('pointerdown', onDoc)
  document.addEventListener('keydown', onKey)
  window.addEventListener('scroll', onScroll, { passive: true })
  onScroll()
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDoc)
  document.removeEventListener('keydown', onKey)
  window.removeEventListener('scroll', onScroll)
  document.documentElement.style.overflow = ''
})
</script>

<template>
  <header
    ref="headerEl"
    :class="['sticky top-0 z-40 border-b bg-surface/90 backdrop-blur-xl transition-shadow', scrolled ? 'border-line shadow-card' : 'border-transparent']"
  >
    <a href="#main" class="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-primary-ink">본문으로 건너뛰기</a>
    <div class="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 lg:px-6">
      <NuxtLink to="/" class="flex shrink-0 items-center" :title="BRAND.name">
        <img src="/logo.svg" alt="getfortrip" class="h-8 w-auto" width="132" height="32" />
      </NuxtLink>

      <!-- Desktop navigation -->
      <nav class="hidden min-w-0 flex-1 items-center gap-1 lg:flex" aria-label="상품 카테고리">
        <NuxtLink
          v-for="c in primary"
          :key="c.key"
          :to="c.to"
          :class="['relative rounded-lg px-3 py-2 text-sm font-semibold transition-colors', isActive(c.to) ? 'text-primary' : 'text-ink-muted hover:bg-surface-sunken hover:text-ink']"
        >
          {{ c.label }}
          <span v-if="isActive(c.to)" class="absolute inset-x-3 -bottom-[13px] h-0.5 rounded-full bg-primary" />
        </NuxtLink>
        <div class="relative">
          <button
            type="button"
            :aria-expanded="pop === 'more'"
            aria-haspopup="menu"
            class="flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-semibold text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink"
            @click="toggle('more')"
          >
            더보기 <AppIcon name="chevron-down" :size="16" :class="['transition-transform', pop === 'more' && 'rotate-180']" />
          </button>
          <div v-if="pop === 'more'" role="menu" class="absolute left-0 top-full mt-2 w-64 animate-pop-in rounded-card border border-line bg-surface-raised p-2 shadow-pop">
            <NuxtLink v-for="c in secondary" :key="c.key" :to="c.to" role="menuitem" class="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-ink hover:bg-surface-sunken">
              <span class="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-soft text-primary"><AppIcon :name="c.icon" :size="18" /></span>{{ c.label }}
            </NuxtLink>
            <div class="my-2 h-px bg-line" />
            <NuxtLink v-for="l in DISCOVER_LINKS" :key="l.to" :to="l.to" role="menuitem" class="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-ink-muted hover:bg-surface-sunken hover:text-ink">
              <AppIcon :name="l.icon" :size="18" />{{ l.label }}
            </NuxtLink>
          </div>
        </div>
      </nav>

      <div class="ml-auto flex items-center gap-1.5">
        <!-- Region: currency + language -->
        <div class="relative hidden sm:block">
          <button
            type="button"
            :aria-expanded="pop === 'region'"
            class="flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink"
            @click="toggle('region')"
          >
            <AppIcon name="globe" :size="18" />
            <span class="tabular">{{ currency.activeCurrency }}</span>
            <span class="h-3 w-px bg-line-strong" />
            <span>{{ localeLabel }}</span>
          </button>
          <div v-if="pop === 'region'" class="absolute right-0 top-full mt-2 grid w-80 animate-pop-in grid-cols-2 gap-4 rounded-card border border-line bg-surface-raised p-4 shadow-pop">
            <div>
              <p class="mb-2 text-2xs font-semibold uppercase tracking-wide text-ink-subtle">통화</p>
              <button
                v-for="c in CURRENCIES"
                :key="c"
                type="button"
                :class="['flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-sm font-semibold', currency.activeCurrency === c ? 'bg-primary-soft text-primary' : 'text-ink hover:bg-surface-sunken']"
                @click="currency.setCurrency(c); pop = null"
              >
                <span class="tabular">{{ c }}</span>
                <AppIcon v-if="currency.activeCurrency === c" name="check" :size="16" />
              </button>
            </div>
            <div>
              <p class="mb-2 text-2xs font-semibold uppercase tracking-wide text-ink-subtle">언어</p>
              <button
                v-for="l in LOCALES"
                :key="l.id"
                type="button"
                :class="['flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-sm font-semibold', locale.activeLocale === l.id ? 'bg-primary-soft text-primary' : 'text-ink hover:bg-surface-sunken']"
                @click="setLocale(l.id); pop = null"
              >
                {{ l.label }}
                <AppIcon v-if="locale.activeLocale === l.id" name="check" :size="16" />
              </button>
            </div>
            <p class="col-span-2 border-t border-line pt-3 text-2xs leading-relaxed text-ink-subtle">다른 통화 금액은 참고용 환산값이며, 결제는 원화(KRW)로 진행됩니다.</p>
          </div>
        </div>

        <NuxtLink to="/my/wishlist" class="hidden h-10 w-10 items-center justify-center rounded-xl text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink md:flex" aria-label="위시리스트" title="위시리스트">
          <AppIcon name="heart" />
        </NuxtLink>
        <NuxtLink to="/my/bookings" class="hidden h-10 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink md:flex">
          <AppIcon name="bookings" :size="18" />내 예약
        </NuxtLink>

        <!-- Account -->
        <div v-if="auth.isLoggedIn && auth.user" class="relative hidden md:block">
          <button type="button" :aria-expanded="pop === 'account'" class="flex h-10 items-center gap-2 rounded-xl pl-1 pr-2 transition-colors hover:bg-surface-sunken" @click="toggle('account')">
            <img v-if="auth.user.avatarUrl" :src="auth.user.avatarUrl" alt="" class="h-8 w-8 rounded-full object-cover" />
            <span v-else class="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-ink">{{ initial }}</span>
            <AppIcon name="chevron-down" :size="16" class="text-ink-subtle" />
          </button>
          <div v-if="pop === 'account'" role="menu" class="absolute right-0 top-full mt-2 w-64 animate-pop-in rounded-card border border-line bg-surface-raised p-2 shadow-pop">
            <div class="px-3 py-2.5">
              <p class="truncate text-sm font-bold text-ink">{{ auth.user.fullName }}</p>
              <p class="truncate text-xs text-ink-subtle">{{ auth.user.email }}</p>
              <NuxtLink to="/rewards" class="mt-2 inline-flex items-center gap-1.5 rounded-full bg-warning-soft px-2.5 py-1 text-2xs font-semibold text-warning">
                <AppIcon name="coins" :size="14" />{{ auth.user.tier }} · <span class="tabular">{{ Number(auth.user.tripCoins ?? 0).toLocaleString() }}{{ BRAND.coinSymbol }}</span>
              </NuxtLink>
            </div>
            <div class="my-1 h-px bg-line" />
            <NuxtLink to="/my" role="menuitem" class="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-ink hover:bg-surface-sunken"><AppIcon name="user" :size="18" />마이페이지</NuxtLink>
            <NuxtLink to="/my/bookings" role="menuitem" class="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-ink hover:bg-surface-sunken"><AppIcon name="bookings" :size="18" />예약 내역</NuxtLink>
            <NuxtLink to="/my/coupons" role="menuitem" class="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-ink hover:bg-surface-sunken"><AppIcon name="gift" :size="18" />쿠폰함</NuxtLink>
            <div class="my-1 h-px bg-line" />
            <button type="button" role="menuitem" class="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-ink-muted hover:bg-surface-sunken hover:text-danger" @click="logout"><AppIcon name="logout" :size="18" />로그아웃</button>
          </div>
        </div>
        <NuxtLink v-else :to="`/login?redirect=${encodeURIComponent(route.fullPath)}`" class="hidden h-10 items-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-ink transition-colors hover:bg-primary-hover md:flex">
          로그인
        </NuxtLink>

        <button type="button" class="flex h-10 w-10 items-center justify-center rounded-xl text-ink transition-colors hover:bg-surface-sunken lg:hidden" aria-label="전체 메뉴" :aria-expanded="drawer" @click="drawer = true">
          <AppIcon name="menu" :size="22" />
        </button>
      </div>
    </div>

    <!-- Drawer (mobile / tablet) -->
    <Teleport to="body">
      <Transition enter-from-class="opacity-0" enter-active-class="transition-opacity duration-200" leave-to-class="opacity-0" leave-active-class="transition-opacity duration-150">
        <div v-if="drawer" class="fixed inset-0 z-[60] bg-midnight-950/50 backdrop-blur-sm lg:hidden" @click="drawer = false" />
      </Transition>
      <Transition enter-from-class="translate-x-full" enter-active-class="transition-transform duration-300 ease-out" leave-to-class="translate-x-full" leave-active-class="transition-transform duration-200 ease-in">
        <aside v-if="drawer" class="fixed inset-y-0 right-0 z-[61] flex w-[min(88vw,380px)] flex-col bg-surface shadow-pop lg:hidden" aria-label="전체 메뉴" role="dialog" aria-modal="true">
          <div class="flex h-16 items-center justify-between border-b border-line px-5">
            <img src="/logo.svg" alt="getfortrip" class="h-7 w-auto" />
            <button type="button" class="flex h-10 w-10 items-center justify-center rounded-xl text-ink-muted hover:bg-surface-sunken" aria-label="메뉴 닫기" @click="drawer = false"><AppIcon name="close" /></button>
          </div>
          <div class="flex-1 overflow-y-auto overscroll-contain px-5 pb-8 pt-5">
            <div v-if="auth.isLoggedIn && auth.user" class="flex items-center gap-3 rounded-card bg-surface-sunken p-4">
              <span class="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-base font-bold text-primary-ink">{{ initial }}</span>
              <div class="min-w-0 flex-1">
                <p class="truncate font-bold text-ink">{{ auth.user.fullName }}</p>
                <p class="text-xs text-ink-muted">{{ auth.user.tier }} · <span class="tabular">{{ Number(auth.user.tripCoins ?? 0).toLocaleString() }}{{ BRAND.coinSymbol }}</span></p>
              </div>
              <NuxtLink to="/my" class="text-sm font-semibold text-primary">마이</NuxtLink>
            </div>
            <div v-else class="flex items-center justify-between rounded-card bg-primary-soft p-4">
              <p class="text-sm font-medium text-ink">로그인하고 예약을 관리하세요</p>
              <NuxtLink :to="`/login?redirect=${encodeURIComponent(route.fullPath)}`" class="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-ink">로그인</NuxtLink>
            </div>

            <p class="mb-3 mt-6 text-2xs font-semibold uppercase tracking-wide text-ink-subtle">여행 상품</p>
            <div class="grid grid-cols-3 gap-2">
              <NuxtLink v-for="c in CATEGORIES" :key="c.key" :to="c.to" :class="['flex flex-col items-center gap-1.5 rounded-xl border px-1 py-3 text-xs font-semibold transition-colors', isActive(c.to) ? 'border-primary bg-primary-soft text-primary' : 'border-line text-ink hover:bg-surface-sunken']">
                <AppIcon :name="c.icon" :size="22" />{{ c.label }}
              </NuxtLink>
            </div>

            <p class="mb-2 mt-6 text-2xs font-semibold uppercase tracking-wide text-ink-subtle">내 여행</p>
            <NuxtLink to="/my/bookings" class="flex items-center gap-3 rounded-xl px-2 py-2.5 text-sm font-medium text-ink hover:bg-surface-sunken"><AppIcon name="bookings" :size="18" class="text-ink-muted" />예약 내역</NuxtLink>
            <NuxtLink to="/my/wishlist" class="flex items-center gap-3 rounded-xl px-2 py-2.5 text-sm font-medium text-ink hover:bg-surface-sunken"><AppIcon name="heart" :size="18" class="text-ink-muted" />위시리스트·가격 알림</NuxtLink>
            <NuxtLink v-for="l in DISCOVER_LINKS" :key="l.to" :to="l.to" class="flex items-center gap-3 rounded-xl px-2 py-2.5 text-sm font-medium text-ink hover:bg-surface-sunken"><AppIcon :name="l.icon" :size="18" class="text-ink-muted" />{{ l.label }}</NuxtLink>

            <p class="mb-2 mt-6 text-2xs font-semibold uppercase tracking-wide text-ink-subtle">고객 지원</p>
            <NuxtLink v-for="l in SUPPORT_LINKS" :key="l.to" :to="l.to" class="flex items-center gap-3 rounded-xl px-2 py-2.5 text-sm font-medium text-ink hover:bg-surface-sunken"><AppIcon :name="l.icon" :size="18" class="text-ink-muted" />{{ l.label }}</NuxtLink>

            <p class="mb-2 mt-6 text-2xs font-semibold uppercase tracking-wide text-ink-subtle">통화</p>
            <div class="flex flex-wrap gap-1.5">
              <button v-for="c in CURRENCIES" :key="c" type="button" :class="['tabular rounded-lg border px-3 py-1.5 text-xs font-semibold', currency.activeCurrency === c ? 'border-primary bg-primary text-primary-ink' : 'border-line text-ink-muted']" @click="currency.setCurrency(c)">{{ c }}</button>
            </div>
            <p class="mb-2 mt-4 text-2xs font-semibold uppercase tracking-wide text-ink-subtle">언어</p>
            <div class="flex flex-wrap gap-1.5">
              <button v-for="l in LOCALES" :key="l.id" type="button" :class="['rounded-lg border px-3 py-1.5 text-xs font-semibold', locale.activeLocale === l.id ? 'border-primary bg-primary text-primary-ink' : 'border-line text-ink-muted']" @click="setLocale(l.id)">{{ l.label }}</button>
            </div>

            <a :href="BRAND.partnerConsoleUrl" class="mt-8 flex items-center justify-between rounded-xl border border-line px-4 py-3 text-sm font-semibold text-ink hover:bg-surface-sunken">
              <span class="flex items-center gap-3"><AppIcon name="briefcase" :size="18" class="text-ink-muted" />파트너 콘솔</span><AppIcon name="external" :size="16" class="text-ink-subtle" />
            </a>
            <button v-if="auth.isLoggedIn" type="button" class="mt-2 flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-ink-muted hover:text-danger" @click="logout"><AppIcon name="logout" :size="18" />로그아웃</button>
          </div>
        </aside>
      </Transition>
    </Teleport>
  </header>
</template>
