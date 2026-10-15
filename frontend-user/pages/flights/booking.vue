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

const flight = ref<any>(null)
const loading = ref(true)

// Passenger details
const contactName = ref(authStore.user.fullName)
const contactEmail = ref(authStore.user.email)
const contactPhone = ref('+82-10-1234-5678')
const passengerTitle = ref('MR')
const passengerLastName = ref('KIM')
const passengerFirstName = ref('MINSU')
const passengerBirth = ref('1992-05-18')
const passportNumber = ref('M12345678')
const passportExpiry = ref('2032-12-31')
const seatPreference = ref('WINDOW') // WINDOW, AISLE, ANY
const extraBaggage = ref(0) // 0, 5kg, 10kg

// Discounts & Coins
const couponCode = ref('WELCOME2026')
const couponApplied = ref(true)
const couponDiscount = ref(20000)
const tripCoinsToUse = ref(500)

const priceDetail = ref<any>(null)
const isSubmitting = ref(false)

const calculatePrice = async () => {
  if (!flight.value) return
  const rawBase = (flight.value.base_price_krw || 250000) + (extraBaggage.value * 15000)
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
    priceDetail.value = json.data
  } catch (e) {
    console.error(e)
  }
}

const applyCoupon = () => {
  if (couponCode.value.toUpperCase() === 'WELCOME2026') {
    couponApplied.value = true
    couponDiscount.value = 20000
    calculatePrice()
  } else {
    alert('유효하지 않은 쿠폰 코드입니다.')
  }
}

const handlePayment = async () => {
  isSubmitting.value = true
  try {
    const draftRes = await fetch(useApiUrl('/bookings'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: authStore.user.id,
        domain_type: 'FLIGHT',
        base_amount_krw: priceDetail.value?.base_amount_krw || 250000,
        tax_amount_krw: priceDetail.value?.tax_amount_krw || 28000,
        service_fee_krw: priceDetail.value?.service_fee_krw || 0,
        discount_amount_krw: (priceDetail.value?.coupon_discount_krw || 0) + (priceDetail.value?.trip_coins_discount_krw || 0),
        trip_coins_used: Number(tripCoinsToUse.value),
        final_amount_krw: priceDetail.value?.final_amount_krw || 258000,
        paid_currency: currencyStore.activeCurrency,
        paid_currency_amount: priceDetail.value?.final_target_amount || 258000,
        primary_contact_name: contactName.value,
        primary_contact_email: contactEmail.value,
        primary_contact_phone: contactPhone.value,
        traveler_details: [
          {
            title: passengerTitle.value,
            last_name: passengerLastName.value,
            first_name: passengerFirstName.value,
            birth_date: passengerBirth.value,
            passport_number: passportNumber.value,
            passport_expiry: passportExpiry.value,
            seat_preference: seatPreference.value
          }
        ],
        special_requests: `좌석 선호: ${seatPreference.value}, 추가 수하물: ${extraBaggage.value}kg`
      })
    })
    const draftJson = await draftRes.json()
    const bookingId = draftJson.data.id

    // Payment transition
    await fetch(useApiUrl(`/bookings/${bookingId}/pay`), { method: 'POST' })
    authStore.deductCoins(Number(tripCoinsToUse.value))

    // Direct navigate to Trip-style booking voucher detail
    router.push(`/my/bookings/${bookingId}`)
  } catch (e) {
    alert('항공권 예약 처리 중 오류가 발생했습니다.')
  } finally {
    isSubmitting.value = false
  }
}

