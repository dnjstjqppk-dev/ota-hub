<script setup lang="ts">
/**
 * TG-13 SLO dashboard (GET /admin/slo/summary) + incident console
 * (GET/POST/PATCH /admin/incidents). Figures are recorded facts only —
 * definitions come from docs/SLO.md and the honest limits are shown inline.
 */
import { computed, onMounted, ref } from 'vue'
import { api, toast } from '../composables/session'
import { useResource } from '../composables/useResource'
import PageHeader from '../components/PageHeader.vue'
import StatePanel from '../components/StatePanel.vue'
import StatCard from '../components/StatCard.vue'
import StatusBadge from '../components/StatusBadge.vue'

const s = useResource(async () => api('/admin/slo/summary'), null as any)
const inc = useResource(async () => api('/admin/incidents'), null as any)
onMounted(() => { s.reload(); inc.reload() })
const d = computed(() => s.data.value?.slo)
const incidents = computed<any[]>(() => inc.data.value?.incidents || [])
const open = computed(() => incidents.value.filter((i) => i.status === 'OPEN'))

const form = ref({ title: '', severity: 'DEGRADED', latestUpdate: '' })
const updating = ref<Record<string, string>>({})
const busy = ref(false)
const purgePaths = ref('/\n/hotels\n/deals')
const purging = ref(false)

const runCachePurge = async () => {
  if (purging.value) return
  const paths = purgePaths.value.split(/[\n,]+/).map((x) => x.trim()).filter(Boolean)
  if (!paths.length) { toast('퍼지할 경로를 입력해 주세요.', 'danger'); return }
  purging.value = true
  try {
    await api('/admin/cache/purge', { method: 'POST', json: { paths } })
    toast(`${paths.length}개 경로의 엣지 캐시 퍼지를 요청했어요.`)
  } catch (e: any) {
    toast(e?.message || '캐시 퍼지에 실패했어요.', 'danger')
  } finally {
    purging.value = false
  }
}

