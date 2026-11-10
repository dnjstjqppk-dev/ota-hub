<script setup lang="ts">
/**
 * Supplier registry (GET/PATCH /admin/suppliers). Integration status decides what the site may sell:
 * LIVE needs an ACTIVE supplier contract and a direct_contract/api adapter — the server enforces it,
 * this screen explains it. Contracts come from GET /admin/entities.
 */
import { computed, onMounted, reactive, ref } from 'vue'
import { api, toast } from '../composables/session'
import { useResource } from '../composables/useResource'
import { dateTime, domainLabel } from '../composables/format'
import PageHeader from '../components/PageHeader.vue'
import StatePanel from '../components/StatePanel.vue'
import StatusBadge from '../components/StatusBadge.vue'
import SidePanel from '../components/SidePanel.vue'

const list = useResource(async () => (await api('/admin/suppliers')).suppliers || [], [] as any[])
const entities = useResource(async () => api('/admin/entities'), { entities: [], contracts: [] } as any)
onMounted(() => { list.reload(); entities.reload() })

const STATUS: Record<string, { label: string; tone: any; help: string }> = {
  LIVE: { label: '실연동', tone: 'success', help: '실제 결제·예약이 공급사로 전달돼요.' },
  SANDBOX_VERIFIED: { label: '샌드박스 검증', tone: 'info', help: '테스트 환경에서만 검증됐어요.' },
  DEV_DONE_CONTRACT_PENDING: { label: '개발 완료 · 계약 대기', tone: 'warning', help: '연동 개발은 끝났지만 계약이 없어요.' },
  CONTRACTED_IN_DEV: { label: '계약 · 개발 중', tone: 'warning', help: '계약은 있지만 연동 개발 중이에요.' },
  EXTERNAL_LINK_ONLY: { label: '외부 링크', tone: 'neutral', help: '직접 판매하지 않고 외부 사이트로 연결해요.' },
  NOT_INTEGRATED: { label: '미연동', tone: 'neutral', help: '판매할 수 없어요.' },
  BLOCKED: { label: '차단', tone: 'danger', help: '판매가 막혀 있어요.' }
}
const ADAPTER: Record<string, string> = { none: '없음', direct_contract: '직계약 (수동 확정)', simulator: '시뮬레이터', api: 'API 연동' }
const MODEL: Record<string, string> = { MERCHANT_OF_RECORD: '직판매', AGENCY: '중개', AFFILIATE: '제휴 링크' }

const supplierContracts = computed(() => (entities.data.value.contracts || []).filter((c: any) => c.contract_type === 'SUPPLIER'))
const contractById = computed(() => new Map((entities.data.value.contracts || []).map((c: any) => [c.id, c])))

const editing = ref<any | null>(null)
const form = reactive({ adapter: '', integrationStatus: '', contractId: '', notes: '', outlinkPartnerId: '' })
const partners = useResource(async () => api('/admin/affiliate/partners'), { partners: [] } as any)
const activePartners = computed(() => (partners.data.value.partners || []).filter((p: any) => p.is_active === 1))
const busy = ref(false)
function open(s: any) {
  editing.value = s
  Object.assign(form, { adapter: s.adapter, integrationStatus: s.integration_status, contractId: s.contract_id || '', notes: s.notes || '', outlinkPartnerId: s.outlink_partner_id || '' })
}
const liveBlocked = computed(() => {
  if (form.integrationStatus !== 'LIVE') return ''
  const c: any = form.contractId ? contractById.value.get(form.contractId) : null
  if (!c) return 'LIVE 전환에는 공급사 계약이 필요해요.'
  if (c.status !== 'ACTIVE') return `선택한 계약이 유효(ACTIVE) 상태가 아니에요 (현재 ${c.status}).`
  if (form.adapter !== 'direct_contract' && form.adapter !== 'api') return 'LIVE는 직계약 또는 API 어댑터에서만 가능해요.'
  return ''
})
async function save() {
  if (liveBlocked.value) { toast(liveBlocked.value, 'danger'); return }
  busy.value = true
  try {
    await api(`/admin/suppliers/${encodeURIComponent(editing.value.id)}`, {
      method: 'PATCH',
      json: { adapter: form.adapter, integrationStatus: form.integrationStatus, contractId: form.contractId || undefined, notes: form.notes.trim() || undefined, outlinkPartnerId: form.outlinkPartnerId || null }
    })
    toast('공급사 연동 정보를 저장했어요.')
    editing.value = null
    list.reload()
  } catch (e) { toast((e as Error).message, 'danger', 6000) } finally { busy.value = false }
}
</script>

