<script setup lang="ts">
/**
 * Member profile (design system "Horizon"). Values are the server's (GET /auth/me); saving uses
 * PATCH /auth/me and reports the server's answer. Nothing is pre-filled with sample data.
 * Withdrawal is confirmed, password-verified, and clears the local session on success.
 */
import { ref } from 'vue'
import { useAuthStore } from '~/stores/auth'
import { apiFetch } from '~/composables/useApi'

useHead({ title: '회원 정보' })
const auth = useAuthStore()
const fullName = ref('')
const phone = ref('')
const email = ref('')
const marketing = ref(false)
const saving = ref(false)
const msg = ref<{ ok: boolean; text: string } | null>(null)

async function load() {
  const r = await apiFetch('/auth/me')
  const u: any = r.ok ? r.data : auth.user
  fullName.value = u?.fullName || ''
  phone.value = u?.phoneNumber || ''
  email.value = u?.email || ''
  marketing.value = u?.marketingConsent === true
}
async function save() {
  msg.value = null; saving.value = true
  const r = await apiFetch('/auth/me', { method: 'PATCH', body: { fullName: fullName.value.trim(), phoneNumber: phone.value.trim(), marketingConsent: marketing.value } })
  saving.value = false
  if (!r.ok) { msg.value = { ok: false, text: r.data.error || '저장하지 못했어요.' }; return }
  if (auth.user) { const u = auth.user as any; u.fullName = r.data.fullName; u.phoneNumber = r.data.phoneNumber; u.phone = r.data.phoneNumber; try { localStorage.setItem('getfortrip_user', JSON.stringify(auth.user)) } catch {} }
  msg.value = { ok: true, text: '회원 정보를 저장했어요.' }
}
function logout() { auth.logout(); navigateTo('/') }
// #37: password change kills every session (server resets + revokes), so the
// user always lands back on login with the new password.
const curPw = ref('')
const newPw = ref('')
const newPw2 = ref('')
const pwBusy = ref(false)
const pwMsg = ref<{ ok: boolean; text: string } | null>(null)
async function changePassword() {
  pwMsg.value = null
  if (!curPw.value) { pwMsg.value = { ok: false, text: '현재 비밀번호를 입력해 주세요.' }; return }
  if (newPw.value !== newPw2.value) { pwMsg.value = { ok: false, text: '새 비밀번호가 일치하지 않아요.' }; return }
  pwBusy.value = true
  const r = await apiFetch('/auth/me/password', { method: 'POST', body: { currentPassword: curPw.value, newPassword: newPw.value } })
  pwBusy.value = false
  if (!r.ok) { pwMsg.value = { ok: false, text: r.data.error || '변경하지 못했어요.' }; return }
  auth.logout()
  navigateTo({ path: '/login', query: { changed: '1' } })
}
// A1: confirmed, password-verified withdrawal. Session is cleared on success.
const withdrawing = ref(false)
const withdrawPw = ref('')
const confirmText = ref('')
const withdrawError = ref('')
async function withdraw() {
  withdrawError.value = ''
  if (confirmText.value.trim() !== '탈퇴합니다') { withdrawError.value = '확인을 위해 "탈퇴합니다"를 입력해 주세요.'; return }
  if (!withdrawPw.value) { withdrawError.value = '비밀번호를 입력해 주세요.'; return }
  withdrawing.value = true
  const r = await apiFetch('/auth/me/withdraw', { method: 'POST', body: { password: withdrawPw.value, reason: 'USER_REQUEST_PROFILE' } })
  withdrawing.value = false
  if (!r.ok) { withdrawError.value = r.data.error || '탈퇴하지 못했어요.'; return }
  auth.logout()
  navigateTo('/')
}
const FIELD = 'w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-subtle focus:border-primary focus:outline-none focus:shadow-focus disabled:bg-surface-sunken disabled:text-ink-muted'
</script>

