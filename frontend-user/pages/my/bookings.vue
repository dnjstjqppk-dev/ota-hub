<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useAuthStore } from '~/stores/auth'
import { useCurrencyStore } from '~/stores/currency'
import { useApiUrl } from '~/composables/useApi'
import { getUserBookings, type BookingRecord } from '~/data/initialBookings'

const authStore = useAuthStore()
const currencyStore = useCurrencyStore()
const bookings = ref<BookingRecord[]>([])
const loading = ref(false)

const fetchMyBookings = async () => {
  if (!authStore.isLoggedIn || !authStore.user) {
    bookings.value = []
    loading.value = false
    return
  }
  loading.value = true
  let apiList: any[] = []
  try {
    const res = await fetch(useApiUrl(`/bookings/user/${authStore.user?.id}`), { signal: AbortSignal.timeout(1500) })
    if (res.ok) {
      const json = await res.json()
      if (json.data && Array.isArray(json.data) && json.data.length > 0) {
        apiList = json.data
      }
    }
  } catch (e) {
    // API offline fallback to unified local bookings
  }

  if (apiList.length > 0) {
    bookings.value = apiList
  } else {
    bookings.value = getUserBookings()
  }
  loading.value = false
}

const cancelBooking = async (id: string) => {
  if (!confirm('정말 예약을 취소하시겠습니까? 무료 취소 기간인 경우 전액 환불됩니다.')) return
  try {
    const res = await fetch(useApiUrl(`/bookings/${id}/cancel`), { method: 'POST' })
    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}))
      throw new Error(errJson?.error || '서버 취소 처리에 실패했습니다.')
    }

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
  } catch (e: any) {
    alert(`⚠️ [예약 취소 오류]\n${e.message || '예약을 취소할 수 없습니다. 고객센터로 문의해 주세요.'}`)
  }
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

      <button v-if="authStore.isLoggedIn" @click="fetchMyBookings" class="px-4 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold hover:bg-slate-50 shadow-sm">
        새로고침
      </button>
    </div>

    <!-- 비로그인 상태 안내 -->
    <div v-if="!authStore.isLoggedIn" class="max-w-xl mx-auto py-12 px-4 text-center">
      <div class="bg-white rounded-3xl border border-slate-200 p-8 sm:p-12 shadow-sm space-y-6">
        <div class="w-16 h-16 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center text-3xl mx-auto">
          🔒
        </div>
        <div class="space-y-2">
          <h2 class="text-xl sm:text-2xl font-black text-slate-900">로그인이 필요한 서비스입니다</h2>
          <p class="text-xs sm:text-sm text-slate-500 leading-relaxed">
            고객님의 예약 바우처와 개인정보를 안전하게 보호하기 위해 로그인이 필요합니다.<br>
            getfortrip 계정으로 로그인하여 발권 내역을 확인하세요.
          </p>
        </div>
        <div class="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            @click="authStore.loginAsDemo(); fetchMyBookings()"
            class="w-full sm:w-auto px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-md transition"
          >
            체험 계정으로 빠른 로그인 ⚡
          </button>
          <NuxtLink
            to="/login"
            class="w-full sm:w-auto px-6 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition"
          >
            이메일 로그인
          </NuxtLink>
        </div>
      </div>
    </div>

    <div v-else-if="loading" class="p-16 text-center text-slate-400 font-bold">예약 내역 조회 중...</div>

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
