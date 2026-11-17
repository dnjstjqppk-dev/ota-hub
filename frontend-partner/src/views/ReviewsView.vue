<script setup lang="ts">
/**
 * CR-01 partner review inbox. Reviews arrive only from customers who completed
 * a booking with this partner. Replies are public on the product page;
 * blinded reviews (operator moderation) cannot be answered.
 */
import { onMounted, ref, watch } from 'vue'
import { partnerInfo } from '../config/api'
import { dt, pfetch } from '../config/http'
import { assetUrl } from '../config/asset'

const FILTERS = [
  { id: 'unanswered', label: '미답변' },
  { id: 'answered', label: '답변 완료' },
  { id: 'all', label: '전체' }
] as const
const filter = ref<(typeof FILTERS)[number]['id']>('unanswered')
const page = ref(1)
const reviews = ref<any[]>([])
const stats = ref<{ total: number; average: number | null; unanswered: number } | null>(null)
const totalPages = ref(1)
const loading = ref(true)
const error = ref('')
const editing = ref<string | null>(null)
const draft = ref('')
const saving = ref(false)
const rowError = ref('')
const notice = ref('')

// The owner logs in without a staff row; staff carry staffRole (server enforces the same rule).
const role = String(partnerInfo()?.staffRole || 'OWNER').toUpperCase()
const canReply = role === 'OWNER' || role === 'MANAGER'
const stars = (n: number) => '★'.repeat(Math.round(n)) + '☆'.repeat(5 - Math.round(n))

async function load() {
  loading.value = true
  error.value = ''
  const r = await pfetch(`/partner/reviews?filter=${filter.value}&page=${page.value}&pageSize=20`)
  loading.value = false
  if (!r.ok) { error.value = r.data.error || '리뷰를 불러오지 못했습니다.'; return }
  reviews.value = r.data.reviews || []
  stats.value = r.data.stats
  totalPages.value = r.data.totalPages || 1
}
watch(filter, () => { page.value = 1; load() })
watch(page, load)

