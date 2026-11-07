<script setup lang="ts">
/** Save-to-wishlist heart. Server-synced per user; login required. */
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useWishlistStore } from '~/stores/wishlist'
import { useAuthStore } from '~/stores/auth'

const props = defineProps<{
  domain: 'HOTEL' | 'FLIGHT' | 'TRAIN' | 'CAR' | 'TRANSFER' | 'ACTIVITY' | 'PACKAGE'
  itemId: string
  title: string
  priceKrw?: number | null
  thumbnailUrl?: string | null
  targetUrl: string
}>()

const store = useWishlistStore()
const auth = useAuthStore()
const router = useRouter()
const saved = computed(() => store.isSaved(props.itemId))

onMounted(() => {
  if (!store.items.length) void store.initWishlist()
})

async function toggle() {
  if (!auth.isLoggedIn) {
    await router.push(`/login?redirect=${encodeURIComponent(router.currentRoute.value.fullPath)}`)
    return
  }
  await store.toggleWishlist({
    domainType: props.domain,
    itemId: props.itemId,
    title: props.title,
    priceKrw: props.priceKrw || 0,
    thumbnailUrl: props.thumbnailUrl || '',
    targetUrl: props.targetUrl
  })
}
</script>

<template>
  <button
    type="button"
    :aria-pressed="saved"
    :aria-label="saved ? '찜 해제' : '찜하기'"
    class="inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors"
    :class="saved ? 'border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100' : 'border-line-strong bg-surface text-ink-muted hover:bg-surface-sunken'"
    data-testid="wishlist-toggle"
    @click="toggle"
  >
    <AppIcon name="heart" :size="14" :stroke="saved ? 0 : 2" :class="saved ? 'fill-current' : ''" />{{ saved ? '찜 해제' : '찜하기' }}
  </button>
</template>
