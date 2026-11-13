<script setup lang="ts">
/**
 * Product catalog (GET /admin/catalog ?q ?domain ?status, CRUD + bulk upsert + policy).
 * Create/edit/delete via SidePanel form; CSV/JSON bulk panel below the list.
 */
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api, toast } from '../composables/session'
import { API_BASE_URL } from '../config/api'
import { useResource } from '../composables/useResource'
import { DOMAIN_LABEL, domainLabel, krw } from '../composables/format'
import PageHeader from '../components/PageHeader.vue'
import StatePanel from '../components/StatePanel.vue'
import StatusBadge from '../components/StatusBadge.vue'
import EntitySearch from '../components/EntitySearch.vue'
import PageNav from '../components/PageNav.vue'
import SidePanel from '../components/SidePanel.vue'

interface FormField { key: string; label: string; kind: 'text' | 'textarea' | 'number' | 'bool' | 'json'; required?: boolean }
const DOMAIN_FIELDS: Record<string, FormField[]> = {
  HOTEL: [
    { key: 'partner_id', label: '파트너 ID', kind: 'text' }, { key: 'name_ko', label: '호텔명(국문)', kind: 'text', required: true },
    { key: 'name_en', label: '호텔명(영문)', kind: 'text', required: true }, { key: 'city', label: '도시', kind: 'text', required: true },
    { key: 'country', label: '국가', kind: 'text', required: true }, { key: 'address', label: '주소', kind: 'textarea', required: true },
    { key: 'latitude', label: '위도', kind: 'number' }, { key: 'longitude', label: '경도', kind: 'number' },
    { key: 'star_rating', label: '성급', kind: 'number' }, { key: 'property_type', label: '숙소 유형', kind: 'text' },
    { key: 'review_score', label: '평점', kind: 'number' }, { key: 'review_count', label: '리뷰 수', kind: 'number' },
    { key: 'neighborhood', label: '주변 지역', kind: 'text' }, { key: 'subway_nearby', label: '인근 지하철', kind: 'text' },
    { key: 'free_cancellation', label: '무료 취소', kind: 'bool' }, { key: 'free_breakfast', label: '조식 포함', kind: 'bool' },
    { key: 'base_price_krw', label: '1박 기준가(KRW)', kind: 'number', required: true }, { key: 'thumbnail_url', label: '썸네일 URL', kind: 'text' },
    { key: 'images_json', label: '이미지(JSON 배열)', kind: 'json' }, { key: 'amenities_json', label: '편의시설(JSON 배열)', kind: 'json' },
    { key: 'rooms_json', label: '객실(JSON 배열)', kind: 'json' }, { key: 'is_active', label: '판매중', kind: 'bool' },
  ],
  FLIGHT: [
    { key: 'partner_id', label: '파트너 ID', kind: 'text' }, { key: 'flight_number', label: '편명', kind: 'text', required: true },
    { key: 'airline_name', label: '항공사', kind: 'text', required: true }, { key: 'airline_code', label: '항공사 코드', kind: 'text', required: true },
    { key: 'departure_airport', label: '출발 공항', kind: 'text', required: true }, { key: 'arrival_airport', label: '도착 공항', kind: 'text', required: true },
    { key: 'departure_city', label: '출발 도시', kind: 'text', required: true }, { key: 'arrival_city', label: '도착 도시', kind: 'text', required: true },
    { key: 'departure_time', label: '출발 시각', kind: 'text', required: true }, { key: 'arrival_time', label: '도착 시각', kind: 'text', required: true },
    { key: 'duration_minutes', label: '비행시간(분)', kind: 'number', required: true }, { key: 'stops', label: '경유 횟수', kind: 'number' },
    { key: 'departure_time_slot', label: '출발 시간대', kind: 'text' }, { key: 'cabin_class', label: '좌석 등급', kind: 'text' },
    { key: 'base_price_krw', label: '기준가(KRW)', kind: 'number', required: true }, { key: 'free_baggage_kg', label: '무료 수하물(kg)', kind: 'number' },
    { key: 'available_seats', label: '잔여석', kind: 'number' }, { key: 'is_active', label: '판매중', kind: 'bool' },
  ],
  TRAIN: [
    { key: 'train_number', label: '열차 번호', kind: 'text', required: true }, { key: 'train_type', label: '열차 종류', kind: 'text', required: true },
    { key: 'departure_station', label: '출발역', kind: 'text', required: true }, { key: 'arrival_station', label: '도착역', kind: 'text', required: true },
    { key: 'departure_time', label: '출발 시각', kind: 'text', required: true }, { key: 'arrival_time', label: '도착 시각', kind: 'text', required: true },
    { key: 'duration_minutes', label: '소요시간(분)', kind: 'number', required: true }, { key: 'seat_class', label: '좌석 등급', kind: 'text' },
    { key: 'price_krw', label: '기준가(KRW)', kind: 'number', required: true }, { key: 'available_seats', label: '잔여석', kind: 'number' },
    { key: 'is_active', label: '판매중', kind: 'bool' },
  ],
  CAR: [
    { key: 'partner_id', label: '파트너 ID', kind: 'text' }, { key: 'company_name', label: '렌터카 업체', kind: 'text', required: true },
    { key: 'vehicle_model', label: '차종', kind: 'text', required: true }, { key: 'vehicle_type', label: '차급', kind: 'text' },
    { key: 'seats', label: '탑승 인원', kind: 'number' }, { key: 'transmission', label: '변속기', kind: 'text' },
    { key: 'daily_price_krw', label: '1일 기준가(KRW)', kind: 'number', required: true }, { key: 'pickup_location', label: '인수 지점', kind: 'text', required: true },
    { key: 'insurance_included', label: '자차보험 포함', kind: 'bool' }, { key: 'image_url', label: '이미지 URL', kind: 'text' },
    { key: 'available_stock', label: '재고', kind: 'number' }, { key: 'is_active', label: '판매중', kind: 'bool' },
  ],
  TRANSFER: [
    { key: 'partner_id', label: '파트너 ID', kind: 'text' }, { key: 'service_title', label: '서비스명', kind: 'text', required: true },
    { key: 'airport_code', label: '공항 코드', kind: 'text', required: true }, { key: 'destination_area', label: '목적지', kind: 'text', required: true },
    { key: 'vehicle_class', label: '차량 등급', kind: 'text' }, { key: 'max_passengers', label: '최대 인원', kind: 'number' },
    { key: 'max_luggage', label: '최대 수하물', kind: 'number' }, { key: 'price_krw', label: '기준가(KRW)', kind: 'number', required: true },
    { key: 'flight_tracking', label: '항공편 트래킹', kind: 'bool' }, { key: 'image_url', label: '이미지 URL', kind: 'text' },
    { key: 'is_active', label: '판매중', kind: 'bool' },
  ],
  ACTIVITY: [
    { key: 'partner_id', label: '파트너 ID', kind: 'text' }, { key: 'title', label: '상품명', kind: 'text', required: true },
    { key: 'category', label: '카테고리', kind: 'text', required: true }, { key: 'city', label: '도시', kind: 'text', required: true },
    { key: 'country', label: '국가', kind: 'text', required: true }, { key: 'price_krw', label: '기준가(KRW)', kind: 'number', required: true },
    { key: 'review_score', label: '평점', kind: 'number' }, { key: 'review_count', label: '리뷰 수', kind: 'number' },
    { key: 'instant_confirmation', label: '즉시 확정', kind: 'bool' }, { key: 'free_cancellation', label: '무료 취소', kind: 'bool' },
    { key: 'duration_type', label: '소요 구분', kind: 'text' }, { key: 'guide_language', label: '가이드 언어', kind: 'text' },
    { key: 'voucher_type', label: '바우처 형태', kind: 'text' }, { key: 'thumbnail_url', label: '썸네일 URL', kind: 'text' },
    { key: 'description', label: '설명', kind: 'textarea' }, { key: 'packages_json', label: '패키지(JSON 배열)', kind: 'json' },
    { key: 'is_active', label: '판매중', kind: 'bool' },
  ],
  PACKAGE: [
    { key: 'title', label: '상품명', kind: 'text', required: true }, { key: 'destination_city', label: '목적지 도시', kind: 'text', required: true },
    { key: 'hotel_id', label: '호텔 ID', kind: 'text' }, { key: 'flight_id', label: '항공 ID', kind: 'text' },
    { key: 'package_discount_rate', label: '할인율(%)', kind: 'number' }, { key: 'total_original_krw', label: '정상가 합계(KRW)', kind: 'number', required: true },
    { key: 'total_package_krw', label: '패키지가(KRW)', kind: 'number', required: true }, { key: 'thumbnail_url', label: '썸네일 URL', kind: 'text' },
    { key: 'details_json', label: '상세(JSON)', kind: 'json' }, { key: 'is_active', label: '판매중', kind: 'bool' },
  ],
}

