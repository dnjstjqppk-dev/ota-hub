<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useCurrencyStore } from '~/stores/currency'
import { useAuthStore } from '~/stores/auth'
import { useCartStore } from '~/stores/cart'
import { BRAND } from '~/config/brand'
import { CATEGORIES, CURRENCIES, DISCOVER_LINKS, LOCALES, SUPPORT_LINKS } from '~/config/navigation'
import { COOKIE_DOMAIN, PREF_COOKIES, buildLocalizedUrl, isSiteHost, resolveLocale } from '~/config/locale.config'

const route = useRoute()
const router = useRouter()
const currency = useCurrencyStore()
const auth = useAuthStore()
const cart = useCartStore()
const { t, locale, setLocale: setI18nLocale } = useI18n()
const localePath = useLocalePath()

type Pop = 'region' | 'account' | null
const pop = ref<Pop>(null)
const drawer = ref(false)
const scrolled = ref(false)
const headerEl = ref<HTMLElement | null>(null)
const dark = ref(false)

function applyTheme() {
  if (typeof document !== 'undefined') document.documentElement.classList.toggle('dark', dark.value)
}
function toggleTheme() {
  dark.value = !dark.value
  try { localStorage.setItem('getfortrip_theme', dark.value ? 'dark' : 'light') } catch {}
  applyTheme()
}

const activeLocaleCtx = computed(() => {
  const hostname = import.meta.client && typeof window !== 'undefined' ? window.location.hostname : ''
  return resolveLocale({
    hostname,
    searchParams: route.query as Record<string, unknown>,
    cookies: { [PREF_COOKIES.locale]: locale.value, [PREF_COOKIES.curr]: currency.activeCurrency },
  })
})
const localeLabel = computed(() => LOCALES.find(l => l.locale === activeLocaleCtx.value.locale)?.label || LOCALES.find(l => l.id === locale.value)?.label || LOCALES[0].label)
const initial = computed(() => (auth.user?.fullName || auth.user?.email || '?').trim().charAt(0).toUpperCase())
const barePath = (p: string) => p.replace(/^\/(en|ja|zh)(?=\/|$)/, '') || '/'
const isActive = (to: string) => barePath(route.path) === to || barePath(route.path).startsWith(`${to}/`)

function writePrefCookies(sub: string, loc: string, curr: string) {
  if (typeof document === 'undefined' || typeof window === 'undefined') return
  const host = window.location.hostname
  const domainAttr = isSiteHost(host) ? `; Domain=${COOKIE_DOMAIN}` : ''
  const secureAttr = window.location.protocol === 'https:' ? '; Secure' : ''
  const tail = `; Path=/${domainAttr}; Max-Age=31536000; SameSite=Lax${secureAttr}`
  document.cookie = `${PREF_COOKIES.sub}=${sub}${tail}`
  document.cookie = `${PREF_COOKIES.locale}=${loc}${tail}`
  document.cookie = `${PREF_COOKIES.curr}=${curr}${tail}`
}

function toggle(p: Exclude<Pop, null>) { pop.value = pop.value === p ? null : p }
function closeAll() { pop.value = null; drawer.value = false }
async function selectRegion(entry: typeof LOCALES[number]) {
  writePrefCookies(entry.sub, entry.locale, entry.curr)
  const host = typeof window !== 'undefined' ? window.location.hostname.toLowerCase() : ''
  const path = barePath(route.path)
  if (isSiteHost(host)) {
    const targetUrl = buildLocalizedUrl(path, {
      sub: entry.sub,
      locale: entry.locale,
      curr: entry.curr,
      query: route.query as Record<string, unknown>,
    })
    const targetHost = new URL(targetUrl).hostname.toLowerCase()
    if (targetHost !== host) {
      window.location.assign(targetUrl)
      return
    }
  }
  await setI18nLocale(entry.id as 'ko' | 'en' | 'ja' | 'zh' | 'zh-hant')
  currency.setCurrency(entry.curr)
  await router.replace({ path, query: { ...route.query, locale: entry.locale, curr: entry.curr } })
}
async function selectCurrency(curr: string) {
  currency.setCurrency(curr)
  const ctx = activeLocaleCtx.value
  writePrefCookies(ctx.sub, ctx.locale, curr)
  await router.replace({ path: barePath(route.path), query: { ...route.query, locale: ctx.locale, curr } })
}
function logout() { auth.logout(); closeAll(); router.push(localePath('/')) }

