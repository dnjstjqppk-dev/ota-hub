<script setup lang="ts">
/**
 * CR-01 review moderation (GET /admin/reviews, POST /admin/reviews/:id/blind|restore).
 * Blinding hides the review from the product page and recomputes the product score.
 */
import { onMounted, ref, watch } from 'vue'
import { api, toast } from '../composables/session'
import { useResource } from '../composables/useResource'
import { dateTime, domainLabel } from '../composables/format'
import { apiUrl } from '../config/api'
import PageHeader from '../components/PageHeader.vue'
import StatePanel from '../components/StatePanel.vue'
import StatusBadge from '../components/StatusBadge.vue'
import PageNav from '../components/PageNav.vue'

const FILTERS = [{ k: 'all', l: '전체' }, { k: 'low', l: '낮은 평점(≤2)' }, { k: 'visible', l: '노출 중' }, { k: 'blinded', l: '블라인드' }]
const filter = ref('low')
const q = ref('')
const page = ref(1)
const total = ref(0)
const totalPages = ref(1)
const list = useResource(async () => {
  const p = new URLSearchParams({ filter: filter.value, page: String(page.value) })
  if (q.value.trim()) p.set('q', q.value.trim())
  const j = await api(`/admin/reviews?${p}`)
  total.value = j.total || 0
  totalPages.value = j.totalPages || 1
  return j.reviews || []
}, [] as any[])
watch(filter, () => { page.value = 1; list.reload() })
onMounted(list.reload)
const go = (p: number) => { page.value = p; list.reload() }
const stars = (n: number) => '★'.repeat(Math.round(n)) + '☆'.repeat(5 - Math.round(n))
const img = (u: string) => (u.startsWith('/api/v1/') ? apiUrl(u.slice('/api/v1'.length)) : u)

const blindFor = ref<string | null>(null)
const reason = ref('')
const busy = ref('')
async function blind(r: any) {
  if (!reason.value.trim()) { toast('블라인드 사유를 입력해주세요.', 'danger'); return }
  busy.value = r.id
  try {
    await api(`/admin/reviews/${encodeURIComponent(r.id)}/blind`, { method: 'POST', json: { reason: reason.value.trim() } })
    toast('블라인드했어요. 상품 평점도 다시 계산됐어요.')
    blindFor.value = null
    reason.value = ''
    list.reload()
  } catch (e) { toast((e as Error).message, 'danger') } finally { busy.value = '' }
}
async function restore(r: any) {
  busy.value = r.id
  try {
    await api(`/admin/reviews/${encodeURIComponent(r.id)}/restore`, { method: 'POST', json: {} })
    toast('다시 노출했어요.')
    list.reload()
  } catch (e) { toast((e as Error).message, 'danger') } finally { busy.value = '' }
}
</script>

<template>
  <div>
    <PageHeader title="리뷰 검수" description="인증 후기를 검토해요. 욕설·개인정보·허위 내용은 사유를 남기고 블라인드하세요. 블라인드하면 평점 계산에서도 빠져요." />
    <div class="mb-4 flex flex-wrap items-center gap-2">
      <div class="flex max-w-full gap-1.5 overflow-x-auto pb-1" role="group" aria-label="리뷰 필터">
        <button v-for="f in FILTERS" :key="f.k" type="button" class="chip" :aria-pressed="filter === f.k" @click="filter = f.k">{{ f.l }}</button>
      </div>
      <form class="flex w-full min-w-0 gap-2 sm:w-auto sm:flex-1 sm:max-w-sm" @submit.prevent="page = 1; list.reload()">
        <label for="rv-q" class="sr-only">검색</label>
        <input id="rv-q" v-model="q" class="input min-w-0 flex-1" placeholder="상품 ID · 리뷰 ID · 예약번호" />
        <button type="submit" class="btn-secondary btn-sm shrink-0">검색</button>
      </form>
    </div>
    <StatePanel :state="list.state.value" :error="list.error.value" :empty="!list.data.value.length" empty-text="조건에 맞는 리뷰가 없어요." @retry="list.reload()">
      <ul class="space-y-3">
        <li v-for="r in list.data.value" :key="r.id" :class="['card space-y-2 p-4', r.is_blinded && 'opacity-75']">
          <div class="flex flex-wrap items-center gap-2 text-2xs text-ink-subtle">
            <StatusBadge v-if="r.is_blinded" tone="danger" label="블라인드" />
            <StatusBadge v-else tone="success" label="노출 중" />
            <span class="text-warning">{{ stars(r.rating) }}</span>
            <span class="font-semibold text-ink">{{ r.user_name }}</span>
            <span>{{ domainLabel(r.domain_type) }} · <span class="font-mono">{{ r.target_id }}</span></span>
            <span v-if="r.booking_number" class="font-mono">· {{ r.booking_number }}</span>
            <span>· {{ dateTime(r.created_at) }}</span>
          </div>
          <p v-if="r.title" class="text-xs font-semibold text-ink-muted">{{ r.title }}</p>
          <p class="whitespace-pre-line break-words text-sm text-ink">{{ r.comment }}</p>
          <div v-if="r.photos?.length" class="flex gap-2 overflow-x-auto">
            <a v-for="p in r.photos" :key="p" :href="img(p)" target="_blank" rel="noopener"><img :src="img(p)" alt="후기 사진" class="h-16 w-16 rounded-field object-cover" loading="lazy" /></a>
          </div>
          <p v-if="r.partner_reply" class="rounded-field bg-primary-soft px-3 py-2 text-xs"><b>판매자 답글</b> {{ r.partner_reply }}</p>
          <p v-if="r.is_blinded && r.blinded_reason" class="text-xs text-danger">블라인드 사유: {{ r.blinded_reason }}</p>
          <div v-if="blindFor === r.id" class="flex flex-col gap-2 sm:flex-row">
            <label :for="`br-${r.id}`" class="sr-only">블라인드 사유</label>
            <input :id="`br-${r.id}`" v-model="reason" class="input flex-1" maxlength="300" placeholder="사유 (감사 로그에 기록돼요)" />
            <div class="flex gap-2">
              <button type="button" class="btn-ghost btn-sm" @click="blindFor = null">취소</button>
              <button type="button" class="btn-danger btn-sm" :disabled="busy === r.id" @click="blind(r)">블라인드</button>
            </div>
          </div>
          <div v-else class="flex gap-2">
            <button v-if="!r.is_blinded" type="button" class="btn-ghost btn-sm text-danger" @click="blindFor = r.id; reason = ''">블라인드</button>
            <button v-else type="button" class="btn-secondary btn-sm" :disabled="busy === r.id" @click="restore(r)">다시 노출</button>
          </div>
        </li>
      </ul>
      <PageNav :page="page" :total-pages="totalPages" :total="total" @go="go" />
    </StatePanel>
  </div>
</template>