const route = useRoute()
const router = useRouter()
const qv = (k: string) => (typeof route.query[k] === 'string' ? (route.query[k] as string) : '')
function patch(change: Record<string, string>) {
  const next: Record<string, string> = {}
  for (const [k, v] of Object.entries({ ...route.query, ...change })) if (typeof v === 'string' && v) next[k] = v
  router.replace({ query: next })
}
const domain = computed(() => qv('domain'))
const q = computed(() => qv('q'))
const status = computed(() => qv('status'))
const page = computed(() => Math.max(1, parseInt(qv('page') || '1', 10) || 1))
const draft = ref(q.value)
watch(q, (v) => { draft.value = v })

const total = ref(0)
const totalPages = ref(1)
const actionError = ref('')
const list = useResource(async () => {
  const p = new URLSearchParams()
  if (domain.value) p.set('domain', domain.value)
  if (q.value) p.set('q', q.value)
  if (status.value) p.set('status', status.value)
  p.set('page', String(page.value))
  p.set('pageSize', '20')
  const j = await api(`/admin/catalog?${p}`)
  total.value = j.total || 0
  totalPages.value = j.totalPages || 1
  return j.items || []
}, [] as any[])
watch([domain, q, status, page], () => list.reload())
onMounted(() => { list.reload(); suppliers.reload() })
const suppliers = useResource(async () => (await api('/admin/suppliers')).suppliers || [], [] as any[])
const supplierById = computed(() => new Map(suppliers.data.value.map((s: any) => [s.id, s])))
const suggest = async (term: string, signal: AbortSignal) => {
  const p = new URLSearchParams({ q: term, limit: '8' })
  if (domain.value) p.set('domain', domain.value)
  return (await api(`/admin/catalog?${p}`, { signal })).items || []
}

