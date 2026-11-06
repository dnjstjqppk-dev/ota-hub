<script setup lang="ts">
/**
 * URL product ingestion. POST /admin/ingest/url reads only what the page states (title, description,
 * images, JSON-LD price/address); every missing fact stays empty. A reviewer completes the draft
 * (PATCH /admin/ingest/:id) and publishes it (POST /admin/ingest/:id/publish), which the server refuses
 * while required fields are missing. Country/city use the places autocomplete.
 */
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { api, toast } from '../composables/session'
import { useResource } from '../composables/useResource'
import { dateTime, domainLabel, krw } from '../composables/format'
import PageHeader from '../components/PageHeader.vue'
import StatePanel from '../components/StatePanel.vue'
import StatusBadge from '../components/StatusBadge.vue'
import SidePanel from '../components/SidePanel.vue'
import PlaceInput from '../components/PlaceInput.vue'

const DOMAINS: Record<string, { label: string; publishable: boolean }> = {
  ACTIVITY: { label: '투어·액티비티', publishable: true },
  TICKET: { label: '입장권·패스', publishable: true },
  HOTEL: { label: '호텔', publishable: true },
  CAR: { label: '렌터카', publishable: false },
  TRANSFER: { label: '공항 이동', publishable: false },
  PACKAGE: { label: '패키지', publishable: false }
}
const STATUS: Record<string, { label: string; tone: any }> = {
  DRAFT: { label: '검토 전', tone: 'warning' }, REVIEWED: { label: '검토 완료', tone: 'info' },
  PUBLISHED: { label: '등록됨', tone: 'success' }, REJECTED: { label: '반려', tone: 'neutral' }
}
const FIELD: Record<string, string> = { title: '상품명', price_minor: '원화 판매가', city: '도시', country: '국가', cancellation_policy: '취소 규정', address: '주소' }

const statusFilter = ref('')
const history = useResource(async () => (await api(`/admin/ingest/history${statusFilter.value ? `?status=${statusFilter.value}` : ''}`)).items || [], [] as any[])
watch(statusFilter, () => history.reload())
onMounted(history.reload)

