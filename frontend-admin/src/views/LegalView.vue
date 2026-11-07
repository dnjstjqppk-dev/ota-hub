<script setup lang="ts">
/**
 * Legal document version registry (GET/PATCH /admin/legal/:slug).
 * Bodies live in the versioned frontend pages; this table tracks published versions.
 */
import { onMounted, reactive, ref } from 'vue'
import { api, toast } from '../composables/session'
import { useResource } from '../composables/useResource'
import { dateTime } from '../composables/format'
import PageHeader from '../components/PageHeader.vue'
import StatePanel from '../components/StatePanel.vue'

const list = useResource(async () => (await api('/admin/legal')).documents || [], [] as any[])
onMounted(() => list.reload())

const editing = ref<string | null>(null)
const form = reactive({ version: '', title: '', effective_from: '' })
const formError = ref('')
const saving = ref(false)
function startEdit(d: any) {
  editing.value = d.slug
  form.version = d.version
  form.title = d.title
  form.effective_from = d.effective_from
  formError.value = ''
}
async function save(slug: string) {
  saving.value = true
  formError.value = ''
  try {
    await api(`/admin/legal/${slug}`, { method: 'PATCH', json: { version: form.version.trim(), title: form.title.trim(), effective_from: form.effective_from.trim() } })
    toast('약관 버전을 저장했어요.')
    editing.value = null
    await list.reload()
  } catch (e: any) {
    formError.value = e?.message || '저장에 실패했어요.'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div>
    <PageHeader title="약관 버전" description="이용약관·개인정보처리방침·쿠키·취소환불 규정의 게시 버전과 시행일을 관리해요. 본문은 버전 표시된 정적 페이지에서 바뀌어요." />
    <StatePanel :state="list.state.value" :error="list.error.value" :empty="!list.data.value.length" empty-text="등록된 약관 문서가 없어요." @retry="list.reload()">
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>문서</th><th>버전</th><th>시행일</th><th>수정 시각</th><th class="text-right">작업</th></tr></thead>
          <tbody>
            <tr v-for="d in list.data.value" :key="d.slug">
              <td><p class="font-medium">{{ d.title }}</p><p class="font-mono text-2xs text-ink-subtle">/{{ d.slug }}</p></td>
              <td v-if="editing === d.slug"><input v-model="form.version" type="text" class="input w-24 font-mono" placeholder="2.0" /></td>
              <td v-else class="font-mono">v{{ d.version }}</td>
              <td v-if="editing === d.slug"><input v-model="form.effective_from" type="text" class="input w-32 font-mono" placeholder="2026-11-07" /></td>
              <td v-else class="whitespace-nowrap text-xs">{{ d.effective_from }}</td>
              <td class="whitespace-nowrap text-xs text-ink-muted">{{ dateTime(d.updated_at) }}</td>
              <td class="whitespace-nowrap text-right">
                <template v-if="editing === d.slug">
                  <button type="button" class="btn-primary btn-sm" :disabled="saving" @click="save(d.slug)">저장</button>
                  <button type="button" class="btn-ghost btn-sm" @click="editing = null">취소</button>
                </template>
                <button v-else type="button" class="btn-ghost btn-sm" @click="startEdit(d)">수정</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-if="formError" class="mt-2 text-sm text-danger" role="alert">{{ formError }}</p>
      <p class="mt-2 text-2xs text-ink-subtle">버전을 올리면 본문 페이지 하단의 표시와 일치시켜야 해요.</p>
    </StatePanel>
  </div>
</template>