// #155: storefront links follow the configured API host (same hub serves the
// portals) instead of a hardcoded workers.dev URL.
const SITE = API_BASE_URL.replace(/\/api\/v1\/?$/, '')
const DETAIL: Record<string, string> = {
  HOTEL: '/hotels/detail/', FLIGHT: '/flights/detail/', TRAIN: '/trains/detail/', CAR: '/cars/detail/',
  TRANSFER: '/transfers/detail/', ACTIVITY: '/things-to-do/detail/', PACKAGE: '/packages/detail/'
}
const ICON: Record<string, string> = { HOTEL: 'hotel', FLIGHT: 'flight', TRAIN: 'train', CAR: 'car', TRANSFER: 'transfer', ACTIVITY: 'ticket', PACKAGE: 'package' }
const siteUrl = (it: any) => `${SITE}${DETAIL[it.domain_type] || '/'}${encodeURIComponent(it.id)}`

function supplierBadge(it: any): { tone: any; label: string } {
  if (!it.partner_id) return { tone: 'neutral', label: '공급사 미지정' }
  const s: any = supplierById.value.get(it.partner_id)
  if (!s) return { tone: 'danger', label: '미등록 공급사' }
  if (s.transaction_model === 'AFFILIATE') return { tone: 'neutral', label: '제휴 링크' }
  if (s.integration_status === 'BLOCKED') return { tone: 'danger', label: '차단' }
  if (s.integration_status === 'LIVE') return { tone: 'success', label: '실연동' }
  if (s.adapter === 'simulator') return { tone: 'warning', label: '시뮬레이터' }
  return { tone: 'neutral', label: s.integration_status || '미연동' }
}

// --- create/edit panel (dirty-only submit; untouched fields keep DB defaults) ---
const panel = ref<null | { mode: 'create' | 'edit'; domain: string; id: string; title: string }>(null)
const form = reactive<Record<string, any>>({})
const formJson = reactive<Record<string, string>>({})
const policy = reactive({ free_cancel_hours: '', change_allowed: false, no_show_fee_bps: '', tiers: '', note: '' })
const createDomain = ref('HOTEL')
const createId = ref('')
const formError = ref('')
const formLoading = ref(false)
const saving = ref(false)
let snapshot = ''
const fieldsFor = (d: string) => DOMAIN_FIELDS[d] || []

