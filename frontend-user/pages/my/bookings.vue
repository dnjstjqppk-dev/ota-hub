<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useAuthStore } from '~/stores/auth'
import { useCurrencyStore } from '~/stores/currency'
import { useApiUrl } from '~/composables/useApi'

const authStore = useAuthStore()
const currencyStore = useCurrencyStore()
const bookings = ref<any[]>([])
const loading = ref(false)

const defaultSeedBookings = [
  {
    id: 'GF-HT-98214',
    booking_code: 'GF-HT-98214',
    domain_type: 'HOTEL',
    created_at: '2026-10-14T08:30:00Z',
    status: 'CONFIRMED',
    confirmation_number: 'HYATT-SEL-882194',
    final_amount_krw: 320000,
    paid_currency: 'KRW',
    paid_currency_amount: 320000,
    primary_contact_name: '김민수',
    primary_contact_email: 'trip@getfortrip.com',
    voucher_url: true
  },
  {
    id: 'GF-FL-44912',
    booking_code: 'GF-FL-44912',
    domain_type: 'FLIGHT',
    created_at: '2026-10-15T02:15:00Z',
    status: 'CONFIRMED',
    confirmation_number: 'KE-ETKT-70389',
    final_amount_krw: 258000,
    paid_currency: 'KRW',
    paid_currency_amount: 258000,
    primary_contact_name: '김민수',
    primary_contact_email: 'trip@getfortrip.com',
    voucher_url: true
  },
  {
    id: 'GF-TR-29103',
    booking_code: 'GF-TR-29103',
    domain_type: 'TRAIN',
    created_at: '2026-10-15T03:10:00Z',
    status: 'CONFIRMED',
    confirmation_number: 'KTX-021-3H12A',
    final_amount_krw: 59800,
    paid_currency: 'KRW',
    paid_currency_amount: 59800,
    primary_contact_name: '김민수',
    primary_contact_email: 'trip@getfortrip.com',
    voucher_url: true
  },
  {
    id: 'GF-CAR-11849',
    booking_code: 'GF-CAR-11849',
    domain_type: 'CAR',
    created_at: '2026-10-15T03:45:00Z',
    status: 'CONFIRMED',
    confirmation_number: 'LOTTE-RENT-5541',
    final_amount_krw: 180000,
    paid_currency: 'KRW',
    paid_currency_amount: 180000,
    primary_contact_name: '김민수',
    primary_contact_email: 'trip@getfortrip.com',
    voucher_url: true
  },
  {
    id: 'GF-TF-77218',
    booking_code: 'GF-TF-77218',
    domain_type: 'TRANSFER',
    created_at: '2026-10-15T04:00:00Z',
    status: 'CONFIRMED',
    confirmation_number: 'VAN-LIM-9941',
    final_amount_krw: 95000,
    paid_currency: 'KRW',
    paid_currency_amount: 95000,
    primary_contact_name: '김민수',
    primary_contact_email: 'trip@getfortrip.com',
    voucher_url: true
  },
  {
    id: 'GF-ACT-33019',
    booking_code: 'GF-ACT-33019',
    domain_type: 'ACTIVITY',
    created_at: '2026-10-15T04:20:00Z',
    status: 'CONFIRMED',
    confirmation_number: 'TDR-DSN-99120',
    final_amount_krw: 85000,
    paid_currency: 'KRW',
    paid_currency_amount: 85000,
    primary_contact_name: '김민수',
    primary_contact_email: 'trip@getfortrip.com',
    voucher_url: true
  },
  {
    id: 'GF-PKG-55102',
    booking_code: 'GF-PKG-55102',
    domain_type: 'PACKAGE',
    created_at: '2026-10-15T04:40:00Z',
    status: 'CONFIRMED',
    confirmation_number: 'PKG-TYO-4N5D',
    final_amount_krw: 750000,
    paid_currency: 'KRW',
    paid_currency_amount: 750000,
    primary_contact_name: '김민수',
    primary_contact_email: 'trip@getfortrip.com',
    voucher_url: true
  }
]

const fetchMyBookings = async () => {
  loading.value = true
  let apiList: any[] = []
  try {
    const res = await fetch(useApiUrl(`/bookings/user/${authStore.user.id}`))
    const json = await res.json()
    if (json.data && Array.isArray(json.data) && json.data.length > 0) {
      apiList = json.data
    }
  } catch (e) {
    console.warn('API fetch bookings fallback:', e)
  }

  // Load from localStorage
  let localList: any[] = []
  try {
    const raw = localStorage.getItem('user_mock_bookings')
    if (raw) {
      const parsed = JSON.parse(raw)
      localList = parsed.map((item: any) => ({
        id: item.id,
        booking_code: item.id,
        domain_type: item.domain || 'HOTEL',
        created_at: item.created_at || new Date().toISOString(),
        status: item.status || 'CONFIRMED',
        confirmation_number: 'PNR-' + item.id.replace(/[^A-Za-z0-9]/g, '').slice(-6).toUpperCase(),
        final_amount_krw: item.amount || 150000,
        paid_currency: item.paid_currency || 'KRW',
        paid_currency_amount: item.amount || 150000,
        primary_contact_name: item.contact || '김민수 (010-1234-5678)',
        primary_contact_email: 'trip@getfortrip.com',
        voucher_url: true
      }))
    }
  } catch (e) {}

  if (apiList.length > 0 || localList.length > 0) {
    bookings.value = [...localList, ...apiList]
  } else {
    bookings.value = defaultSeedBookings
  }
  loading.value = false
}