// ------------------------------------------------------------------ scrape
const url = ref('')
const scraping = ref(false)
async function scrape() {
  const u = url.value.trim()
  if (!/^https?:\/\//i.test(u)) { toast('http:// 또는 https://로 시작하는 주소를 입력해 주세요.', 'danger'); return }
  scraping.value = true
  try {
    const r = await api('/admin/ingest/url', { method: 'POST', json: { url: u } })
    url.value = ''
    if (r.auto_published) toast(`필수 정보가 모두 있어 자동 등록했어요 (${r.publish_result?.published_item_id}).`)
    else toast(r.missing?.length ? `초안을 만들었어요. ${r.missing.length}개 항목을 채워야 등록할 수 있어요.` : '초안을 만들었어요. 검토 후 등록해 주세요.', 'info', 5000)
    await history.reload()
    const fresh = history.data.value.find((x: any) => x.id === r.draft.id)
    open(fresh || r.draft)
  } catch (e) { toast((e as Error).message, 'danger', 6000) } finally { scraping.value = false }
}

// ------------------------------------------------------------------ review
const draft = ref<any | null>(null)
const form = reactive({ domain_type: 'ACTIVITY', title: '', summary: '', description: '', price: '', country: '', countryCode: '', city: '', address: '', cancellation_policy: '' })
const busy = ref(false)
const meta = computed(() => { try { return typeof draft.value?.raw_html_meta === 'string' ? JSON.parse(draft.value.raw_html_meta) : draft.value?.raw_html_meta || {} } catch { return {} } })
function open(d: any) {
  draft.value = d
  Object.assign(form, {
    domain_type: d.domain_type, title: d.title || '', summary: d.summary || '', description: d.description || '',
    price: Number(d.price_minor) > 0 ? String(d.price_minor) : '', country: d.country || '', countryCode: '', city: d.city || '',
    address: d.address || '', cancellation_policy: d.cancellation_policy || ''
  })
}
const locked = computed(() => draft.value?.status === 'PUBLISHED')
const priceNum = computed(() => (form.price.trim() === '' ? 0 : Number(form.price.replace(/,/g, ''))))
const priceError = computed(() => (form.price.trim() && (!Number.isInteger(priceNum.value) || priceNum.value < 0 || priceNum.value > 100_000_000) ? '0–1억 원 사이의 정수로 입력해 주세요.' : ''))
const missing = computed(() => {
  const m: string[] = []
  if (!form.title.trim()) m.push('title')
  if (!(priceNum.value > 0)) m.push('price_minor')
  if (!form.city.trim()) m.push('city')
  if (!form.country.trim()) m.push('country')
  if (!form.cancellation_policy.trim()) m.push('cancellation_policy')
  if (form.domain_type === 'HOTEL' && !form.address.trim()) m.push('address')
  return m
})
const canPublish = computed(() => !locked.value && DOMAINS[form.domain_type]?.publishable && !missing.value.length && !priceError.value)

function body(extra: Record<string, unknown> = {}) {
  return {
    domain_type: form.domain_type, title: form.title.trim(), summary: form.summary.trim(), description: form.description.trim(),
    price_minor: priceNum.value > 0 ? priceNum.value : undefined, country: form.country.trim(), city: form.city.trim(),
    address: form.address.trim(), cancellation_policy: form.cancellation_policy.trim(), ...extra
  }
}
async function save(status?: 'REVIEWED' | 'REJECTED') {
  if (priceError.value) return
  busy.value = true
  try {
    await api(`/admin/ingest/${draft.value.id}`, { method: 'PATCH', json: body(status ? { status } : {}) })
    toast(status === 'REJECTED' ? '수집 상품을 반려했어요.' : '초안을 저장했어요.')
    await history.reload()
    if (status === 'REJECTED') draft.value = null
    else draft.value = history.data.value.find((x: any) => x.id === draft.value.id) || draft.value
  } catch (e) { toast((e as Error).message, 'danger', 6000) } finally { busy.value = false }
}
async function publish() {
  if (!canPublish.value) return
  busy.value = true
  try {
    await api(`/admin/ingest/${draft.value.id}`, { method: 'PATCH', json: body({ status: 'REVIEWED' }) })
    const r = await api(`/admin/ingest/${draft.value.id}/publish`, { method: 'POST' })
    toast(`카탈로그에 등록했어요 (${r.published_item_id}). 예약 가능 여부는 공급사 연동 상태(공급사 연동 메뉴)를 따라요.`, 'success', 6000)
    draft.value = null
    history.reload()
  } catch (e) { toast((e as Error).message, 'danger', 6000) } finally { busy.value = false }
}
</script>

<template>
  <div>
    <PageHeader title="URL 상품 수집" description="상품 페이지 주소에서 이름·설명·사진·가격처럼 페이지에 적힌 정보만 가져와요. 없는 정보는 비워 두고, 필수 항목을 채워야 카탈로그에 등록할 수 있어요." />

    <form class="card mb-6 flex flex-col gap-2 p-4 sm:flex-row" @submit.prevent="scrape">
      <label for="ingest-url" class="sr-only">상품 페이지 주소</label>
      <input id="ingest-url" v-model="url" type="url" inputmode="url" class="input flex-1" placeholder="https://… 상품 페이지 주소" :disabled="scraping" />
      <button type="submit" class="btn-primary" :disabled="scraping || !url.trim()"><AppIcon name="link" :size="16" />{{ scraping ? '가져오는 중…' : '정보 가져오기' }}</button>
    </form>

    <div class="mb-3 flex items-center justify-between gap-3">
      <h2 class="font-bold text-ink">수집 내역</h2>
      <div class="flex flex-wrap gap-1.5" role="group" aria-label="상태 필터">
        <button type="button" class="chip" :aria-pressed="!statusFilter" @click="statusFilter = ''">전체</button>
        <button v-for="(v, k) in STATUS" :key="k" type="button" class="chip" :aria-pressed="statusFilter === k" @click="statusFilter = k">{{ v.label }}</button>
      </div>
    </div>
    <StatePanel :state="history.state.value" :error="history.error.value" :empty="!history.data.value.length" empty-text="수집한 상품이 없어요." @retry="history.reload()">
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>상품</th><th>상품군</th><th class="text-right">판매가</th><th>위치</th><th>상태</th><th>수집</th></tr></thead>
          <tbody>
            <tr v-for="d in history.data.value" :key="d.id" class="row-link" tabindex="0" @click="open(d)" @keydown.enter="open(d)">
              <td><p class="max-w-[320px] truncate font-medium">{{ d.title || '(제목 없음)' }}</p><p class="max-w-[320px] truncate text-2xs text-ink-subtle">{{ d.source_url }}</p></td>
              <td class="text-xs">{{ DOMAINS[d.domain_type]?.label || domainLabel(d.domain_type) }}</td>
              <td class="text-right tabular">{{ Number(d.price_minor) > 0 ? krw(d.price_minor) : '미입력' }}</td>
              <td class="text-xs">{{ [d.city, d.country].filter(Boolean).join(', ') || '미입력' }}</td>
              <td><StatusBadge v-bind="STATUS[d.status] || { label: d.status }" /></td>
              <td class="whitespace-nowrap text-xs text-ink-muted tabular">{{ dateTime(d.created_at) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </StatePanel>

    <SidePanel :open="!!draft" wide :title="form.title || '(제목 없음)'" :subtitle="draft?.source_url" @close="draft = null">
      <form v-if="draft" id="ingest-form" class="space-y-4 text-sm" @submit.prevent="publish">
        <div class="flex flex-wrap items-center gap-2">
          <StatusBadge v-bind="STATUS[draft.status] || { label: draft.status }" />
          <a :href="draft.source_url" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 text-xs font-semibold text-primary">원본 페이지 <AppIcon name="external" :size="12" /></a>
          <span v-if="draft.published_item_id" class="font-mono text-2xs text-ink-subtle">{{ draft.published_item_id }}</span>
        </div>
        <p v-if="locked" class="rounded-field bg-surface-sunken px-3 py-2 text-xs text-ink-muted">카탈로그에 등록된 상품이라 수정할 수 없어요.</p>

        <fieldset :disabled="locked" class="space-y-4">
          <div>
            <label class="label" for="ig-domain">상품군</label>
            <select id="ig-domain" v-model="form.domain_type" class="input">
              <option v-for="(v, k) in DOMAINS" :key="k" :value="k">{{ v.label }}{{ v.publishable ? '' : ' (자동 등록 불가)' }}</option>
            </select>
            <p v-if="!DOMAINS[form.domain_type]?.publishable" class="mt-1 text-2xs text-warning">이 상품군은 자동 등록을 지원하지 않아요. 파트너 콘솔에서 등록해 주세요.</p>
          </div>
          <div><label class="label" for="ig-title">상품명 *</label><input id="ig-title" v-model="form.title" class="input" maxlength="180" /></div>
          <div class="grid gap-4 sm:grid-cols-2">
            <div>
              <label class="label" for="ig-price">원화 판매가 *</label>
              <input id="ig-price" v-model="form.price" inputmode="numeric" class="input tabular" placeholder="예: 35000" />
              <p v-if="priceError" class="mt-1 text-xs text-danger">{{ priceError }}</p>
              <p v-else-if="meta.sourcePrice && meta.sourceCurrency !== 'KRW'" class="mt-1 text-2xs text-ink-subtle">원본 가격: {{ meta.sourcePrice }} {{ meta.sourceCurrency }} — 원화로 직접 입력해 주세요.</p>
              <p v-else-if="!meta.sourcePrice" class="mt-1 text-2xs text-ink-subtle">페이지에서 가격을 찾지 못했어요.</p>
            </div>
            <div>
              <label class="label" for="ig-country">국가 *</label>
              <PlaceInput v-model="form.country" kind="country" label="국가" input-id="ig-country" @pick="(p) => (form.countryCode = p.code || '')" />
            </div>
            <div>
              <label class="label" for="ig-city">도시 *</label>
              <PlaceInput v-model="form.city" kind="city" label="도시" input-id="ig-city" :country-code="form.countryCode" @pick="(p) => { if (!form.country && p.countryCode) form.countryCode = p.countryCode }" />
            </div>
            <div>
              <label class="label" for="ig-address">주소{{ form.domain_type === 'HOTEL' ? ' *' : '' }}</label>
              <input id="ig-address" v-model="form.address" class="input" maxlength="300" />
            </div>
          </div>
          <div><label class="label" for="ig-summary">요약</label><input id="ig-summary" v-model="form.summary" class="input" maxlength="300" /></div>
          <div><label class="label" for="ig-desc">설명</label><textarea id="ig-desc" v-model="form.description" class="input min-h-[96px] py-2" maxlength="4000" /></div>
          <div>
            <label class="label" for="ig-cancel">취소 규정 *</label>
            <textarea id="ig-cancel" v-model="form.cancellation_policy" class="input min-h-[72px] py-2" maxlength="1000" placeholder="공급사 약관에 적힌 취소·환불 조건을 그대로 입력해 주세요." />
          </div>
          <div v-if="draft.image_urls?.length">
            <p class="label">페이지에서 찾은 사진</p>
            <div class="flex gap-2 overflow-x-auto">
              <img v-for="src in draft.image_urls" :key="src" :src="src" alt="" class="h-20 w-28 shrink-0 rounded-lg border border-line object-cover" loading="lazy" referrerpolicy="no-referrer" />
            </div>
          </div>
        </fieldset>

        <div v-if="!locked && missing.length" class="rounded-field bg-warning-soft px-3 py-2 text-xs text-warning" role="status">
          등록하려면 채워야 해요: {{ missing.map((m) => FIELD[m]).join(', ') }}
        </div>
        <p v-if="!locked" class="text-2xs text-ink-subtle">등록된 상품은 평점·리뷰 없이 시작하고, 예약 가능 여부는 공급사 연동 상태(공급사 연동 메뉴)를 따라요.</p>
      </form>
      <template v-if="draft && !locked" #footer>
        <button type="button" class="btn-ghost text-danger" :disabled="busy" @click="save('REJECTED')">반려</button>
        <button type="button" class="btn-secondary" :disabled="busy || !!priceError" @click="save()">저장</button>
        <button type="submit" form="ingest-form" class="btn-primary" :disabled="busy || !canPublish">{{ busy ? '처리 중…' : '카탈로그에 등록' }}</button>
      </template>
    </SidePanel>
  </div>
</template>
