<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { usePartnerStore } from '~/stores/partner'

definePageMeta({
  middleware: 'partner-auth'
})

const router = useRouter()
const partnerStore = usePartnerStore()

onMounted(() => {
  if (!partnerStore.isLoggedIn || !partnerStore.partner) {
    router.replace('/partner/login')
  }
})

const activeFilter = ref<'ALL' | 'PENDING' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED'>('ALL')
const searchQuery = ref('')
const selectedBooking = ref<any | null>(null)
const isDetailModalOpen = ref(false)

const partnerBookings = ref([
  {
    id: 'b-001',
    bookingCode: 'GF-HT-98214',
    productName: '디럭스 킹 룸 (시티뷰 조식 포함)',
    guestName: '김**',
    guestPhone: '010-****-5678',
    guestEmail: 'tr**@getfortrip.com',
    domainType: 'HOTEL',
    checkInDate: '2026-11-01',
    checkOutDate: '2026-11-03',
    roomsCount: 1,
    guestsCount: 2,
    amountKrw: 320000,
    payoutKrw: 288000,
    commissionKrw: 32000,
    status: 'CONFIRMED',
    confirmationNumber: 'HYATT-SEL-882194',
    createdAt: '2026-10-14T08:30:00Z',
    specialRequest: '고층 시티뷰 배정 부탁드립니다. 금연실 희망.'
  },
  {
    id: 'b-008',
    bookingCode: 'GF-HT-99302',
    productName: '프리미어 이그제큐티브 스위트',
    guestName: '박**',
    guestPhone: '010-****-5432',
    guestEmail: 'se**@gmail.com',
    domainType: 'HOTEL',
    checkInDate: '2026-11-03',
    checkOutDate: '2026-11-06',
    roomsCount: 1,
    guestsCount: 3,
    amountKrw: 680000,
    payoutKrw: 612000,
    commissionKrw: 68000,
    status: 'PENDING',
    confirmationNumber: '',
    createdAt: '2026-10-15T09:12:00Z',
    specialRequest: '아기 침대 추가 대여 가능 여부 확인 요청'
  },
  {
    id: 'b-009',
    bookingCode: 'GF-HT-99411',
    productName: '스탠다드 퀸 룸 (얼리버드)',
    guestName: '정**',
    guestPhone: '010-****-5566',
    guestEmail: 'wo**@naver.com',
    domainType: 'HOTEL',
    checkInDate: '2026-11-05',
    checkOutDate: '2026-11-06',
    roomsCount: 1,
    guestsCount: 1,
    amountKrw: 185000,
    payoutKrw: 166500,
    commissionKrw: 18500,
    status: 'PENDING',
    confirmationNumber: '',
    createdAt: '2026-10-15T10:45:00Z',
    specialRequest: '늦은 체크인 (오후 10시 도착 예정)'
  },
  {
    id: 'b-010',
    bookingCode: 'GF-HT-98774',
    productName: '클럽 라운지 엑세스 킹룸',
    guestName: 'M. C***',
    guestPhone: '+1-415-***-9912',
    guestEmail: 'mc**@silicon.io',
    domainType: 'HOTEL',
    checkInDate: '2026-11-08',
    checkOutDate: '2026-11-12',
    roomsCount: 1,
    guestsCount: 2,
    amountKrw: 920000,
    payoutKrw: 828000,
    commissionKrw: 92000,
    status: 'CONFIRMED',
    confirmationNumber: 'HYATT-SEL-990142',
    createdAt: '2026-10-15T11:20:00Z',
    specialRequest: '공항 픽업 차량 요청 완료건'
  },
  {
    id: 'b-011',
    bookingCode: 'GF-HT-97551',
    productName: '디럭스 킹 룸 (시티뷰 조식 포함)',
    guestName: '이**',
    guestPhone: '010-****-9900',
    guestEmail: 'ji**@kakao.com',
    domainType: 'HOTEL',
    checkInDate: '2026-10-10',
    checkOutDate: '2026-10-12',
    roomsCount: 1,
    guestsCount: 2,
    amountKrw: 320000,
    payoutKrw: 288000,
    commissionKrw: 32000,
    status: 'COMPLETED',
    confirmationNumber: 'HYATT-SEL-772184',
    createdAt: '2026-10-08T05:20:00Z',
    specialRequest: '체크아웃 완료 (투숙객 리뷰 평점 5.0 만점 등록됨)'
  }
])

