<script setup lang="ts">
/**
 * Feature flags (GET /admin/feature-flags, PATCH /admin/feature-flags/:key). The server enforces
 * prerequisites (cannot enable before required flags; cannot disable while others depend on it).
 * This screen shows those dependencies and the external-contract status, asks for a reason, and warns
 * before enabling a feature whose outside contract is not active.
 */
import { computed, onMounted, ref } from 'vue'
import { api, toast } from '../composables/session'
import { useResource } from '../composables/useResource'
import { dateTime } from '../composables/format'
import PageHeader from '../components/PageHeader.vue'
import StatePanel from '../components/StatePanel.vue'
import StatusBadge from '../components/StatusBadge.vue'

const list = useResource(async () => (await api('/admin/feature-flags')).flags || [], [] as any[])
onMounted(list.reload)

const CATEGORY: Record<string, string> = { BOOKING_DOMAIN: '예약 상품', PRODUCT_INGESTION: '상품 수집', AUTOMATION: '자동화', FINANCIAL: '재무', SYSTEM: '시스템' }
const CONTRACT: Record<string, { label: string; tone: any }> = {
  NOT_REQUIRED: { label: '계약 불필요', tone: 'neutral' }, PENDING_CONTRACT: { label: '계약 대기', tone: 'warning' }, ACTIVE: { label: '계약 유효', tone: 'success' }
}
const category = ref('')
const query = ref('')
const byKey = computed(() => new Map(list.data.value.map((f: any) => [f.key, f])))
const shown = computed(() => {
  const t = query.value.trim().toLowerCase()
  return list.data.value.filter((f: any) =>
    (!category.value || f.category === category.value) &&
    (!t || [f.key, f.display_name, f.description].some((v) => String(v || '').toLowerCase().includes(t))))
})
const counts = computed(() => ({ on: list.data.value.filter((f: any) => f.is_enabled === 1).length, total: list.data.value.length }))
const dependents = (key: string) => list.data.value.filter((f: any) => (f.requires_flags || []).includes(key) && f.is_enabled === 1)

const busy = ref('')
async function toggle(f: any) {
  const next = f.is_enabled !== 1
  if (next && f.is_external_dependent === 1 && f.external_contract_status !== 'ACTIVE' &&
      !confirm(`[${f.display_name}]은(는) 외부 계약이 필요한 기능인데 계약 상태가 '${CONTRACT[f.external_contract_status]?.label || f.external_contract_status}'예요. 그래도 켤까요?`)) return
  const reason = prompt(`${f.display_name}을(를) ${next ? '켜는' : '끄는'} 사유를 입력해 주세요. (감사 로그에 기록)`)
  if (reason === null) return
  busy.value = f.key
  try {
    const r = await api(`/admin/feature-flags/${encodeURIComponent(f.key)}`, { method: 'PATCH', json: { is_enabled: next, reason: reason.trim() || undefined } })
    Object.assign(f, r.flag || { is_enabled: next ? 1 : 0 })
    list.data.value = [...list.data.value]
    toast(`${f.display_name}을(를) ${next ? '켰어요' : '껐어요'}.`)
  } catch (e) { toast((e as Error).message, 'danger', 7000) } finally { busy.value = '' }
}
</script>

<template>
  <div>
    <PageHeader title="기능 플래그" :description="`사이트 기능을 켜고 꺼요. 선행 기능이 꺼져 있으면 켤 수 없고, 다른 기능이 의존하면 끌 수 없어요. 현재 ${counts.on}/${counts.total}개 켜짐.`" />

    <div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
      <div class="sm:w-72"><label for="flag-q" class="sr-only">기능 검색</label><input id="flag-q" v-model="query" class="input" placeholder="이름, 키, 설명으로 거르기" /></div>
      <div class="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0 [&::-webkit-scrollbar]:hidden" role="group" aria-label="분류 필터">
        <button type="button" class="chip" :aria-pressed="!category" @click="category = ''">전체</button>
        <button v-for="(v, k) in CATEGORY" :key="k" type="button" class="chip" :aria-pressed="category === k" @click="category = k">{{ v }}</button>
      </div>
    </div>

    <StatePanel :state="list.state.value" :error="list.error.value" :empty="!shown.length" empty-text="조건에 맞는 기능이 없어요." @retry="list.reload()">
      <ul class="grid gap-3 lg:grid-cols-2">
        <li v-for="f in shown" :key="f.key" class="card flex gap-4 p-4">
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <h3 class="font-bold text-ink">{{ f.display_name }}</h3>
              <span class="text-2xs text-ink-subtle">{{ CATEGORY[f.category] || f.category }}</span>
              <StatusBadge v-if="f.is_external_dependent === 1" v-bind="CONTRACT[f.external_contract_status] || { label: f.external_contract_status }" />
            </div>
            <p class="mt-0.5 font-mono text-2xs text-ink-subtle">{{ f.key }}</p>
            <p class="mt-1.5 text-sm text-ink-muted">{{ f.description }}</p>
            <p v-if="f.requires_flags?.length" class="mt-2 text-2xs text-ink-subtle">
              선행 기능:
              <span v-for="k in f.requires_flags" :key="k" :class="['mr-1.5', byKey.get(k)?.is_enabled === 1 ? 'text-success' : 'text-danger']">{{ byKey.get(k)?.display_name || k }} ({{ byKey.get(k)?.is_enabled === 1 ? '켜짐' : '꺼짐' }})</span>
            </p>
            <p v-if="dependents(f.key).length" class="mt-1 text-2xs text-ink-subtle">이 기능을 쓰는 기능: {{ dependents(f.key).map((d: any) => d.display_name).join(', ') }}</p>
            <p class="mt-2 text-2xs text-ink-subtle">변경 {{ dateTime(f.updated_at) }}<span v-if="f.updated_by"> · {{ f.updated_by }}</span></p>
          </div>
          <button
            type="button"
            role="switch"
            :aria-checked="f.is_enabled === 1"
            :aria-label="`${f.display_name} ${f.is_enabled === 1 ? '끄기' : '켜기'}`"
            :disabled="busy === f.key"
            :class="['relative mt-1 h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50', f.is_enabled === 1 ? 'bg-primary' : 'bg-line-strong']"
            @click="toggle(f)"
          ><span :class="['absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform', f.is_enabled === 1 ? 'translate-x-[22px]' : 'translate-x-0.5']" /></button>
        </li>
      </ul>
    </StatePanel>
  </div>
</template>
