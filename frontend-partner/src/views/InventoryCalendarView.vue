<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'
import { apiUrl, partnerToken } from '../config/api'

interface InventoryItem {
  id: string
  item_id: string
  unit_id: string
  service_date: string
  allocated_units: number
  booked_units: number
  price_override_minor: number | null
  is_closed: number
}

interface RoomOption { id: string; name_ko?: string; name?: string; base_price_krw?: number }
interface SlotRow { startTime: string; endTime: string; capacity: number; priceAdult: number; priceChild: number; closed: boolean }

const route = useRoute()
const currentMonth = ref(new Date().toISOString().slice(0, 7))
const inventory = ref<InventoryItem[]>([])
const loading = ref(false)
const error = ref('')
const notice = ref('')
const products = ref<{ id: string; title: string; domain_type: string; base_price_krw?: number | null; is_active?: number; rooms?: RoomOption[] }[]>([])
const selectedProduct = ref('')
const rooms = ref<RoomOption[]>([])
const selectedUnitId = ref('default')

const activeProductObj = computed(() => products.value.find((p) => p.id === selectedProduct.value) || null)
const selectedDomain = computed(() => activeProductObj.value?.domain_type || 'HOTEL')
const basePriceKrw = computed(() => {
  const roomObj = rooms.value.find((r) => r.id === selectedUnitId.value)
  const rn = Number(roomObj?.base_price_krw)
  if (Number.isFinite(rn) && rn > 0) return rn
  const n = Number(activeProductObj.value?.base_price_krw)
  return Number.isFinite(n) && n > 0 ? n : null
})

// Single-day modal state
const selectedDate = ref('')
const selectedAlloc = ref<number | string>(10)
const selectedPrice = ref<number | string>('')
const selectedClosed = ref(false)
const isModalOpen = ref(false)
const saveLoading = ref(false)
const saveError = ref('')

// Bulk date-range modal state
const bulkOpen = ref(false)
const bulkStart = ref('')
const bulkEnd = ref('')
const bulkDays = ref<number[]>([0, 1, 2, 3, 4, 5, 6])
const bulkAlloc = ref<number | string>(10)
const bulkPrice = ref<number | string>('')
const bulkClosed = ref(false)
const bulkBusy = ref(false)
const bulkError = ref('')
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

// Activity time-slots manager state
const slotDate = ref(new Date().toISOString().slice(0, 10))
const slots = ref<SlotRow[]>([
  { startTime: '09:00', endTime: '12:00', capacity: 20, priceAdult: 50000, priceChild: 30000, closed: false },
  { startTime: '14:00', endTime: '17:00', capacity: 20, priceAdult: 50000, priceChild: 30000, closed: false },
])
const slotBusy = ref(false)
const slotMsg = ref('')

