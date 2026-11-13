<script setup lang="ts">
/**
 * Business entities + contracts (#25: GET/PATCH /admin/entities, POST/PATCH
 * /admin/contracts). Supplier LIVE onboarding starts here: a supplier needs an
 * ACTIVE SUPPLIER contract, and an entity turns ACTIVE only with complete
 * registration numbers — the server enforces both, this screen explains them.
 */
import { onMounted, reactive, ref } from 'vue'
import { api, toast } from '../composables/session'
import { useResource } from '../composables/useResource'
import { dateTime } from '../composables/format'
import PageHeader from '../components/PageHeader.vue'
import StatePanel from '../components/StatePanel.vue'
import StatusBadge from '../components/StatusBadge.vue'

const store = useResource(async () => api('/admin/entities'), { entities: [], contracts: [] } as any)
onMounted(() => store.reload())

const ENTITY_FIELDS: Array<{ key: string; label: string; required?: boolean }> = [
  { key: 'legal_name', label: '상호(법인명)' },
  { key: 'representative_name', label: '대표자명', required: true },
  { key: 'business_registration_no', label: '사업자등록번호', required: true },
  { key: 'corporate_registration_no', label: '법인등록번호' },
  { key: 'tax_id', label: '세무 ID' },
  { key: 'travel_agency_license_no', label: '여행업 등록번호', required: true },
  { key: 'ecommerce_registration_no', label: '통신판매업 신고번호', required: true },
  { key: 'address', label: '사업장 주소' },
  { key: 'cs_phone', label: '고객센터 전화', required: true },
  { key: 'cs_email', label: '고객센터 이메일' },
]
const editing = ref<any | null>(null)
const eform = reactive<Record<string, string>>({})
const estatus = ref('')
const ebusy = ref(false)
const changes = ref<any[]>([])
const changesFor = ref('')
function openEntity(e: any) {
  editing.value = e
  changes.value = []
  changesFor.value = ''
  for (const f of ENTITY_FIELDS) eform[f.key] = e[f.key] || ''
  estatus.value = e.status || ''
}
async function saveEntity() {
  if (!editing.value) return
  ebusy.value = true
  try {
    const body: Record<string, string> = {}
    for (const f of ENTITY_FIELDS) body[f.key] = eform[f.key] || ''
    if (estatus.value && estatus.value !== editing.value.status) body.status = estatus.value
    await api(`/admin/entities/${encodeURIComponent(editing.value.id)}`, { method: 'PATCH', json: body })
    toast('사업자 정보를 저장했어요.')
    editing.value = null
    store.reload()
  } catch (e) { toast((e as Error).message, 'danger', 6000) } finally { ebusy.value = false }
}
async function showChanges(e: any) {
  try {
    changes.value = (await api(`/admin/entities/${encodeURIComponent(e.id)}/changes`)).changes || []
    changesFor.value = e.id
  } catch (err) { toast((err as Error).message, 'danger', 6000) }
}

