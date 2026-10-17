<script setup lang="ts">
import { useRoute } from 'vue-router'

const route = useRoute()

const navItems = [
  {
    to: '/',
    label: '홈',
    icon: '🏠',
    exact: true
  },
  {
    to: '/deals',
    label: '특가/혜택',
    icon: '🎁',
    exact: false
  },
  {
    to: '/my/bookings',
    label: '내 예약',
    icon: '📄',
    exact: false
  },
  {
    to: '/my',
    label: '마이',
    icon: '👤',
    exact: true
  }
]

const isActive = (item: typeof navItems[0]) => {
  if (item.exact) {
    return route.path === item.to
  }
  return route.path.startsWith(item.to)
}
</script>

<template>
  <nav
    class="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-md border-t border-slate-200/90 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] px-2 py-1.5 flex items-center justify-around pb-[max(0.5rem,env(safe-area-inset-bottom))]"
    aria-label="모바일 하단 네비게이션"
  >
    <NuxtLink
      v-for="item in navItems"
      :key="item.to"
      :to="item.to"
      :class="[
        'flex flex-col items-center justify-center min-w-[64px] min-h-[48px] py-1 px-2 rounded-xl transition duration-150 select-none active:scale-95',
        isActive(item) ? 'text-trip-blue font-black' : 'text-slate-400 font-bold hover:text-slate-600'
      ]"
    >
      <span class="text-lg leading-none mb-1">{{ item.icon }}</span>
      <span class="text-[10px] tracking-tight">{{ item.label }}</span>
    </NuxtLink>
  </nav>
</template>

