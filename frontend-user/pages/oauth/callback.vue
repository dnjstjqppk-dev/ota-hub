<script setup lang="ts">
/**
 * CR-06 social-login landing. The worker redirects here with a single-use
 * handoff (returning member) or a sign-up ticket (first visit) in the URL
 * fragment. The fragment is wiped immediately so it never lands in history.
 * First-time members must agree to the required terms before an account exists.
 */
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { apiFetch } from '~/composables/useApi'
import { useAuthStore } from '~/stores/auth'
import { useToastStore } from '~/stores/toast'

const { t, te } = useI18n()
useHead({ title: t('auth.oauthTitle'), meta: [{ name: 'robots', content: 'noindex' }] })
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const toast = useToastStore()

const OAUTH_ERR_CODES = ['STATE_MISMATCH', 'CANCELLED', 'CODE_MISSING', 'PROVIDER_ERROR', 'EMAIL_IN_USE', 'ACCOUNT_SUSPENDED', 'ROLE_NOT_ALLOWED'] as const
const oauthErr = (code: string) => ((OAUTH_ERR_CODES as readonly string[]).includes(code) && te(`auth.oauthErr.${code}`) ? t(`auth.oauthErr.${code}`) : t('auth.oauthErrDefault'))

const raw = String(route.query.returnTo || '/')
const returnTo = raw.startsWith('/') && !raw.startsWith('//') ? raw : '/'
const phase = ref<'working' | 'signup' | 'error'>('working')
const error = ref('')
const ticket = ref('')
const email = ref('')
const emailLocked = ref(false)
const fullName = ref('')
const agreeTerms = ref(false)
const agreePrivacy = ref(false)
const agreeMarketing = ref(false)
const busy = ref(false)
const touched = ref(false)
const formError = ref('')

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/
const emailErr = computed(() => (touched.value && !EMAIL_RE.test(email.value.trim()) ? t('auth.emailBad') : ''))
const nameErr = computed(() => (touched.value && !fullName.value.trim() ? t('auth.nameNeed') : ''))
const consentErr = computed(() => (touched.value && (!agreeTerms.value || !agreePrivacy.value) ? t('auth.consentNeed') : ''))
const allRequired = computed({
  get: () => agreeTerms.value && agreePrivacy.value && agreeMarketing.value,
  set: (v: boolean) => { agreeTerms.value = v; agreePrivacy.value = v; agreeMarketing.value = v }
})

function finish(res: any) {
  auth.login(res.user, res.token)
  router.replace(returnTo)
}

onMounted(async () => {
  const frag = new URLSearchParams(window.location.hash.slice(1))
  // Wipe the secret from the address bar and history right away.
  history.replaceState(history.state, '', window.location.pathname + window.location.search)
  if (route.query.error) {
    phase.value = 'error'
    error.value = oauthErr(String(route.query.error))
    return
  }
  const handoff = frag.get('handoff')
  if (handoff) {
    const r = await apiFetch('/auth/oauth/exchange', { method: 'POST', body: { handoff } })
    if (r.ok) { toast.success(t('auth.loggedIn')); finish(r.data); return }
    phase.value = 'error'
    error.value = r.data.error || t('auth.handoffExpired')
    return
  }
  const signup = frag.get('signup')
  if (signup) {
    ticket.value = signup
    email.value = frag.get('email') || ''
    emailLocked.value = !!email.value
    fullName.value = frag.get('name') || ''
    phase.value = 'signup'
    return
  }
  phase.value = 'error'
  error.value = t('auth.noHandoff')
})

async function complete() {
  touched.value = true
  formError.value = ''
  if (emailErr.value || nameErr.value || consentErr.value) return
  busy.value = true
  const r = await apiFetch('/auth/oauth/complete', { method: 'POST', body: { signup: ticket.value, email: email.value.trim(), fullName: fullName.value.trim(), agreeTerms: agreeTerms.value, agreePrivacy: agreePrivacy.value, agreeMarketing: agreeMarketing.value } })
  busy.value = false
  if (!r.ok) { formError.value = r.data.error || t('auth.completeFail'); return }
  toast.success(t('auth.welcome'))
  finish(r.data)
}
</script>

