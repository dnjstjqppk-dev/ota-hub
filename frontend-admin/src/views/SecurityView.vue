<script setup lang="ts">
/**
 * My security (Phase 7): TOTP enrollment for the signed-in admin (#100 made
 * the API; this is the console half). No QR library on purpose — the secret
 * and otpauth URL copy straight into any authenticator app.
 */
import { ref } from 'vue'
import { api, toast } from '../composables/session'

const status = ref<{ enrolled: boolean; pending: boolean } | null>(null)
const loading = ref(true)
const busy = ref(false)
const secret = ref('')
const otpauthUrl = ref('')
const code = ref('')

async function refresh() {
  loading.value = true
  try {
    const r = await api('/admin/mfa/status')
    status.value = { enrolled: Boolean(r.enrolled), pending: Boolean(r.pending) }
  } catch {
    status.value = null
    toast('보안 상태를 불러오지 못했어요.', 'error')
  } finally {
    loading.value = false
  }
}

async function enroll() {
  busy.value = true
  code.value = ''
  try {
    const r = await api('/admin/mfa/enroll', { method: 'POST' })
    secret.value = String(r.secret || '')
    otpauthUrl.value = String(r.otpauthUrl || '')
    status.value = { enrolled: false, pending: true }
    toast('인증 앱에 시크릿을 등록한 뒤 아래에서 확인해 주세요.')
  } catch (e: any) {
    toast(e.message || '등록에 실패했어요.', 'error')
  } finally {
    busy.value = false
  }
}

async function confirm() {
  if (!code.value.trim()) { toast('인증 코드를 입력해 주세요.', 'error'); return }
  busy.value = true
  try {
    await api('/admin/mfa/confirm', { method: 'POST', json: { code: code.value.trim() } })
    secret.value = ''
    otpauthUrl.value = ''
    code.value = ''
    status.value = { enrolled: true, pending: false }
    toast('2단계 인증을 켰어요. 다음 로그인부터 코드가 필요해요.')
  } catch (e: any) {
    toast(e.message || '코드가 올바르지 않아요.', 'error')
  } finally {
    busy.value = false
  }
}

async function disable() {
  busy.value = true
  try {
    await api('/admin/mfa', { method: 'DELETE' })
    status.value = { enrolled: false, pending: false }
    secret.value = ''
    otpauthUrl.value = ''
    toast('2단계 인증을 껐어요.')
  } catch (e: any) {
    toast(e.message || '해제에 실패했어요.', 'error')
  } finally {
    busy.value = false
  }
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast('복사했어요.')
  } catch {
    toast('복사에 실패했어요. 직접 선택해 주세요.', 'error')
  }
}

refresh()
</script>

<template>
  <div class="space-y-4">
    <h1 class="text-lg font-black">내 보안</h1>
    <p v-if="loading" class="text-sm text-ink-subtle">불러오는 중…</p>
    <div v-else-if="status?.enrolled" class="card space-y-3 p-5">
      <p class="text-sm font-bold text-success">2단계 인증 사용 중</p>
      <p class="text-xs text-ink-subtle">로그인할 때마다 인증 앱 코드를 입력해야 해요.</p>
      <button type="button" class="btn-secondary" :disabled="busy" @click="disable">2단계 인증 끄기</button>
    </div>
    <div v-else class="card space-y-4 p-5">
      <p class="text-sm font-bold">2단계 인증 {{ status?.pending ? '등록 진행 중' : '미사용' }}</p>
      <div v-if="!secret" class="space-y-2">
        <p class="text-xs text-ink-subtle">인증 앱(Google Authenticator, 1Password 등)을 준비한 뒤 등록을 시작하세요.</p>
        <button type="button" class="btn-primary" :disabled="busy" @click="enroll">등록 시작</button>
      </div>
      <div v-else class="space-y-3">
        <div>
          <p class="label">1. 시크릿을 인증 앱에 입력하세요</p>
          <div class="flex items-center gap-2">
            <code class="flex-1 break-all rounded-field bg-canvas px-3 py-2 text-xs font-bold">{{ secret }}</code>
            <button type="button" class="btn-secondary" @click="copy(secret)">복사</button>
          </div>
        </div>
        <div>
          <p class="label">2. 또는 이 주소를 인증 앱에 여세요</p>
          <div class="flex items-center gap-2">
            <code class="flex-1 break-all rounded-field bg-canvas px-3 py-2 text-2xs">{{ otpauthUrl }}</code>
            <button type="button" class="btn-secondary" @click="copy(otpauthUrl)">복사</button>
          </div>
        </div>
        <div>
          <label for="mfa-code" class="label">3. 표시된 6자리 코드로 확인하세요</label>
          <div class="flex items-center gap-2">
            <input id="mfa-code" v-model="code" inputmode="numeric" autocomplete="one-time-code" maxlength="10" class="input max-w-40" placeholder="123456" />
            <button type="button" class="btn-primary" :disabled="busy" @click="confirm">확인하고 켜기</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
