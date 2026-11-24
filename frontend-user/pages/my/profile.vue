<script setup lang="ts">
/**
 * Member profile (design system "Horizon"). Values are the server's (GET /auth/me); saving uses
 * PATCH /auth/me and reports the server's answer. Nothing is pre-filled with sample data.
 * Withdrawal is confirmed, password-verified, and clears the local session on success.
 */
import { ref } from 'vue'
import { useAuthStore } from '~/stores/auth'
import { apiFetch } from '~/composables/useApi'

const { t } = useI18n()
const localePath = useLocalePath()
useHead({ title: t('my.profile') })
const auth = useAuthStore()
const fullName = ref('')
const phone = ref('')
const email = ref('')
const marketing = ref(false)
// CR-06: social-only members have no password yet; they set one and withdraw by typed phrase.
const hasPassword = ref(true)
const socialProviders = ref<string[]>([])
const providerLabel = (p: string) => t(`my.provider_${p}`, p)
const saving = ref(false)
const msg = ref<{ ok: boolean; text: string } | null>(null)

async function load() {
  const r = await apiFetch('/auth/me')
  const u: any = r.ok ? r.data : auth.user
  fullName.value = u?.fullName || ''
  phone.value = u?.phoneNumber || ''
  email.value = u?.email || ''
  marketing.value = u?.marketingConsent === true
  hasPassword.value = u?.hasPassword !== false
  socialProviders.value = Array.isArray(u?.socialProviders) ? u.socialProviders : []
}
async function save() {
  msg.value = null; saving.value = true
  const r = await apiFetch('/auth/me', { method: 'PATCH', body: { fullName: fullName.value.trim(), phoneNumber: phone.value.trim(), marketingConsent: marketing.value } })
  saving.value = false
  if (!r.ok) { msg.value = { ok: false, text: r.data.error || t('my.profSaveFail') }; return }
  if (auth.user) { const u = auth.user as any; u.fullName = r.data.fullName; u.phoneNumber = r.data.phoneNumber; u.phone = r.data.phoneNumber; try { localStorage.setItem('getfortrip_user', JSON.stringify(auth.user)) } catch {} }
  msg.value = { ok: true, text: t('my.profSaved') }
}
function logout() { auth.logout(); navigateTo(localePath('/')) }
// #37: password change kills every session (server resets + revokes), so the
// user always lands back on login with the new password.
const curPw = ref('')
const newPw = ref('')
const newPw2 = ref('')
const pwBusy = ref(false)
const pwMsg = ref<{ ok: boolean; text: string } | null>(null)
async function changePassword() {
  pwMsg.value = null
  if (hasPassword.value && !curPw.value) { pwMsg.value = { ok: false, text: t('my.pwNeedCurrent') }; return }
  if (newPw.value !== newPw2.value) { pwMsg.value = { ok: false, text: t('my.pwMismatch') }; return }
  pwBusy.value = true
  const r = await apiFetch('/auth/me/password', { method: 'POST', body: { currentPassword: hasPassword.value ? curPw.value : undefined, newPassword: newPw.value } })
  pwBusy.value = false
  if (!r.ok) { pwMsg.value = { ok: false, text: r.data.error || t('my.pwChangeFail') }; return }
  auth.logout()
  navigateTo({ path: localePath('/login'), query: { changed: '1' } })
}
// A1: confirmed, password-verified withdrawal. Session is cleared on success.
const withdrawing = ref(false)
const withdrawPw = ref('')
const confirmText = ref('')
const withdrawError = ref('')
async function withdraw() {
  withdrawError.value = ''
  if (confirmText.value.trim() !== '탈퇴합니다') { withdrawError.value = t('my.withdrawNeedPhrase'); return }
  if (hasPassword.value && !withdrawPw.value) { withdrawError.value = t('my.withdrawNeedPw'); return }
  withdrawing.value = true
  const r = await apiFetch('/auth/me/withdraw', { method: 'POST', body: hasPassword.value ? { password: withdrawPw.value, reason: 'USER_REQUEST_PROFILE' } : { confirm: confirmText.value.trim(), reason: 'USER_REQUEST_PROFILE' } })
  withdrawing.value = false
  if (!r.ok) { withdrawError.value = r.data.error || t('my.withdrawFail'); return }
  auth.logout()
  navigateTo(localePath('/'))
}
const FIELD = 'w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-subtle focus:border-primary focus:outline-none focus:shadow-focus disabled:bg-surface-sunken disabled:text-ink-muted'
</script>

