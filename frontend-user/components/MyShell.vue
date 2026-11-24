<script setup lang="ts">
/**
 * Account area frame (design system "Horizon"): sign-in gate, section navigation and page heading.
 * Emits `ready` once the session is restored and the user is signed in, so pages load data only then.
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
    <div class="grid gap-6 lg:grid-cols-[220px_1fr]">
      <nav class="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:mx-0 lg:block lg:space-y-1 lg:overflow-visible lg:px-0 [&::-webkit-scrollbar]:hidden" :aria-label="$t('my.nav')">
        <div v-if="auth.user" class="mb-4 hidden rounded-card border border-line bg-surface p-4 lg:block">
          <p class="truncate font-bold text-ink">{{ auth.user.fullName || $t('my.member') }}</p>
          <p class="truncate text-xs text-ink-subtle">{{ auth.user.email }}</p>
        </div>
        <NuxtLink v-for="n in NAV" :key="n.to" :to="$localePath(n.to)" :aria-current="active(n) ? 'page' : undefined"
          :class="['flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-colors', active(n) ? 'bg-primary-soft text-primary' : 'text-ink-muted hover:bg-surface hover:text-ink']">
          <AppIcon :name="n.icon" :size="18" />{{ $t('my.' + n.key) }}
        </NuxtLink>
      </nav>
      <main class="min-w-0">
        <h1 class="text-2xl font-extrabold tracking-tight text-ink">{{ title }}</h1>
        <p v-if="subtitle" class="mt-1 text-sm text-ink-muted">{{ subtitle }}</p>
        <div class="mt-6">
          <div v-if="!ready" class="space-y-3" aria-busy="true"><div v-for="n in 3" :key="n" class="h-20 animate-pulse rounded-card bg-surface-sunken" /></div>
          <slot v-else />
        </div>
      </main>
    </div>
  </div>
</template>
