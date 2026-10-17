<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useCurrencyStore } from '~/stores/currency'
import { useAuthStore } from '~/stores/auth'
import { useApiUrl } from '~/composables/useApi'

const route = useRoute()
const router = useRouter()
const currencyStore = useCurrencyStore()
const authStore = useAuthStore()

const defaultTrain = {
  train_type: 'KTX',
  train_number: 'KTX-103',
  departure_station: '서울역 (Seoul)',
  arrival_station: '부산역 (Busan)',
  departure_time: '2026-11-01T08:00:00Z',
  arrival_time: '2026-11-01T10:15:00Z',
  duration_minutes: 135,
  seat_class: '일반실 (Standard)',
  price_krw: 59800
}

const train = ref<any>(defaultTrain)
const loading = ref(false)

// Passenger details
const contactName = ref(authStore.user?.fullName || '')
const contactEmail = ref(authStore.user?.email || '')
const contactPhone = ref(authStore.user?.phone || '+82-10-1234-5678')
const passengerName = ref('KIM MINSU')
const seatPreference = ref('WINDOW') // WINDOW, AISLE

// Discounts & Coins
const couponCode = ref('WELCOME2026')
const couponApplied = ref(true)
const couponDiscount = ref(5000)
const tripCoinsToUse = ref(200)

const priceDetail = ref<any>(null)
const isSubmitting = ref(false)

