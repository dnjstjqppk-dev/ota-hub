<script setup lang="ts">
/**
 * Members (GET /admin/users ?q ?role, PATCH /admin/users/:id). Search suggests as you type (email,
 * name, phone, id). Role changes and coin adjustments are audited; coin adjustments are written to
 * coin_ledger by the server. Account suspension is not supported by the schema, so it is not offered.
 */
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api, session, toast } from '../composables/session'
import { useResource } from '../composables/useResource'
import { dateTime, num } from '../composables/format'
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
const role = computed(() => qv('role'))
const page = computed(() => Math.max(1, parseInt(qv('page') || '1', 10) || 1))
const draft = ref(q.value)
watch(q, (v) => { draft.value = v })

const total = ref(0)
const totalPages = ref(1)
const list = useResource(async () => {
  const p = new URLSearchParams()
  if (q.value) p.set('q', q.value)
  if (role.value) p.set('role', role.value)
  p.set('page', String(page.value))
  const j = await api(`/admin/users?${p}`)
  total.value = j.total || 0
  totalPages.value = j.totalPages || 1
  return j.users || []
}, [] as any[])
watch([q, role, page], ([qq, r, pg], [oq, orr]) => {
  if ((qq !== oq || r !== orr) && pg !== 1) patch({ page: '' })
  else list.reload()
})
onMounted(list.reload)
const suggest = async (term: string, signal: AbortSignal) => (await api(`/admin/users?q=${encodeURIComponent(term)}&limit=8`, { signal })).users || []

const ROLE: Record<string, { label: string; tone: any }> = { USER: { label: '회원', tone: 'neutral' }, ADMIN: { label: '관리자', tone: 'info' } }

const selected = ref<any | null>(null)
const form = reactive({ role: 'USER', coin: '', note: '' })
const busy = ref(false)
function open(u: any) { selected.value = u; Object.assign(form, { role: u.role, coin: '', note: '' }) }
const isSelf = computed(() => selected.value?.id === session.user?.id)
const coinValue = computed(() => (form.coin.trim() === '' ? null : Number(form.coin)))
const coinError = computed(() => {
  const v = coinValue.value
  if (v === null) return ''
  if (!Number.isInteger(v) || v === 0) return '0이 아닌 정수를 입력해 주세요. 차감은 음수(예: -500)로 입력해요.'
  if (Math.abs(v) > 10_000_000) return '한 번에 ±10,000,000 코인까지 조정할 수 있어요.'
  return ''
})
const dirty = computed(() => !!selected.value && (form.role !== selected.value.role || coinValue.value !== null))

async function save() {
  if (coinError.value) return
  if (form.role !== selected.value.role && !confirm(`${selected.value.email}의 권한을 ${ROLE[form.role].label}(으)로 바꿀까요?`)) return
  busy.value = true
  try {
    const body: Record<string, unknown> = {}
    if (form.role !== selected.value.role) body.role = form.role
    if (coinValue.value !== null) { body.coinAdjustment = coinValue.value; body.note = form.note.trim() || undefined }
    const r = await api(`/admin/users/${encodeURIComponent(selected.value.id)}`, { method: 'PATCH', json: body })
    selected.value = { ...selected.value, role: form.role, coin_balance: r.coinBalance ?? selected.value.coin_balance }
    form.coin = ''
    form.note = ''
    toast('회원 정보를 저장했어요.')
    list.reload()
  } catch (e) { toast((e as Error).message, 'danger', 6000) } finally { busy.value = false }
}
</script>

