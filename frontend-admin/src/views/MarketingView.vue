<script setup lang="ts">
/**
 * CR-05 marketing CMS: home hero banners, strip banners, popups and curated
 * product picks. Live = active AND inside its window. Order is drag-free:
 * up/down buttons persist through POST /admin/marketing/slots/reorder.
 */
import { computed, onMounted, reactive, ref } from 'vue'
import { api, toast } from '../composables/session'
import { useResource } from '../composables/useResource'
import { dateTime, domainLabel } from '../composables/format'
import { adminMemoryToken, apiUrl } from '../config/api'
import PageHeader from '../components/PageHeader.vue'
import StatePanel from '../components/StatePanel.vue'
import StatusBadge from '../components/StatusBadge.vue'
import SidePanel from '../components/SidePanel.vue'

const PLACEMENT: Record<string, { label: string; hint: string }> = {
  HERO: { label: '메인 배너', hint: '홈 상단 캐러셀 · 이미지 필수 (권장 1600×500)' },
  STRIP: { label: '띠 배너', hint: '검색 아래 2열 안내 배너' },
  POPUP: { label: '팝업', hint: '홈 진입 시 1개 · 오늘 하루 보지 않기 지원' },
  HOME_PICK: { label: '에디터 추천', hint: '실제 상품 연결 · 판매 중지되면 자동으로 빠져요' }
}
const PICK_DOMAINS = ['HOTEL', 'ACTIVITY', 'CAR', 'TRANSFER', 'PACKAGE']

const list = useResource(async () => (await api('/admin/marketing/slots')).slots || [], [] as any[])
onMounted(list.reload)
const tab = ref<'HERO' | 'STRIP' | 'POPUP' | 'HOME_PICK'>('HERO')
const rows = computed(() => list.data.value.filter((s: any) => s.placement === tab.value))
const nowIso = () => new Date().toISOString()
function liveState(s: any): { tone: 'success' | 'warning' | 'neutral'; label: string } {
  if (!s.is_active) return { tone: 'neutral', label: '비활성' }
  if (s.starts_at && s.starts_at > nowIso()) return { tone: 'warning', label: '예약됨' }
  if (s.ends_at && s.ends_at <= nowIso()) return { tone: 'neutral', label: '종료' }
  return { tone: 'success', label: '노출 중' }
}
const img = (u: string | null) => (!u ? '' : u.startsWith('/api/v1/') ? apiUrl(u.slice('/api/v1'.length)) : u)

// ---------------- editor ----------------
const open = ref(false)
const editingId = ref<string | null>(null)
const form = reactive({ placement: 'HERO', title: '', subtitle: '', imageUrl: '', linkUrl: '', domainType: 'HOTEL', itemId: '', sortOrder: 100, startsAt: '', endsAt: '', isActive: true })
const errors = reactive<Record<string, string>>({})
const saving = ref(false)
const uploading = ref(false)