const SEV_LABEL: Record<string, string> = { INFO: '안내', DEGRADED: '지연', OUTAGE: '장애' }
const pct = (v: number | null | undefined, digits = 3) => (v === null || v === undefined ? '—' : `${v.toFixed(digits)}%`)
const ms = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${v.toLocaleString('ko-KR')}ms`)
const dur = (sec: number) => {
  if (!sec) return '0초'
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  return h ? `${h}시간 ${m}분` : m ? `${m}분` : `${sec}초`
}
const fmtTime = (iso: string) => {
  try { return new Date(iso).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) } catch { return iso }
}

const openIncident = async () => {
  if (!form.value.title.trim() || busy.value) return
  busy.value = true
  try {
    await api('/admin/incidents', { method: 'POST', json: { title: form.value.title.trim(), severity: form.value.severity, latestUpdate: form.value.latestUpdate.trim() } })
    form.value = { title: '', severity: 'DEGRADED', latestUpdate: '' }
    toast('장애를 등록했어요. /status에 즉시 반영돼요.')
    await Promise.all([s.reload(), inc.reload()])
  } catch (e: any) {
    toast(e?.message || '등록에 실패했어요.', 'danger')
  } finally {
    busy.value = false
  }
}

const saveUpdate = async (id: string) => {
  const text = (updating.value[id] || '').trim()
  if (!text || busy.value) return
  busy.value = true
  try {
    await api(`/admin/incidents/${id}`, { method: 'PATCH', json: { latestUpdate: text } })
    updating.value = { ...updating.value, [id]: '' }
    toast('상황을 공유했어요.')
    await inc.reload()
  } catch (e: any) {
    toast(e?.message || '저장에 실패했어요.', 'danger')
  } finally {
    busy.value = false
  }
}

const resolveIncident = async (id: string) => {
  if (busy.value) return
  busy.value = true
  try {
    await api(`/admin/incidents/${id}`, { method: 'PATCH', json: { status: 'RESOLVED' } })
    toast('장애를 해소했어요.')
    await Promise.all([s.reload(), inc.reload()])
  } catch (e: any) {
    toast(e?.message || '해소 처리에 실패했어요.', 'danger')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div>
    <PageHeader title="SLO·장애 현황" description="목표 대비 현황과 장애 기록이에요. 수치는 기록된 사실만 집계해요." />

    <StatePanel :state="s.state.value" :error="s.error.value" :rows="3" @retry="s.reload()">
      <template v-if="d">
        <p class="mb-3 text-xs tabular text-ink-subtle">최근 {{ d.windowDays }}일 기준</p>
        <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="가용성" :value="pct(d.uptimePct)" :hint="`목표 ${d.objectives.availabilityPct}% · 장애 누적 ${dur(d.outageSeconds)}`" icon="shield" :tone="d.uptimePct < d.objectives.availabilityPct ? 'warning' : 'success'" />
          <StatCard label="p95 지연(표본)" :value="ms(d.isolate.p95Ms)" :hint="`목표 ${d.objectives.p95Ms}ms 이하 · 평균 ${ms(d.isolate.avgMs)}`" icon="clock" :tone="d.isolate.p95Ms !== null && d.isolate.p95Ms > d.objectives.p95Ms ? 'warning' : 'neutral'" />
          <StatCard label="5xx(표본)" :value="`${(d.isolate.errors5xx || 0).toLocaleString('ko-KR')}건`" :hint="`요청 ${(d.isolate.requests || 0).toLocaleString('ko-KR')}건`" icon="alert" :tone="d.isolate.errors5xx > 0 ? 'warning' : 'neutral'" />
          <StatCard label="크론" :value="d.cron === 'NEVER_RAN' ? '미실행' : d.cron === 'UNKNOWN' ? '확인 불가' : d.cron.stale ? '지연' : '정상'" :hint="typeof d.cron === 'object' ? `최근 ${fmtTime(d.cron.lastRun)}` : '15분 기준'" icon="refresh" :tone="d.cron === 'UNKNOWN' || (typeof d.cron === 'object' && d.cron.stale) ? 'warning' : 'neutral'" />
        </div>
        <details class="mt-2 text-2xs text-ink-subtle">
          <summary class="cursor-pointer py-1">측정 한계</summary>
          <ul class="mt-1 space-y-0.5">
            <li>· 가용성은 기록된 장애 기준 — 합성 모니터링이 없어 미기록 장애는 수치에 없어요.</li>
            <li>· 지연·5xx는 단일 isolate 표본이에요. 플릿 전체는 OTLP 수집기 몫이에요. ({{ d.isolate.note }})</li>
          </ul>
        </details>
      </template>
    </StatePanel>

    <section class="card mt-6 p-4">
      <h2 class="text-sm font-bold">새 장애 등록 <span class="font-normal text-ink-subtle">· 등록 즉시 공개 /status에 반영</span></h2>
      <div class="mt-3 grid gap-2 sm:grid-cols-[1fr_140px]">
        <input v-model="form.title" type="text" maxlength="120" placeholder="예: 토스 결제 승인 지연" class="input min-h-[44px]" aria-label="장애 제목" />
        <select v-model="form.severity" class="input min-h-[44px]" aria-label="심각도">
          <option value="INFO">안내</option>
          <option value="DEGRADED">지연</option>
          <option value="OUTAGE">장애</option>
        </select>
      </div>
      <textarea v-model="form.latestUpdate" rows="2" maxlength="2000" placeholder="현재 상황 (선택)" class="input mt-2 w-full" aria-label="현재 상황" />
      <button type="button" class="btn-primary mt-2 min-h-[44px]" :disabled="busy || !form.title.trim()" @click="openIncident">장애 등록</button>
    </section>

    <StatePanel :state="inc.state.value" :error="inc.error.value" :rows="3" @retry="inc.reload()">
      <section v-if="incidents.length" class="mt-6">
        <h2 class="text-sm font-bold">진행 중 {{ open.length }}건 · 전체 {{ incidents.length }}건</h2>
        <ul class="mt-3 space-y-3">
          <li v-for="i in incidents" :key="i.id" class="card p-4 text-sm" :class="i.status === 'RESOLVED' ? 'opacity-70' : ''">
            <p class="flex items-center gap-2 font-bold">
              <span>[{{ SEV_LABEL[i.severity] || i.severity }}] {{ i.title }}</span>
              <StatusBadge :tone="i.status === 'OPEN' ? 'warning' : 'neutral'" :label="i.status === 'OPEN' ? '진행 중' : '해소됨'" />
            </p>
            <p v-if="i.latestUpdate" class="mt-1 whitespace-pre-line text-ink-subtle">{{ i.latestUpdate }}</p>
            <p class="mt-1 text-2xs text-ink-subtle">시작 {{ fmtTime(i.startedAt) }}<span v-if="i.resolvedAt"> · 해소 {{ fmtTime(i.resolvedAt) }}</span></p>
            <div v-if="i.status === 'OPEN'" class="mt-2 flex flex-col gap-2 sm:flex-row">
              <input v-model="updating[i.id]" type="text" maxlength="2000" placeholder="상황 공유…" class="input min-h-[44px] flex-1" :aria-label="`${i.title} 상황 공유`" />
              <div class="flex gap-2">
                <button type="button" class="btn-secondary min-h-[44px]" :disabled="busy || !(updating[i.id] || '').trim()" @click="saveUpdate(i.id)">공유</button>
                <button type="button" class="btn-primary min-h-[44px]" :disabled="busy" @click="resolveIncident(i.id)">해소</button>
              </div>
            </div>
          </li>
        </ul>
      </section>
      <p v-else class="mt-6 text-sm text-ink-subtle">기록된 장애가 없어요.</p>
    </StatePanel>

    <section class="card mt-6 p-4">
      <h2 class="text-sm font-bold text-ink">엣지 캐시 수동 퍼지 <span class="font-normal text-ink-subtle">· Cloudflare Edge Cache 즉시 무효화</span></h2>
      <p class="mt-1 text-xs text-ink-muted">줄바꿈 또는 쉼표로 경로를 입력하세요 (예: /, /hotels, /deals).</p>
      <textarea v-model="purgePaths" rows="3" class="input mt-2 font-mono text-xs" aria-label="퍼지 대상 경로" />
      <button type="button" class="btn-secondary mt-2" :disabled="purging" @click="runCachePurge">{{ purging ? '퍼지 요청 중…' : '캐시 퍼지 실행' }}</button>
    </section>
  </div>
</template>