<template>
  <MyShell :title="$t('my.profile')" @ready="load">
    <form class="card max-w-xl space-y-4 p-5 sm:p-6" novalidate @submit.prevent="save">
      <label class="block"><span class="field-label">{{ $t('my.profEmail') }}</span><input :value="email" disabled :class="FIELD" /></label>
      <label class="block"><span class="field-label">{{ $t('auth.nameLabel') }}</span><input v-model="fullName" autocomplete="name" :class="FIELD" /></label>
      <label class="block"><span class="field-label">{{ $t('my.profPhone') }}</span><input v-model="phone" type="tel" autocomplete="tel" placeholder="+82-10-0000-0000" :class="FIELD" /></label>
      <label class="flex cursor-pointer items-start gap-2.5 text-sm"><input v-model="marketing" type="checkbox" class="mt-0.5 h-4 w-4 accent-primary" data-testid="marketing-consent" /><span class="text-ink">{{ $t('my.profMarketing') }}</span></label>
      <p v-if="msg" :class="['rounded-xl px-4 py-2.5 text-sm font-medium', msg.ok ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger']" :role="msg.ok ? 'status' : 'alert'">{{ msg.text }}</p>
      <div class="flex flex-wrap gap-2 pt-1">
        <button type="submit" class="btn-primary" :disabled="saving">{{ saving ? $t('my.saving') : $t('my.save') }}</button>
      </div>
    </form>
    <form class="card mt-6 max-w-xl space-y-4 p-5 sm:p-6" novalidate @submit.prevent="changePassword">
      <h2 class="text-sm font-bold text-ink">{{ $t('auth.changePw') }}</h2>
      <p class="text-xs text-ink-subtle">{{ $t('my.pwLogoutNote') }}</p>
      <p v-if="!hasPassword" class="rounded-xl bg-surface-sunken px-4 py-2.5 text-ink-muted">{{ $t('my.socialJoined', { p: socialProviders.map((p) => providerLabel(p)).join(', ') }) }}</p>
      <label v-if="hasPassword" class="block"><span class="field-label">{{ $t('my.pwCurrent') }}</span><input v-model="curPw" type="password" autocomplete="current-password" :class="FIELD" data-testid="pw-current" /></label>
      <label class="block"><span class="field-label">{{ $t('my.pwNewRule') }}</span><input v-model="newPw" type="password" autocomplete="new-password" :class="FIELD" data-testid="pw-new" /></label>
      <label class="block"><span class="field-label">{{ $t('auth.newPwConfirm') }}</span><input v-model="newPw2" type="password" autocomplete="new-password" :class="FIELD" data-testid="pw-new2" /></label>
      <p v-if="pwMsg" :class="['rounded-xl px-4 py-2.5 text-sm font-medium', pwMsg.ok ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger']" :role="pwMsg.ok ? 'status' : 'alert'">{{ pwMsg.text }}</p>
      <button type="submit" class="btn-primary" :disabled="pwBusy" data-testid="pw-submit">{{ pwBusy ? $t('auth.changing') : $t('auth.changePw') }}</button>
    </form>
    <button type="button" class="mt-6 flex items-center gap-2 text-sm font-semibold text-ink-muted hover:text-danger" @click="logout"><AppIcon name="logout" :size="18" />{{ $t('my.logout') }}</button>
    <details class="card mt-6 max-w-xl border-danger/30 p-5 sm:p-6">
      <summary class="cursor-pointer text-sm font-bold text-danger">{{ $t('my.withdrawTitle') }}</summary>
      <div class="mt-3 space-y-3 text-sm text-ink">
        <p>{{ $t('my.withdrawNote1') }}</p>
        <p>{{ $t('my.withdrawNote2') }}</p>
        <label class="block"><span class="field-label">{{ $t('my.withdrawTypePh') }}</span><input v-model="confirmText" placeholder="탈퇴합니다" :class="FIELD" data-testid="withdraw-confirm" /></label>
        <label v-if="hasPassword" class="block"><span class="field-label">{{ $t('my.withdrawPw') }}</span><input v-model="withdrawPw" type="password" autocomplete="current-password" :class="FIELD" data-testid="withdraw-password" /></label>
        <p v-if="withdrawError" role="alert" class="rounded-xl bg-danger-soft px-4 py-2.5 font-medium text-danger">{{ withdrawError }}</p>
        <button type="button" :disabled="withdrawing" class="rounded-xl bg-danger px-5 py-2.5 font-bold text-white disabled:opacity-40" data-testid="withdraw-submit" @click="withdraw">{{ withdrawing ? $t('my.processing') : $t('my.withdrawGo') }}</button>
      </div>
    </details>
  </MyShell>
</template>
