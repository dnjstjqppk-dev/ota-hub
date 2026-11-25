<script setup lang="ts">
/**
 * "Notify me below this price". Stored server-side per user; delivery (email) is not connected yet,
 * which the UI states plainly instead of promising a notification.
 */
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '~/stores/auth'
import { apiFetch } from '~/composables/useApi'
import { useApiError } from '~/composables/useApiError'
const localePath = useLocalePath()
const { t } = useI18n()
const apiErr = useApiError()

const props = defineProps<{ domain: string; itemId: string; label: string; currentPrice?: number | null }>()
const auth = useAuthStore()
const router = useRouter()

const open = ref(false)
const target = ref<number | null>(props.currentPrice ? Math.floor((props.currentPrice * 0.9) / 1000) * 1000 : null)
const busy = ref(false)
const result = ref('')
const err = ref('')

function toggle() {
  if (!auth.isLoggedIn) return router.push(localePath(`/login?redirect=${encodeURIComponent(router.currentRoute.value.fullPath)}`))
  open.value = !open.value
}

async function save() {
  err.value = ''
  if (!target.value || target.value <= 0) { err.value = t('wishlist.needTarget'); return }
  busy.value = true
  const r = await apiFetch('/price-alerts', { method: 'POST', body: { domainType: props.domain, itemId: props.itemId, routeOrHotel: props.label, targetPrice: target.value, currentPriceKrw: props.currentPrice || 0 } })
  busy.value = false
  if (!r.ok) { err.value = apiErr(r, 'wishlist.saveFailed'); return }
  result.value = t('wishlist.saved')
  open.value = false
}
</script>

<template>
  <div class="inline-block text-left" data-testid="price-alert">
    <button type="button" class="inline-flex min-h-[40px] items-center gap-1.5 whitespace-nowrap rounded-xl border border-line-strong bg-surface px-3 py-2 text-xs font-semibold text-ink-muted hover:bg-surface-sunken" @click="toggle"><AppIcon name="bolt" :size="14" />{{ t('wishlist.alert') }}</button>
    <form v-if="open" class="mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface p-3 text-sm shadow-sm" @submit.prevent="save">
      <label class="text-xs text-ink-muted">{{ t('wishlist.target') }}
        <input v-model.number="target" type="number" min="1000" step="1000" class="ml-1 w-32 rounded-lg border border-line-strong px-2 py-1" data-testid="alert-target" />
      </label>
      <button type="submit" :disabled="busy" class="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">{{ busy ? t('wishlist.saving') : t('wishlist.saveCta') }}</button>
      <p v-if="err" class="w-full text-xs text-danger" role="alert">{{ err }}</p>
    </form>
    <p v-if="result" class="mt-1 text-xs text-ink-subtle" role="status">{{ result }}</p>
  </div>
</template>