function resetForm() {
  for (const k of Object.keys(form)) delete form[k]
  for (const k of Object.keys(formJson)) delete formJson[k]
  Object.assign(policy, { free_cancel_hours: '', change_allowed: false, no_show_fee_bps: '', tiers: '', note: '' })
  formError.value = ''
}
function openCreate() {
  resetForm()
  createId.value = ''
  panel.value = { mode: 'create', domain: domain.value || 'HOTEL', id: '', title: '상품 등록' }
  snapshot = JSON.stringify({ form: {}, policy: { ...policy } })
}
async function openEdit(it: any) {
  resetForm()
  panel.value = { mode: 'edit', domain: it.domain_type, id: it.id, title: it.title }
  formLoading.value = true
  try {
    const d = await api(`/admin/catalog/${it.domain_type}/${encodeURIComponent(it.id)}`)
    for (const f of fieldsFor(it.domain_type)) {
      const v = d.product[f.key]
      if (v === null || v === undefined) continue
      if (f.kind === 'json') formJson[f.key] = typeof v === 'string' ? v : JSON.stringify(v)
      else if (f.kind === 'bool') form[f.key] = Number(v) === 1
      else form[f.key] = v
    }
    const p = (await api(`/admin/catalog/${it.domain_type}/${encodeURIComponent(it.id)}/policy`)).policy
    if (p) {
      policy.free_cancel_hours = p.free_cancel_hours ?? ''
      policy.change_allowed = Number(p.change_allowed) === 1
      policy.no_show_fee_bps = p.no_show_fee_bps ?? ''
      policy.tiers = JSON.stringify(p.tiers || [])
      policy.note = p.note || ''
    }
    snapshot = JSON.stringify({ form: { ...form }, json: { ...formJson }, policy: { ...policy } })
  } catch (e: any) {
    formError.value = e?.message || '상품을 불러오지 못했어요.'
  } finally {
    formLoading.value = false
  }
}
function closePanel() { panel.value = null }

function collectBody(isCreate: boolean) {
  const body: Record<string, any> = {}
  const fields = fieldsFor(panel.value!.domain)
  const before = JSON.parse(snapshot || '{}')
  for (const f of fields) {
    let v: any
    if (f.kind === 'json') {
      const raw = (formJson[f.key] ?? '').trim()
      if (!raw) {
        if (isCreate) continue
        if ((before.json || {})[f.key] === undefined) continue
        body[f.key] = null
        continue
      }
      try { v = JSON.parse(raw) } catch { throw new Error(`${f.label}: 올바른 JSON이 아니에요.`) }
    } else if (f.kind === 'bool') {
      if (!(f.key in form)) continue
      v = form[f.key] ? 1 : 0
    } else if (f.kind === 'number') {
      if (!(f.key in form) || form[f.key] === '' || form[f.key] === null) continue
      v = Number(form[f.key])
      if (!Number.isFinite(v)) throw new Error(`${f.label}: 숫자여야 해요.`)
    } else {
      if (!(f.key in form)) continue
      v = typeof form[f.key] === 'string' ? form[f.key].trim() : form[f.key]
      if (v === '' && !isCreate) {
        if ((before.form || {})[f.key] === undefined) continue
        body[f.key] = null
        continue
      }
      if (v === '') continue
    }
    const prev = f.kind === 'json' ? (before.json || {})[f.key] : (before.form || {})[f.key]
    const cur = f.kind === 'json' ? (formJson[f.key] ?? '').trim() : f.kind === 'bool' ? !!form[f.key] : form[f.key]
    const prevNorm = f.kind === 'bool' ? !!prev : prev
    if (!isCreate && JSON.stringify(cur) === JSON.stringify(prevNorm)) continue
    body[f.key] = v
  }
  if (isCreate && createId.value.trim()) body.id = createId.value.trim()
  return body
}

