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
const { t } = useI18n()
useHead({ title: t('partnerMove.title'), meta: [{ name: 'robots', content: 'noindex' }] })
</script>

<template>
  <div class="mx-auto max-w-lg px-4 py-24 text-center">
    <span class="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-soft text-primary"><AppIcon name="briefcase" /></span>
    <h1 class="mt-4 text-xl font-bold text-ink">{{ $t('partnerMove.h1') }}</h1>
    <p class="mt-2 text-sm text-ink-muted">{{ $t('partnerMove.sub') }}</p>
    <a :href="target" class="btn-primary mt-6">{{ $t('partnerMove.open') }}<AppIcon name="external" :size="16" /></a>
  </div>
</template>
