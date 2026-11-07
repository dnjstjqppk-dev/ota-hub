<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { apiUrl, partnerToken } from '../config/api'
import PageNav from '../components/PageNav.vue'

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

const STATUS_GROUPS = [
  { id: 'ALL', label: '전체 주문', statuses: [] as string[] },
  { id: 'AWAITING', label: '결제 대기', statuses: ['AWAITING_PAYMENT'] },
  { id: 'ACTIONABLE', label: '확정 대기', statuses: ['SUPPLIER_BOOKING_PENDING', 'PAYMENT_AUTHORIZED'] },
  { id: 'DONE', label: '확정 완료', statuses: ['SUPPLIER_CONFIRMED', 'VOUCHER_ISSUED', 'TICKETED'] },
  { id: 'DEAD', label: '취소·환불', statuses: ['CANCELLED', 'REFUNDED', 'FAILED', 'EXPIRED', 'REFUND_PENDING', 'CANCELLATION_REQUESTED'] }
]

const TERMINAL = new Set(['SUPPLIER_CONFIRMED', 'VOUCHER_ISSUED', 'TICKETED', 'CANCELLED', 'REFUNDED', 'FAILED', 'EXPIRED', 'REFUND_PENDING', 'CANCELLATION_REQUESTED'])

const orders = ref<OrderRow[]>([])
const loading = ref(false)
const error = ref('')
const filterStatus = ref<string>('ALL')
const searchQuery = ref('')
const debouncedQuery = ref('')
const page = ref(1)
const total = ref(0)
const totalPages = ref(1)
const actionLoading = ref('')
const actionError = ref('')

let searchTimer: ReturnType<typeof setTimeout> | null = null
watch(searchQuery, (v) => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    debouncedQuery.value = v.trim()
    page.value = 1
    fetchOrders()
  }, 400)
})

function setFilter(id: string) {
  filterStatus.value = id
  page.value = 1
  fetchOrders()
}

function go(p: number) {
  page.value = p
  fetchOrders()
}

const actionable = (o: OrderRow) => !TERMINAL.has(o.status)

function badge(status: string) {
  if (['SUPPLIER_CONFIRMED', 'VOUCHER_ISSUED', 'TICKETED'].includes(status)) return 'bg-success-soft text-success'
  if (['CANCELLED', 'REFUNDED', 'FAILED', 'EXPIRED'].includes(status)) return 'bg-surface-sunken text-ink-subtle'
  if (status === 'AWAITING_PAYMENT') return 'bg-warning-soft text-warning'
  return 'bg-primary-soft text-primary'
}

