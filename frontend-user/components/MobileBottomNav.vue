<script setup lang="ts">
import { useRoute } from 'vue-router'

const route = useRoute()

const items = [
  { to: '/', key: 'home', icon: 'home', exact: true },
  { to: '/deals', key: 'deals', icon: 'gift', exact: false },
  { to: '/my/bookings', key: 'myBookings', icon: 'bookings', exact: false },
  { to: '/my/wishlist', key: 'wishlist', icon: 'heart', exact: false },
  { to: '/my', key: 'my', icon: 'user', exact: true }
]

const bare = (p: string) => p.replace(/^\/(en|ja|zh)(?=\/|$)/, '') || '/'
const active = (i: typeof items[number]) => (i.exact ? bare(route.path) === i.to : bare(route.path).startsWith(i.to))
</script>

<template>
  <nav
    class="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 grid grid-cols-5 rounded-2xl border border-line bg-surface/95 p-1 shadow-pop backdrop-blur-md md:hidden print:hidden"
    :aria-label="$t('mobile.menu')"
  >
    <NuxtLink
      v-for="i in items"
      :key="i.to"
      :to="$localePath(i.to)"
      :aria-current="active(i) ? 'page' : undefined"
      :class="['flex min-h-[52px] flex-col items-center justify-center gap-0.5 rounded-xl text-2xs font-bold transition active:scale-95', active(i) ? 'bg-primary-soft text-primary' : 'text-ink-subtle']"
    >
      <AppIcon :name="i.icon" :size="20" :stroke="active(i) ? 2.2 : 1.8" />
      {{ $t('mobile.' + i.key) }}
    </NuxtLink>
  </nav>
</template>
