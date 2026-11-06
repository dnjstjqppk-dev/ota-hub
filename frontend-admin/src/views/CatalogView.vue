<script setup lang="ts">
/**
 * Product catalogue across all seven product tables (GET /admin/catalog ?domain ?q), joined client-side
 * with the supplier registry (GET /admin/suppliers) so an operator can see who fulfils each product and
 * how that supplier is integrated. Read-only: product data is edited by partners or the URL ingest flow.
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../composables/session'
import { useResource } from '../composables/useResource'
import { DOMAIN_LABEL, domainLabel, krw } from '../composables/format'
import PageHeader from '../components/PageHeader.vue'
import StatePanel from '../components/StatePanel.vue'
import StatusBadge from '../components/StatusBadge.vue'
import EntitySearch from '../components/EntitySearch.vue'

const route = useRoute()
const router = useRouter()
const qv = (k: string) => (typeof route.query[k] === 'string' ? (route.query[k] as string) : '')
function patch(change: Record<string, string>) {
  const next: Record<string, string> = {}
  for (const [k, v] of Object.entries({ ...route.query, ...change })) if (typeof v === 'string' && v) next[k] = v
  router.replace({ query: next })
}
const domain = computed(() => qv('domain'))
const q = computed(() => qv('q'))
const draft = ref(q.value)
watch(q, (v) => { draft.value = v })

const list = useResource(async () => {
  const p = new URLSearchParams({ limit: '200' })
  if (domain.value) p.set('domain', domain.value)
  if (q.value) p.set('q', q.value)
  return (await api(`/admin/catalog?${p}`)).items || []
}, [] as any[])
const suppliers = useResource(async () => (await api('/admin/suppliers')).suppliers || [], [] as any[])
watch([domain, q], () => list.reload())
onMounted(() => { list.reload(); suppliers.reload() })

const supplierById = computed(() => new Map(suppliers.data.value.map((s: any) => [s.id, s])))
const suggest = async (term: string, signal: AbortSignal) => {
  const p = new URLSearchParams({ q: term, limit: '8' })
  if (domain.value) p.set('domain', domain.value)
  return (await api(`/admin/catalog?${p}`, { signal })).items || []
}

const SITE = 'https://ota-hub.dnjstjqppk.workers.dev'
const DETAIL: Record<string, string> = {
  HOTEL: '/hotels/detail/', FLIGHT: '/flights/detail/', TRAIN: '/trains/detail/', CAR: '/cars/detail/',
  TRANSFER: '/transfers/detail/', ACTIVITY: '/things-to-do/detail/', PACKAGE: '/packages/detail/'
}
const ICON: Record<string, string> = { HOTEL: 'hotel', FLIGHT: 'flight', TRAIN: 'train', CAR: 'car', TRANSFER: 'transfer', ACTIVITY: 'ticket', PACKAGE: 'package' }
const siteUrl = (it: any) => `${SITE}${DETAIL[it.domain_type] || '/'}${encodeURIComponent(it.id)}`

function supplierBadge(it: any): { tone: any; label: string } {
  if (!it.partner_id) return { tone: 'neutral', label: '공급사 미지정' }
  const s: any = supplierById.value.get(it.partner_id)
  if (!s) return { tone: 'danger', label: '미등록 공급사' }
  if (s.transaction_model === 'AFFILIATE') return { tone: 'neutral', label: '외부 링크' }
  if (s.integration_status === 'BLOCKED') return { tone: 'danger', label: '차단' }
  if (s.integration_status === 'LIVE') return { tone: 'success', label: '실연동' }
  if (s.adapter === 'simulator') return { tone: 'warning', label: '시뮬레이터' }
  return { tone: 'neutral', label: s.integration_status || '미연동' }
}
</script>

<template>
  <div>
    <PageHeader title="상품" description="7개 상품군의 카탈로그와 각 상품을 공급하는 공급사의 연동 상태를 확인해요. 상품 내용은 파트너 콘솔이나 URL 수집에서 바뀌어요." />

    <div class="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
      <div class="lg:w-96">
        <EntitySearch
          v-model="draft"
          label="상품 검색"
          input-id="catalog-search"
          placeholder="상품명, 도시, 항공편, 노선, ID"
          :fetcher="suggest"
          :item-key="(x: any) => `${x.domain_type}:${x.id}`"
          @select="(x: any) => patch({ q: x.id })"
          @submit="(t: string) => patch({ q: t })"
        >
          <template #item="{ item }">
            <div class="flex items-center gap-2.5">
              <AppIcon :name="ICON[item.domain_type] || 'package'" :size="16" class="text-ink-subtle" />
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-medium text-ink">{{ item.title }}</p>
                <p class="truncate text-2xs text-ink-subtle">{{ domainLabel(item.domain_type) }} · {{ item.subtitle }} · <span class="font-mono">{{ item.id }}</span></p>
              </div>
            </div>
          </template>
        </EntitySearch>
      </div>
      <div class="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:mx-0 lg:flex-wrap lg:px-0 [&::-webkit-scrollbar]:hidden" role="group" aria-label="상품군 필터">
        <button type="button" class="chip" :aria-pressed="!domain" @click="patch({ domain: '' })">전체</button>
        <button v-for="(label, d) in DOMAIN_LABEL" :key="d" type="button" class="chip" :aria-pressed="domain === d" @click="patch({ domain: d })"><AppIcon :name="ICON[d]" :size="14" />{{ label }}</button>
      </div>
    </div>
    <p v-if="q" class="mb-3 text-sm text-ink-muted">‘{{ q }}’ 검색 결과 · <button type="button" class="font-semibold text-primary" @click="patch({ q: '' })">검색 해제</button></p>

    <StatePanel :state="list.state.value" :error="list.error.value" :empty="!list.data.value.length" empty-text="조건에 맞는 상품이 없어요." @retry="list.reload()">
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>상품</th><th>상품군</th><th class="text-right">기준가</th><th>공급사</th><th>연동</th><th class="w-px"></th></tr></thead>
          <tbody>
            <tr v-for="it in list.data.value" :key="`${it.domain_type}:${it.id}`">
              <td><p class="max-w-[340px] truncate font-medium">{{ it.title }}</p><p class="max-w-[340px] truncate text-2xs text-ink-subtle">{{ it.subtitle }} · <span class="font-mono">{{ it.id }}</span></p></td>
              <td class="whitespace-nowrap text-xs"><span class="inline-flex items-center gap-1.5"><AppIcon :name="ICON[it.domain_type] || 'package'" :size="14" class="text-ink-subtle" />{{ domainLabel(it.domain_type) }}</span></td>
              <td class="text-right font-semibold tabular">{{ krw(it.price) }}</td>
              <td class="font-mono text-xs text-ink-muted">{{ it.partner_id || '—' }}</td>
              <td><StatusBadge v-bind="supplierBadge(it)" /></td>
              <td><a :href="siteUrl(it)" target="_blank" rel="noopener" class="btn-ghost btn-sm px-2" :aria-label="`${it.title} 사용자 화면에서 보기`" title="사용자 화면에서 보기"><AppIcon name="external" :size="14" /></a></td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="mt-2 text-2xs text-ink-subtle">{{ list.data.value.length }}개 표시 (최대 200개). 기준가는 세금·수수료 전 카탈로그 가격이에요.</p>
    </StatePanel>
  </div>
</template>
