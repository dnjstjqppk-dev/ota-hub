<script setup lang="ts">
/**
 * CR-05 popup: the first live POPUP slot, home page only. "오늘 하루 보지 않기"
 * hides that popup until tomorrow on this browser; storage failures just mean it shows again.
 */
import { computed, onBeforeUnmount, onMounted, ref, resolveComponent } from 'vue'
import { useRoute } from 'vue-router'
import { assetUrl, isExternal, useMarketingSlots } from '~/composables/useMarketing'

// Resolved once in setup: the template picks <a>, NuxtLink or <div> per slot link.
const NuxtLinkCmp = resolveComponent('NuxtLink')

const route = useRoute()
const localePath = useLocalePath()
const { load, popup } = useMarketingSlots()
const dismissed = ref<string[]>([])
const closedNow = ref(false)
const today = () => new Date().toISOString().slice(0, 10)
const KEY = 'getfortrip_popup_hidden'

const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && current.value) close(false) }
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))

onMounted(async () => {
  window.addEventListener('keydown', onKey)
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}')
    dismissed.value = raw.day === today() && Array.isArray(raw.ids) ? raw.ids : []
  } catch { dismissed.value = [] }
  if (route.path === '/') await load()
})

const current = computed(() => (route.path === '/' && !closedNow.value ? popup.value.find((p) => !dismissed.value.includes(p.id)) : undefined))

function close(forToday: boolean) {
  if (forToday && current.value) {
    const ids = [...dismissed.value, current.value.id]
    try { localStorage.setItem(KEY, JSON.stringify({ day: today(), ids })) } catch {}
  }
  closedNow.value = true
}
</script>

<template>
  <Teleport to="body">
    <div v-if="current" class="fixed inset-0 z-[60] flex items-end justify-center bg-midnight-950/50 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" :aria-label="current.title" data-testid="mkt-popup" @click.self="close(false)">
      <div class="w-full max-w-sm overflow-hidden rounded-t-3xl bg-surface shadow-pop sm:rounded-3xl">
        <component :is="isExternal(current.linkUrl) ? 'a' : (current.linkUrl ? NuxtLinkCmp : 'div')"
          v-bind="current.linkUrl ? (isExternal(current.linkUrl) ? { href: current.linkUrl, target: '_blank', rel: 'noopener' } : { to: localePath(current.linkUrl) }) : {}"
          class="block" @click="current.linkUrl && close(false)">
          <SmartImg v-if="current.imageUrl" :src="assetUrl(current.imageUrl)" :alt="current.title" icon="gift" img-class="aspect-[4/3] w-full object-cover" />
          <div class="space-y-1 p-5">
            <p class="text-lg font-bold text-ink">{{ current.title }}</p>
            <p v-if="current.subtitle" class="text-sm text-ink-muted">{{ current.subtitle }}</p>
          </div>
        </component>
        <div class="grid grid-cols-2 border-t border-line text-sm">
          <button type="button" class="min-h-[48px] px-4 text-ink-muted hover:bg-surface-sunken" @click="close(true)">{{ $t('home.popup.hideToday') }}</button>
          <button type="button" class="min-h-[48px] border-l border-line px-4 font-semibold text-ink hover:bg-surface-sunken" @click="close(false)">{{ $t('common.close') }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
