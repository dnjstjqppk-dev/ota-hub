<script setup lang="ts">
/**
 * Saved travelers (design system "Horizon"). Stored server-side; passport numbers are encrypted at rest
 * and only ever returned masked. If the encryption key is not configured the server refuses to store a
 * passport number, and the page shows that reason.
 */
import { reactive, ref } from 'vue'
import { apiFetch } from '~/composables/useApi'

const { t } = useI18n()
useHead({ title: t('my.passengers') })
const list = ref<any[]>([])
const state = ref<'loading' | 'ready' | 'error'>('loading')
const formOpen = ref(false)
const saving = ref(false)
const removing = ref('')
const msg = ref<{ ok: boolean; text: string } | null>(null)
const blank = () => ({ nameKo: '', lastNameEn: '', firstNameEn: '', birthDate: '', gender: 'MALE', nationality: 'KOR', passportNumber: '', passportExpiry: '' })
const f = reactive(blank())

async function load() {
  state.value = 'loading'
  const r = await apiFetch('/user/passengers')
  if (!r.ok) { state.value = 'error'; return }
  list.value = r.data.passengers || []
  state.value = 'ready'
}
async function save() {
  msg.value = null
  if (!f.nameKo.trim() || !f.lastNameEn.trim() || !f.firstNameEn.trim()) { msg.value = { ok: false, text: t('my.paxNeedNames') }; return }
  saving.value = true
  const r = await apiFetch('/user/passengers', { method: 'POST', body: { ...f, lastNameEn: f.lastNameEn.trim().toUpperCase(), firstNameEn: f.firstNameEn.trim().toUpperCase(), passportNumber: f.passportNumber.trim().toUpperCase() } })
  saving.value = false
  if (!r.ok) { msg.value = { ok: false, text: r.data.error || t('my.paxSaveFail') }; return }
  Object.assign(f, blank()); formOpen.value = false
  msg.value = { ok: true, text: t('my.paxSaved') }
  await load()
}
async function remove(id: string) {
  if (!confirm(t('my.paxConfirmDelete'))) return
  removing.value = id
  const r = await apiFetch(`/user/passengers/${encodeURIComponent(id)}`, { method: 'DELETE' })
  removing.value = ''
  if (!r.ok) { msg.value = { ok: false, text: t('my.paxDeleteFail') }; return }
  list.value = list.value.filter((p) => p.id !== id)
}
const FIELD = 'w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-subtle focus:border-primary focus:outline-none focus:shadow-focus'
</script>

<template>
  <MyShell :title="$t('my.passengers')" :subtitle="$t('my.paxSub')" @ready="load">
    <p v-if="msg" :class="['mb-4 rounded-xl px-4 py-2.5 text-sm font-medium', msg.ok ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger']" :role="msg.ok ? 'status' : 'alert'">{{ msg.text }}</p>

    <ResultsState :state="state" :count="list.length" icon="users" :empty-title="$t('my.paxEmpty')" :empty-hint="$t('my.paxEmptyHint')" :error-title="$t('my.paxFail')" @retry="load">
      <ul class="grid gap-3 sm:grid-cols-2">
        <li v-for="p in list" :key="p.id" class="card p-4">
          <div class="flex items-start justify-between gap-2">
            <div>
              <p class="font-semibold text-ink">{{ p.name_ko }} <span v-if="p.is_primary" class="ml-1 rounded-full bg-primary-soft px-2 py-0.5 text-2xs font-semibold text-primary">{{ $t('my.paxSelf') }}</span></p>
              <p class="text-sm text-ink-muted">{{ p.last_name_en }} {{ p.first_name_en }}</p>
            </div>
            <button type="button" class="flex h-9 w-9 items-center justify-center rounded-full text-ink-subtle hover:bg-surface-sunken hover:text-danger" :disabled="removing === p.id" :aria-label="$t('my.paxDelete', { name: p.name_ko })" @click="remove(p.id)"><AppIcon name="close" :size="18" /></button>
          </div>
          <dl class="mt-3 grid grid-cols-2 gap-2 text-xs">
            <div v-if="p.birth_date"><dt class="text-ink-subtle">{{ $t('my.paxBirth') }}</dt><dd class="text-ink tabular">{{ p.birth_date }}</dd></div>
            <div v-if="p.nationality"><dt class="text-ink-subtle">{{ $t('my.paxNation') }}</dt><dd class="text-ink">{{ p.nationality }}</dd></div>
            <div v-if="p.passport_number"><dt class="text-ink-subtle">{{ $t('my.paxPassport') }}</dt><dd class="text-ink tabular">{{ p.passport_number }}</dd></div>
            <div v-if="p.passport_expiry"><dt class="text-ink-subtle">{{ $t('my.paxExpiry') }}</dt><dd class="text-ink tabular">{{ p.passport_expiry }}</dd></div>
          </dl>
        </li>
      </ul>
    </ResultsState>

    <div v-if="state === 'ready'" class="mt-6">
      <button v-if="!formOpen" type="button" class="btn-secondary" @click="formOpen = true; msg = null"><AppIcon name="plus" :size="16" />{{ $t('my.paxAdd') }}</button>
      <form v-else class="card space-y-3 p-5" novalidate @submit.prevent="save">
        <h2 class="font-bold text-ink">{{ $t('my.paxAdd') }}</h2>
        <div class="grid gap-3 sm:grid-cols-3">
          <label><span class="field-label">{{ $t('my.paxNameKo') }}</span><input v-model="f.nameKo" :class="FIELD" :placeholder="$t('my.paxNameKoPh')" /></label>
          <label><span class="field-label">{{ $t('my.paxLastEn') }}</span><input v-model="f.lastNameEn" :class="[FIELD, 'uppercase']" placeholder="HONG" /></label>
          <label><span class="field-label">{{ $t('my.paxFirstEn') }}</span><input v-model="f.firstNameEn" :class="[FIELD, 'uppercase']" placeholder="GILDONG" /></label>
          <label><span class="field-label">{{ $t('my.paxBirth') }}</span><input v-model="f.birthDate" type="date" :class="FIELD" /></label>
          <label><span class="field-label">{{ $t('my.paxGender') }}</span><select v-model="f.gender" :class="FIELD"><option value="MALE">{{ $t('my.paxMale') }}</option><option value="FEMALE">{{ $t('my.paxFemale') }}</option></select></label>
          <label><span class="field-label">{{ $t('my.paxNationCode') }}</span><input v-model="f.nationality" maxlength="3" :class="[FIELD, 'uppercase']" /></label>
          <label><span class="field-label">{{ $t('my.paxPassportOpt') }}</span><input v-model="f.passportNumber" autocomplete="off" :class="[FIELD, 'uppercase']" /></label>
          <label><span class="field-label">{{ $t('my.paxExpiryOpt') }}</span><input v-model="f.passportExpiry" type="date" :class="FIELD" /></label>
        </div>
        <div class="flex gap-2 pt-1">
          <button type="submit" class="btn-primary" :disabled="saving">{{ saving ? $t('my.saving') : $t('my.save') }}</button>
          <button type="button" class="btn-secondary" @click="formOpen = false">{{ $t('common.cancel') }}</button>
        </div>
      </form>
    </div>
  </MyShell>
</template>