const fetchOrders = async () => {
  loading.value = true
  error.value = ''
  try {
    const token = partnerToken()
    const g = STATUS_GROUPS.find(x => x.id === filterStatus.value) || STATUS_GROUPS[0]
    const p = new URLSearchParams()
    if (g.statuses.length) p.set('status', g.statuses.join(','))
    if (debouncedQuery.value) p.set('q', debouncedQuery.value)
    p.set('page', String(page.value))
    const res = await fetch(apiUrl(`/partner/orders?${p}`), {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (!res.ok) throw new Error('주문 목록을 불러오지 못했습니다.')
    const json = await res.json()
    orders.value = json.orders || []
    total.value = json.total || 0
    totalPages.value = json.totalPages || 1
  } catch (e: any) {
    error.value = e.message || '주문 목록을 불러오지 못했습니다.'
  } finally {
    loading.value = false
  }
}

const handleOrderAction = async (order: OrderRow, action: 'confirm' | 'reject') => {
  actionError.value = ''
  let supplierReference = ''
  if (action === 'confirm') {
    const ref = window.prompt('공급사 확정번호를 입력하세요 (예약 확정에 필요합니다):', '')
    if (ref === null) return
    supplierReference = ref.trim()
    if (!supplierReference) {
      actionError.value = '공급사 확정번호를 입력해야 확정할 수 있습니다.'
      return
    }
  } else if (!window.confirm('해당 예약을 거절 처리할까요? 결제된 금액은 전액 환불됩니다.')) {
    return
  }

  actionLoading.value = order.id
  try {
    const token = partnerToken()
    const res = await fetch(apiUrl(`/partner/orders/${order.id}/${action}`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ supplierReference })
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || '처리에 실패했습니다.')
    await fetchOrders()
  } catch (e: any) {
    actionError.value = e.message || '오류가 발생했습니다.'
  } finally {
    actionLoading.value = ''
  }
}

onMounted(() => {
  fetchOrders()
})
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-col justify-between gap-4 md:flex-row md:items-center">
      <div>
        <h1 class="flex items-center gap-2 text-2xl font-black tracking-tight text-ink">
          <span>주문 / 예약 접수 관리</span>
          <span class="rounded-full bg-primary-soft px-2 py-0.5 text-xs font-bold text-primary">
            {{ total }}건 접수
          </span>
        </h1>
        <p class="mt-1 text-sm font-medium text-ink-subtle">
          접수된 고객 예약의 실재고 확인 후 확정 처리 또는 거절 처리를 수행합니다. 확정 시 공급사 확정번호가 필요합니다.
        </p>
      </div>
      <div>
        <button
          type="button"
          class="btn-secondary btn-sm !text-xs"
          @click="fetchOrders"
        >
          <AppIcon name="refresh" :size="14" />
          <span>새로고침</span>
        </button>
      </div>
    </div>

    <div v-if="error" class="rounded-2xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm font-semibold text-danger">
      {{ error }}
      <button type="button" class="ml-2 underline" @click="fetchOrders">다시 시도</button>
    </div>
    <div v-if="actionError" class="rounded-2xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm font-semibold text-danger" role="alert">
      {{ actionError }}
    </div>

    <!-- Filters & Search -->
    <div class="card flex flex-col justify-between gap-4 p-4 md:flex-row">
      <div class="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0" role="group" aria-label="주문 상태 필터">
        <button
          v-for="st in STATUS_GROUPS"
          :key="st.id"
          type="button"
          :aria-pressed="filterStatus === st.id"
          :class="[
            filterStatus === st.id
              ? 'bg-primary text-primary-ink shadow-md'
              : 'bg-surface-sunken text-ink-muted hover:text-ink',
            'flex-shrink-0 rounded-xl px-3.5 py-1.5 text-xs font-bold transition'
          ]"
          @click="setFilter(st.id)"
        >
          {{ st.label }}
        </button>
      </div>

      <div class="relative w-full md:w-72">
        <input
          v-model="searchQuery"
          type="text"
          placeholder="예약번호, 상품명 검색..."
          class="input !pl-9 !text-xs"
          aria-label="주문 검색"
        />
        <AppIcon name="search" :size="14" class="pointer-events-none absolute left-3 top-3 text-ink-subtle" />
      </div>
    </div>

    <!-- Order Table -->
    <div class="card overflow-hidden">
      <div class="overflow-x-auto">
        <table class="table !min-w-[720px] text-xs">
          <thead>
            <tr>
              <th>예약 번호</th>
              <th>상품명</th>
              <th>이용 기간</th>
              <th>예약자명 (마스킹)</th>
              <th>결제 금액</th>
              <th>상태</th>
              <th class="!text-right">주문 처리</th>
            </tr>
          </thead>
          <tbody class="font-medium">
            <tr v-if="loading">
              <td colspan="7" class="p-8 text-center font-bold text-ink-subtle">
                주문 목록을 불러오는 중입니다...
              </td>
            </tr>
            <tr v-else-if="orders.length === 0">
              <td colspan="7" class="p-8 text-center font-bold text-ink-subtle">
                일치하는 예약 주문이 없습니다.
              </td>
            </tr>
            <tr
              v-else
              v-for="o in orders"
              :key="o.id"
              class="transition hover:bg-surface-sunken"
            >
              <td class="font-mono font-bold"><router-link :to="`/orders/${o.id}`" class="text-primary hover:underline">{{ o.booking_number || o.id }}</router-link></td>
              <td class="font-bold">{{ o.title }}</td>
              <td class="text-ink-subtle">
                {{ o.service_start || '-' }} <span v-if="o.service_end">~ {{ o.service_end }}</span>
              </td>
              <td class="font-bold text-ink-muted">{{ o.customerNameMasked || '-' }}</td>
              <td class="font-bold tabular text-primary">{{ (o.total_minor || 0).toLocaleString() }}원</td>
              <td>
                <span :class="['rounded-full px-2 py-0.5 text-[10px] font-bold', badge(o.status)]">
                  {{ o.status }}
                </span>
              </td>
              <td class="!text-right">
                <span v-if="!actionable(o)" class="text-[11px] text-ink-subtle">처리 완료</span>
                <span v-else class="space-x-1.5">
                  <button
                    type="button"
                    :disabled="actionLoading === o.id"
                    class="rounded-lg bg-success px-2.5 py-1 text-[11px] font-bold text-white shadow-sm transition hover:opacity-90 disabled:opacity-50"
                    @click="handleOrderAction(o, 'confirm')"
                  >
                    {{ actionLoading === o.id ? '처리 중...' : '예약 확정' }}
                  </button>
                  <button
                    type="button"
                    :disabled="actionLoading === o.id"
                    class="rounded-lg border border-danger/30 bg-danger-soft px-2.5 py-1 text-[11px] font-bold text-danger transition hover:opacity-80 disabled:opacity-50"
                    @click="handleOrderAction(o, 'reject')"
                  >
                    거절
                  </button>
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="px-4 pb-4">
        <PageNav :page="page" :total-pages="totalPages" :total="total" @go="go" />
      </div>
    </div>
  </div>
</template>
