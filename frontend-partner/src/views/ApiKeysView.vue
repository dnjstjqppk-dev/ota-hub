<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { API_BASE, apiUrl, partnerToken } from '../config/api'

interface ApiKeyRow {
  id: string
  name: string
  keyPrefix: string
  isActive: boolean
  lastUsedAt: string | null
  createdAt: string
  revokedAt: string | null
}

const keys = ref<ApiKeyRow[]>([])
const loading = ref(false)
const error = ref('')
const issuing = ref(false)
const newName = ref('')
const freshKey = ref<{ id: string; apiKey: string } | null>(null)
const copied = ref(false)
const revoking = ref('')

const webhookUrl = ref('')
const webhookBusy = ref(false)
const webhookMsg = ref('')

function authHeaders(): Record<string, string> {
  const token = partnerToken()
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const [k, w] = await Promise.all([
      fetch(apiUrl('/partner/api-keys'), { headers: authHeaders() }),
      fetch(apiUrl('/partner/webhook'), { headers: authHeaders() })
    ])
    if (!k.ok) throw new Error('API 키 목록을 불러오지 못했습니다.')
    keys.value = ((await k.json()).keys || []) as ApiKeyRow[]
    if (w.ok) {
      const j = await w.json()
      webhookUrl.value = j.webhookUrl || ''
    }
  } catch (e) {
    error.value = (e as Error).message || '불러오기에 실패했습니다.'
  } finally {
    loading.value = false
  }
}

async function issue() {
  issuing.value = true
  error.value = ''
  freshKey.value = null
  try {
    const res = await fetch(apiUrl('/partner/api-keys'), {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ name: newName.value.trim() || 'Default' })
    })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(j.error || '키 발급에 실패했습니다.')
    freshKey.value = { id: j.id, apiKey: j.apiKey }
    newName.value = ''
    await load()
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    issuing.value = false
  }
}

async function revoke(id: string) {
  if (!confirm('이 API 키를 폐기할까요? 이 키로 연동된 시스템의 호출이 즉시 중단됩니다.')) return
  revoking.value = id
  try {
    const res = await fetch(apiUrl(`/partner/api-keys/${encodeURIComponent(id)}`), { method: 'DELETE', headers: authHeaders() })
    if (!res.ok) throw new Error('키 폐기에 실패했습니다.')
    await load()
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    revoking.value = ''
  }
}

function copyFresh() {
  if (!freshKey.value) return
  navigator.clipboard.writeText(freshKey.value.apiKey)
  copied.value = true
  setTimeout(() => (copied.value = false), 2000)
}

async function saveWebhook() {
  webhookBusy.value = true
  webhookMsg.value = ''
  try {
    const res = await fetch(apiUrl('/partner/webhook'), {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ webhookUrl: webhookUrl.value.trim() })
    })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(j.error || '웹훅 저장에 실패했습니다.')
    webhookMsg.value = '저장했어요.'
  } catch (e) {
    webhookMsg.value = (e as Error).message
  } finally {
    webhookBusy.value = false
  }
}

const openapiUrl = `${API_BASE}/partner/openapi.json`

onMounted(load)
</script>

