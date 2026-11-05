<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { apiUrl } from '../config/api'

interface OrderRow {
  id: string
  booking_number: string
  domain_type: string
  title: string
  status: string
  total_minor: number
  currency: string
  customerNameMasked: string
  service_start: string
  service_end: string
  created_at: string
}

const orders = ref<OrderRow[]>([])
const loading = ref(false)
const filterStatus = ref('ALL')
const searchQuery = ref('')
const actionLoading = ref(false)

const filteredOrders = computed(() => {
  return orders.value.filter(o => {
    const matchStatus = filterStatus.value === 'ALL' || o.status === filterStatus.value
    const matchQuery = !searchQuery.value ||
      (o.booking_number && o.booking_number.toLowerCase().includes(searchQuery.value.toLowerCase())) ||
      (o.title && o.title.toLowerCase().includes(searchQuery.value.toLowerCase()))
    return matchStatus && matchQuery
  })
})

const fetchOrders = async () => {
  loading.value = true
  try {
    const token = localStorage.getItem('getfortrip_partner_token')
    const res = await fetch(apiUrl('/partner/orders'), {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (res.ok) {
      const json = await res.json()
      orders.value = json.orders || []
    }
  } catch (e) {
    console.error('Failed to load orders', e)
  } finally {
    loading.value = false
  }
}

const handleOrderAction = async (orderId: string, action: 'confirm' | 'reject') => {
  const confirmMsg = action === 'confirm' ? '해당 예약을 확정하시겠습니까?' : '해당 예약을 거절/취소 처리하시겠습니까?'
  if (!confirm(confirmMsg)) return

  actionLoading.value = true
  try {
    const token = localStorage.getItem('getfortrip_partner_token')
    const res = await fetch(apiUrl(`/partner/orders/${orderId}/${action}`), {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    })
    if (res.ok) {
      await fetchOrders()
    } else {
      const err = await res.json()
      alert(err.error || '처리에 실패했습니다.')
    }
  } catch (e: any) {
    alert(e.message || '오류가 발생했습니다.')
  } finally {
    actionLoading.value = false
  }
}

onMounted(() => {
  fetchOrders()
})
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div>
        <h1 class="text-2xl font-black tracking-tight text-slate-900 flex items-center gap-2">
          <span>주문 / 예약 접수 관리</span>
          <span class="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
            {{ orders.length }}건 접수
          </span>
        </h1>
        <p class="text-sm text-slate-500 font-medium mt-1">
          접수된 고객 예약의 실재고 확인 후 확정 처리 또는 취소 거절 처리를 수행합니다.
        </p>
      </div>
      <div>
        <button
          @click="fetchOrders"
          class="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl shadow-sm transition flex items-center gap-1.5"
        >
          <span>🔄</span>
          <span>새로고침</span>
        </button>
      </div>
    </div>

    <!-- Filters & Search -->
    <div class="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4 justify-between">
      <div class="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0">
        <button
          v-for="st in [
            { id: 'ALL', label: '전체 주문' },
            { id: 'AWAITING_PAYMENT', label: '결제 대기' },
            { id: 'CONFIRMED', label: '확정 완료 ✅' },
            { id: 'CANCELLED', label: '취소/환불 ❌' }
          ]"
          :key="st.id"
          @click="filterStatus = st.id"
          :class="[
            filterStatus === st.id
              ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
            'px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex-shrink-0'
          ]"
        >
          {{ st.label }}
        </button>
      </div>

      <div class="relative w-full md:w-72">
        <input
          v-model="searchQuery"
          type="text"
          placeholder="예약번호, 상품명 검색..."
          class="w-full pl-9 pr-3 py-2 text-xs font-medium border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
        />
        <span class="absolute left-3 top-2.5 text-xs text-slate-400">🔍</span>
      </div>
    </div>

    <!-- Order Table -->
    <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse text-xs">
          <thead>
            <tr class="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider">
              <th class="p-3.5">예약 번호</th>
              <th class="p-3.5">상품명</th>
              <th class="p-3.5">이용 기간</th>
              <th class="p-3.5">예약자명 (마스킹)</th>
              <th class="p-3.5">결제 금액</th>
              <th class="p-3.5">상태</th>
              <th class="p-3.5 text-right">주문 처리</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 font-medium">
            <tr v-if="loading">
              <td colspan="7" class="p-8 text-center text-slate-400 font-bold">
                주문 목록을 불러오는 중입니다...
              </td>
            </tr>
            <tr v-else-if="filteredOrders.length === 0">
              <td colspan="7" class="p-8 text-center text-slate-400 font-bold">
                일치하는 예약 주문이 없습니다.
              </td>
            </tr>
            <tr
              v-else
              v-for="o in filteredOrders"
              :key="o.id"
              class="hover:bg-slate-50/80 transition"
            >
              <td class="p-3.5 font-mono font-bold text-slate-700">{{ o.booking_number || o.id }}</td>
              <td class="p-3.5 font-bold text-slate-900">{{ o.title }}</td>
              <td class="p-3.5 text-slate-500">
                {{ o.service_start || '-' }} <span v-if="o.service_end">~ {{ o.service_end }}</span>
              </td>
              <td class="p-3.5 font-bold text-slate-700">{{ o.customerNameMasked || '김**' }}</td>
              <td class="p-3.5 font-bold text-blue-600">{{ (o.total_minor || 0).toLocaleString() }}원</td>
              <td class="p-3.5">
                <span
                  :class="[
                    o.status === 'CONFIRMED' ? 'bg-emerald-100 text-emerald-800' :
                    o.status === 'CANCELLED' ? 'bg-rose-100 text-rose-800' :
                    'bg-amber-100 text-amber-800',
                    'px-2 py-0.5 rounded-full text-[10px] font-bold'
                  ]"
                >
                  {{ o.status }}
                </span>
              </td>
              <td class="p-3.5 text-right space-x-1.5">
                <button
                  v-if="o.status !== 'CONFIRMED' && o.status !== 'CANCELLED'"
                  @click="handleOrderAction(o.id, 'confirm')"
                  :disabled="actionLoading"
                  class="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-[11px] shadow-sm transition disabled:opacity-50"
                >
                  예약 확정
                </button>
                <button
                  v-if="o.status !== 'CANCELLED'"
                  @click="handleOrderAction(o.id, 'reject')"
                  :disabled="actionLoading"
                  class="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg font-bold text-[11px] transition disabled:opacity-50"
                >
                  취소 거절
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