const filteredBookings = computed(() => {
  return partnerBookings.value.filter(b => {
    if (activeFilter.value !== 'ALL' && b.status !== activeFilter.value) {
      return false
    }
    if (searchQuery.value) {
      const q = searchQuery.value.toLowerCase()
      return (
        b.bookingCode.toLowerCase().includes(q) ||
        b.guestName.toLowerCase().includes(q) ||
        b.productName.toLowerCase().includes(q)
      )
    }
    return true
  })
})

const openDetail = (b: any) => {
  selectedBooking.value = b
  isDetailModalOpen.value = true
}

const confirmBooking = (b: any) => {
  const pnr = prompt('파트너 호텔 관리시스템(PMS)의 예약 확정 번호를 입력해 주세요:', 'HYATT-SEL-' + Math.floor(100000 + Math.random() * 900000))
  if (pnr) {
    b.status = 'CONFIRMED'
    b.confirmationNumber = pnr
    alert(`[${b.bookingCode}] 예약이 성공적으로 확정되었습니다. PNR: ${pnr}`)
    isDetailModalOpen.value = false
  }
}

const markCheckIn = (b: any) => {
  b.status = 'COMPLETED'
  alert(`[${b.bookingCode}] 고객 체크인이 확인되었습니다. 정산 집계에 포함됩니다.`)
  isDetailModalOpen.value = false
}
</script>

