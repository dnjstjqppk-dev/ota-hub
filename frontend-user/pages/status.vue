<script setup lang="ts">
import { ref, onMounted } from 'vue'

useHead({
  title: '서비스 상태',
  meta: [{ name: 'description', content: 'getfortrip 서비스 상태와 진행 중인 장애 안내' }]
})

interface ActiveIncident {
  id: string
  title: string
  severity: 'INFO' | 'DEGRADED' | 'OUTAGE'
  latestUpdate: string
  startedAt: string
}

interface StatusData {
  status: 'ok' | 'degraded' | 'outage'
  components: { api: boolean; database: boolean }
  activeIncidents: ActiveIncident[]
  time: string
}

const data = ref<StatusData | null>(null)
const state = ref<'loading' | 'ready' | 'error'>('loading')

const STATUS_LABEL: Record<string, string> = { ok: '정상 운영 중', degraded: '일부 지연', outage: '장애 대응 중' }
const SEVERITY_LABEL: Record<string, string> = { INFO: '안내', DEGRADED: '지연', OUTAGE: '장애' }

const load = async () => {
  state.value = 'loading'
  try {
    const res = await fetch('/status')
    if (!res.ok) throw new Error(String(res.status))
    data.value = await res.json()
    state.value = 'ready'
  } catch {
    state.value = 'error'
  }
}

onMounted(load)

const fmtTime = (iso: string) => {
  try {
    return new Date(iso).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch {
    return iso
  }
}
</script>

<template>
  <div class="mx-auto max-w-3xl px-4 py-10">
    <h1 class="text-2xl font-bold">서비스 상태</h1>
    <p class="mt-1 text-sm text-gray-500">getfortrip 운영 상태를 실시간으로 안내해요.</p>

    <div v-if="state === 'loading'" class="mt-6 rounded-xl border p-6 text-sm text-gray-500">상태를 불러오는 중…</div>
    <div v-else-if="state === 'error'" class="mt-6 rounded-xl border p-6 text-sm">
      상태를 불러오지 못했어요.
      <button type="button" class="ml-2 min-h-[44px] px-3 underline" @click="load">다시 시도</button>
    </div>
    <div v-else-if="data" class="mt-6 space-y-4">
      <div
        class="rounded-xl border p-5 text-lg font-bold"
        :class="data.status === 'ok' ? 'border-green-200 bg-green-50 text-green-800' : data.status === 'degraded' ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-red-200 bg-red-50 text-red-800'"
      >
        {{ STATUS_LABEL[data.status] || data.status }}
      </div>

      <section class="rounded-xl border p-5">
        <h2 class="text-sm font-bold">구성 요소</h2>
        <ul class="mt-2 space-y-1 text-sm">
          <li>예약 API — {{ data.components.api ? '정상' : '확인 중' }}</li>
          <li>데이터베이스 — {{ data.components.database ? '정상' : '확인 중' }}</li>
        </ul>
      </section>

      <section v-if="data.activeIncidents.length" class="rounded-xl border p-5">
        <h2 class="text-sm font-bold">진행 중인 안내 ({{ data.activeIncidents.length }}건)</h2>
        <ul class="mt-3 space-y-3">
          <li v-for="inc in data.activeIncidents" :key="inc.id" class="rounded-lg bg-gray-50 p-3 text-sm">
            <p class="font-bold">[{{ SEVERITY_LABEL[inc.severity] || inc.severity }}] {{ inc.title }}</p>
            <p v-if="inc.latestUpdate" class="mt-1 whitespace-pre-line text-gray-600">{{ inc.latestUpdate }}</p>
            <p class="mt-1 text-xs text-gray-400">시작 {{ fmtTime(inc.startedAt) }}</p>
          </li>
        </ul>
      </section>
      <p v-else class="text-sm text-gray-500">진행 중인 장애가 없어요.</p>

      <p class="text-xs text-gray-400">마지막 확인 {{ fmtTime(data.time) }}</p>
    </div>
  </div>
</template>