<template>
  <div>
    <PageHeader title="회원" description="회원을 찾아 권한과 코인을 관리해요. 모든 변경은 감사 로그에 남아요." />

    <div class="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
      <div class="lg:w-96">
        <EntitySearch
          v-model="draft"
          label="회원 검색"
          input-id="user-search"
          placeholder="이메일, 이름, 전화번호"
          :fetcher="suggest"
          :item-key="(x: any) => x.id"
          @select="open"
          @submit="(t: string) => patch({ q: t })"
        >
          <template #item="{ item }">
            <div class="flex items-center gap-2">
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-medium text-ink">{{ item.full_name || '이름 없음' }}</p>
                <p class="truncate text-2xs text-ink-subtle">{{ item.email }}<span v-if="item.phone_number"> · {{ item.phone_number }}</span></p>
              </div>
              <StatusBadge v-bind="ROLE[item.role] || { label: item.role }" />
            </div>
          </template>
        </EntitySearch>
      </div>
      <div class="flex gap-1.5" role="group" aria-label="권한 필터">
        <button type="button" class="chip" :aria-pressed="!role" @click="patch({ role: '' })">전체</button>
        <button v-for="(v, k) in ROLE" :key="k" type="button" class="chip" :aria-pressed="role === k" @click="patch({ role: k })">{{ v.label }}</button>
      </div>
    </div>
    <p v-if="q" class="mb-3 text-sm text-ink-muted">‘{{ q }}’ 검색 결과 · <button type="button" class="font-semibold text-primary" @click="patch({ q: '' })">검색 해제</button></p>

    <StatePanel :state="list.state.value" :error="list.error.value" :empty="!list.data.value.length" empty-text="조건에 맞는 회원이 없어요." @retry="list.reload()">
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>회원</th><th>전화번호</th><th>권한</th><th>등급</th><th class="text-right">코인</th><th>가입</th></tr></thead>
          <tbody>
            <tr v-for="u in list.data.value" :key="u.id" class="row-link" tabindex="0" @click="open(u)" @keydown.enter="open(u)">
              <td><p class="font-medium">{{ u.full_name || '이름 없음' }}</p><p class="text-2xs text-ink-subtle">{{ u.email }}</p></td>
              <td class="text-xs tabular">{{ u.phone_number || '—' }}</td>
              <td><StatusBadge v-bind="ROLE[u.role] || { label: u.role }" /></td>
              <td class="text-xs">{{ u.tier || '—' }}</td>
              <td class="text-right tabular">{{ num(u.coin_balance) }}</td>
              <td class="whitespace-nowrap text-xs text-ink-muted tabular">{{ dateTime(u.created_at) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <PageNav :page="page" :total-pages="totalPages" :total="total" @go="(p) => patch({ page: p === 1 ? '' : String(p) })" />
    </StatePanel>

    <SidePanel :open="!!selected" :title="selected?.full_name || selected?.email || ''" :subtitle="selected?.email" @close="selected = null">
      <form v-if="selected" id="user-form" class="space-y-5 text-sm" @submit.prevent="save">
        <dl class="grid grid-cols-2 gap-3">
          <div><dt class="text-2xs text-ink-subtle">회원 ID</dt><dd class="break-all font-mono text-xs">{{ selected.id }}</dd></div>
          <div><dt class="text-2xs text-ink-subtle">가입</dt><dd class="tabular">{{ dateTime(selected.created_at) }}</dd></div>
          <div><dt class="text-2xs text-ink-subtle">전화번호</dt><dd>{{ selected.phone_number || '—' }}</dd></div>
          <div><dt class="text-2xs text-ink-subtle">코인 잔액</dt><dd class="font-semibold tabular">{{ num(selected.coin_balance) }}</dd></div>
        </dl>

        <fieldset>
          <legend class="label">권한</legend>
          <div class="flex gap-2">
            <label v-for="(v, k) in ROLE" :key="k" class="chip cursor-pointer" :aria-pressed="form.role === k">
              <input v-model="form.role" type="radio" name="role" :value="k" class="sr-only" :disabled="isSelf && k !== 'ADMIN'" />{{ v.label }}
            </label>
          </div>
          <p v-if="isSelf" class="mt-1 text-2xs text-ink-subtle">본인의 관리자 권한은 해제할 수 없어요.</p>
        </fieldset>

        <fieldset class="space-y-2">
          <legend class="label">코인 조정</legend>
          <input v-model="form.coin" inputmode="numeric" class="input tabular" placeholder="예: 1000 (지급), -500 (차감)" aria-describedby="coin-help" />
          <p id="coin-help" class="text-2xs text-ink-subtle">잔액은 0 아래로 내려가지 않아요. 조정 내역은 코인 원장에 기록돼요.</p>
          <p v-if="coinError" class="text-xs text-danger" role="alert">{{ coinError }}</p>
          <input v-if="coinValue !== null" v-model="form.note" class="input" maxlength="200" placeholder="조정 사유 (원장에 기록)" />
        </fieldset>

        <p class="rounded-field bg-surface-sunken px-3 py-2 text-2xs text-ink-muted">회원 이용 정지는 아직 지원하지 않아요.</p>
      </form>
      <template #footer>
        <button type="button" class="btn-ghost" @click="selected = null">닫기</button>
        <button type="submit" form="user-form" class="btn-primary" :disabled="busy || !dirty || !!coinError">{{ busy ? '저장 중…' : '저장' }}</button>
      </template>
    </SidePanel>
  </div>
</template>