const cancelBooking = async (id: string) => {
  if (!confirm('정말 예약을 취소하시겠습니까? 무료 취소 기간인 경우 전액 환불됩니다.')) return
  try {
    await fetch(useApiUrl(`/bookings/${id}/cancel`), { method: 'POST' })
  } catch (e) {}

  // Update local storage
  try {
    const raw = localStorage.getItem('user_mock_bookings')
    if (raw) {
      const list = JSON.parse(raw)
      const found = list.find((b: any) => b.id === id)
      if (found) {
        found.status = 'CANCELLED'
        localStorage.setItem('user_mock_bookings', JSON.stringify(list))
      }
    }
  } catch (e) {}

  const target = bookings.value.find(b => b.id === id)
  if (target) {
    target.status = 'CANCELLED'
  }
  alert('예약이 정상적으로 취소되었습니다. 취소 확인 영수증이 발행되었습니다.')
}

onMounted(() => {
  fetchMyBookings()
})
</script>

<template>
  <div class="max-w-6xl mx-auto px-4 py-8 space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-3xl font-black text-slate-900 tracking-tight">내 예약 관리 (My Bookings)</h1>
        <p class="text-sm text-slate-500 mt-1">호텔, 항공권, 기차표, 투어 티켓 바우처 확인 및 셀프서비스 일정 변경/취소</p>
      </div>

      <button @click="fetchMyBookings" class="px-4 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold hover:bg-slate-50 shadow-sm">
        새로고침
      </button>
    </div>

    <div v-if="loading" class="p-16 text-center text-slate-400 font-bold">예약 내역 조회 중...</div>

    <div v-else-if="bookings.length === 0" class="bg-white p-12 text-center rounded-3xl border border-slate-200">
      <div class="text-4xl mb-2">📋</div>
      <h3 class="font-bold text-slate-700">예약 내역이 없습니다.</h3>
      <p class="text-xs text-slate-400 mt-1">getfortrip의 최저가 항공권과 호텔을 지금 예약해보세요!</p>
    </div>

    <!-- 예약 카드 목록 -->
    <div v-else class="space-y-4">
      <div v-for="b in bookings" :key="b.id" class="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-sm hover:shadow-lg transition space-y-4">
        <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pb-4 border-b border-slate-100">
          <div class="flex items-center gap-3">
            <span class="px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg text-xs font-black">{{ b.domain_type }}</span>
            <span class="font-mono font-bold text-trip-blue text-sm">{{ b.booking_code }}</span>
            <span class="text-xs text-slate-400 font-medium">{{ new Date(b.created_at).toLocaleDateString() }} 예약</span>
          </div>

          <span
            :class="[
              'px-3 py-1 rounded-full text-xs font-bold inline-flex items-center gap-1.5',
              b.status === 'CONFIRMED' ? 'bg-emerald-50 text-emerald-700' :
              b.status === 'ISSUE_FAILED' ? 'bg-rose-50 text-rose-700' :
              b.status === 'CANCEL_REQUESTED' ? 'bg-amber-50 text-amber-700' :
              b.status === 'REFUNDED' ? 'bg-slate-100 text-slate-600' : 'bg-blue-50 text-trip-blue'
            ]"
          >
            <span class="w-2 h-2 rounded-full bg-current"></span>
            {{ b.status === 'CONFIRMED' ? '예약 확정 / 바우처 발급' : b.status }}
          </span>
        </div>

        <div class="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div class="space-y-1">
            <div class="text-xs text-slate-400 font-semibold">예약자: {{ b.primary_contact_name }} ({{ b.primary_contact_email }})</div>
            <div class="text-sm font-bold text-slate-800">
              확정 식별 번호 (PNR/PIN): <span class="font-mono text-trip-blue font-black">{{ b.confirmation_number || '발권 진행 중' }}</span>
            </div>
            <div v-if="b.voucher_url" class="text-xs text-emerald-600 font-bold">
              ✓ 전자 바우처 및 영수증 온라인 출력 가능
            </div>
          </div>

          <div class="text-right flex items-center gap-4">
            <div>
              <div class="text-[11px] text-slate-400">결제 총액</div>
              <div class="text-2xl font-black text-slate-900 font-mono">
                {{ b.paid_currency }} {{ b.paid_currency_amount?.toLocaleString() }}
              </div>
            </div>

            <div class="flex flex-col gap-2">
              <NuxtLink
                :to="`/my/bookings/${b.id}`"
                class="px-4 py-2 bg-slate-900 hover:bg-black text-white text-xs font-bold rounded-xl shadow-md text-center transition"
              >
                바우처 보기
              </NuxtLink>
              <button
                v-if="b.status === 'CONFIRMED'"
                @click="cancelBooking(b.id)"
                class="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold rounded-xl transition"
              >
                예약 취소 신청
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
