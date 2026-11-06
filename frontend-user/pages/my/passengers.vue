<script setup lang="ts">
/**
 * Saved travelers (design system "Horizon"). Stored server-side; passport numbers are encrypted at rest
 * and only ever returned masked. If the encryption key is not configured the server refuses to store a
 * passport number, and the page shows that reason.
 */
import { reactive, ref } from 'vue'
import { apiFetch } from '~/composables/useApi'

useHead({ title: '자주 쓰는 여행자' })
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
  if (!f.nameKo.trim() || !f.lastNameEn.trim() || !f.firstNameEn.trim()) { msg.value = { ok: false, text: '한글 이름과 영문 성·이름을 입력해 주세요.' }; return }
  saving.value = true
  const r = await apiFetch('/user/passengers', { method: 'POST', body: { ...f, lastNameEn: f.lastNameEn.trim().toUpperCase(), firstNameEn: f.firstNameEn.trim().toUpperCase(), passportNumber: f.passportNumber.trim().toUpperCase() } })
  saving.value = false
  if (!r.ok) { msg.value = { ok: false, text: r.data.error || '저장하지 못했어요.' }; return }
  Object.assign(f, blank()); formOpen.value = false
  msg.value = { ok: true, text: '여행자를 저장했어요.' }
  await load()
}
async function remove(id: string) {
  if (!confirm('이 여행자 정보를 삭제할까요?')) return
  removing.value = id
  const r = await apiFetch(`/user/passengers/${encodeURIComponent(id)}`, { method: 'DELETE' })
  removing.value = ''
  if (!r.ok) { msg.value = { ok: false, text: '삭제하지 못했어요. 다시 시도해 주세요.' }; return }
  list.value = list.value.filter((p) => p.id !== id)
}
const FIELD = 'w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-subtle focus:border-primary focus:outline-none focus:shadow-focus'
</script>

<template>
  <MyShell title="자주 쓰는 여행자" subtitle="여권 정보는 암호화해 저장하고, 화면에는 일부만 보여 드려요." @ready="load">
    <p v-if="msg" :class="['mb-4 rounded-xl px-4 py-2.5 text-sm font-medium', msg.ok ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger']" :role="msg.ok ? 'status' : 'alert'">{{ msg.text }}</p>

    <ResultsState :state="state" :count="list.length" icon="users" empty-title="저장한 여행자가 없어요" empty-hint="자주 함께 여행하는 사람을 저장해 두세요." error-title="여행자 정보를 불러오지 못했어요" @retry="load">
      <ul class="grid gap-3 sm:grid-cols-2">
        <li v-for="p in list" :key="p.id" class="card p-4">
          <div class="flex items-start justify-between gap-2">
            <div>
              <p class="font-semibold text-ink">{{ p.name_ko }} <span v-if="p.is_primary" class="ml-1 rounded-full bg-primary-soft px-2 py-0.5 text-2xs font-semibold text-primary">본인</span></p>
              <p class="text-sm text-ink-muted">{{ p.last_name_en }} {{ p.first_name_en }}</p>
            </div>
            <button type="button" class="flex h-9 w-9 items-center justify-center rounded-full text-ink-subtle hover:bg-surface-sunken hover:text-danger" :disabled="removing === p.id" :aria-label="`${p.name_ko} 삭제`" @click="remove(p.id)"><AppIcon name="close" :size="18" /></button>
          </div>
          <dl class="mt-3 grid grid-cols-2 gap-2 text-xs">
            <div v-if="p.birth_date"><dt class="text-ink-subtle">생년월일</dt><dd class="text-ink tabular">{{ p.birth_date }}</dd></div>
            <div v-if="p.nationality"><dt class="text-ink-subtle">국적</dt><dd class="text-ink">{{ p.nationality }}</dd></div>
            <div v-if="p.passport_number"><dt class="text-ink-subtle">여권번호</dt><dd class="text-ink tabular">{{ p.passport_number }}</dd></div>
            <div v-if="p.passport_expiry"><dt class="text-ink-subtle">여권 만료일</dt><dd class="text-ink tabular">{{ p.passport_expiry }}</dd></div>
          </dl>
        </li>
      </ul>
    </ResultsState>

    <div v-if="state === 'ready'" class="mt-6">
      <button v-if="!formOpen" type="button" class="btn-secondary" @click="formOpen = true; msg = null"><AppIcon name="plus" :size="16" />여행자 추가</button>
      <form v-else class="card space-y-3 p-5" novalidate @submit.prevent="save">
        <h2 class="font-bold text-ink">여행자 추가</h2>
        <div class="grid gap-3 sm:grid-cols-3">
          <label><span class="field-label">한글 이름</span><input v-model="f.nameKo" :class="FIELD" placeholder="홍길동" /></label>
          <label><span class="field-label">영문 성 (여권과 동일)</span><input v-model="f.lastNameEn" :class="[FIELD, 'uppercase']" placeholder="HONG" /></label>
          <label><span class="field-label">영문 이름 (여권과 동일)</span><input v-model="f.firstNameEn" :class="[FIELD, 'uppercase']" placeholder="GILDONG" /></label>
          <label><span class="field-label">생년월일</span><input v-model="f.birthDate" type="date" :class="FIELD" /></label>
          <label><span class="field-label">성별</span><select v-model="f.gender" :class="FIELD"><option value="MALE">남성</option><option value="FEMALE">여성</option></select></label>
          <label><span class="field-label">국적 (3자리 코드)</span><input v-model="f.nationality" maxlength="3" :class="[FIELD, 'uppercase']" /></label>
          <label><span class="field-label">여권번호 (선택)</span><input v-model="f.passportNumber" autocomplete="off" :class="[FIELD, 'uppercase']" /></label>
          <label><span class="field-label">여권 만료일 (선택)</span><input v-model="f.passportExpiry" type="date" :class="FIELD" /></label>
        </div>
        <div class="flex gap-2 pt-1">
          <button type="submit" class="btn-primary" :disabled="saving">{{ saving ? '저장 중…' : '저장' }}</button>
          <button type="button" class="btn-secondary" @click="formOpen = false">취소</button>
        </div>
      </form>
    </div>
  </MyShell>
</template>
