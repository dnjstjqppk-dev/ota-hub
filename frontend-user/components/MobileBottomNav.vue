<script setup lang="ts">
import { useRoute } from 'vue-router'

const route = useRoute()

const items = [
  { to: '/', label: '홈', icon: 'home', exact: true },
  { to: '/deals', label: '특가', icon: 'gift', exact: false },
  { to: '/my/bookings', label: '내 예약', icon: 'bookings', exact: false },
  { to: '/my/wishlist', label: '찜', icon: 'heart', exact: false },
  { to: '/my', label: '마이', icon: 'user', exact: true }
]

const active = (i: typeof items[number]) => (i.exact ? route.path === i.to : route.path.startsWith(i.to))
</script>

<template>
  <nav
    class="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
    aria-label="하단 메뉴"
  >
    <NuxtLink
      v-for="i in items"
      :key="i.to"
      :to="i.to"
      :aria-current="active(i) ? 'page' : undefined"
      :class="['flex min-h-[56px] flex-col items-center justify-center gap-1 text-2xs font-semibold transition-colors active:scale-95', active(i) ? 'text-primary' : 'text-ink-subtle']"
    >
      <AppIcon :name="i.icon" :size="22" :stroke="active(i) ? 2.2 : 1.8" />
      {{ i.label }}
    </NuxtLink>
  </nav>
</template>