const CONTRACT_TYPES = ['PG', 'SUPPLIER', 'SETTLEMENT_ACCOUNT', 'INSURANCE', 'OTHER']
const CONTRACT_STATUS = ['PENDING', 'ACTIVE', 'EXPIRED', 'TERMINATED']
const cform = reactive({ entityId: '', contractType: 'SUPPLIER', counterparty: '', reference: '', effectiveFrom: '', effectiveTo: '', notes: '' })
const cbusy = ref(false)
const cedit = ref<any | null>(null)
const cstatus = ref('')
async function createContract() {
  if (!cform.entityId || !cform.counterparty.trim()) { toast('사업자와 계약 상대방을 입력해 주세요.', 'danger', 6000); return }
  cbusy.value = true
  try {
    const r = await api('/admin/contracts', { method: 'POST', json: { entityId: cform.entityId, contractType: cform.contractType, counterparty: cform.counterparty.trim(), reference: cform.reference.trim() || undefined, effectiveFrom: cform.effectiveFrom || undefined, effectiveTo: cform.effectiveTo || undefined, notes: cform.notes.trim() || undefined } })
    toast(`계약 '${r.id}'를 등록했어요. (PENDING — 검토 후 ACTIVE로 전환하세요)`)
    cform.entityId = ''; cform.counterparty = ''; cform.reference = ''; cform.effectiveFrom = ''; cform.effectiveTo = ''; cform.notes = ''
    store.reload()
  } catch (e) { toast((e as Error).message, 'danger', 6000) } finally { cbusy.value = false }
}
async function saveContractStatus(c: any) {
  if (!cedit.value || !cstatus.value) return
  cbusy.value = true
  try {
    await api(`/admin/contracts/${encodeURIComponent(c.id)}`, { method: 'PATCH', json: { status: cstatus.value } })
    toast(`계약 '${c.id}' 상태를 ${cstatus.value}(으)로 바꿨어요.`)
    cedit.value = null
    store.reload()
  } catch (e) { toast((e as Error).message, 'danger', 6000) } finally { cbusy.value = false }
}
function statusTone(s: string) {
  if (s === 'ACTIVE') return 'success'
  if (s === 'TERMINATED' || s === 'EXPIRED') return 'danger'
  return 'neutral'
}
</script>

