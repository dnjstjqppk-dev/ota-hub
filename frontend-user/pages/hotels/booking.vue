<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useCurrencyStore } from '~/stores/currency'
import { useAuthStore } from '~/stores/auth'
import { useApiUrl } from '~/composables/useApi'

const route = useRoute()
const router = useRouter()
const currencyStore = useCurrencyStore()
const authStore = useAuthStore()

import { getHotelById } from '~/data/hotelCatalog'

const hotelId = (route.query.hotelId as string) || 'htl_seoul_01'
const roomId = (route.query.roomId as string) || ''
const initialHotel = getHotelById(hotelId) || getHotelById('htl_seoul_01')

const hotel = ref<any>(initialHotel)
const room = ref<any>(initialHotel?.rooms?.find(r => r.id === roomId) || initialHotel?.rooms?.[0] || null)
const loading = ref(false)

// 사용자 입력
const contactName = ref(authStore.user?.fullName || '')
const contactEmail = ref(authStore.user?.email || '')
const contactPhone = ref(authStore.user?.phone || '+82-10-1234-5678')
const guestLastName = ref('KIM')
const guestFirstName = ref('TRIP')
const specialRequests = ref('고층 배정 부탁드립니다.')

const couponCode = ref('WELCOME2026')
const couponApplied = ref(true)
const couponDiscount = ref(30000)
const tripCoinsToUse = ref(500)
const paymentMethod = ref('CREDIT_CARD')

// 계산 결과
const priceDetail = ref<any>(null)
const isBookingComplete = ref(false)
const completedBooking = ref<any>(null)
const isSubmitting = ref(false)

const calculatePrice = async () => {
  if (!room.value) return
  try {
    const res = await fetch(useApiUrl('/bookings/calculate'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        base_amount_krw: room.value.base_price_krw,
        coupon_discount_krw: couponApplied.value ? couponDiscount.value : 0,
        trip_coins_redeem: Number(tripCoinsToUse.value),
        target_currency: currencyStore.activeCurrency
      })
    })
    const json = await res.json()
    if (json.data) {
      priceDetail.value = json.data
      return
    }
  } catch (e) {
    console.warn('Calculate API fallback', e)
  }
  // Graceful price fallback
  const base = room.value?.base_price_krw || 320000
  const disc = couponApplied.value ? couponDiscount.value : 0
  const coins = Number(tripCoinsToUse.value) || 0
  const tax = Math.round(base * 0.1)
  const finalKrw = Math.max(0, base + tax - disc - coins)
  priceDetail.value = {
    base_amount_krw: base,
    tax_amount_krw: tax,
    service_fee_krw: 0,
    coupon_discount_krw: disc,
    trip_coins_discount_krw: coins,
    final_amount_krw: finalKrw,
    final_target_amount: finalKrw
  }
}

const applyCoupon = () => {
  if (couponCode.value.toUpperCase() === 'WELCOME2026') {
    couponApplied.value = true
    couponDiscount.value = 30000
    calculatePrice()
  } else if (couponCode.value.toUpperCase() === 'HOTEL50000') {
    couponApplied.value = true
    couponDiscount.value = 50000
    calculatePrice()
  } else {
    alert('유효하지 않은 쿠폰 코드입니다.')
  }
}