<template>
  <div>
    <PageHeader title="공급사 연동" description="공급사별 연동 방식과 판매 가능 상태를 관리해요. 실연동(LIVE)은 유효한 공급사 계약과 직계약·API 어댑터가 있어야 켤 수 있어요." />

    <StatePanel :state="list.state.value" :error="list.error.value" :empty="!list.data.value.length" empty-text="등록된 공급사가 없어요." @retry="list.reload()">
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>공급사</th><th>상품군</th><th>어댑터</th><th>거래 모델</th><th>상태</th><th>계약</th><th>수정</th></tr></thead>
          <tbody>
            <tr v-for="s in list.data.value" :key="s.id" class="row-link" tabindex="0" @click="open(s)" @keydown.enter="open(s)">
              <td><p class="font-medium">{{ s.name }}</p><p class="font-mono text-2xs text-ink-subtle">{{ s.id }}</p></td>
              <td class="text-xs">{{ domainLabel(s.product_domain) }}</td>
              <td class="text-xs">{{ ADAPTER[s.adapter] || s.adapter }}</td>
              <td class="text-xs">{{ MODEL[s.transaction_model] || s.transaction_model }}</td>
              <td><StatusBadge :tone="STATUS[s.integration_status]?.tone" :label="STATUS[s.integration_status]?.label || s.integration_status" /></td>
              <td class="font-mono text-2xs text-ink-muted">{{ s.contract_id || '—' }}</td>
              <td class="whitespace-nowrap text-xs text-ink-muted tabular">{{ dateTime(s.updated_at) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </StatePanel>

    <SidePanel :open="!!editing" :title="editing?.name || ''" :subtitle="editing?.id" @close="editing = null">
      <form v-if="editing" id="supplier-form" class="space-y-4 text-sm" @submit.prevent="save">
        <div>
          <label class="label" for="sp-status">연동 상태</label>
          <select id="sp-status" v-model="form.integrationStatus" class="input">
            <option v-for="(v, k) in STATUS" :key="k" :value="k">{{ v.label }} ({{ k }})</option>
          </select>
          <p class="mt-1 text-2xs text-ink-subtle">{{ STATUS[form.integrationStatus]?.help }}</p>
        </div>
        <div>
          <label class="label" for="sp-adapter">어댑터</label>
          <select id="sp-adapter" v-model="form.adapter" class="input">
            <option v-for="(v, k) in ADAPTER" :key="k" :value="k">{{ v }}</option>
          </select>
        </div>
        <div>
          <label class="label" for="sp-contract">공급사 계약</label>
          <select id="sp-contract" v-model="form.contractId" class="input">
            <option value="">계약 없음</option>
            <option v-for="c in supplierContracts" :key="c.id" :value="c.id">{{ c.counterparty }} · {{ c.status }} ({{ c.id }})</option>
          </select>
          <p v-if="!supplierContracts.length" class="mt-1 text-2xs text-ink-subtle">등록된 공급사 계약이 없어요.</p>
        </div>
        <div v-if="editing?.transaction_model === 'AFFILIATE'">
          <label class="label" for="sp-outlink">제휴 아웃링크</label>
          <select id="sp-outlink" v-model="form.outlinkPartnerId" class="input">
            <option value="">연결 없음 (링크 미노출)</option>
            <option v-for="p in activePartners" :key="p.partner_id" :value="p.partner_id">{{ p.name }} ({{ p.partner_id }})</option>
          </select>
          <p class="mt-1 text-2xs text-ink-subtle">AFFILIATE 공급사는 직접 판매하지 않고, 선택한 제휴사의 외부 링크 버튼만 노출해요.</p>
        </div>
        <div>
          <label class="label" for="sp-notes">메모</label>
          <textarea id="sp-notes" v-model="form.notes" class="input min-h-[80px] py-2" maxlength="500" />
        </div>
        <p v-if="liveBlocked" class="rounded-field bg-danger-soft px-3 py-2 text-xs text-danger" role="alert">{{ liveBlocked }}</p>
      </form>
      <template #footer>
        <button type="button" class="btn-ghost" @click="editing = null">취소</button>
        <button type="submit" form="supplier-form" class="btn-primary" :disabled="busy || !!liveBlocked">{{ busy ? '저장 중…' : '저장' }}</button>
      </template>
    </SidePanel>
  </div>
</template>
