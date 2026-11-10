<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
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

const route = useRoute()
const currentMonth = ref(new Date().toISOString().slice(0, 7))
const inventory = ref<InventoryItem[]>([])
const loading = ref(false)
const error = ref('')
const products = ref<{ id: string; title: string; domain_type: string }[]>([])
const selectedProduct = ref('')

const selectedDomain = computed(() => products.value.find((p) => p.id === selectedProduct.value)?.domain_type || 'HOTEL')

const selectedDate = ref('')
const selectedAlloc = ref(10)
const selectedPrice = ref(150000)
const selectedClosed = ref(false)
const isModalOpen = ref(false)
const saveLoading = ref(false)
const saveError = ref('')

const fetchProducts = async () => {
  try {
    const token = partnerToken()
    const res = await fetch(apiUrl('/partner/products'), {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (!res.ok) throw new Error('상품 목록을 불러오지 못했습니다.')
    const json = await res.json()
    products.value = (json.products || []).filter((p: any) => p.is_active === 1)
    const fromQuery = String(route.query.item || '')
    if (fromQuery && products.value.some((p) => p.id === fromQuery)) {
      selectedProduct.value = fromQuery
    } else if (!selectedProduct.value && products.value.length) {
      selectedProduct.value = products.value[0].id
    }
  } catch (e: any) {
    error.value = e.message || '상품 목록을 불러오지 못했습니다.'
  }
}

const fetchInventory = async () => {
  if (!selectedProduct.value) return
  loading.value = true
  error.value = ''
  try {
    const token = partnerToken()
    const res = await fetch(apiUrl(`/partner/inventory?month=${currentMonth.value}&itemId=${encodeURIComponent(selectedProduct.value)}`), {
      headers: { Authorization: `Bearer ${token}` }
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

const openEditDateModal = (dateStr: string, existing?: InventoryItem) => {
  selectedDate.value = dateStr
  selectedAlloc.value = existing?.allocated_units ?? 10
  selectedPrice.value = existing?.price_override_minor ?? 150000
  selectedClosed.value = existing?.is_closed === 1
  saveError.value = ''
  isModalOpen.value = true
}

const handleSaveDate = async () => {
  saveLoading.value = true
  saveError.value = ''
  try {
    const token = partnerToken()
    const res = await fetch(apiUrl('/partner/inventory'), {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        domain: selectedDomain.value,
        itemId: selectedProduct.value,
        unitId: 'default',
        serviceDate: selectedDate.value,
        allocatedUnits: selectedAlloc.value,
        priceOverrideMinor: selectedPrice.value,
        isClosed: selectedClosed.value
      })
    })

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

// Real month length (28–31 days), reactive to the month picker.
const daysInMonth = computed(() => {
  const [y, m] = currentMonth.value.split('-').map(Number)
  if (!y || !m) return []
  const len = new Date(y, m, 0).getDate()
  const mm = String(m).padStart(2, '0')
  return Array.from({ length: len }, (_, i) => `${y}-${mm}-${String(i + 1).padStart(2, '0')}`)
})

const getDayData = (dateStr: string) => {
  return inventory.value.find(item => item.service_date === dateStr)
}

onMounted(async () => {
  await fetchProducts()
  await fetchInventory()
})
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-col justify-between gap-4 md:flex-row md:items-center">
      <div>
        <h1 class="flex items-center gap-2 text-2xl font-black tracking-tight text-ink">
          <span>일자별 가격 / 재고 캘린더</span>
        </h1>
        <p class="mt-1 text-sm font-medium text-ink-subtle">
          성수기/주말 요금 차등 적용, 판매 가능 잔여 객실/차량 수량 및 마감 상태를 설정합니다.
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <select
          v-model="selectedProduct"
          aria-label="재고 관리 상품"
          class="input !w-auto !text-xs font-bold shadow-sm"
          @change="fetchInventory"
        >
          <option v-if="!products.length" value="">등록된 상품 없음</option>
          <option v-for="p in products" :key="p.id" :value="p.id">{{ p.title }} ({{ p.domain_type }})</option>
        </select>
        <input
          v-model="currentMonth"
          type="month"
          aria-label="조회 월"
          class="input !w-auto !text-xs font-bold shadow-sm"
          @change="fetchInventory"
        />
        <button
          type="button"
          class="btn-secondary btn-sm !text-xs"
          @click="fetchInventory"
        >
          <AppIcon name="refresh" :size="14" />새로고침
        </button>
      </div>
    </div>

    <div v-if="error" class="rounded-2xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm font-semibold text-danger">
      {{ error }}
      <button type="button" class="ml-2 underline" @click="fetchInventory">다시 시도</button>
    </div>

    <!-- Calendar Grid -->
    <div class="card space-y-4 p-4">
      <p v-if="loading" class="py-8 text-center text-sm font-bold text-ink-subtle">재고 정보를 불러오는 중입니다...</p>
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
            <span class="font-mono text-xs font-black">{{ date.slice(8) }}일</span>
            <span
              v-if="getDayData(date)?.is_closed === 1"
              class="rounded bg-danger-soft px-1.5 py-0.5 text-[9px] font-bold text-danger"
            >
              마감
            </span>
            <span
              v-else
              class="rounded bg-success-soft px-1.5 py-0.5 text-[9px] font-bold text-success"
            >
              잔여 {{ (getDayData(date)?.allocated_units ?? 10) - (getDayData(date)?.booked_units ?? 0) }}실
            </span>
          </div>

          <div class="space-y-0.5">
            <div class="text-[11px] font-black tabular text-primary">
              {{ (getDayData(date)?.price_override_minor ?? 150000).toLocaleString() }}원
            </div>
            <div class="text-[10px] font-medium text-ink-subtle">
              배정 {{ getDayData(date)?.allocated_units ?? 10 }} / 예약 {{ getDayData(date)?.booked_units ?? 0 }}
            </div>
          </div>

          <div class="text-right text-[9px] font-bold text-primary opacity-0 transition group-hover:opacity-100">
            수정 클릭 →
          </div>
        </button>
      </div>
    </div>

    <!-- Edit Date Modal -->
    <div
      v-if="isModalOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-midnight-950/50 p-4"
      role="dialog"
      aria-modal="true"
      :aria-label="`${selectedDate} 요금/재고 설정`"
    >
      <div class="w-full max-w-sm space-y-5 rounded-2xl border border-line bg-surface-raised p-6 shadow-pop">
        <div class="flex items-center justify-between border-b border-line pb-3">
          <h3 class="text-base font-black text-ink">{{ selectedDate }} 요금/재고 설정</h3>
          <button type="button" aria-label="닫기" class="flex h-9 w-9 items-center justify-center rounded-full text-ink-muted hover:bg-surface-sunken" @click="isModalOpen = false"><AppIcon name="close" :size="18" /></button>
        </div>

        <div v-if="saveError" class="rounded-xl bg-danger-soft px-3.5 py-2.5 text-xs font-medium text-danger" role="alert">{{ saveError }}</div>

        <div class="space-y-4 text-xs">
          <div class="space-y-1">
            <label class="label">판매 가능 배정 수량 (Units)</label>
            <input
              v-model.number="selectedAlloc"
              type="number"
              min="0"
              max="100"
              class="input font-bold tabular"
            />
          </div>

          <div class="space-y-1">
            <label class="label">해당 일자 요금 (KRW)</label>
            <input
              v-model.number="selectedPrice"
              type="number"
              step="5000"
              min="0"
              class="input font-black tabular text-primary"
            />
          </div>

          <div class="pt-1">
            <label class="flex cursor-pointer items-center gap-2 font-bold text-ink-muted">
              <input v-model="selectedClosed" type="checkbox" class="h-4 w-4 rounded accent-danger" />
              <span>해당 일자 판매 마감 (예약 차단)</span>
            </label>
          </div>
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
            type="button"
            :disabled="saveLoading"
            class="btn-primary btn-sm"
            @click="handleSaveDate"
          >
            {{ saveLoading ? '반영 중...' : '설정 저장' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
