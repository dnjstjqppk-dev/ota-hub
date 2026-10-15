<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { apiUrl } from '../config/api'

interface BookingRow {
  id: string
  booking_code: string
  domain_type: string
  primary_contact_name: string
  status: string
  final_amount_krw: number
  created_at: string
  confirmation_number?: string
  voucher_url?: string
}

const bookings = ref<BookingRow[]>([])
const isActionModalOpen = ref(false)
const selectedBooking = ref<BookingRow | null>(null)
const manualPnr = ref('')
const operatorReason = ref('')
const loading = ref(false)

const fallbackBookings: BookingRow[] = [
  {
    id: 'b-001',
    booking_code: 'GF-HT-98214',
    domain_type: 'HOTEL',
    primary_contact_name: '김민수 (010-1234-5678)',
    status: 'CONFIRMED',
    final_amount_krw: 320000,
    created_at: '2026-10-14T08:30:00Z',
    confirmation_number: 'HYATT-SEL-882194',
    voucher_url: '/my/bookings/GF-HT-98214'
  },
  {
    id: 'b-002',
    booking_code: 'GF-FL-44912',
    domain_type: 'FLIGHT',
    primary_contact_name: '이수진 (010-9876-5432)',
    status: 'CONFIRMED',
    final_amount_krw: 258000,
    created_at: '2026-10-15T02:15:00Z',
    confirmation_number: 'KE-ETKT-70389',
    voucher_url: '/my/bookings/GF-FL-44912'
  },
  {
    id: 'b-003',
    booking_code: 'GF-TR-29103',
    domain_type: 'TRAIN',
    primary_contact_name: '박준영 (010-3344-5566)',
    status: 'CONFIRMED',
    final_amount_krw: 59800,
    created_at: '2026-10-15T03:10:00Z',
    confirmation_number: 'KTX-021-3H12A',
    voucher_url: '/my/bookings/GF-TR-29103'
  },
  {
    id: 'b-004',
    booking_code: 'GF-CAR-11849',
    domain_type: 'CAR',
    primary_contact_name: '정현우 (010-7788-9900)',
    status: 'CONFIRMED',
    final_amount_krw: 180000,
    created_at: '2026-10-15T03:45:00Z',
    confirmation_number: 'LOTTE-RENT-5541',
    voucher_url: '/my/bookings/GF-CAR-11849'
  },
  {
    id: 'b-005',
    booking_code: 'GF-TF-77218',
    domain_type: 'CAR',
    primary_contact_name: '최지우 (010-4455-6677)',
    status: 'CONFIRMED',
    final_amount_krw: 95000,
    created_at: '2026-10-15T04:00:00Z',
    confirmation_number: 'VAN-LIM-9941',
    voucher_url: '/my/bookings/GF-TF-77218'
  },
  {
    id: 'b-006',
    booking_code: 'GF-ACT-33019',
    domain_type: 'ACTIVITY',
    primary_contact_name: '강태양 (010-5566-7788)',
    status: 'CONFIRMED',
    final_amount_krw: 85000,
    created_at: '2026-10-15T04:20:00Z',
    confirmation_number: 'TDR-DSN-99120',
    voucher_url: '/my/bookings/GF-ACT-33019'
  },
  {
    id: 'b-007',
    booking_code: 'GF-PKG-55102',
    domain_type: 'PACKAGE',
    primary_contact_name: '윤아름 (010-8899-0011)',
    status: 'CONFIRMED',
    final_amount_krw: 750000,
    created_at: '2026-10-15T04:40:00Z',
    confirmation_number: 'PKG-TYO-4N5D',
    voucher_url: '/my/bookings/GF-PKG-55102'
  }
]

const fetchBookings = async () => {
  loading.value = true
  try {
    const res = await fetch(apiUrl('/admin/bookings'))
    const json = await res.json()
    if (json.data && Array.isArray(json.data) && json.data.length > 0) {
      bookings.value = json.data
      loading.value = false
      return
    }
  } catch (e) {
    console.warn('Admin OMS API fallback to mock bookings:', e)
  } finally {
    loading.value = false
  }
  bookings.value = fallbackBookings
}

const openActionModal = (b: BookingRow) => {
  selectedBooking.value = b
  manualPnr.value = b.confirmation_number || ''
  operatorReason.value = ''
  isActionModalOpen.value = true
}

const triggerStatusChange = async (targetStatus: string, defaultReason: string) => {
  if (!selectedBooking.value) return
  const reason = operatorReason.value || defaultReason

  try {
    await fetch(apiUrl(`/admin/bookings/${selectedBooking.value.id}/transition`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        target_status: targetStatus,
        reason: reason,
        manual_pnr: manualPnr.value
      })
    })
  } catch (e) {
    console.warn('Admin status change API fallback:', e)
  }

  // Update in memory
  selectedBooking.value.status = targetStatus
  if (manualPnr.value) {
    selectedBooking.value.confirmation_number = manualPnr.value
  }
  isActionModalOpen.value = false
}

