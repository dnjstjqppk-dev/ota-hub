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
    class="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 px-2 pb-[max(0.35rem,env(safe-area-inset-bottom))] pt-1.5 shadow-pop backdrop-blur-xl md:hidden print:hidden"
    :aria-label="$t('mobile.menu')"
  >
    <div class="mx-auto grid max-w-md grid-cols-5 gap-1">
      <NuxtLink
        v-for="i in items"
        :key="i.to"
        :to="$localePath(i.to)"
        :aria-current="active(i) ? 'page' : undefined"
        :class="[
          'relative flex min-h-[50px] flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-[11px] font-bold transition active:scale-95',
          active(i) ? 'bg-primary-soft text-primary' : 'text-ink-subtle hover:text-ink'
        ]"
      >
        <AppIcon :name="i.icon" :size="19" :stroke="active(i) ? 2.2 : 1.8" />
        <span class="max-w-full truncate">{{ $t('mobile.' + i.key) }}</span>
      </NuxtLink>
    </div>
  </nav>
</template>
