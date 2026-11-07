<script setup lang="ts">
/**
 * 1:1 inquiry tickets (GET/PATCH /admin/tickets). Customers file from /help;
 * operators triage here: status transitions + admin notes (visible to the customer).
 */
import { computed, onMounted, ref } from 'vue'
import { api, toast } from '../composables/session'
import { useResource } from '../composables/useResource'
import { dateTime } from '../composables/format'
import PageHeader from '../components/PageHeader.vue'
import StatePanel from '../components/StatePanel.vue'
import StatusBadge from '../components/StatusBadge.vue'
import PageNav from '../components/PageNav.vue'
import type { Tone } from '../composables/format'

const FILTERS = [
  { value: '', label: '전체' },
  { value: 'OPEN', label: '접수' },
  { value: 'IN_PROGRESS', label: '처리 중' },
  { value: 'RESOLVED', label: '답변 완료' },
  { value: 'CLOSED', label: '종료' }
]
const STATUS_TONE: Record<string, Tone> = { OPEN: 'warning', IN_PROGRESS: 'info', RESOLVED: 'success', CLOSED: 'neutral' }
const STATUS_LABEL: Record<string, string> = { OPEN: '접수', IN_PROGRESS: '처리 중', RESOLVED: '답변 완료', CLOSED: '종료' }
const CATEGORY_LABEL: Record<string, string> = { BOOKING: '예약', PAYMENT: '결제', REFUND: '취소/환불', ACCOUNT: '계정', TECHNICAL: '이용 오류', GENERAL: '기타' }

const filter = ref('')
const page = ref(1)
const total = ref(0)
const totalPages = ref(1)
const list = useResource(async () => {
  const p = new URLSearchParams()
  if (filter.value) p.set('status', filter.value)
  p.set('page', String(page.value))
  const j = await api(`/admin/tickets?${p}`)
  total.value = j.total || 0
  totalPages.value = j.totalPages || 1
  return j.tickets || []
}, [] as any[])
onMounted(list.reload)
async function setFilter(v: string) {
  filter.value = v
  page.value = 1
  await list.reload()
}
async function go(p: number) {
  page.value = p
  await list.reload()
}

const openId = ref<string | null>(null)
const note = ref('')
const busy = ref('')
const counts = computed(() => {
  const c: Record<string, number> = {}
  for (const t of list.data.value) c[t.status] = (c[t.status] || 0) + 1
  return c
})

function toggle(t: any) {
  openId.value = openId.value === t.id ? null : t.id
  note.value = t.admin_note || ''
}

async function triage(t: any, status: string) {
  busy.value = t.id
  try {
    await api(`/admin/tickets/${encodeURIComponent(t.id)}`, { method: 'PATCH', json: { status, adminNote: note.value.trim() || undefined } })
    toast(`티켓을 '${STATUS_LABEL[status]}' 처리했어요.`)
    openId.value = null
    list.reload()
  } catch (e) { toast((e as Error).message, 'danger') } finally { busy.value = '' }
}
</script>

<template>
  <div>
    <PageHeader title="1:1 문의 티켓" description="고객이 고객센터에서 접수한 문의를 처리해요. 답변 메모는 고객에게 그대로 보여요." />
    <div class="mb-4 flex gap-2 overflow-x-auto pb-1">
      <button
        v-for="f in FILTERS"
        :key="f.value"
        type="button"
        class="chip"
        :aria-pressed="filter === f.value"
        @click="setFilter(f.value)"
      >{{ f.label }}<span v-if="f.value && counts[f.value]" class="tabular">{{ counts[f.value] }}</span></button>
    </div>
    <StatePanel :state="list.state.value" :error="list.error.value" :empty="!list.data.value.length" empty-text="해당 상태의 문의가 없어요." @retry="list.reload()">
      <ul class="space-y-3">
        <li v-for="t in list.data.value" :key="t.id" class="card p-4">
          <button type="button" class="flex w-full flex-wrap items-center gap-2 text-left" @click="toggle(t)" :aria-expanded="openId === t.id">
            <StatusBadge :tone="STATUS_TONE[t.status] || 'neutral'" :label="STATUS_LABEL[t.status] || t.status" />
            <StatusBadge tone="neutral" :label="CATEGORY_LABEL[t.category] || t.category" />
            <span class="min-w-0 flex-1 truncate font-bold text-ink">{{ t.subject }}</span>
            <span class="text-2xs tabular text-ink-subtle">{{ t.email }} · {{ dateTime(t.created_at) }}</span>
          </button>
          <div v-if="openId === t.id" class="mt-3 space-y-3 border-t border-line pt-3">
            <p class="whitespace-pre-line text-sm text-ink-muted">{{ t.body }}</p>
            <p v-if="t.booking_id" class="text-2xs tabular text-ink-subtle">연관 예약: {{ t.booking_id }}</p>
            <div>
              <label :for="`note-${t.id}`" class="label">답변 메모 (고객에게 공개)</label>
              <textarea :id="`note-${t.id}`" v-model="note" class="input min-h-[80px] py-2" maxlength="2000" placeholder="고객에게 보여줄 답변을 적어주세요." />
            </div>
            <div class="flex flex-wrap gap-2">
              <button type="button" class="btn-secondary btn-sm" :disabled="busy === t.id" @click="triage(t, 'IN_PROGRESS')">처리 중으로</button>
              <button type="button" class="btn-primary btn-sm" :disabled="busy === t.id" @click="triage(t, 'RESOLVED')">{{ busy === t.id ? '처리 중…' : '답변 완료' }}</button>
              <button type="button" class="btn-ghost btn-sm" :disabled="busy === t.id" @click="triage(t, 'CLOSED')">종료</button>
            </div>
          </div>
        </li>
      </ul>
      <PageNav :page="page" :total-pages="totalPages" :total="total" @go="go" />
    </StatePanel>
  </div>
</template>
