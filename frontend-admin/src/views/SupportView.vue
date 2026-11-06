<script setup lang="ts">
/**
 * Site notices (GET/POST /admin/notices, PATCH /admin/notices/:id). A notice with the banner on is shown
 * on the user site (GET /notices); "긴급" puts it first.
 */
import { onMounted, reactive, ref } from 'vue'
import { api, toast } from '../composables/session'
import { useResource } from '../composables/useResource'
import { dateTime } from '../composables/format'
import PageHeader from '../components/PageHeader.vue'
import StatePanel from '../components/StatePanel.vue'
import StatusBadge from '../components/StatusBadge.vue'

const list = useResource(async () => (await api('/admin/notices')).notices || [], [] as any[])
onMounted(list.reload)

const form = reactive({ title: '', content: '', isEmergency: false, bannerActive: true })
const saving = ref(false)
async function create() {
  if (!form.title.trim() || !form.content.trim()) { toast('제목과 내용을 입력해 주세요.', 'danger'); return }
  saving.value = true
  try {
    const shown = form.bannerActive
    await api('/admin/notices', { method: 'POST', json: { title: form.title.trim(), content: form.content.trim(), isEmergency: form.isEmergency, bannerActive: shown } })
    Object.assign(form, { title: '', content: '', isEmergency: false, bannerActive: true })
    toast(shown ? '공지를 등록했어요. 사용자 사이트에 바로 보여요.' : '공지를 등록했어요.')
    list.reload()
  } catch (e) { toast((e as Error).message, 'danger') } finally { saving.value = false }
}
const busy = ref('')
async function patch(n: any, change: { bannerActive?: boolean; isEmergency?: boolean }) {
  busy.value = n.id
  try {
    await api(`/admin/notices/${encodeURIComponent(n.id)}`, { method: 'PATCH', json: change })
    list.reload()
  } catch (e) { toast((e as Error).message, 'danger') } finally { busy.value = '' }
}
</script>

<template>
  <div>
    <PageHeader title="공지사항" description="사용자 사이트 상단에 보일 공지를 등록하고 노출을 관리해요." />
    <div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <StatePanel :state="list.state.value" :error="list.error.value" :empty="!list.data.value.length" empty-text="등록된 공지가 없어요." @retry="list.reload()">
        <ul class="space-y-3">
          <li v-for="n in list.data.value" :key="n.id" class="card p-4">
            <div class="flex flex-wrap items-center gap-2">
              <StatusBadge v-if="n.is_emergency" tone="danger" label="긴급" />
              <StatusBadge :tone="n.banner_active ? 'success' : 'neutral'" :label="n.banner_active ? '노출 중' : '숨김'" />
              <span class="text-2xs text-ink-subtle tabular">{{ dateTime(n.created_at) }}</span>
            </div>
            <h3 class="mt-2 font-bold text-ink">{{ n.title }}</h3>
            <p class="mt-1 whitespace-pre-line text-sm text-ink-muted">{{ n.content }}</p>
            <div class="mt-3 flex gap-2">
              <button type="button" class="btn-secondary btn-sm" :disabled="busy === n.id" @click="patch(n, { bannerActive: !n.banner_active })">{{ n.banner_active ? '숨기기' : '노출하기' }}</button>
              <button type="button" class="btn-ghost btn-sm" :disabled="busy === n.id" @click="patch(n, { isEmergency: !n.is_emergency })">{{ n.is_emergency ? '긴급 해제' : '긴급 지정' }}</button>
            </div>
          </li>
        </ul>
      </StatePanel>

      <form class="card h-fit space-y-3 p-5 lg:sticky lg:top-20" @submit.prevent="create">
        <h2 class="font-bold text-ink">새 공지</h2>
        <div><label for="nt-title" class="label">제목</label><input id="nt-title" v-model="form.title" class="input" maxlength="200" /></div>
        <div><label for="nt-content" class="label">내용</label><textarea id="nt-content" v-model="form.content" class="input min-h-[140px] py-2" maxlength="4000" /></div>
        <label class="flex items-center gap-2 text-sm"><input v-model="form.bannerActive" type="checkbox" class="h-4 w-4 accent-[rgb(var(--gft-primary))]" />사용자 사이트에 바로 노출</label>
        <label class="flex items-center gap-2 text-sm"><input v-model="form.isEmergency" type="checkbox" class="h-4 w-4 accent-[rgb(var(--gft-primary))]" />긴급 공지 (맨 위에 표시)</label>
        <button type="submit" class="btn-primary w-full" :disabled="saving">{{ saving ? '등록 중…' : '공지 등록' }}</button>
      </form>
    </div>
  </div>
</template>
