<script setup lang="ts">
/**
 * Member profile (design system "Horizon"). Values are the server's (GET /auth/me); saving uses
 * PATCH /auth/me and reports the server's answer. Nothing is pre-filled with sample data.
 */
import { ref } from 'vue'
import { useAuthStore } from '~/stores/auth'
import { apiFetch } from '~/composables/useApi'

useHead({ title: '회원 정보' })
const auth = useAuthStore()
const fullName = ref('')
const phone = ref('')
const email = ref('')
const saving = ref(false)
const msg = ref<{ ok: boolean; text: string } | null>(null)

async function load() {
  const r = await apiFetch('/auth/me')
  const u: any = r.ok ? r.data : auth.user
  fullName.value = u?.fullName || ''
  phone.value = u?.phoneNumber || ''
  email.value = u?.email || ''
}
async function save() {
  msg.value = null; saving.value = true
  const r = await apiFetch('/auth/me', { method: 'PATCH', body: { fullName: fullName.value.trim(), phoneNumber: phone.value.trim() } })
  saving.value = false
  if (!r.ok) { msg.value = { ok: false, text: r.data.error || '저장하지 못했어요.' }; return }
  if (auth.user) { const u = auth.user as any; u.fullName = r.data.fullName; u.phoneNumber = r.data.phoneNumber; u.phone = r.data.phoneNumber; try { localStorage.setItem('getfortrip_user', JSON.stringify(auth.user)) } catch {} }
  msg.value = { ok: true, text: '회원 정보를 저장했어요.' }
}
function logout() { auth.logout(); navigateTo('/') }
const FIELD = 'w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-subtle focus:border-primary focus:outline-none focus:shadow-focus disabled:bg-surface-sunken disabled:text-ink-muted'
</script>

<template>
  <MyShell title="회원 정보" @ready="load">
    <form class="card max-w-xl space-y-4 p-5 sm:p-6" novalidate @submit.prevent="save">
      <label class="block"><span class="field-label">이메일 (로그인 아이디)</span><input :value="email" disabled :class="FIELD" /></label>
      <label class="block"><span class="field-label">이름</span><input v-model="fullName" autocomplete="name" :class="FIELD" /></label>
      <label class="block"><span class="field-label">휴대전화</span><input v-model="phone" type="tel" autocomplete="tel" placeholder="+82-10-0000-0000" :class="FIELD" /></label>
      <p v-if="msg" :class="['rounded-xl px-4 py-2.5 text-sm font-medium', msg.ok ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger']" :role="msg.ok ? 'status' : 'alert'">{{ msg.text }}</p>
      <div class="flex flex-wrap gap-2 pt-1">
        <button type="submit" class="btn-primary" :disabled="saving">{{ saving ? '저장 중…' : '저장' }}</button>
      </div>
    </form>
    <button type="button" class="mt-6 flex items-center gap-2 text-sm font-semibold text-ink-muted hover:text-danger" @click="logout"><AppIcon name="logout" :size="18" />로그아웃</button>
  </MyShell>
</template>
