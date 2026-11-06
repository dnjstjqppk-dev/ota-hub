<script setup lang="ts">
/**
 * Community moderation (GET /admin/moments ?filter, POST /admin/moments/:id/approve|blind|restore).
 * Blinded posts disappear from the public feed; "추천" pins a post to the top of it.
 */
import { onMounted, ref, watch } from 'vue'
import { api, toast } from '../composables/session'
import { useResource } from '../composables/useResource'
import { dateTime, num } from '../composables/format'
import PageHeader from '../components/PageHeader.vue'
import StatePanel from '../components/StatePanel.vue'
import StatusBadge from '../components/StatusBadge.vue'

const filter = ref('')
const list = useResource(async () => (await api(`/admin/moments${filter.value ? `?filter=${filter.value}` : ''}`)).moments || [], [] as any[])
watch(filter, () => list.reload())
onMounted(list.reload)

const photos = (m: any): string[] => { try { return JSON.parse(m.photos_json || '[]') } catch { return [] } }
const FILTERS = [{ k: '', l: '전체' }, { k: 'visible', l: '노출 중' }, { k: 'featured', l: '추천' }, { k: 'blinded', l: '블라인드' }]

const busy = ref('')
async function act(m: any, action: 'approve' | 'blind' | 'restore') {
  if (action === 'blind' && !confirm('이 게시물을 블라인드할까요? 사용자 사이트에서 사라져요.')) return
  busy.value = m.id
  try {
    await api(`/admin/moments/${encodeURIComponent(m.id)}/${action}`, { method: 'POST' })
    toast({ approve: '추천 게시물로 지정했어요.', blind: '블라인드했어요.', restore: '다시 노출했어요.' }[action])
    list.reload()
  } catch (e) { toast((e as Error).message, 'danger') } finally { busy.value = '' }
}
</script>

<template>
  <div>
    <PageHeader title="커뮤니티" description="여행자가 올린 게시물을 검토해요. 블라인드하면 사용자 사이트에서 사라지고, 추천하면 맨 위에 보여요." />
    <div class="mb-4 flex gap-1.5" role="group" aria-label="게시물 필터">
      <button v-for="f in FILTERS" :key="f.k" type="button" class="chip" :aria-pressed="filter === f.k" @click="filter = f.k">{{ f.l }}</button>
    </div>
    <StatePanel :state="list.state.value" :error="list.error.value" :empty="!list.data.value.length" empty-text="게시물이 없어요." @retry="list.reload()">
      <ul class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <li v-for="m in list.data.value" :key="m.id" :class="['card flex flex-col overflow-hidden', m.is_blinded ? 'opacity-70' : '']">
          <img v-if="photos(m)[0]" :src="photos(m)[0]" alt="" class="aspect-[16/9] w-full object-cover" loading="lazy" referrerpolicy="no-referrer" />
          <div class="flex flex-1 flex-col p-4">
            <div class="flex flex-wrap items-center gap-1.5">
              <StatusBadge v-if="m.is_blinded" tone="danger" label="블라인드" />
              <StatusBadge v-else-if="m.is_featured" tone="info" label="추천" />
              <StatusBadge v-else tone="success" label="노출 중" />
              <span class="text-2xs text-ink-subtle">{{ m.city || '도시 미지정' }} · {{ dateTime(m.created_at) }}</span>
            </div>
            <h3 class="mt-2 font-bold text-ink">{{ m.title }}</h3>
            <p class="mt-1 line-clamp-3 text-sm text-ink-muted">{{ m.content }}</p>
            <p class="mt-2 text-2xs text-ink-subtle">{{ m.user_name || '익명' }} · 좋아요 {{ num(m.likes_count) }}</p>
            <div class="mt-auto flex gap-2 pt-3">
              <button v-if="!m.is_featured && !m.is_blinded" type="button" class="btn-secondary btn-sm" :disabled="busy === m.id" @click="act(m, 'approve')">추천</button>
              <button v-if="!m.is_blinded" type="button" class="btn-ghost btn-sm text-danger" :disabled="busy === m.id" @click="act(m, 'blind')">블라인드</button>
              <button v-else type="button" class="btn-secondary btn-sm" :disabled="busy === m.id" @click="act(m, 'restore')">다시 노출</button>
            </div>
          </div>
        </li>
      </ul>
    </StatePanel>
  </div>
</template>
