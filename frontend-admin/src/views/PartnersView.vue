<script setup lang="ts">
/**
 * Partner onboarding and status (GET /admin/partners ?q ?status, PATCH /admin/partners/:id).
 * Reject/suspend require a reason (server-enforced); commission is 0–50% in basis points.
 */
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api, toast } from '../composables/session'
import { useResource } from '../composables/useResource'
import { PARTNER_STATUS, dateTime, partnerStatus } from '../composables/format'
import PageHeader from '../components/PageHeader.vue'
import StatePanel from '../components/StatePanel.vue'
import StatusBadge from '../components/StatusBadge.vue'
import SidePanel from '../components/SidePanel.vue'
import EntitySearch from '../components/EntitySearch.vue'
import PageNav from '../components/PageNav.vue'

const route = useRoute()
const router = useRouter()
const qv = (k: string) => (typeof route.query[k] === 'string' ? (route.query[k] as string) : '')
function patch(change: Record<string, string>) {
  const next: Record<string, string> = {}
  for (const [k, v] of Object.entries({ ...route.query, ...change })) if (typeof v === 'string' && v) next[k] = v
  router.replace({ query: next })
}
const q = computed(() => qv('q'))
const status = computed(() => qv('status'))
const page = computed(() => Math.max(1, parseInt(qv('page') || '1', 10) || 1))
const draft = ref(q.value)
watch(q, (v) => { draft.value = v })

const total = ref(0)
const totalPages = ref(1)
const list = useResource(async () => {
  const p = new URLSearchParams()
  if (q.value) p.set('q', q.value)
  if (status.value) p.set('status', status.value)
  p.set('page', String(page.value))
  const j = await api(`/admin/partners?${p}`)
  total.value = j.total || 0
  totalPages.value = j.totalPages || 1
  return j.partners || []
}, [] as any[])
watch([q, status, page], ([qq, s, pg], [oq, os]) => {
  if ((qq !== oq || s !== os) && pg !== 1) patch({ page: '' })
  else list.reload()
})
onMounted(list.reload)
const suggest = async (term: string, signal: AbortSignal) => (await api(`/admin/partners?q=${encodeURIComponent(term)}&limit=8`, { signal })).partners || []

const TYPE: Record<string, string> = { HOTEL: '숙박', FLIGHT: '항공', CAR: '렌터카', TRANSFER: '공항 이동', ACTIVITY: '투어·티켓', TOUR: '투어·티켓', PACKAGE: '패키지' }
const mask = (s: string | null) => (s ? `${'•'.repeat(Math.max(0, s.length - 4))}${s.slice(-4)}` : '—')

const selected = ref<any | null>(null)
const form = reactive({ action: '' as '' | 'ACTIVE' | 'REJECTED' | 'SUSPENDED', reason: '', ratePct: '' })
const busy = ref(false)
function open(p: any) { selected.value = p; Object.assign(form, { action: '', reason: '', ratePct: String(Number(p.settlement_rate_bps) / 100) }) }

const rateBps = computed(() => Math.round(Number(form.ratePct) * 100))
const rateError = computed(() => {
  if (form.ratePct.trim() === '') return '수수료율을 입력해 주세요.'
  const v = Number(form.ratePct)
  if (!Number.isFinite(v) || v < 0 || v > 50) return '0–50% 사이로 입력해 주세요.'
  if (Math.abs(v * 100 - Math.round(v * 100)) > 1e-9) return '소수점 둘째 자리까지 입력할 수 있어요.'
  return ''
})
const rateChanged = computed(() => !!selected.value && !rateError.value && rateBps.value !== Number(selected.value.settlement_rate_bps))

