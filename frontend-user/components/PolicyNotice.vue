<script setup lang="ts">
/**
 * Structured cancellation policy slot. Fetches GET /policies once and exposes
 * { policy, loaded } to the slot; parents render their own default when null.
 * Never blocks rendering: failures degrade to policy=null.
 */
import { onMounted, ref } from 'vue'
import { useApiUrl } from '~/composables/useApi'

const props = defineProps<{ domain: string; itemId: string }>()
const policy = ref<any>(null)
const loaded = ref(false)

onMounted(async () => {
  try {
    const res = await fetch(useApiUrl(`/policies?domain=${encodeURIComponent(props.domain)}&itemId=${encodeURIComponent(props.itemId)}`), { signal: AbortSignal.timeout(8000) })
    if (res.ok) policy.value = (await res.json()).policy || null
  } catch { /* default branch below */ }
  loaded.value = true
})

interface PolicyTier { hours_before: number; refund_bps: number; note?: string }
function hoursLabel(h: number): string {
  if (h >= 24 && h % 24 === 0) return `${h / 24}일`
  if (h >= 24) return `${h}시간(${(h / 24).toFixed(1)}일)`
  return `${h}시간`
}
function pct(bps: number): string {
  return `${Number((bps / 100).toFixed(bps % 100 === 0 ? 0 : 1))}%`
}
</script>

<template>
  <slot :policy="policy" :loaded="loaded" :hours-label="hoursLabel" :pct="pct" />
</template>