function collectPolicy() {
  if (!panel.value || panel.value.mode !== 'edit') return null
  const before = (JSON.parse(snapshot || '{}').policy) || {}
  const cur = { ...policy }
  if (JSON.stringify(cur) === JSON.stringify(before)) return null
  let tiers: any[] = []
  if (String(cur.tiers || '').trim()) {
    try { tiers = JSON.parse(cur.tiers) } catch { throw new Error('정책 구간: 올바른 JSON 배열이어야 해요.') }
    if (!Array.isArray(tiers)) throw new Error('정책 구간: 배열이어야 해요.')
  }
  return {
    free_cancel_hours: cur.free_cancel_hours === '' ? null : Number(cur.free_cancel_hours),
    change_allowed: !!cur.change_allowed,
    no_show_fee_bps: cur.no_show_fee_bps === '' ? null : Number(cur.no_show_fee_bps),
    tiers,
    note: cur.note || null,
  }
}

async function save() {
  if (!panel.value || saving.value) return
  saving.value = true
  formError.value = ''
  try {
    const isCreate = panel.value.mode === 'create'
    const dom = isCreate ? createDomain.value : panel.value.domain
    const body = collectBody(isCreate)
    let id = panel.value.id
    if (isCreate) {
      const r = await api(`/admin/catalog/${dom}`, { method: 'POST', json: body })
      id = r.id
      toast('상품을 등록했어요.')
    } else {
      if (Object.keys(body).length) await api(`/admin/catalog/${dom}/${encodeURIComponent(id)}`, { method: 'PATCH', json: body })
      const pol = collectPolicy()
      if (pol) await api(`/admin/catalog/${dom}/${encodeURIComponent(id)}/policy`, { method: 'PUT', json: pol })
      toast(Object.keys(body).length || pol ? '저장했어요.' : '바뀐 내용이 없어요.')
    }
    closePanel()
    await list.reload()
  } catch (e: any) {
    formError.value = e?.message || '저장에 실패했어요.'
  } finally {
    saving.value = false
  }
}

async function toggleActive(it: any) {
  actionError.value = ''
  try {
    await api(`/admin/catalog/${it.domain_type}/${encodeURIComponent(it.id)}`, { method: 'PATCH', json: { is_active: it.is_active ? 0 : 1 } })
    toast(it.is_active ? '판매를 중지했어요.' : '판매를 재개했어요.')
    await list.reload()
  } catch (e: any) {
    actionError.value = e?.message || '상태 변경에 실패했어요.'
  }
}

async function removeItem(it: any) {
  if (!window.confirm(`‘${it.title}’ 상품을 삭제할까요? 예약이 참조 중이면 삭제되지 않아요.`)) return
  actionError.value = ''
  try {
    await api(`/admin/catalog/${it.domain_type}/${encodeURIComponent(it.id)}`, { method: 'DELETE' })
    toast('상품을 삭제했어요.')
    await list.reload()
  } catch (e: any) {
    actionError.value = e?.message || '삭제에 실패했어요.'
  }
}

// --- bulk upsert (JSON array or CSV; CSV headers accept Korean labels or column names) ---
const bulk = reactive({ domain: 'HOTEL', text: '', result: null as any, error: '', busy: false })
function labelToCol(dom: string) {
  const m: Record<string, string> = { id: 'id' }
  for (const f of fieldsFor(dom)) { m[f.label] = f.key; m[f.key] = f.key }
  return m
}
const BOOL_WORDS: Record<string, number> = { '1': 1, '0': 0, TRUE: 1, FALSE: 0, true: 1, false: 0, Y: 1, N: 0, y: 1, n: 0, '예': 1, '아니오': 0, '참': 1, '거짓': 0 }
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++ } else quoted = false
      } else cell += c
    } else if (c === '"') quoted = true
    else if (c === ',') { row.push(cell); cell = '' }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = '' }
    else if (c !== '\r') cell += c
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row) }
  return rows.filter((r) => r.some((x) => x.trim() !== ''))
}
function bulkRows(): any[] {
  const raw = bulk.text.trim()
  if (!raw) throw new Error('업로드할 내용을 입력해 주세요.')
  if (raw.startsWith('[')) {
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) throw new Error('JSON 배열이어야 해요.')
    return arr
  }
  const grid = parseCsv(raw)
  if (grid.length < 2) throw new Error('CSV는 헤더 + 1행 이상이어야 해요.')
  const map = labelToCol(bulk.domain)
  const cols = grid[0].map((h) => map[h.trim()] || '')
  const unknown = grid[0].filter((_, i) => !cols[i])
  if (unknown.length) throw new Error(`알 수 없는 헤더: ${unknown.join(', ')}`)
  const fields = new Map(fieldsFor(bulk.domain).map((f) => [f.key, f]))
  return grid.slice(1).map((r) => {
    const o: Record<string, any> = {}
    cols.forEach((col, i) => {
      const v = (r[i] ?? '').trim()
      if (!v) return
      const f = fields.get(col)
      if (f?.kind === 'bool' && v in BOOL_WORDS) o[col] = BOOL_WORDS[v]
      else o[col] = v
    })
    return o
  })
}
async function runBulk() {
  bulk.busy = true
  bulk.error = ''
  bulk.result = null
  try {
    const rows = bulkRows()
    const r = await api('/admin/catalog/bulk', { method: 'POST', json: { domain: bulk.domain, rows } })
    bulk.result = r
    toast(`${r.created}건 등록·${r.updated}건 갱신했어요.`)
    await list.reload()
  } catch (e: any) {
    bulk.error = e?.message || '업로드에 실패했어요.'
  } finally {
    bulk.busy = false
  }
}
function onBulkFile(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (!f) return
  const reader = new FileReader()
  reader.onload = () => { bulk.text = String(reader.result || '') }
  reader.readAsText(f, 'utf-8')
}
</script>