const authHeaders = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${partnerToken()}` })

const fetchRoomsForSelected = async () => {
  rooms.value = []
  selectedUnitId.value = 'default'
  if (!selectedProduct.value || selectedDomain.value !== 'HOTEL') return
  try {
    const res = await fetch(apiUrl(`/hotels/${encodeURIComponent(selectedProduct.value)}`), { credentials: 'include' })
    if (res.ok) {
      const j = await res.json()
      const list = Array.isArray(j.data?.rooms) ? j.data.rooms : []
      rooms.value = list
    }
  } catch { /* fallback to default unit */ }
}

const fetchProducts = async () => {
  try {
    const res = await fetch(apiUrl('/partner/products'), { credentials: 'include', headers: { Authorization: `Bearer ${partnerToken()}` } })
    if (!res.ok) throw new Error('상품 목록을 불러오지 못했습니다.')
    const json = await res.json()
    products.value = json.products || []
    const fromQuery = String(route.query.item || '')
    if (fromQuery && products.value.some((p) => p.id === fromQuery)) {
      selectedProduct.value = fromQuery
    } else if (!selectedProduct.value && products.value.length) {
      const firstActive = products.value.find((p) => p.is_active === 1)
      selectedProduct.value = (firstActive || products.value[0]).id
    }
    await fetchRoomsForSelected()
  } catch (e: any) {
    error.value = e.message || '상품 목록을 불러오지 못했습니다.'
  }
}

const fetchInventory = async () => {
  if (!selectedProduct.value) return
  loading.value = true
  error.value = ''
  try {
    const res = await fetch(apiUrl(`/partner/inventory?month=${currentMonth.value}&itemId=${encodeURIComponent(selectedProduct.value)}`), {
      credentials: 'include',
      headers: { Authorization: `Bearer ${partnerToken()}` }
    })
    if (!res.ok) throw new Error('재고 정보를 불러오지 못했습니다.')
    const json = await res.json()
    inventory.value = json.inventory || []
  } catch (e: any) {
    error.value = e.message || '재고 정보를 불러오지 못했습니다.'
  } finally {
    loading.value = false
  }
}

const onProductChange = async () => {
  notice.value = ''
  await fetchRoomsForSelected()
  await fetchInventory()
}

const openEditDateModal = (dateStr: string, existing?: InventoryItem) => {
  if (!selectedProduct.value) return
  selectedDate.value = dateStr
  selectedAlloc.value = existing?.allocated_units ?? 10
  selectedPrice.value = existing?.price_override_minor ?? ''
  selectedClosed.value = existing?.is_closed === 1
  saveError.value = ''
  isModalOpen.value = true
}

const handleSaveDate = async () => {
  if (!selectedProduct.value || saveLoading.value) return
  saveError.value = ''
  const rawAlloc = String(selectedAlloc.value ?? '').trim()
  const allocNum = rawAlloc === '' ? NaN : Number(rawAlloc)
  if (!Number.isInteger(allocNum) || allocNum < 0) {
    saveError.value = '배정 수량은 0 이상의 정수로 입력해 주세요.'
    return
  }
  const rawPrice = String(selectedPrice.value ?? '').trim()
  let priceOverride: number | null = null
  if (rawPrice !== '') {
    const pNum = Number(rawPrice)
    if (!Number.isInteger(pNum) || pNum < 0) {
      saveError.value = '요금은 0 이상의 정수로 입력하거나 비워두어 기본가를 유지해 주세요.'
      return
    }
    priceOverride = pNum
  }
  saveLoading.value = true
  try {
    const payload: Record<string, unknown> = {
      domain: selectedDomain.value,
      itemId: selectedProduct.value,
      unitId: selectedUnitId.value || 'default',
      serviceDate: selectedDate.value,
      allocatedUnits: allocNum,
      isClosed: selectedClosed.value
    }
    if (priceOverride !== null) payload.priceOverrideMinor = priceOverride
    const res = await fetch(apiUrl('/partner/inventory'), { credentials: 'include', method: 'PUT', headers: authHeaders(), body: JSON.stringify(payload) })
    if (res.ok) {
      isModalOpen.value = false
      await fetchInventory()
    } else {
      const err = await res.json().catch(() => ({}))
      saveError.value = err.error || '저장에 실패했습니다.'
    }
  } catch (e: any) {
    saveError.value = e.message || '오류가 발생했습니다.'
  } finally {
    saveLoading.value = false
  }
}

const openBulkModal = () => {
  const days = daysInMonth.value
  bulkStart.value = days[0] || ''
  bulkEnd.value = days[days.length - 1] || ''
  bulkDays.value = [0, 1, 2, 3, 4, 5, 6]
  bulkAlloc.value = 10
  bulkPrice.value = ''
  bulkClosed.value = false
  bulkError.value = ''
  bulkOpen.value = true
}

const toggleBulkDay = (d: number) => {
  bulkDays.value = bulkDays.value.includes(d) ? bulkDays.value.filter((x) => x !== d) : [...bulkDays.value, d]
}

const handleSaveBulk = async () => {
  if (!selectedProduct.value || bulkBusy.value) return
  bulkError.value = ''
  if (!bulkStart.value || !bulkEnd.value || bulkEnd.value < bulkStart.value) {
    bulkError.value = '시작일과 종료일을 올바르게 입력해 주세요.'
    return
  }
  const allocNum = Number(bulkAlloc.value)
  if (!Number.isInteger(allocNum) || allocNum < 0) {
    bulkError.value = '배정 수량은 0 이상의 정수로 입력해 주세요.'
    return
  }
  const rawPrice = String(bulkPrice.value ?? '').trim()
  let priceOverride: number | null = null
  if (rawPrice !== '') {
    const pNum = Number(rawPrice)
    if (!Number.isInteger(pNum) || pNum < 0) { bulkError.value = '요금은 0 이상의 정수로 입력해 주세요.'; return }
    priceOverride = pNum
  }
  const targets: string[] = []
  const cur = new Date(`${bulkStart.value}T00:00:00Z`)
  const end = new Date(`${bulkEnd.value}T00:00:00Z`)
  while (cur <= end && targets.length < 62) {
    if (bulkDays.value.includes(cur.getUTCDay())) targets.push(cur.toISOString().slice(0, 10))
    cur.setUTCDate(cur.getUTCDate() + 1)
  }
  if (!targets.length) { bulkError.value = '선택된 요일에 해당하는 날짜가 없습니다.'; return }
  bulkBusy.value = true
  try {
    let okCount = 0
    for (const d of targets) {
      const payload: Record<string, unknown> = {
        domain: selectedDomain.value,
        itemId: selectedProduct.value,
        unitId: selectedUnitId.value || 'default',
        serviceDate: d,
        allocatedUnits: allocNum,
        isClosed: bulkClosed.value,
        ...(priceOverride !== null ? { priceOverrideMinor: priceOverride } : {}),
      }
      const res = await fetch(apiUrl('/partner/inventory'), { credentials: 'include', method: 'PUT', headers: authHeaders(), body: JSON.stringify(payload) })
      if (res.ok) okCount++
    }
    bulkOpen.value = false
    notice.value = `${okCount}일치 요금·재고를 일괄 반영했습니다.`
    await fetchInventory()
  } catch (e: any) {
    bulkError.value = e.message || '일괄 저장 중 오류가 발생했습니다.'
  } finally {
    bulkBusy.value = false
  }
}

const addSlotRow = () => {
  if (slots.value.length >= 24) return
  slots.value.push({ startTime: '10:00', endTime: '12:00', capacity: 15, priceAdult: basePriceKrw.value || 40000, priceChild: Math.round((basePriceKrw.value || 40000) * 0.7), closed: false })
}
const removeSlotRow = (idx: number) => {
  if (slots.value.length > 1) slots.value.splice(idx, 1)
}
const saveActivitySlots = async () => {
  if (!selectedProduct.value || selectedDomain.value !== 'ACTIVITY' || slotBusy.value) return
  slotBusy.value = true
  slotMsg.value = ''
  try {
    const res = await fetch(apiUrl(`/partner/activities/${encodeURIComponent(selectedProduct.value)}/slots`), {
      credentials: 'include',
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({
        date: slotDate.value,
        slots: slots.value.map((s) => ({
          startTime: s.startTime,
          endTime: s.endTime || null,
          capacity: Number(s.capacity) || 1,
          priceAdult: Number(s.priceAdult) || 0,
          priceChild: Number(s.priceChild) || 0,
          closed: Boolean(s.closed),
        })),
      }),
    })
    const j = await res.json().catch(() => ({}))
    slotMsg.value = res.ok ? `${slotDate.value} 회차 ${j.upserted || slots.value.length}개를 저장했습니다.` : (j.error || '회차 저장에 실패했습니다.')
  } finally {
    slotBusy.value = false
  }
}

const daysInMonth = computed(() => {
  const [y, m] = currentMonth.value.split('-').map(Number)
  if (!y || !m) return []
  const len = new Date(y, m, 0).getDate()
  const mm = String(m).padStart(2, '0')
  return Array.from({ length: len }, (_, i) => `${y}-${mm}-${String(i + 1).padStart(2, '0')}`)
})

const getDayData = (dateStr: string) => {
  const targetUnit = selectedUnitId.value || 'default'
  return inventory.value.find(item => item.service_date === dateStr && item.unit_id === targetUnit)
    || (targetUnit === 'default' ? inventory.value.find(item => item.service_date === dateStr) : undefined)
}

const onKey = (e: KeyboardEvent) => {
  if (e.key === 'Escape') { isModalOpen.value = false; bulkOpen.value = false }
}

onMounted(async () => {
  window.addEventListener('keydown', onKey)
  await fetchProducts()
  await fetchInventory()
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-col justify-between gap-4 md:flex-row md:items-center">
      <div>
        <h1 class="font-display text-2xl font-extrabold tracking-tight text-ink">
          일자별 가격 / 재고 캘린더
        </h1>
        <p class="mt-1 text-sm font-medium text-ink-subtle">
          객실별 차등 요금, 기간 일괄 반영, 판매 마감 및 투어 회차(Time Slot)를 관리합니다.
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <select v-model="selectedProduct" aria-label="재고 관리 상품" class="input !w-auto !text-xs font-bold shadow-sm" @change="onProductChange">
          <option v-if="!products.length" value="">등록된 상품 없음</option>
          <option v-for="p in products" :key="p.id" :value="p.id">{{ p.title }} ({{ p.domain_type }})</option>
        </select>
        <select v-if="selectedDomain === 'HOTEL' && rooms.length" v-model="selectedUnitId" aria-label="객실 타입" class="input !w-auto !text-xs font-bold shadow-sm">
          <option value="default">전체 기본 (default)</option>
          <option v-for="rm in rooms" :key="rm.id" :value="rm.id">{{ rm.name_ko || rm.name || rm.id }}</option>
        </select>
        <input v-model="currentMonth" type="month" aria-label="조회 월" class="input !w-auto !text-xs font-bold shadow-sm" @change="fetchInventory" />
        <button v-if="selectedProduct" type="button" class="btn-primary btn-sm !text-xs" @click="openBulkModal">기간 일괄 설정</button>
        <button type="button" class="btn-secondary btn-sm !text-xs" @click="fetchInventory"><AppIcon name="refresh" :size="14" />새로고침</button>
      </div>
    </div>

    <div v-if="notice" class="rounded-2xl border border-success/30 bg-success-soft px-4 py-3 text-sm font-semibold text-success">{{ notice }}</div>
    <div v-if="error" class="rounded-2xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm font-semibold text-danger">
      {{ error }} <button type="button" class="ml-2 underline" @click="fetchInventory">다시 시도</button>
    </div>

    <!-- Calendar Grid -->
    <div class="card space-y-4 p-4">
      <p v-if="loading" class="py-8 text-center text-sm font-bold text-ink-subtle">재고 정보를 불러오는 중입니다...</p>
      <p v-else-if="!selectedProduct" class="py-8 text-center text-sm font-bold text-ink-subtle">등록된 상품이 없습니다. 먼저 공급 상품을 등록해 주세요.</p>
      <div v-else class="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-7">
        <button
          v-for="date in daysInMonth"
          :key="date"
          type="button"
          :aria-label="`${date} 요금/재고 설정`"
          class="group relative space-y-2 rounded-2xl border p-3 text-left shadow-card transition"
          :class="getDayData(date)?.is_closed === 1
            ? 'border-danger/30 bg-danger-soft text-ink-subtle'
            : 'border-line bg-surface-sunken text-ink hover:border-primary hover:bg-primary-soft/40'"
          @click="openEditDateModal(date, getDayData(date))"
        >
          <div class="flex items-center justify-between">
            <span class="font-mono text-xs font-extrabold">{{ date.slice(8) }}일</span>
            <span v-if="getDayData(date)?.is_closed === 1" class="rounded bg-danger-soft px-1.5 py-0.5 text-[9px] font-bold text-danger">마감</span>
            <span v-else class="rounded bg-success-soft px-1.5 py-0.5 text-[9px] font-bold text-success">
              잔여 {{ (getDayData(date)?.allocated_units ?? 10) - (getDayData(date)?.booked_units ?? 0) }}
            </span>
          </div>
          <div class="space-y-0.5">
            <div class="text-[11px] font-extrabold tabular text-primary">
              <template v-if="getDayData(date)?.price_override_minor != null">{{ Number(getDayData(date)!.price_override_minor).toLocaleString() }}원</template>
              <template v-else-if="basePriceKrw != null">{{ basePriceKrw.toLocaleString() }}원 <span class="font-medium text-ink-subtle">(기본)</span></template>
              <template v-else>기본가</template>
            </div>
            <div class="text-[10px] font-medium text-ink-subtle">
              배정 {{ getDayData(date)?.allocated_units ?? 10 }} / 예약 {{ getDayData(date)?.booked_units ?? 0 }}
            </div>
          </div>
        </button>
      </div>
    </div>

    <!-- Activity Time Slots Manager -->
    <section v-if="selectedProduct && selectedDomain === 'ACTIVITY'" class="card space-y-4 p-5">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 class="text-base font-extrabold text-ink">투어·체험 회차별(Time Slot) 정원 및 요금</h2>
          <p class="text-xs text-ink-subtle">등록한 회차는 사용자 상품 상세 페이지에 즉시 노출됩니다.</p>
        </div>
        <div class="flex items-center gap-2">
          <input v-model="slotDate" type="date" class="input !w-auto !text-xs font-bold" />
          <button type="button" class="btn-secondary btn-sm" @click="addSlotRow">+ 회차 추가</button>
          <button type="button" class="btn-primary btn-sm" :disabled="slotBusy" @click="saveActivitySlots">{{ slotBusy ? '저장 중...' : '회차 저장' }}</button>
        </div>
      </div>
      <div class="space-y-2">
        <div v-for="(s, idx) in slots" :key="idx" class="grid grid-cols-2 items-end gap-2 rounded-xl bg-surface-sunken p-3 sm:grid-cols-6">
          <label class="text-xs"><span class="label">시작</span><input v-model="s.startTime" type="time" class="input !text-xs" /></label>
          <label class="text-xs"><span class="label">종료</span><input v-model="s.endTime" type="time" class="input !text-xs" /></label>
          <label class="text-xs"><span class="label">정원</span><input v-model.number="s.capacity" type="number" min="1" class="input !text-xs tabular" /></label>
          <label class="text-xs"><span class="label">성인(원)</span><input v-model.number="s.priceAdult" type="number" min="0" step="1000" class="input !text-xs tabular" /></label>
          <label class="text-xs"><span class="label">아동(원)</span><input v-model.number="s.priceChild" type="number" min="0" step="1000" class="input !text-xs tabular" /></label>
          <div class="flex items-center justify-between gap-2 pb-1.5">
            <label class="flex items-center gap-1 text-xs font-semibold"><input v-model="s.closed" type="checkbox" class="accent-danger" /> 마감</label>
            <button v-if="slots.length > 1" type="button" class="text-xs font-bold text-danger hover:underline" @click="removeSlotRow(idx)">삭제</button>
          </div>
        </div>
      </div>
      <p v-if="slotMsg" class="text-xs font-bold text-primary">{{ slotMsg }}</p>
    </section>

    <!-- Single-Day Edit Modal -->
    <div v-if="isModalOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-midnight-950/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" :aria-label="`${selectedDate} 요금/재고 설정`" @click.self="isModalOpen = false">
      <div class="w-full max-w-sm space-y-5 rounded-2xl border border-line bg-surface-raised p-6 shadow-pop animate-pop-in">
        <div class="flex items-center justify-between border-b border-line pb-3">
          <h3 class="text-base font-extrabold text-ink">{{ selectedDate }} 요금/재고 설정</h3>
          <button type="button" aria-label="닫기" class="flex h-9 w-9 items-center justify-center rounded-full text-ink-muted hover:bg-surface-sunken" @click="isModalOpen = false"><AppIcon name="close" :size="18" /></button>
        </div>
        <div v-if="saveError" class="rounded-xl bg-danger-soft px-3.5 py-2.5 text-xs font-medium text-danger" role="alert">{{ saveError }}</div>
        <div class="space-y-4 text-xs">
          <div class="space-y-1">
            <label class="label">판매 가능 배정 수량 (Units)</label>
            <input v-model.number="selectedAlloc" type="number" min="0" max="500" class="input font-bold tabular" />
          </div>
          <div class="space-y-1">
            <label class="label">특별 요금 (KRW · 비워두면 기본가 유지)</label>
            <input v-model="selectedPrice" type="number" step="1000" min="0" :placeholder="basePriceKrw != null ? `기본가 ${basePriceKrw.toLocaleString()}원` : '기본가 유지'" class="input font-extrabold tabular text-primary" />
          </div>
          <label class="flex cursor-pointer items-center gap-2 font-bold text-ink-muted">
            <input v-model="selectedClosed" type="checkbox" class="h-4 w-4 rounded accent-danger" />
            <span>해당 일자 판매 마감 (예약 차단)</span>
          </label>
        </div>
        <div class="flex items-center justify-end gap-2 border-t border-line pt-2">
          <button type="button" class="btn-secondary btn-sm" @click="isModalOpen = false">취소</button>
          <button type="button" :disabled="saveLoading" class="btn-primary btn-sm" @click="handleSaveDate">{{ saveLoading ? '반영 중...' : '설정 저장' }}</button>
        </div>
      </div>
    </div>

    <!-- Bulk Date-Range Modal -->
    <div v-if="bulkOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-midnight-950/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="기간 일괄 요금/재고 설정" @click.self="bulkOpen = false">
      <div class="w-full max-w-md space-y-4 rounded-2xl border border-line bg-surface-raised p-6 shadow-pop animate-pop-in">
        <div class="flex items-center justify-between border-b border-line pb-3">
          <h3 class="text-base font-extrabold text-ink">기간 일괄 요금·재고 설정</h3>
          <button type="button" aria-label="닫기" class="flex h-9 w-9 items-center justify-center rounded-full text-ink-muted hover:bg-surface-sunken" @click="bulkOpen = false"><AppIcon name="close" :size="18" /></button>
        </div>
        <div v-if="bulkError" class="rounded-xl bg-danger-soft px-3.5 py-2.5 text-xs font-medium text-danger" role="alert">{{ bulkError }}</div>
        <div class="grid grid-cols-2 gap-3 text-xs">
          <label><span class="label">시작일</span><input v-model="bulkStart" type="date" class="input" /></label>
          <label><span class="label">종료일</span><input v-model="bulkEnd" type="date" class="input" /></label>
        </div>
        <div>
          <span class="label">적용 요일</span>
          <div class="flex flex-wrap gap-1.5">
            <button v-for="(w, idx) in WEEKDAYS" :key="w" type="button" class="chip !px-2.5 !py-1" :aria-pressed="bulkDays.includes(idx)" @click="toggleBulkDay(idx)">{{ w }}</button>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3 text-xs">
          <label><span class="label">배정 수량</span><input v-model.number="bulkAlloc" type="number" min="0" max="500" class="input tabular" /></label>
          <label><span class="label">특별 요금 (비우면 기본가)</span><input v-model="bulkPrice" type="number" min="0" step="1000" class="input tabular" placeholder="기본가 유지" /></label>
        </div>
        <label class="flex cursor-pointer items-center gap-2 text-xs font-bold text-ink-muted">
          <input v-model="bulkClosed" type="checkbox" class="h-4 w-4 accent-danger" />
          <span>선택 기간 판매 마감</span>
        </label>
        <div class="flex items-center justify-end gap-2 border-t border-line pt-2">
          <button type="button" class="btn-secondary btn-sm" @click="bulkOpen = false">취소</button>
          <button type="button" :disabled="bulkBusy" class="btn-primary btn-sm" @click="handleSaveBulk">{{ bulkBusy ? '일괄 반영 중...' : '일괄 적용' }}</button>
        </div>
      </div>
    </div>
  </div>
</template>