<template>
  <div class="max-w-3xl space-y-6">
    <div>
      <h1 class="text-2xl font-black tracking-tight text-ink">
        API 연동 & 웹훅(Webhook) 설정
      </h1>
      <p class="mt-1 text-sm font-medium text-ink-subtle">
        공급사 자체 PMS / ERP 시스템과 getfortrip을 실시간 API로 연동합니다.
      </p>
    </div>

    <div v-if="error" class="rounded-2xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm font-semibold text-danger">
      {{ error }}
      <button type="button" class="ml-2 underline" @click="load">다시 시도</button>
    </div>

    <!-- Freshly issued key: shown exactly once -->
    <div v-if="freshKey" class="space-y-3 rounded-3xl border border-warning/40 bg-warning-soft p-6">
      <p class="font-black text-ink">새 API 키가 발급됐어요 — 지금 복사하세요. 다시 볼 수 없습니다.</p>
      <div class="flex items-center gap-2">
        <input :value="freshKey.apiKey" readonly aria-label="발급된 API 키" class="input font-mono !text-sm" />
        <button type="button" class="btn-primary btn-sm shrink-0" @click="copyFresh">
          {{ copied ? '복사됨!' : '키 복사' }}
        </button>
      </div>
      <button type="button" class="text-xs font-bold text-ink-muted underline" @click="freshKey = null">확인했어요 (닫기)</button>
    </div>

    <div class="card space-y-6 p-6 text-xs sm:p-8">
      <div class="space-y-3">
        <label for="key-name" class="label">파트너 REST API 인증키 (Bearer Token)</label>
        <div class="flex items-center gap-2">
          <input
            id="key-name"
            v-model="newName"
            maxlength="80"
            placeholder="키 이름 (예: PMS 연동용)"
            class="input"
          />
          <button
            type="button"
            :disabled="issuing"
            class="btn-primary btn-sm shrink-0"
            @click="issue"
          >
            {{ issuing ? '발급 중…' : '새 키 발급' }}
          </button>
        </div>
        <p class="text-[11px] text-ink-subtle">
          API 요청 시 <code class="rounded bg-surface-sunken px-1 py-0.5 font-mono">Authorization: Bearer &lt;API_KEY&gt;</code> 헤더에 포함하여 전송하세요.
        </p>
      </div>

      <div class="space-y-2">
        <p v-if="loading" class="text-ink-subtle">불러오는 중…</p>
        <p v-else-if="!keys.length" class="rounded-xl bg-surface-sunken px-4 py-6 text-center text-ink-subtle">발급된 API 키가 없어요. 위에서 첫 키를 발급하세요.</p>
        <ul v-else class="divide-y divide-line rounded-2xl border border-line">
          <li v-for="k in keys" :key="k.id" class="flex flex-wrap items-center gap-3 px-4 py-3">
            <div class="min-w-0 flex-1">
              <p class="truncate font-bold text-ink">{{ k.name }}</p>
              <p class="font-mono text-[11px] text-ink-subtle">{{ k.keyPrefix }}</p>
              <p class="text-[11px] text-ink-subtle">
                발급 {{ (k.createdAt || '').slice(0, 10) }} · 최근 사용 {{ k.lastUsedAt ? k.lastUsedAt.slice(0, 16).replace('T', ' ') : '없음' }}
              </p>
            </div>
            <span :class="['rounded-full px-2 py-0.5 font-bold', k.isActive ? 'bg-success-soft text-success' : 'bg-surface-sunken text-ink-subtle']">
              {{ k.isActive ? '활성' : '폐기됨' }}
            </span>
            <button
              v-if="k.isActive"
              type="button"
              :disabled="revoking === k.id"
              class="rounded-xl bg-surface-sunken px-3 py-1.5 font-bold text-ink-muted transition hover:bg-danger-soft hover:text-danger disabled:opacity-50"
              @click="revoke(k.id)"
            >
              {{ revoking === k.id ? '폐기 중…' : '폐기' }}
            </button>
          </li>
        </ul>
      </div>

      <div class="space-y-3 border-t border-line pt-6">
        <label for="webhook-url" class="label">주문 이벤트 실시간 웹훅 (Webhook URL)</label>
        <div class="flex items-center gap-2">
          <input
            id="webhook-url"
            v-model="webhookUrl"
            type="url"
            placeholder="https://your-domain.com/webhook"
            class="input font-mono"
          />
          <button
            type="button"
            :disabled="webhookBusy"
            class="btn-secondary btn-sm shrink-0"
            @click="saveWebhook"
          >
            {{ webhookBusy ? '저장 중…' : '저장' }}
          </button>
        </div>
        <p class="text-[11px] text-ink-subtle">
          신규 예약 접수(<code class="font-mono">booking.created</code>), 취소 요청(<code class="font-mono">booking.cancelled</code>) 발생 시 JSON 페이로드가 POST 전송됩니다. https만 허용돼요.
        </p>
        <p v-if="webhookMsg" class="text-[11px] font-bold text-ink-muted">{{ webhookMsg }}</p>
      </div>

      <div class="space-y-2 rounded-2xl border border-line bg-surface-sunken p-4">
        <div class="flex items-center gap-1.5 font-black text-ink">
          <AppIcon name="external" :size="16" class="text-primary" />
          <span>OpenAPI 3.0 사양 & 규격서</span>
        </div>
        <p class="text-[11px] text-ink-subtle">
          호텔 객실 재고 자동 푸시(ARI), 차량 가용성 동기화 및 바우처 전송 규격을 지원합니다.
        </p>
        <div class="pt-1">
          <a
            :href="openapiUrl"
            target="_blank"
            rel="noopener"
            class="inline-flex items-center gap-1 font-bold text-primary hover:underline"
          >
            <span>OpenAPI 스펙 문서 바로가기</span>
            <AppIcon name="arrow-right" :size="14" />
          </a>
        </div>
      </div>
    </div>
  </div>
</template>