const handlePayment = async () => {
  isSubmitting.value = true

  // Supplier failure test condition or validation
  if (contactName.value.trim().toUpperCase() === 'FAIL') {
    setTimeout(() => {
      isSubmitting.value = false
      alert('⚠️ [공급사 실시간 확정 실패 안내]\n호텔 예약시스템(PMS/GDS) 실시간 잔여 객실 마감으로 인해 예약이 실패하였습니다.\n결제 승인은 즉시 전액 승인 취소/환불되었으며 코인은 차감되지 않았습니다.')
    }, 600)
    return
  }

  let finalBookingId = `GF-HT-${Math.floor(10000 + Math.random() * 90000)}`
  const finalAmount = priceDetail.value?.final_amount_krw || (room.value?.base_price_krw || 550000)
  try {
    // 1. Create Draft Booking with 15min lock
    const draftRes = await fetch(useApiUrl('/bookings'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: authStore.user?.id || 'usr_guest',
        domain_type: 'HOTEL',
        base_amount_krw: priceDetail.value?.base_amount_krw || 550000,
        tax_amount_krw: priceDetail.value?.tax_amount_krw || 55000,
        service_fee_krw: priceDetail.value?.service_fee_krw || 0,
        discount_amount_krw: (priceDetail.value?.coupon_discount_krw || 0) + (priceDetail.value?.trip_coins_discount_krw || 0),
        trip_coins_used: Number(tripCoinsToUse.value),
        final_amount_krw: finalAmount,
        paid_currency: currencyStore.activeCurrency,
        paid_currency_amount: priceDetail.value?.final_target_amount || finalAmount,
        primary_contact_name: contactName.value,
        primary_contact_email: contactEmail.value,
        primary_contact_phone: contactPhone.value,
        traveler_details: [{ last_name: guestLastName.value, first_name: guestFirstName.value }],
        special_requests: specialRequests.value
      })
    })
    const draftJson = await draftRes.json()
    if (draftJson?.data?.id) {
      finalBookingId = draftJson.data.id
      // 2. Execute Payment & Auto Issuance
      await fetch(useApiUrl(`/bookings/${finalBookingId}/pay`), { method: 'POST' })
    }
  } catch (e) {
    console.warn('API booking call fallback to mock storage:', e)
  }

  // Save to local storage for My Bookings
  const hotelTitle = `${hotel.value?.name_ko || hotel.value?.name || '시그니엘 서울 롯데월드타워'} (${room.value?.name_ko || room.value?.name || '그랜드 디럭스 더블룸'})`
  try {
    const newRecord = {
      id: finalBookingId,
      domain: 'HOTEL',
      title: hotelTitle,
      schedule: '2026.11.15 체크인 ~ 2026.11.17 체크아웃 (2박)',
      amount: finalAmount,
      paid_currency: currencyStore.activeCurrency,
      contact: `${contactName.value} (${contactPhone.value})`,
      status: 'CONFIRMED',
      created_at: new Date().toISOString()
    }
    const history = JSON.parse(localStorage.getItem('user_mock_bookings') || '[]')
    history.unshift(newRecord)
    localStorage.setItem('user_mock_bookings', JSON.stringify(history))
    localStorage.setItem('last_getfortrip_booking', JSON.stringify(newRecord))
  } catch (e) {}

  authStore.deductCoins(Number(tripCoinsToUse.value))
  isSubmitting.value = false

  router.push(`/booking/success?bookingId=${finalBookingId}&domain=HOTEL&amount=${finalAmount}&title=${encodeURIComponent(hotelTitle)}&schedule=${encodeURIComponent('2026.11.15 체크인 ~ 2026.11.17 체크아웃 (2박)')}&contact=${encodeURIComponent(contactName.value + ' (' + contactPhone.value + ')')}`)
}

onMounted(async () => {
  const hotelId = (route.query.hotelId as string) || 'htl_seoul_01'
  const roomId = (route.query.roomId as string) || ''

  try {
    const res = await fetch(useApiUrl(`/hotels/${hotelId}`), { signal: AbortSignal.timeout(1500) })
    if (res.ok) {
      const json = await res.json()
      if (json.data) {
        hotel.value = json.data
        room.value = hotel.value?.rooms?.find((r: any) => r.id === roomId) || hotel.value?.rooms?.[0]
      }
    }
  } catch (e) {
    // Fall back to master hotel catalog
  }

  if (!hotel.value) {
    const catHotel = getHotelById(hotelId) || getHotelById('htl_seoul_01')
    if (catHotel) {
      hotel.value = catHotel
      room.value = catHotel.rooms.find(r => r.id === roomId) || catHotel.rooms[0]
    }
  }

  await calculatePrice()
  loading.value = false
})
</script>