function onDoc(e: Event) {
  if (pop.value && headerEl.value && !headerEl.value.contains(e.target as Node)) pop.value = null
}
function onKey(e: KeyboardEvent) { if (e.key === 'Escape') closeAll() }
function onScroll() { scrolled.value = window.scrollY > 4 }

watch(() => route.fullPath, closeAll)
watch(drawer, (open) => { if (typeof document !== 'undefined') document.documentElement.style.overflow = open ? 'hidden' : '' })

onMounted(() => {
  cart.hydrate()
  currency.fetchRates()
  try { dark.value = localStorage.getItem('getfortrip_theme') === 'dark' } catch {}
  applyTheme()
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
    :class="['sticky top-0 z-40 border-b bg-surface/92 backdrop-blur-xl transition-[border-color,box-shadow,background-color] duration-200 print:hidden', scrolled ? 'border-line shadow-card' : 'border-line/70']"
  >
    <a href="#main" class="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-field focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-primary-ink">{{ t('header.skip') }}</a>

    <!-- Tier 1: Brand + Unified Search Bar + Utility Actions -->
    <div class="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 lg:px-6">
      <NuxtLink :to="$localePath('/')" class="flex shrink-0 items-center transition-opacity hover:opacity-90" :title="BRAND.name">
        <img src="/logo.svg" alt="getfortrip" class="h-8 w-auto dark:hidden" width="147" height="32" />
        <img src="/logo-white.svg" alt="getfortrip" class="hidden h-8 w-auto dark:block" width="147" height="32" />
      </NuxtLink>

      <!-- Desktop Architectural Quick-Search Trigger -->
      <NuxtLink
        :to="$localePath('/search')"
        class="hidden h-10 w-64 items-center gap-2.5 rounded-field border border-line bg-canvas/80 px-3.5 text-xs font-medium text-ink-subtle transition hover:border-primary/50 hover:bg-surface hover:text-ink lg:flex xl:w-80"
        :aria-label="t('home.quickSearch')"
      >
        <AppIcon name="search" :size="15" class="text-primary" />
        <span class="truncate">{{ t('home.quickSearch') }}</span>
        <span class="ml-auto rounded border border-line bg-surface px-1.5 py-0.5 font-mono text-[10px] text-ink-subtle">/</span>
      </NuxtLink>

      <div class="ml-auto flex items-center gap-1 sm:gap-1.5">
        <!-- Mobile / Tablet Quick Search Button -->
        <NuxtLink
          :to="$localePath('/search')"
          class="flex h-10 w-10 items-center justify-center rounded-field border border-line bg-surface text-ink-muted transition hover:border-primary/50 hover:text-primary lg:hidden"
          :aria-label="t('home.quickSearch')"
          :title="t('home.quickSearch')"
        >
          <AppIcon name="search" :size="17" />
        </NuxtLink>

        <!-- Region: currency + language (Tablet + Desktop) -->
        <div class="relative hidden sm:block">
          <button
            type="button"
            :aria-expanded="pop === 'region'"
            class="flex h-10 items-center gap-1.5 rounded-field border border-line bg-surface px-3 text-xs font-bold text-ink-muted transition hover:border-line-strong hover:text-ink"
            @click="toggle('region')"
          >
            <AppIcon name="globe" :size="15" class="text-primary" />
            <span class="tabular">{{ currency.activeCurrency }}</span>
            <span class="h-3 w-px bg-line-strong" />
            <span class="max-w-[5.5rem] truncate">{{ localeLabel }}</span>
          </button>
          <div v-if="pop === 'region'" class="absolute right-0 top-full z-50 mt-2 grid w-[min(92vw,320px)] animate-pop-in grid-cols-2 gap-3 rounded-card border border-line bg-surface-raised p-4 shadow-pop">
            <div>
              <p class="mb-2 text-2xs font-bold uppercase tracking-wider text-ink-subtle">{{ t('header.currency') }}</p>
              <button
                v-for="c in CURRENCIES"
                :key="c"
                type="button"
                :class="['flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-sm font-semibold', currency.activeCurrency === c ? 'bg-primary-soft text-primary' : 'text-ink hover:bg-surface-sunken']"
                @click="selectCurrency(c); pop = null"
              >
                <span class="tabular">{{ c }}</span>
                <AppIcon v-if="currency.activeCurrency === c" name="check" :size="15" />
              </button>
            </div>
            <div>
              <p class="mb-2 text-2xs font-bold uppercase tracking-wider text-ink-subtle">{{ t('header.language') }}</p>
              <button
                v-for="l in LOCALES"
                :key="l.sub"
                type="button"
                :class="['flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-sm font-semibold', activeLocaleCtx.locale === l.locale ? 'bg-primary-soft text-primary' : 'text-ink hover:bg-surface-sunken']"
                @click="selectRegion(l); pop = null"
              >
                {{ l.label }}
                <AppIcon v-if="activeLocaleCtx.locale === l.locale" name="check" :size="15" />
              </button>
            </div>
            <p class="col-span-2 border-t border-line pt-2.5 text-2xs leading-relaxed text-ink-subtle">{{ t('header.fxNote') }}</p>
          </div>
        </div>

        <NuxtLink :to="$localePath('/my/wishlist')" class="hidden h-10 w-10 items-center justify-center rounded-field text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink md:flex" :aria-label="t('header.wishlist')" :title="t('header.wishlist')">
          <AppIcon name="heart" :size="19" />
        </NuxtLink>

        <!-- Cart accessible on Mobile, Tablet, AND Desktop -->
        <NuxtLink :to="$localePath('/cart')" class="relative flex h-10 w-10 items-center justify-center rounded-field text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink" :aria-label="t('header.cart')" :title="t('header.cart')">
          <AppIcon name="bag" :size="19" />
          <span v-if="cart.count" class="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-2xs font-bold text-white shadow-sm tabular" data-testid="cart-count">{{ cart.count }}</span>
        </NuxtLink>

        <NuxtLink :to="$localePath('/my/bookings')" class="hidden h-10 items-center gap-1.5 rounded-field px-3 text-xs font-bold text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink lg:flex">
          <AppIcon name="bookings" :size="16" />{{ t('header.myBookings') }}
        </NuxtLink>

        <button
          type="button"
          class="flex h-10 w-10 items-center justify-center rounded-field text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink"
          :aria-label="dark ? t('header.switchToLight') : t('header.switchToDark')"
          :title="dark ? t('header.themeLight') : t('header.themeDark')"
          @click="toggleTheme"
        >
          <AppIcon :name="dark ? 'sun' : 'moon'" :size="18" />
        </button>

        <!-- Account (Tablet + Desktop) -->
        <div v-if="auth.isLoggedIn && auth.user" class="relative hidden sm:block">
          <button type="button" :aria-expanded="pop === 'account'" class="flex h-10 items-center gap-2 rounded-field border border-line bg-surface pl-1.5 pr-2.5 transition-colors hover:border-line-strong" @click="toggle('account')">
            <img v-if="auth.user.avatarUrl" :src="auth.user.avatarUrl" alt="" class="h-7 w-7 rounded-lg object-cover" />
            <span v-else class="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-xs font-bold text-primary-ink">{{ initial }}</span>
            <AppIcon name="chevron-down" :size="14" class="text-ink-subtle" />
          </button>
          <div v-if="pop === 'account'" role="menu" class="absolute right-0 top-full z-50 mt-2 w-64 animate-pop-in rounded-card border border-line bg-surface-raised p-2 shadow-pop">
            <div class="px-3 py-2.5">
              <p class="truncate text-sm font-bold text-ink">{{ auth.user.fullName }}</p>
              <p class="truncate text-xs text-ink-subtle">{{ auth.user.email }}</p>
              <NuxtLink :to="$localePath('/rewards')" class="mt-2 inline-flex items-center gap-1.5 rounded-full bg-warning-soft px-2.5 py-1 text-2xs font-semibold text-warning">
                <AppIcon name="coins" :size="14" />{{ auth.user.tier }} · <span class="tabular">{{ Number(auth.user.tripCoins ?? 0).toLocaleString() }}{{ BRAND.coinSymbol }}</span>
              </NuxtLink>
            </div>
            <div class="my-1 h-px bg-line" />
            <NuxtLink :to="$localePath('/my')" role="menuitem" class="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-ink hover:bg-surface-sunken"><AppIcon name="user" :size="18" />{{ t('header.mypage') }}</NuxtLink>
            <NuxtLink :to="$localePath('/my/bookings')" role="menuitem" class="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-ink hover:bg-surface-sunken"><AppIcon name="bookings" :size="18" />{{ t('header.myBookings') }}</NuxtLink>
            <NuxtLink :to="$localePath('/my/coupons')" role="menuitem" class="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-ink hover:bg-surface-sunken"><AppIcon name="gift" :size="18" />{{ t('header.coupons') }}</NuxtLink>
            <div class="my-1 h-px bg-line" />
            <button type="button" role="menuitem" class="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-ink-muted hover:bg-surface-sunken hover:text-danger" @click="logout"><AppIcon name="logout" :size="18" />{{ t('header.logout') }}</button>
          </div>
        </div>
        <NuxtLink v-else rel="nofollow" :to="$localePath(`/login?redirect=${encodeURIComponent(route.fullPath)}`)" class="hidden h-10 items-center rounded-field bg-primary px-4 text-xs font-bold text-primary-ink transition hover:bg-primary-hover sm:flex">
          {{ t('nav.login') }}
        </NuxtLink>

        <!-- Menu Drawer Trigger (Mobile + Tablet < lg) -->
        <button type="button" class="flex h-10 w-10 items-center justify-center rounded-field border border-line bg-surface text-ink transition-colors hover:bg-surface-sunken lg:hidden" :aria-label="t('header.menu')" :aria-expanded="drawer" @click="drawer = true">
          <AppIcon name="menu" :size="20" />
        </button>
      </div>
    </div>

    <!-- Tier 2: Architectural Category & Discovery Ribbon (Tablet md: + Desktop lg:) -->
    <div class="hidden border-t border-line/60 bg-canvas/55 md:block">
      <nav class="chip-rail mx-auto flex max-w-7xl items-center gap-1 px-4 py-1.5 lg:px-6" :aria-label="t('header.navAria')">
        <NuxtLink
          v-for="c in CATEGORIES"
          :key="c.key"
          :to="$localePath(c.to)"
          :class="[
            'inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition',
            isActive(c.to)
              ? 'bg-primary text-primary-ink shadow-sm'
              : 'text-ink-muted hover:bg-surface hover:text-ink'
          ]"
        >
          <AppIcon :name="c.icon" :size="15" />
          <span>{{ t('nav.' + c.key) }}</span>
        </NuxtLink>
        <span class="mx-1.5 h-4 w-px shrink-0 bg-line" aria-hidden="true" />
        <NuxtLink
          v-for="l in DISCOVER_LINKS"
          :key="l.to"
          :to="$localePath(l.to)"
          :class="[
            'inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition',
            isActive(l.to) ? 'bg-accent-soft text-accent font-bold' : 'text-ink-subtle hover:bg-surface hover:text-ink'
          ]"
        >
          <AppIcon :name="l.icon" :size="14" />
          <span>{{ t('discover.' + l.key) }}</span>
        </NuxtLink>
      </nav>
    </div>

    <!-- Slide-over Drawer (Mobile & Tablet < lg) -->
    <Teleport to="body">
      <Transition enter-from-class="opacity-0" enter-active-class="transition-opacity duration-200" leave-to-class="opacity-0" leave-active-class="transition-opacity duration-150">
        <div v-if="drawer" class="fixed inset-0 z-[60] bg-midnight-950/50 backdrop-blur-sm lg:hidden" @click="drawer = false" />
      </Transition>
      <Transition enter-from-class="translate-x-full" enter-active-class="transition-transform duration-300 ease-out" leave-to-class="translate-x-full" leave-active-class="transition-transform duration-200 ease-in">
        <aside v-if="drawer" class="fixed inset-y-0 right-0 z-[61] flex w-[min(90vw,380px)] flex-col border-l border-line bg-surface shadow-pop lg:hidden" :aria-label="t('header.menu')" role="dialog" aria-modal="true">
          <div class="flex h-16 shrink-0 items-center justify-between border-b border-line px-5">
            <span class="flex items-center">
              <img src="/logo.svg" alt="getfortrip" class="h-7 w-auto dark:hidden" />
              <img src="/logo-white.svg" alt="getfortrip" class="hidden h-7 w-auto dark:block" />
            </span>
            <button type="button" class="flex h-10 w-10 items-center justify-center rounded-field text-ink-muted hover:bg-surface-sunken" :aria-label="t('header.closeMenu')" @click="drawer = false"><AppIcon name="close" /></button>
          </div>

          <div class="sheet-scroll flex-1 overflow-y-auto overscroll-contain px-5 pb-10 pt-5">
            <div v-if="auth.isLoggedIn && auth.user" class="flex items-center gap-3 rounded-card border border-line bg-surface-sunken/70 p-4">
              <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-base font-bold text-primary-ink">{{ initial }}</span>
              <div class="min-w-0 flex-1">
                <p class="truncate font-bold text-ink">{{ auth.user.fullName }}</p>
                <p class="text-xs text-ink-muted">{{ auth.user.tier }} · <span class="tabular">{{ Number(auth.user.tripCoins ?? 0).toLocaleString() }}{{ BRAND.coinSymbol }}</span></p>
              </div>
              <NuxtLink :to="$localePath('/my')" class="rounded-lg bg-surface px-3 py-1.5 text-xs font-bold text-primary shadow-sm">{{ t('header.my') }}</NuxtLink>
            </div>
            <div v-else class="flex items-center justify-between gap-3 rounded-card border border-primary/20 bg-primary-soft p-4">
              <p class="text-sm font-semibold text-ink">{{ t('header.loginPrompt') }}</p>
              <NuxtLink rel="nofollow" :to="localePath(`/login?redirect=${encodeURIComponent(route.fullPath)}`)" class="shrink-0 rounded-field bg-primary px-3.5 py-2 text-xs font-bold text-primary-ink">{{ t('nav.login') }}</NuxtLink>
            </div>

            <p class="mb-2.5 mt-6 text-2xs font-bold uppercase tracking-wider text-ink-subtle">{{ t('header.products') }}</p>
            <div class="grid grid-cols-3 gap-2">
              <NuxtLink v-for="c in CATEGORIES" :key="c.key" :to="$localePath(c.to)" :class="['flex min-h-[68px] flex-col items-center justify-center gap-1.5 rounded-xl border px-1.5 py-2.5 text-center text-xs font-semibold transition-colors', isActive(c.to) ? 'border-primary bg-primary-soft text-primary' : 'border-line bg-canvas/50 text-ink hover:bg-surface-sunken']">
                <AppIcon :name="c.icon" :size="20" />
                <span class="line-clamp-1">{{ t('nav.' + c.key) }}</span>
              </NuxtLink>
            </div>

            <p class="mb-2 mt-6 text-2xs font-bold uppercase tracking-wider text-ink-subtle">{{ t('header.myTrips') }}</p>
            <div class="space-y-0.5">
              <NuxtLink :to="$localePath('/cart')" class="flex items-center justify-between rounded-xl px-2.5 py-2.5 text-sm font-medium text-ink hover:bg-surface-sunken">
                <span class="flex items-center gap-3"><AppIcon name="bag" :size="18" class="text-ink-muted" />{{ t('header.cart') }}</span>
                <span v-if="cart.count" class="rounded-full bg-accent px-2 py-0.5 text-2xs font-bold text-white tabular">{{ cart.count }}</span>
              </NuxtLink>
              <NuxtLink :to="$localePath('/my/bookings')" class="flex items-center gap-3 rounded-xl px-2.5 py-2.5 text-sm font-medium text-ink hover:bg-surface-sunken"><AppIcon name="bookings" :size="18" class="text-ink-muted" />{{ t('header.myBookings') }}</NuxtLink>
              <NuxtLink :to="$localePath('/my/wishlist')" class="flex items-center gap-3 rounded-xl px-2.5 py-2.5 text-sm font-medium text-ink hover:bg-surface-sunken"><AppIcon name="heart" :size="18" class="text-ink-muted" />{{ t('header.wishlistAlerts') }}</NuxtLink>
              <NuxtLink v-for="l in DISCOVER_LINKS" :key="l.to" :to="$localePath(l.to)" class="flex items-center gap-3 rounded-xl px-2.5 py-2.5 text-sm font-medium text-ink hover:bg-surface-sunken"><AppIcon :name="l.icon" :size="18" class="text-ink-muted" />{{ t('discover.' + l.key) }}</NuxtLink>
            </div>

            <p class="mb-2 mt-6 text-2xs font-bold uppercase tracking-wider text-ink-subtle">{{ t('header.support') }}</p>
            <div class="space-y-0.5">
              <NuxtLink v-for="l in SUPPORT_LINKS" :key="l.to" :to="$localePath(l.to)" class="flex items-center gap-3 rounded-xl px-2.5 py-2.5 text-sm font-medium text-ink hover:bg-surface-sunken"><AppIcon :name="l.icon" :size="18" class="text-ink-muted" />{{ t('support.' + l.key) }}</NuxtLink>
            </div>

            <p class="mb-2 mt-6 text-2xs font-bold uppercase tracking-wider text-ink-subtle">{{ t('header.currency') }}</p>
            <div class="flex flex-wrap gap-1.5">
              <button v-for="c in CURRENCIES" :key="c" type="button" :class="['tabular min-h-[36px] rounded-lg border px-3 py-1.5 text-xs font-bold', currency.activeCurrency === c ? 'border-primary bg-primary text-primary-ink' : 'border-line text-ink-muted hover:text-ink']" @click="selectCurrency(c)">{{ c }}</button>
            </div>

            <p class="mb-2 mt-4 text-2xs font-bold uppercase tracking-wider text-ink-subtle">{{ t('header.language') }}</p>
            <div class="flex flex-wrap gap-1.5">
              <button v-for="l in LOCALES" :key="l.sub" type="button" :class="['min-h-[36px] rounded-lg border px-3 py-1.5 text-xs font-bold', activeLocaleCtx.locale === l.locale ? 'border-primary bg-primary text-primary-ink' : 'border-line text-ink-muted hover:text-ink']" @click="selectRegion(l)">{{ l.label }}</button>
            </div>

            <button type="button" class="mt-7 flex w-full items-center justify-between rounded-xl border border-line bg-canvas/60 px-4 py-3 text-sm font-semibold text-ink hover:bg-surface-sunken" @click="toggleTheme">
              <span class="flex items-center gap-3"><AppIcon :name="dark ? 'sun' : 'moon'" :size="18" class="text-ink-muted" />{{ dark ? t('header.themeLight') : t('header.themeDark') }}</span>
              <span class="text-xs font-medium text-ink-subtle">{{ dark ? t('header.themeOn') : t('header.themeOff') }}</span>
            </button>
            <a :href="BRAND.partnerConsoleUrl" class="mt-2 flex items-center justify-between rounded-xl border border-line bg-canvas/60 px-4 py-3 text-sm font-semibold text-ink hover:bg-surface-sunken">
              <span class="flex items-center gap-3"><AppIcon name="briefcase" :size="18" class="text-ink-muted" />{{ t('header.partnerConsole') }}</span><AppIcon name="external" :size="16" class="text-ink-subtle" />
            </a>
            <button v-if="auth.isLoggedIn" type="button" class="mt-2 flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-ink-muted hover:text-danger" @click="logout"><AppIcon name="logout" :size="18" />{{ t('header.logout') }}</button>
          </div>
        </aside>
      </Transition>
    </Teleport>
  </header>
</template>
