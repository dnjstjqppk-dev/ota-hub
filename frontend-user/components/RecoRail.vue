<script setup lang="ts">
/**
 * TG-19: rule-based recommendation rail for product detail pages.
 * Treatment members see together/popular/recent slots; control and anonymous
 * visitors see popular only (server decides). The section hides itself on
 * flag-off (503), errors, and empty results — never an error wall.
 */
import { computed, onMounted, ref } from 'vue'
import { apiFetch } from '~/composables/useApi'
import { detailUrl } from '~/stores/wishlist'

const props = defineProps<{ domain: string; itemId: string }>()

interface Card { itemId: string; domain: string; title: string; priceKrw: number | null; exposureId: string }
type Slot = 'together' | 'popular' | 'recent'

const { t, locale } = useI18n()
const tag = computed(() => ({ ko: 'ko-KR', en: 'en-US', ja: 'ja-JP', zh: 'zh-CN' })[locale.value] || 'ko-KR')

function slotTitle(slot: Slot): string {
  return slot === 'together' ? t('reco.together') : slot === 'popular' ? t('reco.popular') : t('reco.recent')
}

function priceText(priceKrw: number | null): string {
  return typeof priceKrw === 'number' ? t('reco.priceRef', { p: priceKrw.toLocaleString(tag.value) }) : t('reco.pricePending')
}

const slots = ref<Record<Slot, Card[]>>({ together: [], popular: [], recent: [] })
const state = ref<'loading' | 'ready' | 'hidden'>('loading')

async function load() {
  state.value = 'loading'
  const r = await apiFetch<{ slots?: Record<Slot, Card[]> }>(
    `/recommendations?domain=${encodeURIComponent(props.domain)}&itemId=${encodeURIComponent(props.itemId)}`
  )
  if (!r.ok || !r.data.slots) { state.value = 'hidden'; return }
  const s = r.data.slots
  slots.value = { together: s.together || [], popular: s.popular || [], recent: s.recent || [] }
  state.value = (slots.value.together.length + slots.value.popular.length + slots.value.recent.length) > 0 ? 'ready' : 'hidden'
}

function clicked(card: Card) {
  // Fire-and-forget CTR mark; navigation must never wait for analytics.
  apiFetch('/recommendations/click', { method: 'POST', body: { exposureId: card.exposureId } }).catch(() => {})
}

onMounted(load)
</script>

<template>
  <section v-if="state === 'ready'" :aria-label="t('reco.section')" class="space-y-8">
    <div v-for="slot in (['together', 'popular', 'recent'] as Slot[])" :key="slot">
      <template v-if="slots[slot].length">
        <h2 class="text-lg font-bold tracking-tight text-ink">{{ slotTitle(slot) }}</h2>
        <ul class="mt-3 space-y-2">
          <li v-for="c in slots[slot]" :key="c.exposureId">
            <NuxtLink
              :to="$localePath(detailUrl(c.domain, c.itemId))"
              class="card flex min-h-[44px] items-center justify-between gap-3 px-4 py-3"
              @click="clicked(c)"
            >
              <span class="min-w-0 truncate text-sm font-semibold text-ink">{{ c.title }}</span>
              <span class="shrink-0 text-sm text-ink-muted">{{ priceText(c.priceKrw) }}</span>
            </NuxtLink>
          </li>
        </ul>
      </template>
    </div>
  </section>
</template>
