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

const LOCALE_TAG: Record<string, string> = { ko: 'ko-KR', en: 'en-US', ja: 'ja-JP', zh: 'zh-CN', 'zh-hant': 'zh-Hant' }
const fmtTime = (iso: string) => {
  try {
    return new Date(iso).toLocaleString(LOCALE_TAG[locale.value] || 'ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch {
    return iso
  }
}
</script>

<template>
  <div class="mx-auto max-w-3xl px-4 pb-24 pt-10 lg:pb-16">
    <h1 class="font-display text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">{{ $t('status.title') }}</h1>
    <p class="mt-1 text-sm text-ink-muted">{{ $t('status.sub') }}</p>

    <div v-if="state === 'loading'" class="card mt-6 p-6 text-sm text-ink-muted">{{ $t('status.loading') }}</div>
    <div v-else-if="state === 'error'" class="card mt-6 p-6 text-sm text-ink">
      {{ $t('status.loadFail') }}
      <button type="button" class="ml-2 min-h-[44px] px-3 font-semibold text-primary underline" @click="load">{{ $t('common.retry') }}</button>
    </div>
    <div v-else-if="data" class="mt-6 space-y-4">
      <div
        class="rounded-card border p-5 text-lg font-extrabold"
        :class="data.status === 'ok' ? 'border-success/30 bg-success-soft text-success' : data.status === 'degraded' ? 'border-warning/30 bg-warning-soft text-warning' : 'border-danger/30 bg-danger-soft text-danger'"
      >
        {{ statusLabel(data.status) }}
      </div>

      <section class="card p-5">
        <h2 class="text-sm font-bold text-ink">{{ $t('status.components') }}</h2>
        <ul class="mt-3 space-y-2 text-sm text-ink-muted">
          <li class="flex items-center justify-between rounded-xl bg-surface-sunken px-3.5 py-2.5">
            <span>{{ $t('status.apiLine', { s: data.components.api ? $t('status.up') : $t('status.checking') }) }}</span>
            <span :class="['h-2.5 w-2.5 rounded-full', data.components.api ? 'bg-success' : 'bg-warning']" />
          </li>
          <li class="flex items-center justify-between rounded-xl bg-surface-sunken px-3.5 py-2.5">
            <span>{{ $t('status.dbLine', { s: data.components.database ? $t('status.up') : $t('status.checking') }) }}</span>
            <span :class="['h-2.5 w-2.5 rounded-full', data.components.database ? 'bg-success' : 'bg-warning']" />
          </li>
        </ul>
      </section>

      <section v-if="data.activeIncidents.length" class="card p-5">
        <h2 class="text-sm font-bold text-ink">{{ $t('status.activeTitle', { n: data.activeIncidents.length }) }}</h2>
        <ul class="mt-3 space-y-3">
          <li v-for="inc in data.activeIncidents" :key="inc.id" class="rounded-xl bg-surface-sunken p-3.5 text-sm">
            <p class="font-bold text-ink">[{{ sevLabel(inc.severity) }}] {{ inc.title }}</p>
            <p v-if="inc.latestUpdate" class="mt-1 whitespace-pre-line text-ink-muted">{{ inc.latestUpdate }}</p>
            <p class="mt-1 text-xs text-ink-subtle">{{ $t('status.started', { d: fmtTime(inc.startedAt) }) }}</p>
          </li>
        </ul>
      </section>
      <p v-else class="text-sm text-ink-muted">{{ $t('status.noIncidents') }}</p>

      <p class="text-xs text-ink-subtle">{{ $t('status.lastCheck', { d: fmtTime(data.time) }) }}</p>
    </div>
  </div>
</template>