<template>
  <div class="max-w-6xl mx-auto px-4 py-8">
    <!-- 결제 완료 모달 / 뷰 -->
    <div v-if="isBookingComplete" class="bg-white rounded-3xl p-8 border border-slate-200 shadow-xl max-w-xl mx-auto text-center space-y-4">
      <div class="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center text-3xl mx-auto">
        ✓
      </div>
      <h2 class="text-2xl font-black text-slate-900">호텔 예약 및 발권 완료!</h2>
      <p class="text-xs text-slate-500">예약이 성공적으로 확정되었으며 모바일 바우처가 발급되었습니다.</p>

      <div class="bg-slate-50 p-4 rounded-2xl text-left text-xs font-mono space-y-1.5 border border-slate-200">
        <div><strong>예약 번호:</strong> {{ completedBooking?.booking_code }}</div>
        <div><strong>확정 번호(PIN):</strong> <span class="text-trip-blue font-bold">{{ completedBooking?.confirmation_number }}</span></div>
        <div><strong>호텔:</strong> {{ hotel?.name_ko }}</div>
        <div><strong>객실:</strong> {{ room?.name }}</div>
        <div><strong>최종 결제 금액:</strong> {{ completedBooking?.paid_currency }} {{ completedBooking?.paid_currency_amount }}</div>
      </div>

      <div class="pt-4 flex gap-3">
        <NuxtLink to="/my/bookings" class="flex-1 py-3 bg-trip-blue text-white font-bold rounded-xl text-xs shadow-md">
          내 예약 내역 확인
        </NuxtLink>
        <NuxtLink to="/" class="py-3 px-6 bg-slate-100 text-slate-700 font-bold rounded-xl text-xs">
          홈으로
        </NuxtLink>
      </div>
    </div>

    <!-- 결제 작성 폼 -->
    <div v-else class="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <!-- 좌측 투숙객 및 할인 정보 (2열) -->
      <div class="lg:col-span-2 space-y-6">
        <!-- 1. 예약자 연락처 정보 -->
        <div class="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <h3 class="font-bold text-base text-slate-900">1. 예약자 연락처 정보</h3>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label class="block text-xs font-bold text-slate-600 mb-1">성명</label>
              <input v-model="contactName" type="text" class="w-full p-2.5 border border-slate-300 rounded-xl text-xs font-bold" />
            </div>
            <div>
              <label class="block text-xs font-bold text-slate-600 mb-1">이메일 (바우처 수신)</label>
              <input v-model="contactEmail" type="email" class="w-full p-2.5 border border-slate-300 rounded-xl text-xs font-bold" />
            </div>
            <div>
              <label class="block text-xs font-bold text-slate-600 mb-1">휴대폰 번호</label>
              <input v-model="contactPhone" type="tel" class="w-full p-2.5 border border-slate-300 rounded-xl text-xs font-bold" />
            </div>
          </div>
        </div>

        <!-- 2. 투숙객 영문 정보 -->
        <div class="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <h3 class="font-bold text-base text-slate-900">2. 실투숙객 정보 (여권 일치 필요)</h3>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-bold text-slate-600 mb-1">영문 성 (Last Name)</label>
              <input v-model="guestLastName" type="text" class="w-full p-2.5 border border-slate-300 rounded-xl text-xs font-bold uppercase" />
            </div>
            <div>
              <label class="block text-xs font-bold text-slate-600 mb-1">영문 이름 (First Name)</label>
              <input v-model="guestFirstName" type="text" class="w-full p-2.5 border border-slate-300 rounded-xl text-xs font-bold uppercase" />
            </div>
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-600 mb-1">특별 요청 사항</label>
            <textarea v-model="specialRequests" rows="2" class="w-full p-2.5 border border-slate-300 rounded-xl text-xs" placeholder="금연실, 고층 배정 등"></textarea>
          </div>
        </div>

        <!-- 3. 프로모션 쿠폰 및 getfortrip 코인 적용 -->
        <div class="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <h3 class="font-bold text-base text-slate-900">3. 할인 쿠폰 및 getfortrip Coins (G-Coins) 사용</h3>
          
          <div class="flex gap-2">
            <input v-model="couponCode" type="text" class="p-2.5 border border-slate-300 rounded-xl text-xs font-mono font-bold uppercase w-48" placeholder="쿠폰 코드" />
            <button @click="applyCoupon" class="px-4 py-2 bg-slate-900 hover:bg-black text-white text-xs font-bold rounded-xl">
              쿠폰 적용
            </button>
            <span v-if="couponApplied" class="text-xs font-bold text-emerald-600 flex items-center">
              ✓ 웰컴 쿠폰 ₩30,000 할인 적용됨
            </span>
          </div>

          <div class="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
            <div>
              <span class="font-bold text-slate-800">getfortrip Coins 보유 잔여:</span>
              <span class="font-mono font-bold text-amber-600 ml-1">{{ (authStore.user?.tripCoins || 0).toLocaleString() }}G</span>
              <span class="text-slate-400 text-[11px] ml-1">(100G = ₩1,000 할인)</span>
            </div>
            <div class="flex items-center gap-2">
              <input v-model="tripCoinsToUse" @input="calculatePrice" type="number" min="0" :max="authStore.user?.tripCoins || 0" class="w-24 p-1.5 border border-slate-300 rounded-lg text-xs font-mono font-bold text-right" />
              <span>G 차감</span>
            </div>
          </div>
        </div>

        <!-- 4. 결제 수단 선택 -->
        <div class="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-3">
          <h3 class="font-bold text-base text-slate-900">4. 결제 수단 선택</h3>
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <button
              v-for="m in [
                { id: 'CREDIT_CARD', label: '신용/체크카드' },
                { id: 'NAVER_PAY', label: '네이버페이' },
                { id: 'KAKAO_PAY', label: '카카오페이' },
                { id: 'TOSS_PAY', label: '토스페이' }
              ]"
              :key="m.id"
              @click="paymentMethod = m.id"
              :class="[
                'p-3 rounded-xl border text-xs font-bold transition text-center',
                paymentMethod === m.id ? 'border-trip-blue bg-blue-50/50 text-trip-blue ring-2 ring-blue-500/20' : 'border-slate-200 text-slate-600'
              ]"
            >
              {{ m.label }}
            </button>
          </div>
        </div>
      </div>

      <!-- 우측 요약 및 최종 결제 금액 (1열) -->
      <div class="space-y-6">
        <div class="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4 sticky top-24">
          <h3 class="font-bold text-base text-slate-900 pb-3 border-b border-slate-100">예약 상품 요약</h3>

          <div v-if="hotel && room" class="space-y-2">
            <div class="font-black text-slate-900 text-sm">{{ hotel.name_ko }}</div>
            <div class="text-xs text-slate-500">{{ room.name }}</div>
            <div class="text-[11px] text-slate-400">1박 일정 · 성인 2인</div>
          </div>

          <!-- 실시간 정밀 가격 계산 내역 -->
          <div v-if="priceDetail" class="space-y-2 text-xs pt-3 border-t border-slate-100">
            <div class="flex justify-between text-slate-600">
              <span>기본 객실 요금</span>
              <span>₩{{ priceDetail.base_amount_krw.toLocaleString() }}</span>
            </div>
            <div class="flex justify-between text-slate-600">
              <span>세금 및 부가세 (10%)</span>
              <span>+₩{{ priceDetail.tax_amount_krw.toLocaleString() }}</span>
            </div>
            <div class="flex justify-between text-slate-600">
              <span>플랫폼 서비스 수수료 (3%)</span>
              <span>+₩{{ priceDetail.service_fee_krw.toLocaleString() }}</span>
            </div>
            <div v-if="priceDetail.coupon_discount_krw > 0" class="flex justify-between text-emerald-600 font-bold">
              <span>쿠폰 할인</span>
              <span>-₩{{ priceDetail.coupon_discount_krw.toLocaleString() }}</span>
            </div>
            <div v-if="priceDetail.trip_coins_discount_krw > 0" class="flex justify-between text-amber-600 font-bold">
              <span>getfortrip 코인 사용 할인</span>
              <span>-₩{{ priceDetail.trip_coins_discount_krw.toLocaleString() }}</span>
            </div>

            <div class="pt-3 border-t border-slate-200 flex justify-between items-baseline">
              <span class="font-bold text-slate-900">최종 결제 금액</span>
              <div class="text-right">
                <div class="text-2xl font-black text-trip-blue">
                  {{ priceDetail.symbol }}{{ priceDetail.final_target_amount }}
                </div>
                <div class="text-[10px] text-slate-400 font-mono">
                  (₩{{ priceDetail.final_amount_krw.toLocaleString() }})
                </div>
              </div>
            </div>
          </div>

          <button
            @click="handlePayment"
            :disabled="isSubmitting"
            class="w-full py-4 bg-trip-blue hover:bg-trip-hover text-white font-black text-base rounded-2xl transition shadow-xl shadow-blue-500/30 flex items-center justify-center gap-2"
          >
            <span>{{ isSubmitting ? '발권 및 결제 진행 중...' : '예약 및 결제하기' }}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