function edit(r: any) {
  editing.value = r.id
  draft.value = r.partner_reply || ''
  rowError.value = ''
}
async function save(r: any) {
  const text = draft.value.trim()
  if (!text) { rowError.value = '답글 내용을 입력해주세요.'; return }
  saving.value = true
  const res = await pfetch(`/partner/reviews/${r.id}/reply`, { method: 'PUT', body: { reply: text } })
  saving.value = false
  if (!res.ok) { rowError.value = res.data.error || '답글을 저장하지 못했습니다.'; return }
  editing.value = null
  notice.value = '답글을 등록했어요. 상품 페이지에 바로 표시됩니다.'
  await load()
}
async function remove(r: any) {
  if (!confirm('답글을 삭제할까요?')) return
  const res = await pfetch(`/partner/reviews/${r.id}/reply`, { method: 'DELETE' })
  if (!res.ok) { notice.value = res.data.error || '삭제하지 못했습니다.'; return }
  notice.value = '답글을 삭제했어요.'
  await load()
}
onMounted(load)
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-xl font-black tracking-tight text-ink">리뷰 관리</h1>
      <p class="mt-1 text-sm text-ink-subtle">이용을 마친 고객의 인증 후기예요. 답글은 상품 페이지에 공개됩니다.</p>
    </div>

    <div v-if="stats" class="grid grid-cols-3 gap-3">
      <div class="card p-4"><p class="label">전체 후기</p><p class="text-2xl font-black tabular text-ink">{{ stats.total }}</p></div>
      <div class="card p-4"><p class="label">평균 평점</p><p class="text-2xl font-black tabular text-ink">{{ stats.average ?? '-' }}<span class="text-sm text-ink-subtle">/5</span></p></div>
      <div class="card p-4"><p class="label">미답변</p><p class="text-2xl font-black tabular" :class="stats.unanswered ? 'text-danger' : 'text-ink'">{{ stats.unanswered }}</p></div>
    </div>

    <div class="flex flex-wrap gap-2" role="tablist">
      <button v-for="f in FILTERS" :key="f.id" type="button" role="tab" :aria-selected="filter === f.id" class="btn-sm btn" :class="filter === f.id ? 'bg-primary text-primary-ink' : 'border border-line bg-surface text-ink-muted'" @click="filter = f.id">{{ f.label }}</button>
    </div>

    <p v-if="notice" class="rounded-xl bg-success-soft px-4 py-2.5 text-sm font-semibold text-success" role="status">{{ notice }}</p>
    <p v-if="!canReply" class="rounded-xl bg-surface-sunken px-4 py-2.5 text-xs text-ink-muted">답글 작성은 대표·매니저 계정만 할 수 있어요.</p>

    <div v-if="loading" class="space-y-3"><div v-for="i in 3" :key="i" class="card h-28 animate-pulse" /></div>
    <div v-else-if="error" class="rounded-2xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm font-semibold text-danger">{{ error }} <button type="button" class="ml-2 underline" @click="load">다시 시도</button></div>
    <div v-else-if="!reviews.length" class="card p-10 text-center">
      <p class="text-sm font-bold text-ink">{{ filter === 'unanswered' ? '답변할 후기가 없어요.' : '아직 후기가 없어요.' }}</p>
      <p class="mt-1 text-xs text-ink-subtle">고객이 이용을 마치고 후기를 남기면 여기에 표시돼요.</p>
    </div>
    <ul v-else class="space-y-3">
      <li v-for="r in reviews" :key="r.id" class="card space-y-3 p-5" :class="r.is_blinded && 'opacity-70'">
        <div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-subtle">
          <span class="text-warning">{{ stars(r.rating) }}</span>
          <span class="font-bold text-ink">{{ r.userName }}</span>
          <span>{{ dt(r.created_at) }}</span>
          <span v-if="r.booking_number" class="font-mono">· {{ r.booking_number }}</span>
          <span v-if="r.is_blinded" class="rounded bg-danger-soft px-1.5 py-0.5 font-bold text-danger">운영 정책에 따라 블라인드됨</span>
        </div>
        <p v-if="r.title" class="text-xs font-semibold text-ink-muted">{{ r.title }}</p>
        <p class="whitespace-pre-line break-words text-sm text-ink">{{ r.comment }}</p>
        <div v-if="r.photos?.length" class="flex gap-2 overflow-x-auto">
          <a v-for="p in r.photos" :key="p" :href="assetUrl(p)" target="_blank" rel="noopener" class="shrink-0"><img :src="assetUrl(p)" alt="후기 사진" class="h-16 w-16 rounded-lg object-cover" loading="lazy" /></a>
        </div>

        <div v-if="editing === r.id" class="space-y-2">
          <label :for="`rp-${r.id}`" class="sr-only">답글</label>
          <textarea :id="`rp-${r.id}`" v-model="draft" rows="3" maxlength="1000" class="input w-full py-2" placeholder="고객에게 감사 인사나 개선 계획을 남겨주세요." />
          <p v-if="rowError" class="text-xs font-semibold text-danger">{{ rowError }}</p>
          <div class="flex justify-end gap-2">
            <button type="button" class="btn-secondary" @click="editing = null">취소</button>
            <button type="button" class="btn-primary" :disabled="saving" @click="save(r)">{{ saving ? '저장 중…' : '답글 등록' }}</button>
          </div>
        </div>
        <div v-else-if="r.partner_reply" class="rounded-xl border-l-2 border-primary bg-primary-soft/50 px-4 py-3">
          <p class="text-xs font-bold text-primary">우리 답글 · {{ dt(r.partner_replied_at) }}</p>
          <p class="mt-1 whitespace-pre-line break-words text-sm text-ink">{{ r.partner_reply }}</p>
          <div v-if="canReply && !r.is_blinded" class="mt-2 flex gap-2">
            <button type="button" class="btn-ghost btn-sm" @click="edit(r)">수정</button>
            <button type="button" class="btn-ghost btn-sm text-danger" @click="remove(r)">삭제</button>
          </div>
        </div>
        <button v-else-if="canReply && !r.is_blinded" type="button" class="btn-secondary btn-sm" @click="edit(r)">답글 쓰기</button>
      </li>
    </ul>

    <div v-if="totalPages > 1" class="flex items-center justify-center gap-2">
      <button type="button" class="btn-secondary btn-sm" :disabled="page <= 1" @click="page--">이전</button>
      <span class="text-xs tabular text-ink-muted">{{ page }} / {{ totalPages }}</span>
      <button type="button" class="btn-secondary btn-sm" :disabled="page >= totalPages" @click="page++">다음</button>
    </div>
  </div>
</template>