<template>
  <AuthCard :title="phase === 'signup' ? $t('auth.finishTitle') : $t('auth.oauthTitle')" :subtitle="phase === 'signup' ? $t('auth.finishSub') : ''">
    <div v-if="phase === 'working'" class="space-y-3 py-6 text-center" aria-busy="true">
      <div class="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-line border-t-primary" />
      <p class="text-sm text-ink-muted">{{ $t('auth.working') }}</p>
    </div>

    <div v-else-if="phase === 'error'" class="space-y-4">
      <p class="flex items-start gap-2 rounded-xl bg-danger-soft px-3.5 py-3 text-sm font-medium text-danger" role="alert"><AppIcon name="close" :size="16" class="mt-0.5" />{{ error }}</p>
      <NuxtLink :to="$localePath({ path: '/login', query: { redirect: returnTo } })" class="btn-primary w-full py-3">{{ $t('auth.toLogin') }}</NuxtLink>
    </div>

    <form v-else class="space-y-4" novalidate @submit.prevent="complete">
      <label class="block">
        <span class="field-label">{{ $t('auth.email') }}</span>
        <input v-model="email" type="email" autocomplete="email" :readonly="emailLocked" class="w-full rounded-xl border bg-surface px-3.5 py-3 text-sm text-ink focus:border-primary focus:outline-none focus:shadow-focus read-only:bg-surface-sunken read-only:text-ink-muted" :class="emailErr ? 'border-danger' : 'border-line'" :aria-invalid="!!emailErr" @blur="touched = true" />
        <span v-if="emailErr" class="mt-1 block text-xs text-danger">{{ emailErr }}</span>
        <span v-else-if="emailLocked" class="mt-1 block text-xs text-ink-subtle">{{ $t('auth.emailLockedHint') }}</span>
      </label>
      <label class="block">
        <span class="field-label">{{ $t('auth.nameLabel') }}</span>
        <input v-model="fullName" type="text" autocomplete="name" maxlength="80" class="w-full rounded-xl border bg-surface px-3.5 py-3 text-sm text-ink focus:border-primary focus:outline-none focus:shadow-focus" :class="nameErr ? 'border-danger' : 'border-line'" :aria-invalid="!!nameErr" />
        <span v-if="nameErr" class="mt-1 block text-xs text-danger">{{ nameErr }}</span>
      </label>
      <fieldset class="space-y-2 rounded-xl border p-4 text-sm" :class="consentErr ? 'border-danger' : 'border-line'">
        <legend class="sr-only">{{ $t('auth.consentLegend') }}</legend>
        <label class="flex items-center gap-2.5 border-b border-line pb-2 font-semibold text-ink"><input v-model="allRequired" type="checkbox" class="h-5 w-5 accent-primary" />{{ $t('auth.allAgree') }}</label>
        <label class="flex items-start gap-2.5"><input v-model="agreeTerms" type="checkbox" class="mt-0.5 h-5 w-5 accent-primary" /><span class="text-ink"><b>{{ $t('auth.req') }}</b> {{ $t('auth.agreePrefix') }}<NuxtLink :to="$localePath('/terms')" target="_blank" class="underline">{{ $t('auth.termsLink') }}</NuxtLink>{{ $t('auth.agreeSuffix') }}</span></label>
        <label class="flex items-start gap-2.5"><input v-model="agreePrivacy" type="checkbox" class="mt-0.5 h-5 w-5 accent-primary" /><span class="text-ink"><b>{{ $t('auth.req') }}</b> {{ $t('auth.agreePrefix') }}<NuxtLink :to="$localePath('/privacy')" target="_blank" class="underline">{{ $t('auth.privacyLink') }}</NuxtLink>{{ $t('auth.agreeSuffix') }}</span></label>
        <label class="flex items-start gap-2.5"><input v-model="agreeMarketing" type="checkbox" class="mt-0.5 h-5 w-5 accent-primary" /><span class="text-ink-muted">{{ $t('auth.opt') }} {{ $t('auth.marketingSub') }}</span></label>
        <span v-if="consentErr" class="block text-xs text-danger">{{ consentErr }}</span>
      </fieldset>
      <p v-if="formError" class="rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm font-medium text-danger" role="alert">{{ formError }}</p>
      <button type="submit" :disabled="busy" class="btn-primary w-full py-3 text-base">{{ busy ? $t('auth.joining') : $t('auth.agreeStart') }}</button>
    </form>
  </AuthCard>
</template>
