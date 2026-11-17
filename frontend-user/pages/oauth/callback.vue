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

useHead({ title: '소셜 로그인', meta: [{ name: 'robots', content: 'noindex' }] })
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const toast = useToastStore()

const ERRORS: Record<string, string> = {
  STATE_MISMATCH: '로그인 요청이 만료됐거나 올바르지 않아요. 다시 시도해주세요.',
  CANCELLED: '소셜 로그인을 취소했어요.',
  CODE_MISSING: '소셜 로그인 응답이 올바르지 않아요. 다시 시도해주세요.',
  PROVIDER_ERROR: '소셜 로그인 제공자와 통신하지 못했어요. 잠시 후 다시 시도해주세요.',
  EMAIL_IN_USE: '이미 이 이메일로 가입된 계정이 있어요. 이메일과 비밀번호로 로그인해주세요.',
  ACCOUNT_SUSPENDED: '이용이 제한된 계정이에요. 고객센터로 문의해주세요.',
  ROLE_NOT_ALLOWED: '이 계정은 소셜 로그인을 사용할 수 없어요.'
}

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
const emailErr = computed(() => (touched.value && !EMAIL_RE.test(email.value.trim()) ? '올바른 이메일 주소를 입력해주세요.' : ''))
const nameErr = computed(() => (touched.value && !fullName.value.trim() ? '이름을 입력해주세요.' : ''))
const consentErr = computed(() => (touched.value && (!agreeTerms.value || !agreePrivacy.value) ? '필수 약관에 동의해주세요.' : ''))
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
    error.value = ERRORS[String(route.query.error)] || '소셜 로그인에 실패했어요. 다시 시도해주세요.'
    return
  }
  const handoff = frag.get('handoff')
  if (handoff) {
    const r = await apiFetch('/auth/oauth/exchange', { method: 'POST', body: { handoff } })
    if (r.ok) { toast.success('로그인했어요.'); finish(r.data); return }
    phase.value = 'error'
    error.value = r.data.error || '로그인 정보가 만료됐어요. 다시 시도해주세요.'
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
  error.value = '로그인 정보가 없어요. 소셜 로그인을 다시 시도해주세요.'
})

async function complete() {
  touched.value = true
  formError.value = ''
  if (emailErr.value || nameErr.value || consentErr.value) return
  busy.value = true
  const r = await apiFetch('/auth/oauth/complete', { method: 'POST', body: { signup: ticket.value, email: email.value.trim(), fullName: fullName.value.trim(), agreeTerms: agreeTerms.value, agreePrivacy: agreePrivacy.value, agreeMarketing: agreeMarketing.value } })
  busy.value = false
  if (!r.ok) { formError.value = r.data.error || '가입을 완료하지 못했어요.'; return }
  toast.success('가입을 환영해요!')
  finish(r.data)
}
</script>

<template>
  <AuthCard :title="phase === 'signup' ? '가입 마무리' : '소셜 로그인'" :subtitle="phase === 'signup' ? '처음 오셨네요. 약관 동의만 하면 바로 시작할 수 있어요.' : ''">
    <div v-if="phase === 'working'" class="space-y-3 py-6 text-center" aria-busy="true">
      <div class="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-line border-t-primary" />
      <p class="text-sm text-ink-muted">로그인 중이에요…</p>
    </div>

    <div v-else-if="phase === 'error'" class="space-y-4">
      <p class="flex items-start gap-2 rounded-xl bg-danger-soft px-3.5 py-3 text-sm font-medium text-danger" role="alert"><AppIcon name="close" :size="16" class="mt-0.5" />{{ error }}</p>
      <NuxtLink :to="{ path: '/login', query: { redirect: returnTo } }" class="btn-primary w-full py-3">로그인 화면으로</NuxtLink>
    </div>

    <form v-else class="space-y-4" novalidate @submit.prevent="complete">
      <label class="block">
        <span class="field-label">이메일</span>
        <input v-model="email" type="email" autocomplete="email" :readonly="emailLocked" class="w-full rounded-xl border bg-surface px-3.5 py-3 text-sm text-ink focus:border-primary focus:outline-none focus:shadow-focus read-only:bg-surface-sunken read-only:text-ink-muted" :class="emailErr ? 'border-danger' : 'border-line'" :aria-invalid="!!emailErr" @blur="touched = true" />
        <span v-if="emailErr" class="mt-1 block text-xs text-danger">{{ emailErr }}</span>
        <span v-else-if="emailLocked" class="mt-1 block text-xs text-ink-subtle">소셜 계정의 이메일로 가입돼요.</span>
      </label>
      <label class="block">
        <span class="field-label">이름</span>
        <input v-model="fullName" type="text" autocomplete="name" maxlength="80" class="w-full rounded-xl border bg-surface px-3.5 py-3 text-sm text-ink focus:border-primary focus:outline-none focus:shadow-focus" :class="nameErr ? 'border-danger' : 'border-line'" :aria-invalid="!!nameErr" />
        <span v-if="nameErr" class="mt-1 block text-xs text-danger">{{ nameErr }}</span>
      </label>
      <fieldset class="space-y-2 rounded-xl border p-4 text-sm" :class="consentErr ? 'border-danger' : 'border-line'">
        <legend class="sr-only">약관 동의</legend>
        <label class="flex items-center gap-2.5 border-b border-line pb-2 font-semibold text-ink"><input v-model="allRequired" type="checkbox" class="h-5 w-5 accent-primary" />전체 동의</label>
        <label class="flex items-start gap-2.5"><input v-model="agreeTerms" type="checkbox" class="mt-0.5 h-5 w-5 accent-primary" /><span class="text-ink"><b>(필수)</b> <NuxtLink to="/terms" target="_blank" class="underline">이용약관</NuxtLink>에 동의합니다</span></label>
        <label class="flex items-start gap-2.5"><input v-model="agreePrivacy" type="checkbox" class="mt-0.5 h-5 w-5 accent-primary" /><span class="text-ink"><b>(필수)</b> <NuxtLink to="/privacy" target="_blank" class="underline">개인정보 수집·이용</NuxtLink>에 동의합니다</span></label>
        <label class="flex items-start gap-2.5"><input v-model="agreeMarketing" type="checkbox" class="mt-0.5 h-5 w-5 accent-primary" /><span class="text-ink-muted">(선택) 할인·이벤트 소식 받기</span></label>
        <span v-if="consentErr" class="block text-xs text-danger">{{ consentErr }}</span>
      </fieldset>
      <p v-if="formError" class="rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm font-medium text-danger" role="alert">{{ formError }}</p>
      <button type="submit" :disabled="busy" class="btn-primary w-full py-3 text-base">{{ busy ? '가입 중…' : '동의하고 시작하기' }}</button>
    </form>
  </AuthCard>
</template>