<template>
  <div>
    <PageHeader title="사업자·계약" description="공급사 LIVE 온보딩의 출발점: 사업자 등록번호를 완비하고 계약을 ACTIVE로 전환해요." />

    <StatePanel :state="store.state.value" :error="store.error.value" :empty="!(store.data.value.entities || []).length" empty-text="등록된 사업자가 없어요." @retry="store.reload()">
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>사업자 ID</th><th>상호</th><th>대표자</th><th>사업자등록번호</th><th>상태</th><th class="text-right">관리</th></tr></thead>
          <tbody>
            <tr v-for="e in store.data.value.entities" :key="e.id">
              <td class="font-mono text-xs">{{ e.id }}</td>
              <td class="font-medium">{{ e.legal_name || '—' }}</td>
              <td class="text-sm">{{ e.representative_name || '—' }}</td>
              <td class="font-mono text-xs">{{ e.business_registration_no || '—' }}</td>
              <td><StatusBadge :tone="statusTone(e.status)" :label="e.status" /></td>
              <td class="whitespace-nowrap text-right">
                <button type="button" class="btn-ghost text-xs" @click="openEntity(e)">수정</button>
                <button type="button" class="btn-ghost text-xs" @click="showChanges(e)">변경 이력</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </StatePanel>

    <div v-if="editing" class="rounded-card mt-4 border border-line bg-surface p-4">
      <p class="mb-1 text-sm font-black text-ink">사업자 수정 · <span class="font-mono">{{ editing.id }}</span></p>
      <p class="mb-3 text-xs text-ink-subtle">ACTIVE 전환에는 대표자·사업자등록번호·여행업 등록번호·통신판매업 신고번호·고객센터 전화가 모두 필요합니다.</p>
      <div class="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <label v-for="f in ENTITY_FIELDS" :key="f.key" class="block"><span class="field-label">{{ f.label }}<span v-if="f.required" class="text-danger"> *</span></span><input v-model="eform[f.key]" class="input mt-1 w-full" :placeholder="f.label" /></label>
        <label class="block"><span class="field-label">상태</span>
          <select v-model="estatus" class="input mt-1 w-full"><option value="">변경 안 함</option><option>ACTIVE</option><option>SUSPENDED</option><option>RETIRED</option></select>
        </label>
      </div>
      <div class="mt-4 flex gap-2">
        <button type="button" class="btn-primary" :disabled="ebusy" @click="saveEntity">{{ ebusy ? '저장 중…' : '저장' }}</button>
        <button type="button" class="btn-ghost" @click="editing = null">취소</button>
      </div>
    </div>

    <div v-if="changesFor" class="rounded-card mt-4 border border-line bg-surface p-4">
      <p class="mb-2 text-sm font-black text-ink">변경 이력 · <span class="font-mono">{{ changesFor }}</span></p>
      <p v-if="!changes.length" class="text-xs text-ink-subtle">이력이 없어요.</p>
      <ul v-else class="space-y-1.5">
        <li v-for="c in changes" :key="c.id" class="text-xs text-ink-muted"><span class="font-mono">{{ dateTime(c.created_at) }}</span> · {{ c.change_type }} · {{ c.changed_by }}</li>
      </ul>
    </div>

    <div class="mb-3 mt-8 flex items-center justify-between">
      <h2 class="text-base font-black text-ink">계약</h2>
    </div>
    <form class="rounded-card mb-4 border border-line bg-surface p-4" @submit.prevent="createContract">
      <p class="mb-3 text-sm font-black text-ink">새 계약 등록</p>
      <div class="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <label class="block"><span class="field-label">사업자 *</span>
          <select v-model="cform.entityId" class="input mt-1 w-full"><option value="">선택하세요</option><option v-for="e in store.data.value.entities" :key="e.id" :value="e.id">{{ e.legal_name || e.id }} ({{ e.id }})</option></select>
        </label>
        <label class="block"><span class="field-label">계약 종류</span>
          <select v-model="cform.contractType" class="input mt-1 w-full"><option v-for="t in CONTRACT_TYPES" :key="t" :value="t">{{ t }}</option></select>
        </label>
        <label class="block"><span class="field-label">계약 상대방 *</span><input v-model="cform.counterparty" class="input mt-1 w-full" placeholder="예: (주)신라호텔" /></label>
        <label class="block"><span class="field-label">참조(계약서 번호 등)</span><input v-model="cform.reference" class="input mt-1 w-full" /></label>
        <label class="block"><span class="field-label">효력 시작</span><input v-model="cform.effectiveFrom" type="date" class="input mt-1 w-full" /></label>
        <label class="block"><span class="field-label">효력 종료</span><input v-model="cform.effectiveTo" type="date" class="input mt-1 w-full" /></label>
        <label class="block lg:col-span-3"><span class="field-label">메모</span><input v-model="cform.notes" class="input mt-1 w-full" /></label>
      </div>
      <button type="submit" class="btn-primary mt-4" :disabled="cbusy">{{ cbusy ? '등록 중…' : '계약 등록' }}</button>
    </form>
    <StatePanel :state="store.state.value" :error="store.error.value" :empty="!(store.data.value.contracts || []).length" empty-text="등록된 계약이 없어요." @retry="store.reload()">
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>계약 ID</th><th>사업자</th><th>종류</th><th>상대방</th><th>상태</th><th class="text-right">관리</th></tr></thead>
          <tbody>
            <tr v-for="c in store.data.value.contracts" :key="c.id">
              <td class="font-mono text-xs">{{ c.id }}</td>
              <td class="font-mono text-xs">{{ c.entity_id }}</td>
              <td class="text-xs">{{ c.contract_type }}</td>
              <td class="text-sm">{{ c.counterparty }}</td>
              <td><StatusBadge :tone="statusTone(c.status)" :label="c.status" /></td>
              <td class="whitespace-nowrap text-right">
                <template v-if="cedit && cedit.id === c.id">
                  <select v-model="cstatus" class="input mr-2 w-32" aria-label="계약 상태"><option v-for="s in CONTRACT_STATUS" :key="s" :value="s">{{ s }}</option></select>
                  <button type="button" class="btn-ghost text-xs" :disabled="cbusy" @click="saveContractStatus(c)">저장</button>
                  <button type="button" class="btn-ghost text-xs" @click="cedit = null">취소</button>
                </template>
                <button v-else type="button" class="btn-ghost text-xs" @click="cedit = c; cstatus = c.status">상태 변경</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </StatePanel>
  </div>
</template>