onMounted(() => {
  fetchBookings()
})
</script>

<template>
  <div class="p-8 space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-black text-slate-900 tracking-tight">통합 예약 & 발권 관제 (OMS)</h1>
        <p class="text-sm text-slate-500 mt-1">실시간 예약 상태 머신 제어, 수동 PNR 발권 및 환불 승인</p>
      </div>
      <button
        @click="fetchBookings"
        class="px-4 py-2 bg-white border border-slate-300 rounded-xl text-sm font-semibold hover:bg-slate-50 shadow-sm"
      >
        새로고침
      </button>
    </div>

    <!-- OMS 테이블 -->
    <div class="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
      <table class="w-full text-left text-sm">
        <thead class="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
          <tr>
            <th class="p-4">예약 번호</th>
            <th class="p-4">도메인</th>
            <th class="p-4">예약자</th>
            <th class="p-4">결제 금액</th>
            <th class="p-4">확정 번호 (PNR)</th>
            <th class="p-4">현재 상태</th>
            <th class="p-4">생성 일시</th>
            <th class="p-4 text-center">관리 조치</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          <tr v-for="b in bookings" :key="b.id" class="hover:bg-slate-50/70">
            <td class="p-4 font-mono font-bold text-trip-blue">{{ b.booking_code }}</td>
            <td class="p-4">
              <span class="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-xs font-bold">{{ b.domain_type }}</span>
            </td>
            <td class="p-4 font-medium text-slate-900">{{ b.primary_contact_name }}</td>
            <td class="p-4 font-mono font-bold text-slate-900">₩{{ b.final_amount_krw.toLocaleString() }}</td>
            <td class="p-4 font-mono text-xs text-slate-600">
              {{ b.confirmation_number || '발권 대기' }}
            </td>
            <td class="p-4">
              <span
                :class="[
                  'px-2.5 py-1 rounded-full text-xs font-bold inline-flex items-center gap-1.5',
                  b.status === 'CONFIRMED' ? 'bg-emerald-100 text-emerald-800' :
                  b.status === 'ISSUE_FAILED' ? 'bg-rose-100 text-rose-800 animate-pulse' :
                  b.status === 'CANCEL_REQUESTED' ? 'bg-amber-100 text-amber-800' :
                  b.status === 'REFUNDED' ? 'bg-slate-200 text-slate-700' : 'bg-blue-100 text-blue-800'
                ]"
              >
                <span class="w-1.5 h-1.5 rounded-full bg-current"></span>
                {{ b.status }}
              </span>
            </td>
            <td class="p-4 text-xs text-slate-400">{{ new Date(b.created_at).toLocaleString() }}</td>
            <td class="p-4 text-center">
              <button
                @click="openActionModal(b)"
                class="px-3.5 py-1.5 bg-slate-900 hover:bg-black text-white text-xs font-bold rounded-lg transition"
              >
                상태 제어
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 모달 -->
    <div v-if="isActionModalOpen" class="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div class="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
        <div>
          <h3 class="text-lg font-bold text-slate-900">예약 상태 전이 및 OMS 조치</h3>
          <p class="text-xs text-slate-500 mt-1 font-mono">예약 번호: {{ selectedBooking?.booking_code }} (현재: {{ selectedBooking?.status }})</p>
        </div>

        <div class="space-y-3">
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">수동 PNR / 바우처 식별 번호</label>
            <input v-model="manualPnr" type="text" class="w-full border border-slate-300 rounded-xl p-2.5 text-sm font-mono" placeholder="예: PNR-7X89QW" />
          </div>

          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">사유 기재 (감사 로그 보관용)</label>
            <input v-model="operatorReason" type="text" class="w-full border border-slate-300 rounded-xl p-2.5 text-sm" placeholder="예: 고객 요청 또는 발권 시스템 수동 재처리" />
          </div>

          <div class="grid grid-cols-2 gap-2 pt-2">
            <button
              @click="triggerStatusChange('CONFIRMED', '관리자 수동 발권 승인')"
              class="py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-sm transition"
            >
              확정 (CONFIRMED)
            </button>
            <button
              @click="triggerStatusChange('REFUNDED', '관리자 환불 승인')"
              class="py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-sm transition"
            >
              환불 (REFUNDED)
            </button>
          </div>
        </div>

        <button @click="isActionModalOpen = false" class="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-sm transition">
          닫기
        </button>
      </div>
    </div>
  </div>
</template>