const calculatePrice = async () => {
  if (!train.value) return
  const rawBase = train.value.price_krw || 59800
  try {
    const res = await fetch(useApiUrl('/bookings/calculate'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        base_amount_krw: rawBase,
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
    console.warn('Train calculatePrice fallback', e)
  }
  const fallbackBase = train.value?.base_price_krw || 59800
  const disc = couponApplied.value ? couponDiscount.value : 0
  const coins = Number(tripCoinsToUse.value) || 0
  const finalKrw = Math.max(0, fallbackBase - disc - coins)
  priceDetail.value = {
    base_amount_krw: fallbackBase,
    tax_amount_krw: 0,
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
    couponDiscount.value = 5000
    calculatePrice()
  } else {
    alert('유효하지 않은 쿠폰 코드입니다.')
  }
}

const handlePayment = async () => {
  isSubmitting.value = true
  let finalBookingId = `GF-TR-${Math.floor(10000 + Math.random() * 90000)}`
  const finalAmount = priceDetail.value?.final_amount_krw || 54800
  try {
    const draftRes = await fetch(useApiUrl('/bookings'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: authStore.user?.id || 'usr_guest',
        domain_type: 'TRAIN',
        base_amount_krw: priceDetail.value?.base_amount_krw || 59800,
        tax_amount_krw: priceDetail.value?.tax_amount_krw || 0,
        service_fee_krw: priceDetail.value?.service_fee_krw || 0,
        discount_amount_krw: (priceDetail.value?.coupon_discount_krw || 0) + (priceDetail.value?.trip_coins_discount_krw || 0),
        trip_coins_used: Number(tripCoinsToUse.value),
        final_amount_krw: finalAmount,
        paid_currency: currencyStore.activeCurrency,
        paid_currency_amount: priceDetail.value?.final_target_amount || finalAmount,
        primary_contact_name: contactName.value,
        primary_contact_email: contactEmail.value,
        primary_contact_phone: contactPhone.value,
        traveler_details: [
          {
            name: passengerName.value,
            seat_preference: seatPreference.value
          }
        ],
        special_requests: `기차 승차권: 좌석 선호 ${seatPreference.value}`
      })
    })
    const draftJson = await draftRes.json()
    if (draftJson?.data?.id) {
      finalBookingId = draftJson.data.id
      // Payment transition
      await fetch(useApiUrl(`/bookings/${finalBookingId}/pay`), { method: 'POST' })
    }
  } catch (e) {
    console.warn('API train booking fallback to mock storage:', e)
  }

  // Save to local storage for My Bookings
  const trainTitle = `${train.value?.train_type || 'KTX'} ${train.value?.train_number || '021'} (${train.value?.departure_station || '서울역'} → ${train.value?.arrival_station || '부산역'})`
  const trainSchedule = '2026년 11월 01일 (일) 08:30 ~ 11:05 (3호차 12A)'
  try {
    const newRecord = {
      id: finalBookingId,
      domain: 'TRAIN',
      title: trainTitle,
      schedule: trainSchedule,
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

  router.push(`/booking/success?bookingId=${finalBookingId}&domain=TRAIN&amount=${finalAmount}&title=${encodeURIComponent(trainTitle)}&schedule=${encodeURIComponent(trainSchedule)}&contact=${encodeURIComponent(contactName.value + ' (' + contactPhone.value + ')')}`)
}

onMounted(async () => {
  loading.value = true
  try {
    const res = await fetch(useApiUrl('/trains'))
    const json = await res.json()
    const trainsList = json.data || []
    train.value = trainsList[0] || {
      train_type: 'KTX',
      train_number: 'KTX-103',
      departure_station: '서울역 (Seoul)',
      arrival_station: '부산역 (Busan)',
      departure_time: '2026-11-01T08:00:00Z',
      arrival_time: '2026-11-01T10:15:00Z',
      duration_minutes: 135,
      seat_class: '일반실 (Standard)',
      price_krw: 59800
    }
    await calculatePrice()
  } catch (e) {
    console.error(e)
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div v-if="loading" class="max-w-4xl mx-auto px-4 py-24 text-center text-slate-400 font-bold">
    승차권 예매 정보를 불러오는 중입니다...
  </div>

  <div v-else-if="train" class="max-w-6xl mx-auto px-4 py-8 space-y-8">
    <!-- 상단 안내 -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <div class="flex items-center gap-2 text-xs text-slate-400 mb-1">
          <NuxtLink to="/trains" class="hover:underline">기차표</NuxtLink> <span>›</span>
          <NuxtLink to="/trains/search" class="hover:underline">시간표</NuxtLink> <span>›</span>
          <span class="text-slate-800 font-bold">승차권 예매 및 발권</span>
        </div>
        <h1 class="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">고속철도 승차권 예매</h1>
      </div>

      <div class="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-bold">
        <span>⚡</span>
        <span>모바일 QR 즉시 발권 (현장 수령 불필요)</span>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
      <!-- 좌측: 열차 일정 & 탑승자 정보 -->
      <div class="lg:col-span-8 space-y-6">
        <!-- 열차 운행 정보 카드 -->
        <div class="bg-white rounded-3xl border border-slate-200/90 p-6 shadow-sm space-y-4">
          <div class="flex items-center justify-between border-b border-slate-100 pb-4">
            <div class="flex items-center gap-3">
              <span class="px-2.5 py-1 bg-emerald-50 text-emerald-700 font-black text-xs rounded-lg">{{ train.train_type }}</span>
              <span class="font-black text-slate-900 text-sm">{{ train.train_number }}</span>
            </div>
            <span class="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-xs font-bold">{{ train.seat_class }}</span>
          </div>

          <div class="flex items-center justify-between text-center py-2">
            <div>
              <div class="text-2xl font-black text-slate-900 font-mono">
                {{ new Date(train.departure_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}
              </div>
              <div class="text-xs font-bold text-slate-600 mt-0.5">{{ train.departure_station }}</div>
            </div>

            <div class="space-y-1">
              <div class="text-xs text-slate-400 font-medium">{{ train.duration_minutes }}분 소요</div>
              <div class="w-32 h-0.5 bg-emerald-200 relative">
                <div class="w-2 h-2 rounded-full bg-emerald-600 absolute right-0 -top-0.5"></div>
              </div>
            </div>

            <div>
              <div class="text-2xl font-black text-slate-900 font-mono">
                {{ new Date(train.arrival_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}
              </div>
              <div class="text-xs font-bold text-slate-600 mt-0.5">{{ train.arrival_station }}</div>
            </div>
          </div>
        </div>

        <!-- 탑승자 정보 & 좌석 선호 -->
        <div class="bg-white rounded-3xl border border-slate-200/90 p-6 shadow-sm space-y-4">
          <h3 class="font-black text-base text-slate-900">탑승자 정보 및 좌석 선호</h3>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div>
              <label class="text-xs font-bold text-slate-600 block mb-1">탑승자 성명</label>
              <input
                v-model="passengerName"
                type="text"
                class="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-trip-blue"
              />
            </div>

            <div>
              <label class="text-xs font-bold text-slate-600 block mb-1">휴대폰 번호 (모바일 티켓 수신용)</label>
              <input
                v-model="contactPhone"
                type="tel"
                class="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-trip-blue"
              />
            </div>
          </div>

          <!-- 좌석 선호도 -->
          <div class="pt-4 border-t border-slate-100">
            <label class="text-xs font-bold text-slate-600 block mb-2">선호 좌석 배치</label>
            <div class="grid grid-cols-2 gap-3 text-xs">
              <button
                type="button"
                @click="seatPreference = 'WINDOW'"
                :class="['p-3 rounded-xl border font-bold text-center transition', seatPreference === 'WINDOW' ? 'bg-emerald-50 border-emerald-500 text-emerald-800' : 'bg-slate-50 border-slate-200 text-slate-600']"
              >
                🪟 창가 좌석 (Window Seat)
              </button>
              <button
                type="button"
                @click="seatPreference = 'AISLE'"
                :class="['p-3 rounded-xl border font-bold text-center transition', seatPreference === 'AISLE' ? 'bg-emerald-50 border-emerald-500 text-emerald-800' : 'bg-slate-50 border-slate-200 text-slate-600']"
              >
                🚶 복도 좌석 (Aisle Seat)
              </button>
            </div>
          </div>
        </div>

        <!-- 할인 쿠폰 & 코인 -->
        <div class="bg-white rounded-3xl border border-slate-200/90 p-6 shadow-sm space-y-4">
          <h3 class="font-black text-base text-slate-900">할인 및 혜택 적용</h3>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div class="space-y-1.5">
              <label class="text-xs font-bold text-slate-600 block">할인 쿠폰</label>
              <div class="flex gap-2">
                <input
                  v-model="couponCode"
                  type="text"
                  class="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono uppercase font-bold"
                />
                <button
                  @click="applyCoupon"
                  class="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-black transition"
                >
                  적용
                </button>
              </div>
            </div>

            <div class="space-y-1.5">
              <label class="text-xs font-bold text-slate-600 block">
                getfortrip 코인 사용 (보유: {{ authStore.user?.tripCoins || 0 }}G)
              </label>
              <div class="flex gap-2">
                <input
                  v-model="tripCoinsToUse"
                  type="number"
                  min="0"
                  :max="authStore.user?.tripCoins || 0"
                  class="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold"
                  @change="calculatePrice"
                />
                <span class="px-3 py-2 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold">코인</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 우측: 결제 금액 내역 -->
      <div class="lg:col-span-4 sticky top-24 bg-white rounded-3xl border border-slate-200 shadow-xl p-6 space-y-5">
        <h3 class="font-black text-lg text-slate-900">승차권 요금 명세서</h3>

        <div v-if="priceDetail" class="space-y-3 text-xs text-slate-600">
          <div class="flex justify-between">
            <span>승차권 기준 운임</span>
            <span class="font-mono font-bold">{{ currencyStore.formatKRW(priceDetail.base_amount_krw) }}</span>
          </div>

          <div v-if="priceDetail.coupon_discount_krw > 0" class="flex justify-between text-rose-600 font-bold">
            <span>쿠폰 할인</span>
            <span class="font-mono">-{{ currencyStore.formatKRW(priceDetail.coupon_discount_krw) }}</span>
          </div>

          <div v-if="priceDetail.trip_coins_discount_krw > 0" class="flex justify-between text-amber-600 font-bold">
            <span>코인 사용 할인</span>
            <span class="font-mono">-{{ currencyStore.formatKRW(priceDetail.trip_coins_discount_krw) }}</span>
          </div>

          <div class="pt-4 border-t border-slate-200 flex items-baseline justify-between">
            <span class="font-bold text-slate-900 text-sm">최종 결제 금액</span>
            <div class="text-right">
              <div class="text-2xl font-black text-trip-blue font-mono">
                {{ currencyStore.activeCurrency }} {{ priceDetail.final_target_amount?.toLocaleString() }}
              </div>
              <div class="text-[10px] text-slate-400">약 {{ currencyStore.formatKRW(priceDetail.final_amount_krw) }}</div>
            </div>
          </div>
        </div>

        <button
          @click="handlePayment"
          :disabled="isSubmitting"
          class="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm rounded-2xl shadow-lg transition flex items-center justify-center gap-2 disabled:bg-slate-300"
        >
          <span v-if="isSubmitting">승차권 발권 중...</span>
          <span v-else>💳 승차권 즉시 결제 및 모바일 QR 발권</span>
        </button>

        <div class="text-[10px] text-slate-400 space-y-1 leading-relaxed">
          <div>✓ 결제 완료 즉시 스마트폰 화면에 탑승용 QR코드가 표시됩니다.</div>
          <div>✓ 열차 출발 3시간 전까지 모바일에서 간편 취소 가능합니다.</div>
        </div>
      </div>
    </div>
  </div>
</template>
