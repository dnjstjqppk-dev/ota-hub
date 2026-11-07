<script setup lang="ts">
/**
 * Affiliate funnel (GET /admin/affiliate/summary|clicks|conversions).
 * Clicks are written by /out/* redirects, conversions by signed postbacks; here read-only.
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../composables/session'
import { useResource } from '../composables/useResource'
import { krw, dateTime } from '../composables/format'
import PageHeader from '../components/PageHeader.vue'
import StatePanel from '../components/StatePanel.vue'
import StatusBadge from '../components/StatusBadge.vue'
import PageNav from '../components/PageNav.vue'

const route = useRoute()
const router = useRouter()
const qv = (k: string) => (typeof route.query[k] === 'string' ? (route.query[k] as string) : '')
function patch(change: Record<string, string>) {
  const next: Record<string, string> = {}
  for (const [k, v] of Object.entries({ ...route.query, ...change })) if (typeof v === 'string' && v) next[k] = v
  router.replace({ query: next })
}
const tab = computed(() => (qv('tab') === 'conversions' ? 'conversions' : 'clicks'))
const q = computed(() => qv('q'))
const partner = computed(() => qv('partner'))
const status = computed(() => qv('status'))
const page = computed(() => Math.max(1, parseInt(qv('page') || '1', 10) || 1))
const draft = ref(q.value)
watch(q, (v) => { draft.value = v })

const summary = useResource(async () => (await api('/admin/affiliate/summary')).summary || { clicks: 0, conversions: 0, gmv: 0, commission: 0 },
  { clicks: 0, conversions: 0, gmv: 0, commission: 0 } as any)
const total = ref(0)
const totalPages = ref(1)
const list = useResource(async () => {
  const p = new URLSearchParams()
  if (q.value) p.set('q', q.value)
  if (partner.value) p.set('partner', partner.value)
  if (status.value) p.set('status', status.value)
  p.set('page', String(page.value))
  p.set('pageSize', '20')
  const j = await api(`/admin/affiliate/${tab.value}?${p}`)
  total.value = j.total || 0
  totalPages.value = j.totalPages || 1
  return (tab.value === 'clicks' ? j.clicks : j.conversions) || []
}, [] as any[])
watch([tab, q, partner, status, page], () => list.reload())
onMounted(() => { summary.reload(); list.reload() })

const CLICK_STATUS = ['', 'CLICKED', 'REDIRECTED', 'CONVERTED', 'EXPIRED']
const CONV_STATUS = ['', 'CONFIRMED', 'PENDING', 'REJECTED', 'REVERSED']
function statusTone(s: string) {
  if (s === 'CONVERTED' || s === 'CONFIRMED') return 'success'
  if (s === 'REJECTED' || s === 'REVERSED' || s === 'EXPIRED') return 'danger'
  return 'neutral'
}
const convRate = computed(() => {
  const s = summary.data.value
  return s.clicks ? ((s.conversions / s.clicks) * 100).toFixed(1) : '0.0'
})
</script>

<template>
  <div>
    <PageHeader title="제휴 전환" description="아웃링크 클릭부터 제휴사 확정 전환까지의 퍼널을 조회해요." />

    <div class="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <div class="rounded-card border border-line bg-surface p-4"><p class="text-2xs text-ink-subtle">클릭</p><p class="text-xl font-black tabular text-ink">{{ summary.data.value.clicks }}</p></div>
      <div class="rounded-card border border-line bg-surface p-4"><p class="text-2xs text-ink-subtle">전환 ({{ convRate }}%)</p><p class="text-xl font-black tabular text-ink">{{ summary.data.value.conversions }}</p></div>
      <div class="rounded-card border border-line bg-surface p-4"><p class="text-2xs text-ink-subtle">전환 GMV</p><p class="text-xl font-black tabular text-ink">{{ krw(summary.data.value.gmv) }}</p></div>
      <div class="rounded-card border border-line bg-surface p-4"><p class="text-2xs text-ink-subtle">예상 커미션</p><p class="text-xl font-black tabular text-ink">{{ krw(summary.data.value.commission) }}</p></div>
    </div>

    <div class="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
      <div class="flex gap-1.5" role="group" aria-label="로그 종류">
        <button type="button" class="chip" :aria-pressed="tab === 'clicks'" @click="patch({ tab: '', page: '' })">클릭 로그</button>
        <button type="button" class="chip" :aria-pressed="tab === 'conversions'" @click="patch({ tab: 'conversions', page: '' })">전환 로그</button>
      </div>
      <div class="lg:w-72">
        <label class="sr-only" for="affiliate-search">로그 검색</label>
        <input id="affiliate-search" v-model="draft" type="search" placeholder="클릭·주문 ID, 제휴사" class="input w-full" @keydown.enter="patch({ q: draft.trim(), page: '' })" @change="patch({ q: draft.trim(), page: '' })" />
      </div>
      <input :value="partner" type="text" placeholder="제휴사 코드 (예: klook)" aria-label="제휴사 코드" class="input lg:w-52" @change="(e) => patch({ partner: (e.target as HTMLInputElement).value.trim(), page: '' })" />
      <select :value="status" aria-label="상태" class="input lg:w-40" @change="(e) => patch({ status: (e.target as HTMLSelectElement).value, page: '' })">
        <option v-for="s in (tab === 'clicks' ? CLICK_STATUS : CONV_STATUS)" :key="s" :value="s">{{ s || '전체 상태' }}</option>
      </select>
    </div>

    <StatePanel :state="list.state.value" :error="list.error.value" :empty="!list.data.value.length" empty-text="조건에 맞는 로그가 없어요." @retry="list.reload()">
      <div class="table-wrap">
        <table v-if="tab === 'clicks'" class="table">
          <thead><tr><th>클릭 ID</th><th>상품</th><th>제휴사</th><th>서브 ID</th><th>상태</th><th>발생 시각</th></tr></thead>
          <tbody>
            <tr v-for="c in list.data.value" :key="c.click_id">
              <td class="font-mono text-xs">{{ c.click_id }}</td>
              <td><p class="max-w-[260px] truncate font-medium">{{ c.item_title || c.item_id }}</p><p class="font-mono text-2xs text-ink-subtle">{{ c.domain_type }} · {{ c.item_id }}</p></td>
              <td class="font-mono text-xs">{{ c.partner_name }}</td>
              <td class="font-mono text-xs text-ink-muted">{{ c.sub_id || '—' }}</td>
              <td><StatusBadge :tone="statusTone(c.status)" :label="c.status" /></td>
              <td class="whitespace-nowrap text-xs text-ink-muted">{{ dateTime(c.created_at) }}</td>
            </tr>
          </tbody>
        </table>
        <table v-else class="table">
          <thead><tr><th>제휴 주문번호</th><th>제휴사</th><th class="text-right">결제액</th><th class="text-right">커미션</th><th>상태</th><th>발생 시각</th></tr></thead>
          <tbody>
            <tr v-for="c in list.data.value" :key="c.id">
              <td><p class="font-mono text-xs">{{ c.order_id }}</p><p class="font-mono text-2xs text-ink-subtle">{{ c.click_id }}</p></td>
              <td class="font-mono text-xs">{{ c.partner_name }}</td>
              <td class="text-right font-semibold tabular">{{ krw(c.amount) }} <span class="text-2xs text-ink-subtle">{{ c.currency }}</span></td>
              <td class="text-right font-semibold tabular">{{ krw(c.commission) }}</td>
              <td><StatusBadge :tone="statusTone(c.status)" :label="c.status" /></td>
              <td class="whitespace-nowrap text-xs text-ink-muted">{{ dateTime(c.created_at) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <PageNav :page="page" :total-pages="totalPages" :total="total" @go="(p) => patch({ page: p === 1 ? '' : String(p) })" />
    </StatePanel>
  </div>
</template>