<template>
  <div>
    <PageHeader title="상품" description="7개 상품군의 카탈로그를 직접 등록·수정·삭제해요. 연동 공급사 상품은 파트너 콘솔이나 URL 수집에서 바뀌어요.">
      <button type="button" class="btn-primary btn-sm" @click="openCreate"><AppIcon name="plus" :size="14" />상품 등록</button>
    </PageHeader>

    <div class="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
      <div class="lg:w-96">
        <EntitySearch
          v-model="draft"
          label="상품 검색"
          input-id="catalog-search"
          placeholder="상품명, 도시, 항공편, 노선, ID"
          :fetcher="suggest"
          :item-key="(x: any) => `${x.domain_type}:${x.id}`"
          @select="(x: any) => patch({ q: x.id })"
          @submit="(t: string) => patch({ q: t })"
        >
          <template #item="{ item }">
            <div class="flex items-center gap-2.5">
              <AppIcon :name="ICON[item.domain_type] || 'package'" :size="16" class="text-ink-subtle" />
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-medium text-ink">{{ item.title }}</p>
                <p class="truncate text-2xs text-ink-subtle">{{ domainLabel(item.domain_type) }} · {{ item.subtitle }} · <span class="font-mono">{{ item.id }}</span></p>
              </div>
            </div>
          </template>
        </EntitySearch>
      </div>
      <div class="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:mx-0 lg:flex-wrap lg:px-0 [&::-webkit-scrollbar]:hidden" role="group" aria-label="상품군 필터">
        <button type="button" class="chip" :aria-pressed="!domain" @click="patch({ domain: '' })">전체</button>
        <button v-for="(label, d) in DOMAIN_LABEL" :key="d" type="button" class="chip" :aria-pressed="domain === d" @click="patch({ domain: d })"><AppIcon :name="ICON[d]" :size="14" />{{ label }}</button>
      </div>
    </div>
    <div class="mb-4 flex gap-1.5" role="group" aria-label="판매 상태 필터">
      <button type="button" class="chip" :aria-pressed="!status" @click="patch({ status: '', page: '' })">전체 상태</button>
      <button type="button" class="chip" :aria-pressed="status === 'active'" @click="patch({ status: 'active', page: '' })">판매중</button>
      <button type="button" class="chip" :aria-pressed="status === 'inactive'" @click="patch({ status: 'inactive', page: '' })">판매중지</button>
    </div>
    <p v-if="q" class="mb-3 text-sm text-ink-muted">‘{{ q }}’ 검색 결과 · <button type="button" class="font-semibold text-primary" @click="patch({ q: '' })">검색 해제</button></p>
    <p v-if="actionError" class="mb-3 rounded-xl border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger" role="alert">{{ actionError }}</p>

    <StatePanel :state="list.state.value" :error="list.error.value" :empty="!list.data.value.length" empty-text="조건에 맞는 상품이 없어요." @retry="list.reload()">
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>상품</th><th>상품군</th><th class="text-right">기준가</th><th>상태</th><th>공급사</th><th>연동</th><th class="text-right">작업</th></tr></thead>
          <tbody>
            <tr v-for="it in list.data.value" :key="`${it.domain_type}:${it.id}`">
              <td><p class="max-w-[280px] truncate font-medium">{{ it.title }}</p><p class="max-w-[280px] truncate text-2xs text-ink-subtle">{{ it.subtitle }} · <span class="font-mono">{{ it.id }}</span></p></td>
              <td class="whitespace-nowrap text-xs"><span class="inline-flex items-center gap-1.5"><AppIcon :name="ICON[it.domain_type] || 'package'" :size="14" class="text-ink-subtle" />{{ domainLabel(it.domain_type) }}</span></td>
              <td class="text-right font-semibold tabular">{{ krw(it.price) }}</td>
              <td><StatusBadge :tone="it.is_active ? 'success' : 'neutral'" :label="it.is_active ? '판매중' : '중지'" /></td>
              <td class="font-mono text-xs text-ink-muted">{{ it.partner_id || '—' }}</td>
              <td><StatusBadge v-bind="supplierBadge(it)" /></td>
              <td class="whitespace-nowrap text-right">
                <button type="button" class="btn-ghost btn-sm px-2" title="수정" aria-label="수정" @click="openEdit(it)"><AppIcon name="edit" :size="15" /></button>
                <button type="button" class="btn-ghost btn-sm px-2" :title="it.is_active ? '판매중지' : '판매재개'" :aria-label="it.is_active ? '판매중지' : '판매재개'" @click="toggleActive(it)"><AppIcon :name="it.is_active ? 'pause' : 'play'" :size="15" /></button>
                <button type="button" class="btn-ghost btn-sm px-2" title="삭제" aria-label="삭제" @click="removeItem(it)"><AppIcon name="trash" :size="15" /></button>
                <a :href="siteUrl(it)" target="_blank" rel="noopener" class="btn-ghost btn-sm px-2" :aria-label="`${it.title} 사용자 화면에서 보기`" title="사용자 화면에서 보기"><AppIcon name="external" :size="14" /></a>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <PageNav :page="page" :total-pages="totalPages" :total="total" @go="(p) => patch({ page: p === 1 ? '' : String(p) })" />
      <p class="mt-2 text-2xs text-ink-subtle">기준가는 세금·수수료 전 카탈로그 가격이에요.</p>
    </StatePanel>

    <details class="mt-6 rounded-card border border-line bg-surface p-5">
      <summary class="cursor-pointer text-sm font-bold text-ink">대량 등록 (CSV/JSON 배치 업로드)</summary>
      <p class="mt-1 text-xs text-ink-muted">같은 상품군의 행을 최대 500건까지 한 번에 등록·갱신해요. id가 이미 있으면 덮어쓰고, 없으면 새로 만들어요. CSV 첫 행은 한글 라벨 또는 컬럼명.</p>
      <div class="mt-3 grid gap-3 sm:grid-cols-[180px_1fr]">
        <label class="block text-xs font-semibold text-ink-muted">상품군
          <select v-model="bulk.domain" class="input mt-1 w-full">
            <option v-for="(label, d) in DOMAIN_LABEL" :key="d" :value="d">{{ label }}</option>
          </select>
        </label>
        <label class="block text-xs font-semibold text-ink-muted">CSV 파일
          <input type="file" accept=".csv,.json,text/csv,application/json" class="input mt-1 w-full" @change="onBulkFile" />
        </label>
      </div>
      <textarea v-model="bulk.text" rows="6" spellcheck="false" placeholder='CSV 예:&#10;호텔명(국문),도시,1박 기준가(KRW)&#10;테스트 호텔,서울,100000&#10;&#10;또는 JSON 배열' class="input mt-3 w-full font-mono text-xs"></textarea>
      <div class="mt-3 flex items-center gap-2">
        <button type="button" class="btn-primary btn-sm" :disabled="bulk.busy" @click="runBulk">{{ bulk.busy ? '업로드 중…' : '업로드 실행' }}</button>
      </div>
      <p v-if="bulk.error" class="mt-2 text-sm text-danger" role="alert">{{ bulk.error }}</p>
      <div v-if="bulk.result" class="mt-3 rounded-xl border border-line bg-surface-sunken p-3 text-sm">
        <p class="font-bold text-ink">{{ bulk.result.created }}건 등록 · {{ bulk.result.updated }}건 갱신 · {{ bulk.result.failed.length }}건 실패</p>
        <ul v-if="bulk.result.failed.length" class="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs text-ink-muted">
          <li v-for="f in bulk.result.failed" :key="f.index" class="font-mono">{{ f.index + 1 }}행{{ f.id ? ` (${f.id})` : '' }}: {{ f.error }}</li>
        </ul>
      </div>
    </details>

    <SidePanel :open="!!panel" :title="panel?.title || ''" :subtitle="panel ? `${domainLabel(panel.domain)}${panel.mode === 'edit' ? ` · ${panel.id}` : ''}` : ''" wide @close="closePanel">
      <div v-if="formLoading" class="py-10 text-center text-sm text-ink-muted">불러오는 중…</div>
      <div v-else-if="panel" class="space-y-4">
        <div v-if="panel.mode === 'create'" class="grid gap-3 sm:grid-cols-2">
          <label class="block text-xs font-semibold text-ink-muted">상품군
            <select v-model="createDomain" class="input mt-1 w-full" @change="panel.domain = createDomain; resetForm()">
              <option v-for="(label, d) in DOMAIN_LABEL" :key="d" :value="d">{{ label }}</option>
            </select>
          </label>
          <label class="block text-xs font-semibold text-ink-muted">상품 ID (비우면 자동 생성)
            <input v-model="createId" type="text" class="input mt-1 w-full font-mono" placeholder="htl_custom_01" />
          </label>
        </div>
        <div v-for="f in fieldsFor(panel.domain)" :key="f.key">
          <label v-if="f.kind !== 'bool'" class="block text-xs font-semibold text-ink-muted">{{ f.label }}<span v-if="f.required" class="text-danger"> *</span>
            <textarea v-if="f.kind === 'json'" v-model="formJson[f.key]" rows="3" spellcheck="false" class="input mt-1 w-full font-mono text-xs" placeholder="[]" />
            <textarea v-else-if="f.kind === 'textarea'" v-model="form[f.key]" rows="3" spellcheck="false" class="input mt-1 w-full" />
            <input v-else v-model="form[f.key]" :type="f.kind === 'number' ? 'number' : 'text'" class="input mt-1 w-full" />
          </label>
          <label v-else class="flex items-center gap-2 text-sm text-ink">
            <input v-model="form[f.key]" type="checkbox" class="h-4 w-4 accent-primary" />{{ f.label }}
          </label>
        </div>
        <div v-if="panel.mode === 'edit'" class="rounded-xl border border-line bg-surface-sunken p-4">
          <p class="text-sm font-bold text-ink">취소·환불 정책 (구조화)</p>
          <p class="mt-0.5 text-2xs text-ink-muted">비우면 도메인 기본 규정을 따름. 구간은 <span class="font-mono">[{"hours_before":48,"refund_bps":10000}]</span> 형식.</p>
          <div class="mt-3 grid gap-3 sm:grid-cols-2">
            <label class="block text-xs font-semibold text-ink-muted">무료 취소 기한(시간)
              <input v-model="policy.free_cancel_hours" type="number" min="0" class="input mt-1 w-full" placeholder="48" />
            </label>
            <label class="block text-xs font-semibold text-ink-muted">노쇼 위약(bps, 10000=100%)
              <input v-model="policy.no_show_fee_bps" type="number" min="0" max="10000" class="input mt-1 w-full" placeholder="1000" />
            </label>
          </div>
          <label class="mt-3 flex items-center gap-2 text-sm text-ink">
            <input v-model="policy.change_allowed" type="checkbox" class="h-4 w-4 accent-primary" />일정 변경 허용
          </label>
          <label class="mt-3 block text-xs font-semibold text-ink-muted">시점별 환불 구간(JSON 배열)
            <textarea v-model="policy.tiers" rows="2" spellcheck="false" class="input mt-1 w-full font-mono text-xs" placeholder="[]" />
          </label>
          <label class="mt-3 block text-xs font-semibold text-ink-muted">비고
            <input v-model="policy.note" type="text" class="input mt-1 w-full" />
          </label>
        </div>
        <p v-if="formError" class="text-sm text-danger" role="alert">{{ formError }}</p>
      </div>
      <template #footer>
        <button type="button" class="btn-ghost btn-sm" @click="closePanel">닫기</button>
        <button type="button" class="btn-primary btn-sm" :disabled="saving || formLoading" @click="save">{{ saving ? '저장 중…' : '저장' }}</button>
      </template>
    </SidePanel>
  </div>
</template>
