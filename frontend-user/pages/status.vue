<script setup lang="ts">
import { ref, onMounted } from 'vue'

const { t, locale } = useI18n()
useSeoPage({ site: `https://${useRuntimeConfig().public.brandDomain}`, path: '/status', title: t('status.title'), description: t('status.desc') })

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

const STATUS_IDS = ['ok', 'degraded', 'outage'] as const
const statusLabel = (s: string) => ((STATUS_IDS as readonly string[]).includes(s) ? t(`status.state_${s}`) : s)
const SEV_IDS = ['INFO', 'DEGRADED', 'OUTAGE'] as const
const sevLabel = (s: string) => ((SEV_IDS as readonly string[]).includes(s) ? t(`status.sev_${s}`) : s)

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

const LOCALE_TAG: Record<string, string> = { ko: 'ko-KR', en: 'en-US', ja: 'ja-JP', zh: 'zh-CN' }
const fmtTime = (iso: string) => {
  try {
    return new Date(iso).toLocaleString(LOCALE_TAG[locale.value] || 'ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch {
    return iso
  }
}
</script>

<template>
  <div class="mx-auto max-w-3xl px-4 py-10">
    <h1 class="text-2xl font-bold">{{ $t('status.title') }}</h1>
    <p class="mt-1 text-sm text-gray-500">{{ $t('status.sub') }}</p>

    <div v-if="state === 'loading'" class="mt-6 rounded-xl border p-6 text-sm text-gray-500">{{ $t('status.loading') }}</div>
    <div v-else-if="state === 'error'" class="mt-6 rounded-xl border p-6 text-sm">
      {{ $t('status.loadFail') }}
      <button type="button" class="ml-2 min-h-[44px] px-3 underline" @click="load">{{ $t('common.retry') }}</button>
    </div>
    <div v-else-if="data" class="mt-6 space-y-4">
      <div
        class="rounded-xl border p-5 text-lg font-bold"
        :class="data.status === 'ok' ? 'border-green-200 bg-green-50 text-green-800' : data.status === 'degraded' ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-red-200 bg-red-50 text-red-800'"
      >
        {{ statusLabel(data.status) }}
      </div>

      <section class="rounded-xl border p-5">
        <h2 class="text-sm font-bold">{{ $t('status.components') }}</h2>
        <ul class="mt-2 space-y-1 text-sm">
          <li>{{ $t('status.apiLine', { s: data.components.api ? $t('status.up') : $t('status.checking') }) }}</li>
          <li>{{ $t('status.dbLine', { s: data.components.database ? $t('status.up') : $t('status.checking') }) }}</li>
        </ul>
      </section>

      <section v-if="data.activeIncidents.length" class="rounded-xl border p-5">
        <h2 class="text-sm font-bold">{{ $t('status.activeTitle', { n: data.activeIncidents.length }) }}</h2>
        <ul class="mt-3 space-y-3">
          <li v-for="inc in data.activeIncidents" :key="inc.id" class="rounded-lg bg-gray-50 p-3 text-sm">
            <p class="font-bold">[{{ sevLabel(inc.severity) }}] {{ inc.title }}</p>
            <p v-if="inc.latestUpdate" class="mt-1 whitespace-pre-line text-gray-600">{{ inc.latestUpdate }}</p>
            <p class="mt-1 text-xs text-gray-400">{{ $t('status.started', { d: fmtTime(inc.startedAt) }) }}</p>
          </li>
        </ul>
      </section>
      <p v-else class="text-sm text-gray-500">{{ $t('status.noIncidents') }}</p>

      <p class="text-xs text-gray-400">{{ $t('status.lastCheck', { d: fmtTime(data.time) }) }}</p>
    </div>
  </div>
</template>
