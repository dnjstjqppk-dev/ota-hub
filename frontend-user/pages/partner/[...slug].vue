<script setup lang="ts">
/**
 * The partner tools moved to the independent partner console. Old /partner/* links land here and are
 * forwarded to the matching console screen (client-side, so prerendered HTML still explains the move).
 */
import { computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { BRAND } from '~/config/brand'

const route = useRoute()
const MAP: Record<string, string> = { '': '/dashboard', login: '/login', bookings: '/orders', products: '/products', settlement: '/settlements', settings: '/profile', 'api-docs': '/api-keys' }
const target = computed(() => {
  const seg = Array.isArray(route.params.slug) ? route.params.slug.join('/') : String(route.params.slug || '')
  return BRAND.partnerConsoleUrl + (MAP[seg] ?? '/dashboard')
})
onMounted(() => { window.location.replace(target.value) })
useHead({ title: '파트너 콘솔로 이동', meta: [{ name: 'robots', content: 'noindex' }] })
</script>

<template>
  <div class="mx-auto max-w-lg px-4 py-24 text-center">
    <span class="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-soft text-primary"><AppIcon name="briefcase" /></span>
    <h1 class="mt-4 text-xl font-bold text-ink">파트너 센터가 파트너 콘솔로 옮겨졌어요</h1>
    <p class="mt-2 text-sm text-ink-muted">상품·예약·정산 관리는 파트너 콘솔에서 할 수 있어요. 잠시 후 자동으로 이동해요.</p>
    <a :href="target" class="btn-primary mt-6">파트너 콘솔 열기<AppIcon name="external" :size="16" /></a>
  </div>
</template>
