<script setup lang="ts">
/**
 * Wishlist and price alerts (design system "Horizon"), both read from and deleted through the API.
 * Alerts are created from product pages (PriceAlertButton). Email delivery of alerts is not wired yet,
 * and the page says so instead of promising notifications.
 */
import { ref } from 'vue'
import { apiFetch, formatKrw } from '~/composables/useApi'

useHead({ title: '찜·가격 알림' })
const items = ref<any[]>([])
const alerts = ref<any[]>([])
const state = ref<'loading' | 'ready' | 'error'>('loading')
const removing = ref('')
const err = ref('')

const PATHS: Record<string, string> = { HOTEL: '/hotels/detail/', FLIGHT: '/flights/detail/', TRAIN: '/trains/detail/', CAR: '/cars/detail/', TRANSFER: '/transfers/detail/', ACTIVITY: '/things-to-do/detail/', PACKAGE: '/packages/detail/' }
const ICONS: Record<string, string> = { HOTEL: 'hotel', FLIGHT: 'flight', TRAIN: 'train', CAR: 'car', TRANSFER: 'transfer', ACTIVITY: 'ticket', PACKAGE: 'package' }
const linkOf = (domain: string, id: string) => (PATHS[domain] && id && id !== 'general' ? PATHS[domain] + id : '')

async function load() {
  state.value = 'loading'
  const [w, a] = await Promise.all([apiFetch('/wishlist'), apiFetch('/price-alerts')])
  if (!w.ok || !a.ok) { state.value = 'error'; return }
  items.value = w.data.wishlist || []
  alerts.value = a.data.alerts || []
  state.value = 'ready'
}
async function remove(kind: 'wishlist' | 'price-alerts', id: string) {
  removing.value = id; err.value = ''
  const r = await apiFetch(`/${kind}/${encodeURIComponent(id)}`, { method: 'DELETE' })
  removing.value = ''
  if (!r.ok) { err.value = '삭제하지 못했어요. 다시 시도해 주세요.'; return }
  if (kind === 'wishlist') items.value = items.value.filter((x) => x.id !== id)
  else alerts.value = alerts.value.filter((x) => x.id !== id)
}
</script>

<template>
  <MyShell title="찜·가격 알림" subtitle="상품 페이지의 하트와 ‘최저가 알림’ 버튼으로 추가할 수 있어요." @ready="load">
    <p v-if="err" class="mb-4 rounded-xl bg-danger-soft px-4 py-2.5 text-sm font-medium text-danger" role="alert">{{ err }}</p>

    <h2 class="mb-3 text-lg font-bold text-ink">찜한 상품</h2>
    <ResultsState :state="state" :count="items.length" icon="heart" empty-title="찜한 상품이 없어요" empty-hint="마음에 드는 숙소나 항공편을 찜해 두면 여기에서 다시 볼 수 있어요." error-title="찜 목록을 불러오지 못했어요" @retry="load">
      <ul class="grid gap-3 sm:grid-cols-2">
        <li v-for="w in items" :key="w.id" class="card flex items-center gap-3 p-3">
          <SmartImg :src="w.thumbnail_url" :alt="w.item_title" :icon="ICONS[w.domain_type] || 'heart'" img-class="h-16 w-16 shrink-0 rounded-xl object-cover" />
          <div class="min-w-0 flex-1">
            <NuxtLink v-if="linkOf(w.domain_type, w.item_id)" :to="linkOf(w.domain_type, w.item_id)" class="line-clamp-2 text-sm font-semibold text-ink hover:text-primary">{{ w.item_title }}</NuxtLink>
            <p v-else class="line-clamp-2 text-sm font-semibold text-ink">{{ w.item_title }}</p>
            <p v-if="Number(w.price_krw) > 0" class="mt-0.5 text-xs text-ink-subtle">찜할 때 참고가 {{ formatKrw(Number(w.price_krw)) }}</p>
          </div>
          <button type="button" class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-subtle hover:bg-surface-sunken hover:text-danger" :disabled="removing === w.id" :aria-label="`${w.item_title} 찜 해제`" @click="remove('wishlist', w.id)"><AppIcon name="close" :size="18" /></button>
        </li>
      </ul>
    </ResultsState>

    <template v-if="state === 'ready'">
      <h2 class="mb-1 mt-10 text-lg font-bold text-ink">가격 알림</h2>
      <p class="mb-3 flex items-start gap-1.5 text-sm text-ink-muted"><AppIcon name="mail" :size="16" class="mt-0.5" />목표가를 저장해 둘 수 있어요. 알림 메일 발송은 아직 준비 중이라, 지금은 메일이 오지 않아요.</p>
      <p v-if="!alerts.length" class="card px-6 py-8 text-center text-sm text-ink-muted">설정한 가격 알림이 없어요.</p>
      <ul v-else class="space-y-2">
        <li v-for="a in alerts" :key="a.id" class="card flex items-center gap-3 p-4">
          <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-sunken text-ink-muted"><AppIcon :name="ICONS[a.domain_type] || 'bolt'" :size="18" /></span>
          <div class="min-w-0 flex-1">
            <NuxtLink v-if="linkOf(a.domain_type, a.item_id)" :to="linkOf(a.domain_type, a.item_id)" class="line-clamp-1 text-sm font-semibold text-ink hover:text-primary">{{ a.route_or_hotel }}</NuxtLink>
            <p v-else class="line-clamp-1 text-sm font-semibold text-ink">{{ a.route_or_hotel }}</p>
            <p class="text-xs text-ink-subtle">목표가 <b class="tabular text-ink">{{ formatKrw(Number(a.target_price)) }}</b><template v-if="Number(a.current_price_krw) > 0"> · 등록 당시 {{ formatKrw(Number(a.current_price_krw)) }}</template></p>
          </div>
          <button type="button" class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-subtle hover:bg-surface-sunken hover:text-danger" :disabled="removing === a.id" aria-label="가격 알림 삭제" @click="remove('price-alerts', a.id)"><AppIcon name="close" :size="18" /></button>
        </li>
      </ul>
    </template>
  </MyShell>
</template>