const toLocal = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '')
function startCreate() {
  editingId.value = null
  Object.assign(form, { placement: tab.value, title: '', subtitle: '', imageUrl: '', linkUrl: '', domainType: 'HOTEL', itemId: '', sortOrder: (rows.value.length + 1) * 10, startsAt: '', endsAt: '', isActive: true })
  Object.keys(errors).forEach((k) => delete errors[k])
  open.value = true
}
function startEdit(s: any) {
  editingId.value = s.id
  Object.assign(form, { placement: s.placement, title: s.title, subtitle: s.subtitle || '', imageUrl: s.image_url || '', linkUrl: s.link_url || '', domainType: s.domain_type || 'HOTEL', itemId: s.item_id || '', sortOrder: s.sort_order, startsAt: toLocal(s.starts_at), endsAt: toLocal(s.ends_at), isActive: !!s.is_active })
  Object.keys(errors).forEach((k) => delete errors[k])
  open.value = true
}
function validate(): boolean {
  Object.keys(errors).forEach((k) => delete errors[k])
  if (!form.title.trim()) errors.title = '제목을 입력해주세요.'
  if (form.placement === 'HERO' && !form.imageUrl) errors.imageUrl = '메인 배너는 이미지가 필요해요.'
  if (form.placement === 'HOME_PICK' && !form.itemId.trim()) errors.itemId = '연결할 상품 ID를 입력해주세요.'
  if (form.linkUrl && !/^\/(?!\/)/.test(form.linkUrl) && !/^https:\/\//.test(form.linkUrl)) errors.linkUrl = '/로 시작하는 내부 경로 또는 https 주소만 쓸 수 있어요.'
  if (form.startsAt && form.endsAt && form.startsAt >= form.endsAt) errors.endsAt = '종료는 시작보다 뒤여야 해요.'
  return !Object.keys(errors).length
}
async function save() {
  if (!validate()) return
  saving.value = true
  const json: Record<string, unknown> = {
    placement: form.placement, title: form.title.trim(), subtitle: form.subtitle.trim(), imageUrl: form.imageUrl, linkUrl: form.placement === 'HOME_PICK' ? '' : form.linkUrl.trim(),
    sortOrder: Number(form.sortOrder) || 0, isActive: form.isActive,
    startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : '', endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : '',
    domainType: form.placement === 'HOME_PICK' ? form.domainType : '', itemId: form.placement === 'HOME_PICK' ? form.itemId.trim() : ''
  }
  try {
    if (editingId.value) await api(`/admin/marketing/slots/${encodeURIComponent(editingId.value)}`, { method: 'PATCH', json })
    else await api('/admin/marketing/slots', { method: 'POST', json })
    toast(editingId.value ? '저장했어요.' : '등록했어요. 노출 기간 안이면 1분 안에 홈에 반영돼요.')
    open.value = false
    tab.value = form.placement as any
    list.reload()
  } catch (e) { toast((e as Error).message, 'danger') } finally { saving.value = false }
}
async function upload(e: Event) {
  const input = e.target as HTMLInputElement
  const f = input.files?.[0]
  input.value = ''
  if (!f) return
  if (!/^image\/(jpeg|png|webp)$/.test(f.type)) { errors.imageUrl = 'JPG·PNG·WEBP만 올릴 수 있어요.'; return }
  uploading.value = true
  const fd = new FormData()
  fd.append('file', f)
  fd.append('purpose', 'PRODUCT_IMAGE')
  try {
    const t = adminMemoryToken()
    const res = await fetch(apiUrl('/uploads'), { method: 'POST', body: fd, credentials: 'include', headers: t ? { Authorization: `Bearer ${t}` } : {} })
    const j = await res.json().catch(() => ({}))
    if (!res.ok || !j.url) throw new Error(j.error || '이미지를 올리지 못했어요.')
    form.imageUrl = j.url
    delete errors.imageUrl
  } catch (err) { errors.imageUrl = (err as Error).message } finally { uploading.value = false }
}

async function toggleActive(s: any) {
  try {
    await api(`/admin/marketing/slots/${encodeURIComponent(s.id)}`, { method: 'PATCH', json: { isActive: !s.is_active } })
    toast(s.is_active ? '노출을 껐어요.' : '노출을 켰어요.')
    list.reload()
  } catch (e) { toast((e as Error).message, 'danger') }
}
async function remove(s: any) {
  if (!confirm(`"${s.title}"을(를) 삭제할까요? 되돌릴 수 없어요.`)) return
  try {
    await api(`/admin/marketing/slots/${encodeURIComponent(s.id)}`, { method: 'DELETE' })
    toast('삭제했어요.')
    list.reload()
  } catch (e) { toast((e as Error).message, 'danger') }
}
async function move(i: number, d: -1 | 1) {
  const ids = rows.value.map((s: any) => s.id)
  const j = i + d
  if (j < 0 || j >= ids.length) return
  ;[ids[i], ids[j]] = [ids[j], ids[i]]
  try {
    await api('/admin/marketing/slots/reorder', { method: 'POST', json: { ids } })
    list.reload()
  } catch (e) { toast((e as Error).message, 'danger') }
}
</script>

<template>
  <div>
    <PageHeader title="배너·기획전" description="홈 화면의 배너, 팝업, 에디터 추천 상품을 관리해요. 노출 기간과 순서를 정할 수 있어요.">
      <button type="button" class="btn-primary btn-sm" @click="startCreate">+ {{ PLACEMENT[tab].label }} 추가</button>
    </PageHeader>
    <div class="mb-2 flex gap-1.5 overflow-x-auto pb-1" role="tablist">
      <button v-for="(p, k) in PLACEMENT" :key="k" type="button" role="tab" class="chip" :aria-pressed="tab === k" :aria-selected="tab === k" @click="tab = k as any">{{ p.label }} <span class="tabular">{{ list.data.value.filter((s: any) => s.placement === k).length }}</span></button>
    </div>
    <p class="mb-4 text-xs text-ink-subtle">{{ PLACEMENT[tab].hint }}</p>

    <StatePanel :state="list.state.value" :error="list.error.value" :empty="!rows.length" :empty-text="`등록된 ${PLACEMENT[tab].label}이(가) 없어요.`" @retry="list.reload()">
      <ul class="space-y-2">
        <li v-for="(s, i) in rows" :key="s.id" class="card flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
          <div class="flex items-center gap-3 sm:flex-1">
            <div class="flex flex-col">
              <button type="button" class="btn-ghost btn-sm !min-h-[28px] !px-2" :disabled="i === 0" aria-label="위로" @click="move(i, -1)">▲</button>
              <button type="button" class="btn-ghost btn-sm !min-h-[28px] !px-2" :disabled="i === rows.length - 1" aria-label="아래로" @click="move(i, 1)">▼</button>
            </div>
            <img v-if="s.image_url" :src="img(s.image_url)" alt="" class="h-14 w-24 shrink-0 rounded-field object-cover" loading="lazy" />
            <div v-else class="grid h-14 w-24 shrink-0 place-items-center rounded-field bg-surface-sunken text-2xs text-ink-subtle">이미지 없음</div>
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-1.5"><StatusBadge :tone="liveState(s).tone" :label="liveState(s).label" /><span class="truncate font-bold text-ink">{{ s.title }}</span></div>
              <p class="truncate text-xs text-ink-muted">{{ s.placement === 'HOME_PICK' ? `${domainLabel(s.domain_type)} · ${s.item_id}` : s.link_url || '링크 없음' }}</p>
              <p class="text-2xs tabular text-ink-subtle">{{ s.starts_at ? dateTime(s.starts_at) : '즉시' }} ~ {{ s.ends_at ? dateTime(s.ends_at) : '종료일 없음' }}</p>
            </div>
          </div>
          <div class="flex flex-wrap gap-2 sm:justify-end">
            <button type="button" class="btn-secondary btn-sm" @click="toggleActive(s)">{{ s.is_active ? '노출 끄기' : '노출 켜기' }}</button>
            <button type="button" class="btn-secondary btn-sm" @click="startEdit(s)">편집</button>
            <button type="button" class="btn-ghost btn-sm text-danger" @click="remove(s)">삭제</button>
          </div>
        </li>
      </ul>
    </StatePanel>

    <SidePanel :open="open" :title="editingId ? '배너 편집' : '배너 추가'" :subtitle="PLACEMENT[form.placement]?.label" @close="open = false">
      <form class="space-y-4" novalidate @submit.prevent="save">
        <div>
          <label for="mk-pl" class="label">노출 위치</label>
          <select id="mk-pl" v-model="form.placement" class="input" :disabled="!!editingId">
            <option v-for="(p, k) in PLACEMENT" :key="k" :value="k">{{ p.label }}</option>
          </select>
        </div>
        <div>
          <label for="mk-t" class="label">제목 *</label>
          <input id="mk-t" v-model="form.title" class="input" maxlength="120" :aria-invalid="!!errors.title" />
          <p v-if="errors.title" class="mt-1 text-xs text-danger">{{ errors.title }}</p>
        </div>
        <div>
          <label for="mk-s" class="label">부제</label>
          <input id="mk-s" v-model="form.subtitle" class="input" maxlength="200" />
        </div>
        <div>
          <span class="label">이미지{{ form.placement === 'HERO' ? ' *' : '' }}</span>
          <div class="flex items-center gap-3">
            <img v-if="form.imageUrl" :src="img(form.imageUrl)" alt="미리보기" class="h-16 w-28 rounded-field object-cover" />
            <label class="btn-secondary btn-sm cursor-pointer" :class="uploading && 'pointer-events-none opacity-50'">{{ uploading ? '올리는 중…' : form.imageUrl ? '이미지 변경' : '이미지 올리기' }}<input type="file" accept="image/jpeg,image/png,image/webp" class="sr-only" @change="upload" /></label>
            <button v-if="form.imageUrl" type="button" class="btn-ghost btn-sm" @click="form.imageUrl = ''">제거</button>
          </div>
          <p v-if="errors.imageUrl" class="mt-1 text-xs text-danger">{{ errors.imageUrl }}</p>
        </div>
        <div v-if="form.placement === 'HOME_PICK'" class="grid grid-cols-[120px_1fr] gap-2">
          <div><label for="mk-d" class="label">상품 유형</label><select id="mk-d" v-model="form.domainType" class="input"><option v-for="d in PICK_DOMAINS" :key="d" :value="d">{{ domainLabel(d) }}</option></select></div>
          <div>
            <label for="mk-i" class="label">상품 ID *</label>
            <input id="mk-i" v-model="form.itemId" class="input font-mono" placeholder="예: htl_seoul_01" :aria-invalid="!!errors.itemId" />
            <p v-if="errors.itemId" class="mt-1 text-xs text-danger">{{ errors.itemId }}</p>
          </div>
        </div>
        <div v-else>
          <label for="mk-l" class="label">링크</label>
          <input id="mk-l" v-model="form.linkUrl" class="input" placeholder="/deals 또는 https://…" :aria-invalid="!!errors.linkUrl" />
          <p v-if="errors.linkUrl" class="mt-1 text-xs text-danger">{{ errors.linkUrl }}</p>
        </div>
        <div class="grid gap-2 sm:grid-cols-2">
          <div><label for="mk-sa" class="label">노출 시작</label><input id="mk-sa" v-model="form.startsAt" type="datetime-local" class="input" /></div>
          <div>
            <label for="mk-ea" class="label">노출 종료</label><input id="mk-ea" v-model="form.endsAt" type="datetime-local" class="input" :aria-invalid="!!errors.endsAt" />
            <p v-if="errors.endsAt" class="mt-1 text-xs text-danger">{{ errors.endsAt }}</p>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-2">
          <div><label for="mk-o" class="label">정렬 값 (작을수록 앞)</label><input id="mk-o" v-model.number="form.sortOrder" type="number" min="0" max="10000" class="input" /></div>
          <label class="flex items-end gap-2 pb-2 text-sm"><input v-model="form.isActive" type="checkbox" class="h-4 w-4 accent-primary" />노출 켜기</label>
        </div>
        <div class="flex justify-end gap-2 border-t border-line pt-4">
          <button type="button" class="btn-ghost" @click="open = false">취소</button>
          <button type="submit" class="btn-primary" :disabled="saving || uploading">{{ saving ? '저장 중…' : '저장' }}</button>
        </div>
      </form>
    </SidePanel>
  </div>
</template>
