<script setup lang="ts">
/**
 * Landing page for the emailed reset link: /reset-password?token=...
 * The token is read once, then removed from the address bar, and the page sends no Referer,
 * so it does not linger in history or leak to third parties.
 */
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { apiFetch } from '~/composables/useApi'

const { t } = useI18n()
useHead({ title: t('auth.resetTitle'), meta: [{ name: 'referrer', content: 'no-referrer' }, { name: 'robots', content: 'noindex' }] })

const route = useRoute()
const router = useRouter()
const token = ref('')
const pw = ref('')
const pw2 = ref('')
const busy = ref(false)
const error = ref('')
const done = ref(false)
const ready = ref(false)

// Mirrors the server policy (worker/src/routes/auth.ts validatePassword); the server stays authoritative.
const policyOk = computed(() => pw.value.length >= 10 && pw.value.length <= 128 && /[A-Za-z]/.test(pw.value) && /\d/.test(pw.value))
const match = computed(() => pw.value === pw2.value)

onMounted(() => {
  token.value = String(route.query.token || '')
  if (token.value) router.replace({ path: '/reset-password' })
  ready.value = true
})

async function submit() {
  error.value = ''
  if (!policyOk.value) { error.value = t('auth.policyErr'); return }
  if (!match.value) { error.value = t('auth.mismatchErr'); return }
  busy.value = true
  const r = await apiFetch('/auth/reset-password', { method: 'POST', body: { token: token.value, newPassword: pw.value } })
  busy.value = false
  if (!r.ok) { error.value = r.data.error || t('auth.resetFail'); return }
  token.value = ''
  pw.value = pw2.value = ''
  done.value = true
}
</script>

<template>
  <AuthCard :title="$t('auth.newPwTitle')" icon="lock">
    <div v-if="done" class="space-y-4 text-center">
      <p class="rounded-2xl bg-success-soft px-4 py-3 text-sm text-success" role="status">{{ $t('auth.resetDone') }}</p>
      <NuxtLink :to="$localePath('/login')" class="btn-primary w-full">{{ $t('auth.login') }}</NuxtLink>
    </div>
    <div v-else-if="ready && !token" class="space-y-4 text-center">
      <p class="rounded-2xl bg-warning-soft px-4 py-3 text-sm text-ink" role="alert">{{ $t('auth.badLink') }}</p>
      <NuxtLink :to="$localePath('/forgot-password')" class="btn-primary w-full">{{ $t('auth.forgotTitle') }}</NuxtLink>
    </div>
    <form v-else-if="ready" class="space-y-4" novalidate @submit.prevent="submit">
      <label class="block"><span class="field-label">{{ $t('auth.newPw') }}</span><input v-model="pw" type="password" autocomplete="new-password" required class="w-full rounded-xl border border-line bg-surface px-3.5 py-3 text-sm text-ink placeholder:text-ink-subtle focus:border-primary focus:outline-none focus:shadow-focus" /><span :class="['mt-1 block text-xs', pw && !policyOk ? 'text-danger' : 'text-ink-subtle']">{{ $t('auth.pwHint') }}</span></label>
      <label class="block"><span class="field-label">{{ $t('auth.newPwConfirm') }}</span><input v-model="pw2" type="password" autocomplete="new-password" required class="w-full rounded-xl border border-line bg-surface px-3.5 py-3 text-sm text-ink placeholder:text-ink-subtle focus:border-primary focus:outline-none focus:shadow-focus" /><span v-if="pw2 && !match" class="mt-1 block text-xs text-danger">{{ $t('auth.mismatchHint') }}</span></label>
      <p v-if="error" class="flex items-start gap-2 rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm font-medium text-danger" role="alert"><AppIcon name="close" :size="16" class="mt-0.5" />{{ error }}</p>
      <button type="submit" :disabled="busy" class="btn-primary w-full py-3 text-base">{{ busy ? $t('auth.changing') : $t('auth.changePw') }}</button>
    </form>
  </AuthCard>
</template>