<template>
  <div v-if="partnerStore.isLoggedIn && partnerStore.partner" class="min-h-screen bg-slate-100">
    <header class="bg-slate-900 text-white border-b border-slate-800 sticky top-0 z-40">
      <div class="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        <div class="flex items-center gap-6">
          <NuxtLink to="/partner" class="flex items-center gap-2">
            <img src="/logo-white.svg" alt="getfortrip" class="h-7 w-auto" />
            <span class="px-2 py-0.5 rounded text-[10px] font-black bg-blue-600 text-white uppercase tracking-wider">
              Partner Hub
            </span>
          </NuxtLink>
          <nav class="hidden md:flex items-center gap-1 text-xs font-bold text-slate-300">
            <NuxtLink to="/partner" class="px-3 py-2 rounded-xl hover:bg-slate-800 hover:text-white transition">대시보드</NuxtLink>
            <NuxtLink to="/partner/products" class="px-3 py-2 rounded-xl hover:bg-slate-800 hover:text-white transition">상품 및 재고 관리</NuxtLink>
            <NuxtLink to="/partner/bookings" class="px-3 py-2 rounded-xl bg-slate-800 text-white">예약·바우처 관리</NuxtLink>
            <NuxtLink to="/partner/settlement" class="px-3 py-2 rounded-xl hover:bg-slate-800 hover:text-white transition">정산 및 수수료</NuxtLink>
            <NuxtLink to="/partner/settings" class="px-3 py-2 rounded-xl hover:bg-slate-800 hover:text-white transition">연동 API/설정</NuxtLink>
          </nav>
        </div>
        <div class="flex items-center gap-4 text-xs">
          <span class="font-bold text-slate-300">{{ partnerStore.partner?.companyName }}</span>
          <button @click="partnerStore.logout(); router.push('/partner/login')" class="text-rose-400 font-bold">로그아웃</button>
        </div>
      </div>
    </header>

    <main class="max-w-7xl mx-auto px-4 py-8 space-y-6">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 class="text-2xl font-black text-slate-900">예약 및 고객 바우처 관리</h1>
          <p class="text-xs text-slate-500 mt-1">접수된 고객 예약을 확인하고 PMS 확정 번호(PNR) 발급 및 체크인 처리를 수행합니다.</p>
        </div>
        <div class="flex items-center gap-2">
          <input
            v-model="searchQuery"
            type="text"
            placeholder="예약코드, 고객명 검색..."
            class="px-3 py-2 border border-slate-200 rounded-xl text-xs bg-white font-medium outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <!-- 상태 탭 필터 -->
      <div class="flex items-center gap-2 border-b border-slate-200 pb-3 text-xs font-bold text-slate-500">
        <button
          v-for="tab in [
            { id: 'ALL', label: '전체 보기' },
            { id: 'PENDING', label: '승인 대기 중 (2)' },
            { id: 'CONFIRMED', label: '예약 확정 (2)' },
            { id: 'COMPLETED', label: '이용/체크인 완료 (1)' }
          ]"
          :key="tab.id"
          @click="activeFilter = tab.id as any"
          :class="[
            'px-3.5 py-1.5 rounded-xl transition',
            activeFilter === tab.id ? 'bg-slate-900 text-white' : 'bg-white hover:bg-slate-200 text-slate-600'
          ]"
        >
          {{ tab.label }}
        </button>
      </div>

      <!-- 예약 목록 테이블 -->
      <div class="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs">
            <thead class="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
              <tr>
                <th class="py-3.5 px-4">예약 코드</th>
                <th class="py-3.5 px-4">고객명 / 연락처</th>
                <th class="py-3.5 px-4">상품명 및 투숙일자</th>
                <th class="py-3.5 px-4">결제 총액</th>
                <th class="py-3.5 px-4">파트너 정산액 (90%)</th>
                <th class="py-3.5 px-4">PMS 확정번호</th>
                <th class="py-3.5 px-4 text-center">예약 상태</th>
                <th class="py-3.5 px-4 text-center">관리</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              <tr v-for="b in filteredBookings" :key="b.id" class="hover:bg-slate-50/80 transition">
                <td class="py-3.5 px-4 font-mono font-bold text-slate-900">
                  {{ b.bookingCode }}
                </td>
                <td class="py-3.5 px-4">
                  <div class="font-bold text-slate-900">{{ b.guestName }}</div>
                  <div class="text-[11px] text-slate-400">{{ b.guestPhone }}</div>
                </td>
                <td class="py-3.5 px-4">
                  <div class="font-bold text-slate-900">{{ b.productName }}</div>
                  <div class="text-[11px] text-slate-400 font-mono">{{ b.checkInDate }} ~ {{ b.checkOutDate }}</div>
                </td>
                <td class="py-3.5 px-4 font-black text-slate-900">
                  ₩{{ b.amountKrw.toLocaleString() }}
                </td>
                <td class="py-3.5 px-4 font-black text-emerald-600">
                  ₩{{ b.payoutKrw.toLocaleString() }}
                </td>
                <td class="py-3.5 px-4 font-mono text-[11px] text-blue-600 font-bold">
                  {{ b.confirmationNumber || '-' }}
                </td>
                <td class="py-3.5 px-4 text-center">
                  <span
                    :class="[
                      'px-2.5 py-0.5 rounded-full text-[10px] font-black',
                      b.status === 'CONFIRMED' ? 'bg-blue-50 text-blue-600 border border-blue-200' : b.status === 'PENDING' ? 'bg-amber-50 text-amber-600 border border-amber-200' : 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                    ]"
                  >
                    {{ b.status === 'CONFIRMED' ? '예약 확정' : b.status === 'PENDING' ? '승인 대기' : '체크인 완료' }}
                  </span>
                </td>
                <td class="py-3.5 px-4 text-center">
                  <button
                    @click="openDetail(b)"
                    class="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] transition"
                  >
                    상세 / 처리
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </main>

    <!-- 예약 상세 및 승인 모달 -->
    <div v-if="isDetailModalOpen && selectedBooking" class="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div class="bg-white rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl space-y-5">
        <div class="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <span class="text-[10px] font-bold text-blue-600 uppercase">Partner Reservation Voucher</span>
            <h3 class="text-lg font-black text-slate-900">{{ selectedBooking.bookingCode }}</h3>
          </div>
          <button @click="isDetailModalOpen = false" class="text-slate-400 hover:text-slate-600 font-bold text-lg">✕</button>
        </div>

        <div class="bg-slate-50 p-4 rounded-2xl space-y-2 text-xs">
          <div class="flex justify-between"><span class="text-slate-400">상품명:</span> <span class="font-bold text-slate-900">{{ selectedBooking.productName }}</span></div>
          <div class="flex justify-between"><span class="text-slate-400">투숙객:</span> <span class="font-bold text-slate-900">{{ selectedBooking.guestName }} ({{ selectedBooking.guestPhone }})</span></div>
          <div class="flex justify-between"><span class="text-slate-400">체크인/아웃:</span> <span class="font-bold text-slate-900 font-mono">{{ selectedBooking.checkInDate }} ~ {{ selectedBooking.checkOutDate }}</span></div>
          <div class="flex justify-between"><span class="text-slate-400">고객 결제액:</span> <span class="font-black text-slate-900 font-mono">₩{{ selectedBooking.amountKrw.toLocaleString() }}</span></div>
          <div class="flex justify-between"><span class="text-slate-400">수수료(10%):</span> <span class="font-bold text-slate-500 font-mono">-₩{{ selectedBooking.commissionKrw.toLocaleString() }}</span></div>
          <div class="flex justify-between border-t border-slate-200 pt-2"><span class="font-bold text-slate-700">파트너 정산 실수령액:</span> <span class="font-black text-emerald-600 font-mono text-sm">₩{{ selectedBooking.payoutKrw.toLocaleString() }}</span></div>
        </div>

        <div class="text-xs space-y-1">
          <label class="block font-bold text-slate-700">고객 요청 사항</label>
          <div class="p-3 bg-blue-50/50 rounded-xl text-slate-700 font-medium">
            {{ selectedBooking.specialRequest || '특별 요청 사항 없음' }}
          </div>
        </div>

        <div class="flex items-center justify-between pt-4 border-t border-slate-100 text-xs">
          <button @click="isDetailModalOpen = false" class="px-4 py-2 bg-slate-100 text-slate-600 font-bold rounded-xl">닫기</button>
          <div class="flex items-center gap-2">
            <button
              v-if="selectedBooking.status === 'PENDING'"
              @click="confirmBooking(selectedBooking)"
              class="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl shadow transition"
            >
              예약 승인 및 PNR 발급
            </button>
            <button
              v-if="selectedBooking.status === 'CONFIRMED'"
              @click="markCheckIn(selectedBooking)"
              class="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow transition"
            >
              체크인 완료 확인
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div v-else class="min-h-screen bg-slate-100 flex items-center justify-center p-4">
    <div class="bg-white p-8 rounded-3xl shadow-sm border border-slate-200 max-w-md w-full text-center space-y-4">
      <div class="w-14 h-14 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mx-auto text-2xl font-bold">
        🔒
      </div>
      <div>
        <h2 class="text-xl font-black text-slate-900 tracking-tight">파트너 인증 필요</h2>
        <p class="text-xs text-slate-500 mt-1.5 leading-relaxed">
          고객의 소중한 개인정보(성명, 연락처, 일정)를 보호하기 위해 인가된 파트너 계정으로 로그인한 경우에만 접근할 수 있습니다.
        </p>
      </div>
      <div class="pt-2">
        <NuxtLink
          to="/partner/login"
          class="w-full inline-block py-3 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs rounded-xl shadow-md transition"
        >
          파트너 로그인 바로가기 →
        </NuxtLink>
      </div>
    </div>
  </div>
</template>