<template>
  <MyShell title="회원 정보" @ready="load">
    <form class="card max-w-xl space-y-4 p-5 sm:p-6" novalidate @submit.prevent="save">
      <label class="block"><span class="field-label">이메일 (로그인 아이디)</span><input :value="email" disabled :class="FIELD" /></label>
      <label class="block"><span class="field-label">이름</span><input v-model="fullName" autocomplete="name" :class="FIELD" /></label>
      <label class="block"><span class="field-label">휴대전화</span><input v-model="phone" type="tel" autocomplete="tel" placeholder="+82-10-0000-0000" :class="FIELD" /></label>
      <label class="flex cursor-pointer items-start gap-2.5 text-sm"><input v-model="marketing" type="checkbox" class="mt-0.5 h-4 w-4 accent-primary" data-testid="marketing-consent" /><span class="text-ink">할인·이벤트 소식 받기 (선택 · 언제든 변경할 수 있어요)</span></label>
      <p v-if="msg" :class="['rounded-xl px-4 py-2.5 text-sm font-medium', msg.ok ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger']" :role="msg.ok ? 'status' : 'alert'">{{ msg.text }}</p>
      <div class="flex flex-wrap gap-2 pt-1">
        <button type="submit" class="btn-primary" :disabled="saving">{{ saving ? '저장 중…' : '저장' }}</button>
      </div>
    </form>
    <form class="card mt-6 max-w-xl space-y-4 p-5 sm:p-6" novalidate @submit.prevent="changePassword">
      <h2 class="text-sm font-bold text-ink">비밀번호 변경</h2>
      <p class="text-xs text-ink-subtle">변경하면 모든 기기에서 로그아웃되고 새 비밀번호로 다시 로그인해야 해요.</p>
      <label class="block"><span class="field-label">현재 비밀번호</span><input v-model="curPw" type="password" autocomplete="current-password" :class="FIELD" data-testid="pw-current" /></label>
      <label class="block"><span class="field-label">새 비밀번호 (10자 이상, 영문+숫자)</span><input v-model="newPw" type="password" autocomplete="new-password" :class="FIELD" data-testid="pw-new" /></label>
      <label class="block"><span class="field-label">새 비밀번호 확인</span><input v-model="newPw2" type="password" autocomplete="new-password" :class="FIELD" data-testid="pw-new2" /></label>
      <p v-if="pwMsg" :class="['rounded-xl px-4 py-2.5 text-sm font-medium', pwMsg.ok ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger']" :role="pwMsg.ok ? 'status' : 'alert'">{{ pwMsg.text }}</p>
      <button type="submit" class="btn-primary" :disabled="pwBusy" data-testid="pw-submit">{{ pwBusy ? '변경 중…' : '비밀번호 변경' }}</button>
    </form>
    <button type="button" class="mt-6 flex items-center gap-2 text-sm font-semibold text-ink-muted hover:text-danger" @click="logout"><AppIcon name="logout" :size="18" />로그아웃</button>
    <details class="card mt-6 max-w-xl border-danger/30 p-5 sm:p-6">
      <summary class="cursor-pointer text-sm font-bold text-danger">회원탈퇴</summary>
      <div class="mt-3 space-y-3 text-sm text-ink">
        <p>탈퇴하면 이름·이메일·전화번호·여권정보 등 개인식별정보가 즉시 파기되고, 보유한 코인·쿠폰·찜·알림은 모두 사라져요. 계약·결제·분쟁 기록은 전자상거래법 제6조에 따라 5년간 별도 보관돼요.</p>
        <p>진행 중인 예약이나 미처리 환불이 있으면 탈퇴할 수 없어요.</p>
        <label class="block"><span class="field-label">"탈퇴합니다" 입력</span><input v-model="confirmText" placeholder="탈퇴합니다" :class="FIELD" data-testid="withdraw-confirm" /></label>
        <label class="block"><span class="field-label">비밀번호 확인</span><input v-model="withdrawPw" type="password" autocomplete="current-password" :class="FIELD" data-testid="withdraw-password" /></label>
        <p v-if="withdrawError" role="alert" class="rounded-xl bg-danger-soft px-4 py-2.5 font-medium text-danger">{{ withdrawError }}</p>
        <button type="button" :disabled="withdrawing" class="rounded-xl bg-danger px-5 py-2.5 font-bold text-white disabled:opacity-40" data-testid="withdraw-submit" @click="withdraw">{{ withdrawing ? '처리 중…' : '탈퇴하기' }}</button>
      </div>
    </details>
  </MyShell>
</template>