async function apply(body: Record<string, unknown>, done: string) {
  busy.value = true
  try {
    await api(`/admin/partners/${encodeURIComponent(selected.value.id)}`, { method: 'PATCH', json: body })
    toast(done)
    await list.reload()
    selected.value = list.data.value.find((p: any) => p.id === selected.value.id) || null
    if (selected.value) open(selected.value)
  } catch (e) { toast((e as Error).message, 'danger', 6000) } finally { busy.value = false }
}
function submitStatus() {
  if (form.action !== 'ACTIVE' && !form.reason.trim()) { toast('사유를 입력해 주세요.', 'danger'); return }
  const label = { ACTIVE: '승인', REJECTED: '반려', SUSPENDED: '정지' }[form.action as 'ACTIVE']
  apply({ status: form.action, reason: form.reason.trim() || undefined }, `파트너를 ${label}했어요.`)
}
</script>

<template>
  <div>
    <PageHeader title="파트너" description="입점 신청을 승인·반려하고, 운영 중인 파트너의 상태와 수수료율을 관리해요." />

    <div class="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
      <div class="lg:w-96">
        <EntitySearch
          v-model="draft"
          label="파트너 검색"
          input-id="partner-search"
          placeholder="회사명, 이메일, 사업자등록번호"
          :fetcher="suggest"
          :item-key="(x: any) => x.id"
          @select="open"
          @submit="(t: string) => patch({ q: t })"
        >
          <template #item="{ item }">
            <div class="flex items-center gap-2">
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-medium text-ink">{{ item.company_name }}</p>
                <p class="truncate text-2xs text-ink-subtle">{{ item.email }} · {{ item.business_number || '사업자번호 없음' }}</p>
              </div>
              <StatusBadge v-bind="partnerStatus(item.profile_status)" />
            </div>
          </template>
        </EntitySearch>
      </div>
      <div class="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:mx-0 lg:flex-wrap lg:px-0 [&::-webkit-scrollbar]:hidden" role="group" aria-label="상태 필터">
        <button type="button" class="chip" :aria-pressed="!status" @click="patch({ status: '' })">전체</button>
        <button v-for="(v, k) in PARTNER_STATUS" :key="k" type="button" class="chip" :aria-pressed="status === k" @click="patch({ status: k })">{{ v.label }}</button>
      </div>
    </div>
    <p v-if="q" class="mb-3 text-sm text-ink-muted">‘{{ q }}’ 검색 결과 · <button type="button" class="font-semibold text-primary" @click="patch({ q: '' })">검색 해제</button></p>

    <StatePanel :state="list.state.value" :error="list.error.value" :empty="!list.data.value.length" empty-text="조건에 맞는 파트너가 없어요." @retry="list.reload()">
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>파트너</th><th>유형</th><th>사업자등록번호</th><th class="text-right">수수료</th><th>상태</th><th>신청</th></tr></thead>
          <tbody>
            <tr v-for="p in list.data.value" :key="p.id" class="row-link" tabindex="0" @click="open(p)" @keydown.enter="open(p)">
              <td><p class="font-medium">{{ p.company_name }}</p><p class="text-2xs text-ink-subtle">{{ p.email }}</p></td>
              <td class="text-xs">{{ TYPE[p.partner_type] || p.partner_type }}</td>
              <td class="text-xs tabular">{{ p.business_number || '—' }}</td>
              <td class="text-right tabular">{{ (Number(p.settlement_rate_bps) / 100).toFixed(2).replace(/\.?0+$/, '') }}%</td>
              <td><StatusBadge v-bind="partnerStatus(p.profile_status)" /></td>
              <td class="whitespace-nowrap text-xs text-ink-muted tabular">{{ dateTime(p.created_at) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <PageNav :page="page" :total-pages="totalPages" :total="total" @go="(p) => patch({ page: p === 1 ? '' : String(p) })" />
    </StatePanel>

    <SidePanel :open="!!selected" :title="selected?.company_name || ''" :subtitle="selected?.email" @close="selected = null">
      <div v-if="selected" class="space-y-6 text-sm">
        <div class="flex items-center gap-2"><StatusBadge v-bind="partnerStatus(selected.profile_status)" /><span v-if="selected.rejection_reason" class="text-xs text-ink-muted">사유: {{ selected.rejection_reason }}</span></div>

        <dl class="grid grid-cols-2 gap-3">
          <div><dt class="text-2xs text-ink-subtle">파트너 ID</dt><dd class="break-all font-mono text-xs">{{ selected.id }}</dd></div>
          <div><dt class="text-2xs text-ink-subtle">유형</dt><dd>{{ TYPE[selected.partner_type] || selected.partner_type }}</dd></div>
          <div><dt class="text-2xs text-ink-subtle">대표자</dt><dd>{{ selected.representative_name || '—' }}</dd></div>
          <div><dt class="text-2xs text-ink-subtle">연락처</dt><dd>{{ selected.contact_phone || '—' }}</dd></div>
          <div><dt class="text-2xs text-ink-subtle">사업자등록번호</dt><dd class="tabular">{{ selected.business_number || '—' }}</dd></div>
          <div><dt class="text-2xs text-ink-subtle">세금계산서 이메일</dt><dd class="break-all">{{ selected.tax_invoice_email || '—' }}</dd></div>
          <div><dt class="text-2xs text-ink-subtle">정산 계좌</dt><dd>{{ selected.bank_name || '—' }} {{ mask(selected.bank_account_number) }}</dd></div>
          <div><dt class="text-2xs text-ink-subtle">예금주</dt><dd>{{ selected.bank_account_holder || '—' }}</dd></div>
          <div><dt class="text-2xs text-ink-subtle">신청</dt><dd class="tabular">{{ dateTime(selected.created_at) }}</dd></div>
          <div><dt class="text-2xs text-ink-subtle">승인</dt><dd class="tabular">{{ dateTime(selected.approved_at) }}</dd></div>
        </dl>

        <section class="space-y-2">
          <h3 class="font-bold">상태 변경</h3>
          <div class="flex flex-wrap gap-2">
            <button v-if="selected.profile_status !== 'ACTIVE'" type="button" class="btn-primary btn-sm" @click="form.action = 'ACTIVE'">{{ selected.profile_status === 'SUSPENDED' ? '다시 활성화' : '승인' }}</button>
            <button v-if="selected.profile_status === 'PENDING_APPROVAL'" type="button" class="btn-secondary btn-sm" @click="form.action = 'REJECTED'">반려</button>
            <button v-if="selected.profile_status === 'ACTIVE'" type="button" class="btn-secondary btn-sm text-danger" @click="form.action = 'SUSPENDED'">이용 정지</button>
          </div>
          <form v-if="form.action" class="space-y-2 rounded-field border border-line p-3" @submit.prevent="submitStatus">
            <label class="label" for="pt-reason">{{ form.action === 'ACTIVE' ? '메모 (선택)' : '사유 *' }}</label>
            <textarea id="pt-reason" v-model="form.reason" class="input min-h-[72px] py-2" maxlength="300" />
            <div class="flex gap-2">
              <button type="submit" :class="form.action === 'ACTIVE' ? 'btn-primary btn-sm' : 'btn-danger btn-sm'" :disabled="busy">{{ { ACTIVE: '승인 처리', REJECTED: '반려 처리', SUSPENDED: '정지 처리' }[form.action] }}</button>
              <button type="button" class="btn-ghost btn-sm" @click="form.action = ''">취소</button>
            </div>
          </form>
        </section>

        <form class="space-y-2" @submit.prevent="apply({ settlementRateBps: rateBps }, '수수료율을 저장했어요.')">
          <h3 class="font-bold">수수료율</h3>
          <div class="flex items-center gap-2">
            <input v-model="form.ratePct" inputmode="decimal" class="input w-28 tabular" aria-label="수수료율 (%)" />
            <span class="text-ink-muted">%</span>
            <button type="submit" class="btn-secondary btn-sm" :disabled="busy || !rateChanged">저장</button>
          </div>
          <p v-if="rateError" class="text-xs text-danger" role="alert">{{ rateError }}</p>
          <p class="text-2xs text-ink-subtle">플랫폼이 판매가에서 가져가는 비율이에요 (0–50%).</p>
        </form>
      </div>
    </SidePanel>
  </div>
</template>
