<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { apiUrl, partnerToken } from '../config/api'

interface ProductRow {
  id: string
  title: string
  domain_type: string
  city: string
  base_price_krw: number
  is_active: number
}

const editing = ref<ProductRow | null>(null)
const editTitle = ref('')
const editCity = ref('')
const editPrice = ref(0)
const editActive = ref(true)
const editBusy = ref(false)
const editError = ref('')

const imgBusy = ref(false)
const imgMsg = ref('')

async function openEdit(p: ProductRow) {
  editing.value = p
  editTitle.value = p.title
  editCity.value = p.city
  editPrice.value = Number(p.base_price_krw) || 0
  editActive.value = p.is_active === 1
  editError.value = ''
  imgMsg.value = ''
  editRooms.value = []
  editRoomsLoaded.value = false
  if (p.domain_type === 'HOTEL') {
    try {
      const res = await fetch(apiUrl(`/partner/products/${p.id}`), { headers: { Authorization: `Bearer ${partnerToken()}` } })
      const j = await res.json().catch(() => ({}))
      if (res.ok && Array.isArray(j.product?.rooms)) {
        editRooms.value = j.product.rooms.map((r: any) => ({ id: r.id, name: r.name_ko || r.name || '', price: Number(r.base_price_krw) || 0, inventory: Number(r.available_inventory) || 0, occupancy: Number(r.max_occupancy) || 2 }))
      }
      editRoomsLoaded.value = true
    } catch {
      editError.value = '객실 정보를 불러오지 못했습니다.'
    }
  }
}

async function uploadImages(ev: Event) {
  const input = ev.target as HTMLInputElement
  const files = Array.from(input.files || [])
  if (!files.length || !editing.value) return
  imgBusy.value = true
  imgMsg.value = ''
  editError.value = ''
  try {
    const ids: string[] = []
    for (const file of files.slice(0, 10)) {
      const form = new FormData()
      form.append('file', file)
      form.append('purpose', 'PRODUCT_IMAGE')
      const up = await fetch(apiUrl('/uploads'), {
        method: 'POST',
        headers: { Authorization: `Bearer ${partnerToken()}` },
        body: form
      })
      const uj = await up.json().catch(() => ({}))
      if (!up.ok) throw new Error(uj.error || `"${file.name}" 업로드에 실패했습니다.`)
      ids.push(uj.id)
    }
    const res = await fetch(apiUrl(`/partner/products/${editing.value.id}`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${partnerToken()}` },
      body: JSON.stringify({ imageIds: ids })
    })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(j.error || '이미지 연결에 실패했습니다.')
    imgMsg.value = `${ids.length}장을 등록했어요.`
    await fetchProducts()
  } catch (e) {
    editError.value = (e as Error).message
  } finally {
    imgBusy.value = false
    input.value = ''
  }
}

async function saveEdit() {
  if (!editing.value) return
  if (editing.value.domain_type === 'HOTEL' && editRoomsLoaded.value) {
    const err = validRooms(editRooms.value)
    if (err) { editError.value = err; return }
  }
  editBusy.value = true
  editError.value = ''
  try {
    const body: Record<string, unknown> = { title: editTitle.value.trim(), city: editCity.value.trim(), price: editPrice.value, isActive: editActive.value }
    if (editing.value.domain_type === 'HOTEL' && editRoomsLoaded.value) body.rooms = roomPayload(editRooms.value)
    const res = await fetch(apiUrl(`/partner/products/${editing.value.id}`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${partnerToken()}` },
      body: JSON.stringify(body)
    })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(j.error || '수정에 실패했습니다.')
    editing.value = null
    await fetchProducts()
  } catch (e) {
    editError.value = (e as Error).message
  } finally {
    editBusy.value = false
  }
}

