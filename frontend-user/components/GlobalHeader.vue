<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useCurrencyStore } from '~/stores/currency'
import { useAuthStore } from '~/stores/auth'
import { useCartStore } from '~/stores/cart'
import { BRAND } from '~/config/brand'
import { CATEGORIES, CURRENCIES, DISCOVER_LINKS, LOCALES, SUPPORT_LINKS } from '~/config/navigation'

const route = useRoute()
const router = useRouter()
const currency = useCurrencyStore()
const auth = useAuthStore()
const cart = useCartStore()
const { t, locale, setLocale: setI18nLocale } = useI18n()
const localePath = useLocalePath()

type Pop = 'more' | 'region' | 'account' | null
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

const primary = CATEGORIES.filter(c => c.primary)
const secondary = CATEGORIES.filter(c => !c.primary)
const localeLabel = computed(() => LOCALES.find(l => l.id === locale.value)?.label || LOCALES[0].label)
const initial = computed(() => (auth.user?.fullName || auth.user?.email || '?').trim().charAt(0).toUpperCase())
const barePath = (p: string) => p.replace(/^\/(en|ja|zh)(?=\/|$)/, '') || '/'
const isActive = (to: string) => barePath(route.path) === to || barePath(route.path).startsWith(`${to}/`)

function toggle(p: Exclude<Pop, null>) { pop.value = pop.value === p ? null : p }
function closeAll() { pop.value = null; drawer.value = false }
async function setLocale(id: string) {
  await setI18nLocale(id as 'ko' | 'en' | 'ja' | 'zh')
  await router.push(localePath({ path: barePath(route.path), query: route.query }))
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
    :class="['sticky top-0 z-40 border-b bg-surface/90 backdrop-blur-xl transition-shadow', scrolled ? 'border-line shadow-card' : 'border-transparent']"
  >
    <a href="#main" class="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-primary-ink">{{ t('header.skip') }}</a>
    <div class="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 lg:px-6">
      <NuxtLink :to="$localePath('/')" class="flex shrink-0 items-center" :title="BRAND.name">
        <img src="/logo.svg" alt="getfortrip" class="h-8 w-auto dark:hidden" width="132" height="32" />
        <img src="/logo-white.svg" alt="getfortrip" class="hidden h-8 w-auto dark:block" width="132" height="32" />
      </NuxtLink>

      <!-- Desktop navigation -->
      <nav class="hidden min-w-0 flex-1 items-center gap-1 lg:flex" :aria-label="t('header.navAria')">
        <NuxtLink
          v-for="c in primary"
          :key="c.key"
          :to="$localePath(c.to)"
          :class="['relative rounded-lg px-3 py-2 text-sm font-semibold transition-colors', isActive(c.to) ? 'text-primary' : 'text-ink-muted hover:bg-surface-sunken hover:text-ink']"
        >
          {{ t('nav.' + c.key) }}
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
            {{ t('header.more') }} <AppIcon name="chevron-down" :size="16" :class="['transition-transform', pop === 'more' && 'rotate-180']" />
          </button>
          <div v-if="pop === 'more'" role="menu" class="absolute left-0 top-full mt-2 w-64 animate-pop-in rounded-card border border-line bg-surface-raised p-2 shadow-pop">
            <NuxtLink v-for="c in secondary" :key="c.key" :to="$localePath(c.to)" role="menuitem" class="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-ink hover:bg-surface-sunken">
              <span class="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-soft text-primary"><AppIcon :name="c.icon" :size="18" /></span>{{ t('nav.' + c.key) }}
            </NuxtLink>
            <div class="my-2 h-px bg-line" />
            <NuxtLink v-for="l in DISCOVER_LINKS" :key="l.to" :to="$localePath(l.to)" role="menuitem" class="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-ink-muted hover:bg-surface-sunken hover:text-ink">
              <AppIcon :name="l.icon" :size="18" />{{ t('discover.' + l.key) }}
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
              <p class="mb-2 text-2xs font-semibold uppercase tracking-wide text-ink-subtle">{{ t('header.currency') }}</p>
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
              <p class="mb-2 text-2xs font-semibold uppercase tracking-wide text-ink-subtle">{{ t('header.language') }}</p>
              <button
                v-for="l in LOCALES"
                :key="l.id"
                type="button"
                :class="['flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-sm font-semibold', locale === l.id ? 'bg-primary-soft text-primary' : 'text-ink hover:bg-surface-sunken']"
                @click="setLocale(l.id); pop = null"
              >
                {{ l.label }}
                <AppIcon v-if="locale === l.id" name="check" :size="16" />
              </button>
            </div>
            <p class="col-span-2 border-t border-line pt-3 text-2xs leading-relaxed text-ink-subtle">{{ t('header.fxNote') }}</p>
          </div>
        </div>

        <NuxtLink :to="$localePath('/my/wishlist')" class="hidden h-10 w-10 items-center justify-center rounded-xl text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink md:flex" :aria-label="t('header.wishlist')" :title="t('header.wishlist')">
          <AppIcon name="heart" />
        </NuxtLink>
        <NuxtLink :to="$localePath('/cart')" class="relative hidden h-10 w-10 items-center justify-center rounded-xl text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink md:flex" :aria-label="t('header.cart')" :title="t('header.cart')">
          <AppIcon name="bag" />
          <span v-if="cart.count" class="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-2xs font-bold text-primary-ink tabular" data-testid="cart-count">{{ cart.count }}</span>
        </NuxtLink>
        <NuxtLink :to="$localePath('/my/bookings')" class="hidden h-10 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink md:flex">
          <AppIcon name="bookings" :size="18" />{{ t('header.myBookings') }}
        </NuxtLink>
        <button
          type="button"
          class="flex h-10 w-10 items-center justify-center rounded-xl text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink"
          :aria-label="dark ? t('header.switchToLight') : t('header.switchToDark')"
          :title="dark ? t('header.themeLight') : t('header.themeDark')"
          @click="toggleTheme"
        >
          <AppIcon :name="dark ? 'sun' : 'moon'" :size="18" />
        </button>

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
        <NuxtLink v-else :to="$localePath(`/login?redirect=${encodeURIComponent(route.fullPath)}`)" class="hidden h-10 items-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-ink transition-colors hover:bg-primary-hover md:flex">
          {{ t('nav.login') }}
        </NuxtLink>

        <button type="button" class="flex h-10 w-10 items-center justify-center rounded-xl text-ink transition-colors hover:bg-surface-sunken lg:hidden" :aria-label="t('header.menu')" :aria-expanded="drawer" @click="drawer = true">
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
        <aside v-if="drawer" class="fixed inset-y-0 right-0 z-[61] flex w-[min(88vw,380px)] flex-col bg-surface shadow-pop lg:hidden" :aria-label="t('header.menu')" role="dialog" aria-modal="true">
          <div class="flex h-16 items-center justify-between border-b border-line px-5">
            <span class="flex items-center">
              <img src="/logo.svg" alt="getfortrip" class="h-7 w-auto dark:hidden" />
              <img src="/logo-white.svg" alt="getfortrip" class="hidden h-7 w-auto dark:block" />
            </span>
            <button type="button" class="flex h-10 w-10 items-center justify-center rounded-xl text-ink-muted hover:bg-surface-sunken" :aria-label="t('header.closeMenu')" @click="drawer = false"><AppIcon name="close" /></button>
          </div>
          <div class="flex-1 overflow-y-auto overscroll-contain px-5 pb-8 pt-5">
            <div v-if="auth.isLoggedIn && auth.user" class="flex items-center gap-3 rounded-card bg-surface-sunken p-4">
              <span class="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-base font-bold text-primary-ink">{{ initial }}</span>
              <div class="min-w-0 flex-1">
                <p class="truncate font-bold text-ink">{{ auth.user.fullName }}</p>
                <p class="text-xs text-ink-muted">{{ auth.user.tier }} · <span class="tabular">{{ Number(auth.user.tripCoins ?? 0).toLocaleString() }}{{ BRAND.coinSymbol }}</span></p>
              </div>
              <NuxtLink :to="$localePath('/my')" class="text-sm font-semibold text-primary">{{ t('header.my') }}</NuxtLink>
            </div>
            <div v-else class="flex items-center justify-between rounded-card bg-primary-soft p-4">
              <p class="text-sm font-medium text-ink">{{ t('header.loginPrompt') }}</p>
              <NuxtLink :to="localePath(`/login?redirect=${encodeURIComponent(route.fullPath)}`)" class="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-ink">{{ t('nav.login') }}</NuxtLink>
            </div>

            <p class="mb-3 mt-6 text-2xs font-semibold uppercase tracking-wide text-ink-subtle">{{ t('header.products') }}</p>
            <div class="grid grid-cols-3 gap-2">
              <NuxtLink v-for="c in CATEGORIES" :key="c.key" :to="$localePath(c.to)" :class="['flex flex-col items-center gap-1.5 rounded-xl border px-1 py-3 text-xs font-semibold transition-colors', isActive(c.to) ? 'border-primary bg-primary-soft text-primary' : 'border-line text-ink hover:bg-surface-sunken']">
                <AppIcon :name="c.icon" :size="22" />{{ t('nav.' + c.key) }}
              </NuxtLink>
            </div>

            <p class="mb-2 mt-6 text-2xs font-semibold uppercase tracking-wide text-ink-subtle">{{ t('header.myTrips') }}</p>
            <NuxtLink :to="$localePath('/my/bookings')" class="flex items-center gap-3 rounded-xl px-2 py-2.5 text-sm font-medium text-ink hover:bg-surface-sunken"><AppIcon name="bookings" :size="18" class="text-ink-muted" />{{ t('header.myBookings') }}</NuxtLink>
            <NuxtLink :to="$localePath('/my/wishlist')" class="flex items-center gap-3 rounded-xl px-2 py-2.5 text-sm font-medium text-ink hover:bg-surface-sunken"><AppIcon name="heart" :size="18" class="text-ink-muted" />{{ t('header.wishlistAlerts') }}</NuxtLink>
            <NuxtLink v-for="l in DISCOVER_LINKS" :key="l.to" :to="$localePath(l.to)" class="flex items-center gap-3 rounded-xl px-2 py-2.5 text-sm font-medium text-ink hover:bg-surface-sunken"><AppIcon :name="l.icon" :size="18" class="text-ink-muted" />{{ t('discover.' + l.key) }}</NuxtLink>

            <p class="mb-2 mt-6 text-2xs font-semibold uppercase tracking-wide text-ink-subtle">{{ t('header.support') }}</p>
            <NuxtLink v-for="l in SUPPORT_LINKS" :key="l.to" :to="$localePath(l.to)" class="flex items-center gap-3 rounded-xl px-2 py-2.5 text-sm font-medium text-ink hover:bg-surface-sunken"><AppIcon :name="l.icon" :size="18" class="text-ink-muted" />{{ t('support.' + l.key) }}</NuxtLink>

            <p class="mb-2 mt-6 text-2xs font-semibold uppercase tracking-wide text-ink-subtle">{{ t('header.currency') }}</p>
            <div class="flex flex-wrap gap-1.5">
              <button v-for="c in CURRENCIES" :key="c" type="button" :class="['tabular rounded-lg border px-3 py-1.5 text-xs font-semibold', currency.activeCurrency === c ? 'border-primary bg-primary text-primary-ink' : 'border-line text-ink-muted']" @click="currency.setCurrency(c)">{{ c }}</button>
            </div>
            <p class="mb-2 mt-4 text-2xs font-semibold uppercase tracking-wide text-ink-subtle">{{ t('header.language') }}</p>
            <div class="flex flex-wrap gap-1.5">
              <button v-for="l in LOCALES" :key="l.id" type="button" :class="['rounded-lg border px-3 py-1.5 text-xs font-semibold', locale === l.id ? 'border-primary bg-primary text-primary-ink' : 'border-line text-ink-muted']" @click="setLocale(l.id)">{{ l.label }}</button>
            </div>

            <button type="button" class="mt-8 flex w-full items-center justify-between rounded-xl border border-line px-4 py-3 text-sm font-semibold text-ink hover:bg-surface-sunken" @click="toggleTheme">
              <span class="flex items-center gap-3"><AppIcon :name="dark ? 'sun' : 'moon'" :size="18" class="text-ink-muted" />{{ dark ? t('header.themeLight') : t('header.themeDark') }}</span>
              <span class="text-xs font-medium text-ink-subtle">{{ dark ? t('header.themeOn') : t('header.themeOff') }}</span>
            </button>
            <a :href="BRAND.partnerConsoleUrl" class="mt-2 flex items-center justify-between rounded-xl border border-line px-4 py-3 text-sm font-semibold text-ink hover:bg-surface-sunken">
              <span class="flex items-center gap-3"><AppIcon name="briefcase" :size="18" class="text-ink-muted" />{{ t('header.partnerConsole') }}</span><AppIcon name="external" :size="16" class="text-ink-subtle" />
            </a>
            <button v-if="auth.isLoggedIn" type="button" class="mt-2 flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-ink-muted hover:text-danger" @click="logout"><AppIcon name="logout" :size="18" />{{ t('header.logout') }}</button>
          </div>
        </aside>
      </Transition>
    </Teleport>
  </header>
</template>