onMounted(async () => {
  loading.value = true
  try {
    const res = await fetch(useApiUrl('/flights'))
    const json = await res.json()
    const flightsList = json.data || []
    flight.value = flightsList[0] || {
      airline_name: '대한항공 (Korean Air)',
      flight_number: 'KE703',
      cabin_class: '일반석 (Economy)',
      departure_airport: 'ICN (인천)',
      arrival_airport: 'NRT (나리타)',
      departure_time: '2026-11-01T10:10:00Z',
      arrival_time: '2026-11-01T12:40:00Z',
      duration_minutes: 150,
      free_baggage_kg: 23,
      base_price_krw: 245000
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
    항공권 예약 정보를 불러오는 중입니다...
  </div>

  <div v-else-if="flight" class="max-w-6xl mx-auto px-4 py-8 space-y-8">
    <!-- 타이틀 & 안내 -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <div class="flex items-center gap-2 text-xs text-slate-400 mb-1">
          <NuxtLink to="/flights" class="hover:underline">항공권</NuxtLink> <span>›</span>
          <NuxtLink to="/flights/search" class="hover:underline">항공권 검색</NuxtLink> <span>›</span>
          <span class="text-slate-800 font-bold">탑승객 정보 및 결제</span>
        </div>
        <h1 class="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">항공권 발권 예약</h1>
      </div>

      <div class="flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-200 text-trip-blue rounded-xl text-xs font-bold">
        <span>🛡️</span>
        <span>실시간 좌석 확보 완료 (15:00 요금 홀드)</span>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
      <!-- 좌측: 항공편 상세 & 탑승객 여권 정보 -->
      <div class="lg:col-span-8 space-y-6">
        <!-- 항공편 정보 요약 카드 -->
        <div class="bg-white rounded-3xl border border-slate-200/90 p-6 shadow-sm space-y-4">
          <div class="flex items-center justify-between border-b border-slate-100 pb-4">
            <div class="flex items-center gap-3">
              <span class="px-2.5 py-1 bg-blue-50 text-blue-700 font-black text-xs rounded-lg">가는 편</span>
              <span class="font-black text-slate-900 text-sm">{{ flight.airline_name }}</span>
              <span class="text-xs font-mono text-slate-400">{{ flight.flight_number }}</span>
            </div>
            <span class="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-xs font-bold">{{ flight.cabin_class }}</span>
          </div>

          <div class="flex items-center justify-between text-center py-2">
            <div>
              <div class="text-2xl font-black text-slate-900 font-mono">
                {{ new Date(flight.departure_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}
              </div>
              <div class="text-xs font-bold text-slate-600 mt-0.5">{{ flight.departure_airport }}</div>
            </div>

            <div class="space-y-1">
              <div class="text-xs text-slate-400 font-medium">직항 약 {{ Math.floor(flight.duration_minutes / 60) }}시간 {{ flight.duration_minutes % 60 }}분</div>
              <div class="w-32 h-0.5 bg-slate-200 relative">
                <div class="w-2 h-2 rounded-full bg-trip-blue absolute right-0 -top-0.5"></div>
              </div>
            </div>

            <div>
              <div class="text-2xl font-black text-slate-900 font-mono">
                {{ new Date(flight.arrival_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}
              </div>
              <div class="text-xs font-bold text-slate-600 mt-0.5">{{ flight.arrival_airport }}</div>
            </div>
          </div>

          <div class="pt-3 border-t border-slate-100 flex items-center gap-4 text-xs text-slate-500">
            <span>🧳 무료 위탁수하물 {{ flight.free_baggage_kg || 23 }}kg</span>
            <span>•</span>
            <span>🍱 기내식 제공</span>
            <span>•</span>
            <span class="text-emerald-600 font-bold">✓ e-티켓 즉시 발권</span>
          </div>
        </div>

        <!-- 탑승객 여권 정보 입력 Form -->
        <div class="bg-white rounded-3xl border border-slate-200/90 p-6 shadow-sm space-y-4">
          <div class="flex items-center justify-between">
            <h3 class="font-black text-base text-slate-900">탑승객 1 (성인) 여권 정보</h3>
            <span class="text-xs text-rose-500 font-bold">* 여권 정보와 100% 일치해야 탑승 가능</span>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
            <div>
              <label class="text-xs font-bold text-slate-600 block mb-1">호칭 (Title)</label>
              <select v-model="passengerTitle" class="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800">
                <option value="MR">MR (남성)</option>
                <option value="MS">MS (여성)</option>
              </select>
            </div>

            <div>
              <label class="text-xs font-bold text-slate-600 block mb-1">영문 성 (Last Name)</label>
              <input
                v-model="passengerLastName"
                type="text"
                class="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold font-mono uppercase text-slate-800 focus:outline-none focus:border-trip-blue"
              />
            </div>

            <div>
              <label class="text-xs font-bold text-slate-600 block mb-1">영문 이름 (First Name)</label>
              <input
                v-model="passengerFirstName"
                type="text"
                class="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold font-mono uppercase text-slate-800 focus:outline-none focus:border-trip-blue"
              />
            </div>

            <div>
              <label class="text-xs font-bold text-slate-600 block mb-1">생년월일</label>
              <input
                v-model="passengerBirth"
                type="date"
                class="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
              />
            </div>

            <div>
              <label class="text-xs font-bold text-slate-600 block mb-1">여권 번호</label>
              <input
                v-model="passportNumber"
                type="text"
                class="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold font-mono uppercase text-slate-800 focus:outline-none focus:border-trip-blue"
              />
            </div>

            <div>
              <label class="text-xs font-bold text-slate-600 block mb-1">여권 만료일</label>
              <input
                v-model="passportExpiry"
                type="date"
                class="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
              />
            </div>
          </div>

          <!-- 좌석 선호 및 부가 서비스 -->
          <div class="pt-4 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label class="text-xs font-bold text-slate-600 block mb-1.5">희망 좌석 위치</label>
              <div class="grid grid-cols-2 gap-2 text-xs">
                <button
                  type="button"
                  @click="seatPreference = 'WINDOW'"
                  :class="['p-2 rounded-xl border font-bold text-center transition', seatPreference === 'WINDOW' ? 'bg-blue-50 border-trip-blue text-trip-blue' : 'bg-slate-50 border-slate-200 text-slate-600']"
                >
                  창가 (Window)
                </button>
                <button
                  type="button"
                  @click="seatPreference = 'AISLE'"
                  :class="['p-2 rounded-xl border font-bold text-center transition', seatPreference === 'AISLE' ? 'bg-blue-50 border-trip-blue text-trip-blue' : 'bg-slate-50 border-slate-200 text-slate-600']"
                >
                  복도 (Aisle)
                </button>
              </div>
            </div>

            <div>
              <label class="text-xs font-bold text-slate-600 block mb-1.5">추가 위탁 수하물 사전 구매</label>
              <select
                v-model="extraBaggage"
                @change="calculatePrice"
                class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
              >
                <option :value="0">기본 수하물 (추가 없음)</option>
                <option :value="5">+5kg 추가 (₩15,000)</option>
                <option :value="10">+10kg 추가 (₩30,000)</option>
              </select>
            </div>
          </div>
        </div>

        <!-- 할인 쿠폰 및 코인 -->
        <div class="bg-white rounded-3xl border border-slate-200/90 p-6 shadow-sm space-y-4">
          <h3 class="font-black text-base text-slate-900">할인 및 혜택 적용</h3>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div class="space-y-1.5">
              <label class="text-xs font-bold text-slate-600 block">항공권 할인 쿠폰</label>
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
                getfortrip 코인 사용 (보유: {{ authStore.user.tripCoins }}G)
              </label>
              <div class="flex gap-2">
                <input
                  v-model="tripCoinsToUse"
                  type="number"
                  min="0"
                  :max="authStore.user.tripCoins"
                  class="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold"
                  @change="calculatePrice"
                />
                <span class="px-3 py-2 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold">코인</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 우측: 결제 금액 내역 및 결제 버튼 -->
      <div class="lg:col-span-4 sticky top-24 bg-white rounded-3xl border border-slate-200 shadow-xl p-6 space-y-5">
        <h3 class="font-black text-lg text-slate-900">항공 운임 명세서</h3>

        <div v-if="priceDetail" class="space-y-3 text-xs text-slate-600">
          <div class="flex justify-between">
            <span>기본 항공 운임</span>
            <span class="font-mono font-bold">{{ currencyStore.formatKRW(priceDetail.base_amount_krw) }}</span>
          </div>

          <div class="flex justify-between">
            <span>유류할증료 & 공항세</span>
            <span class="font-mono font-bold">{{ currencyStore.formatKRW(priceDetail.tax_amount_krw) }}</span>
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
          class="w-full py-3.5 bg-trip-blue hover:bg-blue-600 text-white font-black text-sm rounded-2xl shadow-lg transition flex items-center justify-center gap-2 disabled:bg-slate-300"
        >
          <span v-if="isSubmitting">발권 및 결제 진행 중...</span>
          <span v-else>💳 항공권 즉시 결제 및 e-티켓 발권</span>
        </button>

        <div class="text-[10px] text-slate-400 space-y-1 leading-relaxed">
          <div>✓ 결제 완료 즉시 국제선 전자 항공권(e-Ticket)이 발행됩니다.</div>
          <div>✓ 출발 24시간 전 온라인 체크인 알림을 제공합니다.</div>
        </div>
      </div>
    </div>
  </div>
</template>