async function toggleActive(p: ProductRow) {
  try {
    const res = await fetch(apiUrl(`/partner/products/${p.id}`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${partnerToken()}` },
      body: JSON.stringify({ isActive: p.is_active !== 1 })
    })
    if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as any).error || '상태 변경에 실패했습니다.')
    await fetchProducts()
  } catch (e) {
    error.value = (e as Error).message
  }
}

const products = ref<ProductRow[]>([])
const loading = ref(false)
const error = ref('')
const isModalOpen = ref(false)

const newDomain = ref('HOTEL')
const newTitle = ref('')
const newCity = ref('서울')
const newPrice = ref(120000)
const submitLoading = ref(false)
const submitError = ref('')

// #26: hotel rooms (required for bookability — a roomless hotel can never be quoted).
interface RoomDraft { id?: string; name: string; price: number; inventory: number; occupancy: number }
const blankRoom = (): RoomDraft => ({ name: '', price: 0, inventory: 0, occupancy: 2 })
const newRooms = ref<RoomDraft[]>([blankRoom()])
const editRooms = ref<RoomDraft[]>([])
const editRoomsLoaded = ref(false)
function validRooms(rows: RoomDraft[]): string | null {
  if (!rows.length) return '호텔은 객실을 1개 이상 등록해야 견적이 가능합니다.'
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    if (!r.name.trim()) return `${i + 1}번째 객실명을 입력해 주세요.`
    if (!Number.isInteger(r.price) || r.price < 0) return `${i + 1}번째 객실 요금이 올바르지 않습니다.`
    if (!Number.isInteger(r.inventory) || r.inventory < 0) return `${i + 1}번째 객실 재고가 올바르지 않습니다.`
  }
  return null
}
const roomPayload = (rows: RoomDraft[]) => rows.map((r) => ({ id: r.id, name_ko: r.name.trim(), base_price_krw: r.price, available_inventory: r.inventory, max_occupancy: r.occupancy }))

// URL Ingestion for Partners
const importUrl = ref('')
const isImporting = ref(false)
const importMessage = ref('')
const importOk = ref(false)

const fetchProducts = async () => {
  loading.value = true
  error.value = ''
  try {
    const token = partnerToken()
    const res = await fetch(apiUrl('/partner/products'), {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (!res.ok) throw new Error('상품 목록을 불러오지 못했습니다.')
    const json = await res.json()
    products.value = json.products || []
  } catch (e: any) {
    error.value = e.message || '상품 목록을 불러오지 못했습니다.'
  } finally {
    loading.value = false
  }
}

const handleImportUrl = async () => {
  if (!importUrl.value.trim()) return
  isImporting.value = true
  importMessage.value = ''
  importOk.value = false
  try {
    const token = partnerToken()
    const res = await fetch(apiUrl('/partner/ingest/url'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ url: importUrl.value.trim() })
    })

    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'URL 수집에 실패했습니다.')

    const draft = data.draft
    newTitle.value = draft.title || ''
    newDomain.value = draft.domain_type || 'ACTIVITY'
    newPrice.value = draft.price_minor || 50000
    newCity.value = draft.city || '서울'
    importOk.value = true
    importMessage.value = 'URL에서 상품명, 요금, 카테고리를 자동 추출했습니다. 등록 전에 확인해주세요.'
  } catch (err: any) {
    importMessage.value = `수집 실패: ${err.message}`
  } finally {
    isImporting.value = false
  }
}

const handleCreateProduct = async () => {
  if (!newTitle.value) return
  if (newDomain.value === 'HOTEL') {
    const err = validRooms(newRooms.value)
    if (err) { submitError.value = err; return }
  }
  submitLoading.value = true
  submitError.value = ''
  try {
    const token = partnerToken()
    const body: Record<string, unknown> = {
      domain: newDomain.value,
      title: newTitle.value,
      city: newCity.value,
      price: newPrice.value
    }
    if (newDomain.value === 'HOTEL') body.rooms = roomPayload(newRooms.value)
    const res = await fetch(apiUrl('/partner/products'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(body)
    })

    if (res.ok) {
      isModalOpen.value = false
      newTitle.value = ''
      newRooms.value = [blankRoom()]
      importUrl.value = ''
      importMessage.value = ''
      await fetchProducts()
    } else {
      const err = await res.json()
      submitError.value = err.error || '상품 등록에 실패했습니다.'
    }
  } catch (e: any) {
    submitError.value = e.message || '오류가 발생했습니다.'
  } finally {
    submitLoading.value = false
  }
}

onMounted(() => {
  fetchProducts()
})
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-col justify-between gap-4 md:flex-row md:items-center">
      <div>
        <h1 class="flex items-center gap-2 text-2xl font-black tracking-tight text-ink">
          <span>파트너 공급 상품 관리</span>
          <span class="rounded-full bg-primary-soft px-2 py-0.5 text-xs font-bold text-primary">
            총 {{ products.length }}개
          </span>
        </h1>
        <p class="mt-1 text-sm font-medium text-ink-subtle">
          getfortrip 플랫폼에 공급 중인 상품 목록과 기본 요금을 관리합니다.
        </p>
      </div>
      <div class="flex gap-2">
        <button
          type="button"
          class="btn-primary btn-sm !text-xs"
          @click="isModalOpen = true"
        >
          <AppIcon name="plus" :size="14" />
          <span>신규 상품 추가</span>
        </button>
      </div>
    </div>

    <div v-if="error" class="rounded-2xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm font-semibold text-danger">
      {{ error }}
      <button type="button" class="ml-2 underline" @click="fetchProducts">다시 시도</button>
    </div>

    <!-- Product Table -->
    <div class="card overflow-hidden">
      <div class="overflow-x-auto">
        <table :class="['table text-xs', loading || products.length ? '!min-w-[640px]' : 'w-full !min-w-0']">
          <thead>
            <tr>
              <th>상품 ID</th>
              <th>도메인</th>
              <th>상품명</th>
              <th>위치/도시</th>
              <th>기본 기준 요금</th>
              <th>판매 상태</th>
              <th class="!text-right">관리</th>
            </tr>
          </thead>
          <tbody class="font-medium">
            <tr v-if="loading">
              <td colspan="7" class="p-8 text-center text-ink-subtle">데이터를 불러오는 중입니다...</td>
            </tr>
            <tr v-else-if="products.length === 0">
              <td colspan="7" class="p-8 text-center text-ink-subtle">등록된 파트너 공급 상품이 없습니다.</td>
            </tr>
            <tr
              v-for="p in products"
              :key="p.id"
              class="transition hover:bg-surface-sunken"
            >
              <td class="font-mono text-ink-subtle">{{ p.id }}</td>
              <td>
                <span class="rounded bg-surface-sunken px-2 py-0.5 text-[10px] font-bold text-ink-muted">
                  {{ p.domain_type }}
                </span>
              </td>
              <td class="max-w-xs truncate font-bold" :title="p.title">
                {{ p.title }}
              </td>
              <td class="text-ink-muted">{{ p.city }}</td>
              <td class="font-bold tabular">
                {{ (p.base_price_krw || 0).toLocaleString() }}원
              </td>
              <td>
                <span
                  :class="[
                    'rounded px-2 py-0.5 text-[10px] font-bold',
                    p.is_active === 1 ? 'bg-success-soft text-success' : 'bg-surface-sunken text-ink-subtle'
                  ]"
                >
                  {{ p.is_active === 1 ? '판매중' : '판매중지' }}
                </span>
              </td>
              <td class="!text-right">
                <div class="flex items-center justify-end gap-1.5">
                  <router-link
                    :to="`/inventory?item=${p.id}`"
                    class="rounded-lg bg-surface-sunken px-2.5 py-1 font-bold text-ink-muted transition hover:text-ink"
                  >
                    재고/가격
                  </router-link>
                  <button type="button" class="rounded-lg bg-surface-sunken px-2.5 py-1 font-bold text-ink-muted transition hover:text-ink" @click="openEdit(p)">수정</button>
                  <button type="button" class="rounded-lg bg-surface-sunken px-2.5 py-1 font-bold text-ink-muted transition hover:text-ink" @click="toggleActive(p)">{{ p.is_active === 1 ? '판매중지' : '판매재개' }}</button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Create Product Modal -->
    <div
      v-if="isModalOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-midnight-950/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="신규 공급 상품 등록"
    >
      <div class="w-full max-w-md space-y-5 rounded-2xl border border-line bg-surface-raised p-6 shadow-pop">
        <div class="flex items-center justify-between border-b border-line pb-3">
          <h3 class="text-base font-black text-ink">신규 공급 상품 등록</h3>
          <button type="button" aria-label="닫기" class="flex h-9 w-9 items-center justify-center rounded-full text-ink-muted hover:bg-surface-sunken" @click="isModalOpen = false"><AppIcon name="close" :size="18" /></button>
        </div>

        <!-- URL Quick Import Box -->
        <div class="space-y-2 rounded-xl border border-primary/25 bg-primary-soft p-3.5 text-xs">
          <div class="flex items-center justify-between font-bold text-ink">
            <span class="inline-flex items-center gap-1.5"><AppIcon name="globe" :size="14" class="text-primary" />외부 상품 URL로 자동 추출</span>
            <span class="text-[10px] font-normal text-ink-subtle">오픈마켓/홈페이지 연동</span>
          </div>
          <div class="flex gap-2">
            <input
              v-model="importUrl"
              type="url"
              placeholder="https://... 외부 상품 URL 입력"
              class="input !min-h-[36px] !text-xs"
            />
            <button
              type="button"
              :disabled="isImporting || !importUrl.trim()"
              class="btn-primary btn-sm shrink-0"
              @click="handleImportUrl"
            >
              {{ isImporting ? '추출중...' : '추출' }}
            </button>
          </div>
          <p v-if="importMessage" :class="['text-[11px] font-medium', importOk ? 'text-success' : 'text-danger']">{{ importMessage }}</p>
        </div>

        <form class="space-y-4 text-xs" @submit.prevent="handleCreateProduct">
          <div v-if="submitError" class="rounded-xl bg-danger-soft px-3.5 py-2.5 font-medium text-danger" role="alert">{{ submitError }}</div>
          <div class="space-y-1">
            <label class="label">카테고리</label>
            <select v-model="newDomain" class="input font-bold">
              <option value="HOTEL">호텔 / 객실</option>
              <option value="CAR">렌터카 차량</option>
              <option value="ACTIVITY">투어 & 티켓</option>
            </select>
          </div>

          <div class="space-y-1">
            <label class="label">상품명 (노출명) *</label>
            <input
              v-model="newTitle"
              type="text"
              required
              placeholder="예: 디럭스 더블룸 (시티뷰 조식포함)"
              class="input font-medium"
            />
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div class="space-y-1">
              <label class="label">도시 / 지역</label>
              <input
                v-model="newCity"
                type="text"
                required
                class="input font-medium"
              />
            </div>
            <div class="space-y-1">
              <label class="label">기본 1박/1일 요금 (KRW)</label>
              <input
                v-model.number="newPrice"
                type="number"
                step="1000"
                required
                class="input font-bold tabular"
              />
            </div>
          </div>

          <div v-if="newDomain === 'HOTEL'" class="space-y-2 rounded-xl border border-line bg-surface-sunken p-3">
            <div class="flex items-center justify-between">
              <span class="label">객실 (1개 이상 필수 · 없으면 견적 불가)</span>
              <button type="button" class="rounded-lg bg-surface px-2 py-1 text-[11px] font-bold text-ink-muted hover:text-ink" @click="newRooms.push(blankRoom())">+ 객실 추가</button>
            </div>
            <div v-for="(r, i) in newRooms" :key="i" class="grid grid-cols-12 items-end gap-2 rounded-lg bg-surface p-2">
              <div class="col-span-12 space-y-1 sm:col-span-4">
                <label class="label">객실명 *</label>
                <input v-model="r.name" type="text" placeholder="예: 디럭스 더블" class="input !min-h-[36px] !text-xs" />
              </div>
              <div class="col-span-4 space-y-1 sm:col-span-3">
                <label class="label">1박 요금</label>
                <input v-model.number="r.price" type="number" min="0" step="1000" class="input !min-h-[36px] !text-xs tabular" />
              </div>
              <div class="col-span-3 space-y-1 sm:col-span-2">
                <label class="label">재고</label>
                <input v-model.number="r.inventory" type="number" min="0" step="1" class="input !min-h-[36px] !text-xs tabular" />
              </div>
              <div class="col-span-3 space-y-1 sm:col-span-2">
                <label class="label">정원</label>
                <input v-model.number="r.occupancy" type="number" min="1" max="10" step="1" class="input !min-h-[36px] !text-xs tabular" />
              </div>
              <div class="col-span-2 sm:col-span-1">
                <button type="button" :disabled="newRooms.length <= 1" class="flex h-9 w-9 items-center justify-center rounded-full text-ink-muted hover:bg-surface-sunken disabled:opacity-30" @click="newRooms.splice(i, 1)" aria-label="객실 삭제"><AppIcon name="close" :size="16" /></button>
              </div>
            </div>
            <p class="text-[11px] text-ink-subtle">재고 0인 객실은 매진으로 표시돼요. 날짜별 재고·마감은 ‘재고/가격’ 메뉴에서 관리하세요.</p>
          </div>

          <div class="flex items-center justify-end gap-2 border-t border-line pt-2">
            <button
              type="button"
              class="btn-secondary btn-sm"
              @click="isModalOpen = false"
            >
              취소
            </button>
            <button
              type="submit"
              :disabled="submitLoading"
              class="btn-primary btn-sm"
            >
              {{ submitLoading ? '등록 중...' : '상품 등록 완료' }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Edit Product Modal -->
    <div
      v-if="editing"
      class="fixed inset-0 z-50 flex items-center justify-center bg-midnight-950/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="상품 정보 수정"
    >
      <div class="w-full max-w-md space-y-5 rounded-2xl border border-line bg-surface-raised p-6 shadow-pop">
        <div class="flex items-center justify-between border-b border-line pb-3">
          <h3 class="text-base font-black text-ink">상품 정보 수정</h3>
          <button type="button" aria-label="닫기" class="flex h-9 w-9 items-center justify-center rounded-full text-ink-muted hover:bg-surface-sunken" @click="editing = null"><AppIcon name="close" :size="18" /></button>
        </div>

        <form class="space-y-4 text-xs" @submit.prevent="saveEdit">
          <div v-if="editError" class="rounded-xl bg-danger-soft px-3.5 py-2.5 font-medium text-danger" role="alert">{{ editError }}</div>
          <div class="space-y-1">
            <label class="label">상품명 (노출명) *</label>
            <input v-model="editTitle" type="text" required class="input font-medium" />
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div class="space-y-1">
              <label class="label">도시 / 지역</label>
              <input v-model="editCity" type="text" class="input font-medium" />
            </div>
            <div class="space-y-1">
              <label class="label">기본 요금 (KRW)</label>
              <input v-model.number="editPrice" type="number" step="1000" min="0" class="input font-bold tabular" />
            </div>
          </div>
          <div v-if="editing && editing.domain_type === 'HOTEL'" class="space-y-2 rounded-xl border border-line bg-surface-sunken p-3">
            <div class="flex items-center justify-between">
              <span class="label">객실 (1개 이상 필수 · 없으면 견적 불가)</span>
              <button type="button" class="rounded-lg bg-surface px-2 py-1 text-[11px] font-bold text-ink-muted hover:text-ink" @click="editRooms.push(blankRoom())">+ 객실 추가</button>
            </div>
            <p v-if="!editRoomsLoaded" class="text-[11px] text-ink-subtle">객실 정보를 불러오는 중…</p>
            <div v-for="(r, i) in editRooms" :key="r.id || i" class="grid grid-cols-12 items-end gap-2 rounded-lg bg-surface p-2">
              <div class="col-span-12 space-y-1 sm:col-span-4">
                <label class="label">객실명 *</label>
                <input v-model="r.name" type="text" class="input !min-h-[36px] !text-xs" />
              </div>
              <div class="col-span-4 space-y-1 sm:col-span-3">
                <label class="label">1박 요금</label>
                <input v-model.number="r.price" type="number" min="0" step="1000" class="input !min-h-[36px] !text-xs tabular" />
              </div>
              <div class="col-span-3 space-y-1 sm:col-span-2">
                <label class="label">재고</label>
                <input v-model.number="r.inventory" type="number" min="0" step="1" class="input !min-h-[36px] !text-xs tabular" />
              </div>
              <div class="col-span-3 space-y-1 sm:col-span-2">
                <label class="label">정원</label>
                <input v-model.number="r.occupancy" type="number" min="1" max="10" step="1" class="input !min-h-[36px] !text-xs tabular" />
              </div>
              <div class="col-span-2 sm:col-span-1">
                <button type="button" :disabled="editRooms.length <= 1" class="flex h-9 w-9 items-center justify-center rounded-full text-ink-muted hover:bg-surface-sunken disabled:opacity-30" @click="editRooms.splice(i, 1)" aria-label="객실 삭제"><AppIcon name="close" :size="16" /></button>
              </div>
            </div>
          </div>
          <label class="flex cursor-pointer items-center gap-2 font-bold text-ink-muted">
            <input v-model="editActive" type="checkbox" class="h-4 w-4 rounded accent-success" />
            <span>판매 중 (끄면 사용자 사이트에서 숨겨져요)</span>
          </label>
          <div class="space-y-1">
            <label class="label">상품 이미지 (최대 10장 · JPEG/PNG/WebP, 장당 8MB 이하)</label>
            <input type="file" accept="image/jpeg,image/png,image/webp" multiple class="input text-xs" :disabled="imgBusy" @change="uploadImages" />
            <p v-if="imgMsg" class="text-[11px] font-bold text-success">{{ imgMsg }}</p>
            <p v-if="imgBusy" class="text-[11px] text-ink-subtle">업로드 중…</p>
          </div>
          <div class="flex items-center justify-end gap-2 border-t border-line pt-2">
            <button type="button" class="btn-secondary btn-sm" @click="editing = null">취소</button>
            <button type="submit" :disabled="editBusy" class="btn-primary btn-sm">{{ editBusy ? '저장 중...' : '수정 완료' }}</button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>
