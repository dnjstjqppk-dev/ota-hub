<script setup lang="ts">
/**
 * Account area frame (design system "Terra Nord"): sign-in gate, responsive section navigation and page heading.
 */
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '~/stores/auth'
const localePath = useLocalePath()

defineProps<{ title: string; subtitle?: string }>()
const emit = defineEmits<{ ready: [] }>()
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const ready = ref(false)

const NAV = [
  { to: '/my', key: 'overview', icon: 'home', exact: true },
  { to: '/my/bookings', key: 'bookings', icon: 'bookings' },
  { to: '/my/coupons', key: 'coupons', icon: 'gift' },
  { to: '/my/wishlist', key: 'wishlist', icon: 'heart' },
  { to: '/my/passengers', key: 'passengers', icon: 'users' },
  { to: '/my/profile', key: 'profile', icon: 'user' }
]
const bare = (p: string) => p.replace(/^\/(en|ja|zh)(?=\/|$)/, '') || '/'
const active = (n: typeof NAV[number]) => (n.exact ? bare(route.path) === n.to : bare(route.path).startsWith(n.to))

onMounted(async () => {
  await auth.initAuth()
  if (!auth.isLoggedIn) { router.replace(localePath(`/login?redirect=${encodeURIComponent(route.fullPath)}`)); return }
  ready.value = true
  emit('ready')
})
useHead({ meta: [{ name: 'robots', content: 'noindex' }] })
</script>

<template>
  <div class="mx-auto max-w-6xl px-4 pb-24 pt-6 lg:px-6 lg:pt-10">
    <div class="grid gap-6 lg:grid-cols-[240px_1fr]">
      <nav class="chip-rail -mx-4 flex gap-1.5 border-b border-line px-4 pb-3 lg:mx-0 lg:block lg:space-y-1 lg:overflow-visible lg:border-0 lg:px-0 lg:pb-0" :aria-label="$t('my.nav')">
        <div v-if="auth.user" class="mb-4 hidden rounded-card border border-line bg-surface p-4 shadow-card lg:block">
          <div class="flex items-center gap-3">
            <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary font-display text-sm font-extrabold text-primary-ink">{{ (auth.user.fullName || auth.user.email || '?').trim().charAt(0).toUpperCase() }}</span>
            <div class="min-w-0">
              <p class="truncate text-sm font-bold text-ink">{{ auth.user.fullName || $t('my.member') }}</p>
              <p class="truncate text-xs text-ink-subtle">{{ auth.user.email }}</p>
            </div>
          </div>
        </div>
        <NuxtLink v-for="n in NAV" :key="n.to" :to="$localePath(n.to)" :aria-current="active(n) ? 'page' : undefined"
          :class="['flex min-h-[40px] shrink-0 items-center gap-2.5 whitespace-nowrap rounded-field border px-3.5 py-2 text-xs font-bold transition-colors sm:text-sm lg:border-transparent', active(n) ? 'border-primary bg-primary text-primary-ink shadow-sm lg:bg-primary-soft lg:text-primary' : 'border-line bg-surface text-ink-muted hover:border-line-strong hover:text-ink lg:bg-transparent']">
          <AppIcon :name="n.icon" :size="17" />{{ $t('my.' + n.key) }}
        </NuxtLink>
      </nav>
      <main class="min-w-0">
        <h1 class="font-display text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">{{ title }}</h1>
        <p v-if="subtitle" class="mt-1 text-sm text-ink-muted">{{ subtitle }}</p>
        <div class="mt-6">
          <div v-if="!ready" class="space-y-3" aria-busy="true"><div v-for="n in 3" :key="n" class="h-20 animate-pulse rounded-card bg-surface-sunken" /></div>
          <slot v-else />
        </div>
      </main>
    </div>
  </div>
</template>
