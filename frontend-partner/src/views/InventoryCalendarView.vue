<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { apiUrl } from '../config/api'

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

const currentMonth = ref(new Date().toISOString().slice(0, 7))
const inventory = ref<InventoryItem[]>([])
const loading = ref(false)

const selectedDate = ref('')
const selectedAlloc = ref(10)
const selectedPrice = ref(150000)
const selectedClosed = ref(false)
const isModalOpen = ref(false)
const saveLoading = ref(false)

const fetchInventory = async () => {
  loading.value = true
  try {
    const token = localStorage.getItem('getfortrip_partner_token')
    const res = await fetch(apiUrl(`/partner/inventory?month=${currentMonth.value}`), {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (res.ok) {
      const json = await res.json()
      inventory.value = json.inventory || []
    }
  } catch (e) {
    console.error('Failed to load inventory', e)
  } finally {
    loading.value = false
  }
}

const openEditDateModal = (dateStr: string, existing?: InventoryItem) => {
  selectedDate.value = dateStr
  selectedAlloc.value = existing?.allocated_units ?? 10
  selectedPrice.value = existing?.price_override_minor ?? 150000
  selectedClosed.value = existing?.is_closed === 1
  isModalOpen.value = true
}

const handleSaveDate = async () => {
  saveLoading.value = true
  try {
    const token = localStorage.getItem('getfortrip_partner_token')
    const res = await fetch(apiUrl('/partner/inventory'), {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        itemId: 'ptn_default_item',
        unitId: 'standard',
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
      const err = await res.json()
      alert(err.error || '저장에 실패했습니다.')
    }
  } catch (e: any) {
    alert(e.message || '오류가 발생했습니다.')
  } finally {
    saveLoading.value = false
  }
}

// Generate 30 days for month view
const daysInMonth = Array.from({ length: 30 }, (_, i) => {
  const dayNum = String(i + 1).padStart(2, '0')
  return `${currentMonth.value}-${dayNum}`
})

const getDayData = (dateStr: string) => {
  return inventory.value.find(item => item.service_date === dateStr)
}

onMounted(() => {
  fetchInventory()
})
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div>
        <h1 class="text-2xl font-black tracking-tight text-slate-900 flex items-center gap-2">
          <span>일자별 가격 / 재고 캘린더</span>
        </h1>
        <p class="text-sm text-slate-500 font-medium mt-1">
          성수기/주말 요금 차등 적용, 판매 가능 잔여 객실/차량 수량 및 마감 상태를 설정합니다.
        </p>
      </div>
      <div class="flex items-center gap-2">
        <input
          v-model="currentMonth"
          @change="fetchInventory"
          type="month"
          class="px-3 py-1.5 bg-white border border-slate-200 text-xs font-bold rounded-xl shadow-sm outline-none"
        />
        <button
          @click="fetchInventory"
          class="px-3.5 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl shadow-sm transition"
        >
          새로고침
        </button>
      </div>
    </div>

    <!-- Calendar Grid -->
    <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-4">
      <div class="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-3">
        <div
          v-for="date in daysInMonth"
          :key="date"
          @click="openEditDateModal(date, getDayData(date))"
          :class="[
            getDayData(date)?.is_closed === 1
              ? 'bg-rose-50/50 border-rose-200 text-slate-400'
              : 'bg-slate-50 border-slate-200 hover:border-blue-500 hover:bg-blue-50/20 text-slate-800',
            'p-3 rounded-2xl border cursor-pointer transition space-y-2 relative group shadow-sm'
          ]"
        >
          <div class="flex items-center justify-between">
            <span class="text-xs font-black font-mono">{{ date.slice(8) }}일</span>
            <span
              v-if="getDayData(date)?.is_closed === 1"
              class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-rose-100 text-rose-700"
            >
              마감
            </span>
            <span
              v-else
              class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700"
            >
              잔여 {{ (getDayData(date)?.allocated_units ?? 10) - (getDayData(date)?.booked_units ?? 0) }}실
            </span>
          </div>

          <div class="space-y-0.5 text-left">
            <div class="text-[11px] font-black text-blue-600">
              {{ (getDayData(date)?.price_override_minor ?? 150000).toLocaleString() }}원
            </div>
            <div class="text-[10px] text-slate-400 font-medium">
              배정 {{ getDayData(date)?.allocated_units ?? 10 }} / 예약 {{ getDayData(date)?.booked_units ?? 0 }}
            </div>
          </div>

          <div class="text-[9px] text-blue-600 font-bold opacity-0 group-hover:opacity-100 transition text-right">
            수정 클릭 →
          </div>
        </div>
      </div>
    </div>

    <!-- Edit Date Modal -->
    <div
      v-if="isModalOpen"
      class="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
    >
      <div class="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-100 space-y-5">
        <div class="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 class="text-base font-black text-slate-900">{{ selectedDate }} 요금/재고 설정</h3>
          <button @click="isModalOpen = false" class="text-slate-400 hover:text-slate-600 font-bold text-sm">✕</button>
        </div>

        <div class="space-y-4 text-xs">
          <div class="space-y-1">
            <label class="font-bold text-slate-700">판매 가능 배정 수량 (Units)</label>
            <input
              v-model.number="selectedAlloc"
              type="number"
              min="0"
              max="100"
              class="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl font-bold text-slate-900 outline-none"
            />
          </div>

          <div class="space-y-1">
            <label class="font-bold text-slate-700">해당 일자 요금 (KRW)</label>
            <input
              v-model.number="selectedPrice"
              type="number"
              step="5000"
              min="10000"
              class="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl font-black text-blue-600 outline-none"
            />
          </div>

          <div class="pt-1">
            <label class="flex items-center gap-2 cursor-pointer font-bold text-slate-700">
              <input type="checkbox" v-model="selectedClosed" class="rounded text-rose-600" />
              <span>해당 일자 판매 마감 (예약 차단)</span>
            </label>
          </div>
        </div>

        <div class="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
          <button
            type="button"
            @click="isModalOpen = false"
            class="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl font-bold text-xs"
          >
            취소
          </button>
          <button
            type="button"
            @click="handleSaveDate"
            :disabled="saveLoading"
            class="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black text-xs shadow-md shadow-blue-500/25 disabled:opacity-50"
          >
            {{ saveLoading ? '반영 중...' : '설정 저장' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

