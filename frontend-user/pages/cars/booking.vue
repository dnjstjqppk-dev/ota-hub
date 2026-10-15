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

const car = ref<any>(null)
const loading = ref(true)

const pickupLocation = ref(route.query.loc as string || '제주국제공항 렌터카 셔틀 스테이션')
const returnLocation = ref(route.query.returnLoc as string || '제주국제공항 렌터카 셔틀 스테이션')
const pickupDate = ref(route.query.pickup as string || '2026-11-01')
const returnDate = ref(route.query.return as string || '2026-11-04')
const insuranceType = ref('SUPER_CDW') // BASIC vs SUPER_CDW

// Driver information
const driverName = ref(authStore.user.fullName)
const driverPhone = ref('+82-10-1234-5678')
const driverEmail = ref(authStore.user.email)
const driverBirth = ref('1990-03-15')
const licenseType = ref('DOMESTIC_CLASS_2') // DOMESTIC_CLASS_1, DOMESTIC_CLASS_2, IDP_INTERNATIONAL

// Discounts & Coins
const couponCode = ref('WELCOME2026')
const couponApplied = ref(true)
const couponDiscount = ref(15000)
const tripCoinsToUse = ref(400)

const priceDetail = ref<any>(null)
const isSubmitting = ref(false)

const calculatePrice = async () => {
  if (!car.value) return
  // 3 days rental base
  const rentalDays = 3
  const insuranceFee = insuranceType.value === 'SUPER_CDW' ? 30000 : 0
  const rawBase = ((car.value.daily_price_krw || 65000) * rentalDays) + insuranceFee
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
    console.warn('Car calculatePrice fallback', e)
  }
  const fallbackBase = (car.value?.daily_price_krw || 65000) * 3
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
    couponDiscount.value = 15000
    calculatePrice()
  } else {
    alert('유효하지 않은 쿠폰 코드입니다.')
  }
}

const handlePayment = async () => {
  isSubmitting.value = true
  let finalBookingId = `GF-CAR-${Math.floor(10000 + Math.random() * 90000)}`
  const finalAmount = priceDetail.value?.final_amount_krw || 180000
  try {
    const draftRes = await fetch(useApiUrl('/bookings'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: authStore.user.id,
        domain_type: 'CAR',
        base_amount_krw: priceDetail.value?.base_amount_krw || 195000,
        tax_amount_krw: priceDetail.value?.tax_amount_krw || 0,
        service_fee_krw: priceDetail.value?.service_fee_krw || 0,
        discount_amount_krw: (priceDetail.value?.coupon_discount_krw || 0) + (priceDetail.value?.trip_coins_discount_krw || 0),
        trip_coins_used: Number(tripCoinsToUse.value),
        final_amount_krw: finalAmount,
        paid_currency: currencyStore.activeCurrency,
        paid_currency_amount: priceDetail.value?.final_target_amount || finalAmount,
        primary_contact_name: driverName.value,
        primary_contact_email: driverEmail.value,
        primary_contact_phone: driverPhone.value,
        traveler_details: [
          {
            name: driverName.value,
            birth: driverBirth.value,
            license: licenseType.value,
            insurance: insuranceType.value
          }
        ],
        special_requests: `렌터카 대여: ${pickupLocation.value} 인수, ${pickupDate.value} ~ ${returnDate.value}, 보험: ${insuranceType.value}`
      })
    })
    const draftJson = await draftRes.json()
    if (draftJson?.data?.id) {
      finalBookingId = draftJson.data.id
      // Payment transition
      await fetch(useApiUrl(`/bookings/${finalBookingId}/pay`), { method: 'POST' })
    }
  } catch (e) {
    console.warn('API car booking fallback to mock storage:', e)
  }

  // Save to local storage for My Bookings
  const carTitle = `${car.value?.company_name || '롯데렌터카'} - ${car.value?.vehicle_model || '현대 아반떼 CN7'} (${insuranceType.value === 'CDW_FULL' ? '완전자차 포함' : '일반자차'})`
  const carSchedule = `${pickupLocation.value} (${pickupDate.value} 10:00 ~ ${returnDate.value} 10:00)`
  try {
    const newRecord = {
      id: finalBookingId,
      domain: 'CAR',
      title: carTitle,
      schedule: carSchedule,
      amount: finalAmount,
      paid_currency: currencyStore.activeCurrency,
      contact: `${driverName.value} (${driverPhone.value})`,
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

  router.push(`/booking/success?bookingId=${finalBookingId}&domain=CAR&amount=${finalAmount}&title=${encodeURIComponent(carTitle)}&schedule=${encodeURIComponent(carSchedule)}&contact=${encodeURIComponent(driverName.value + ' (' + driverPhone.value + ')')}`)
}

onMounted(async () => {
  loading.value = true
  try {
    const res = await fetch(useApiUrl('/cars'))
    const json = await res.json()
    const carsList = json.data || []
    car.value = carsList[0] || {
      company_name: '롯데렌터카 (LOTTE Rent-a-Car)',
      vehicle_model: '현대 아반떼 CN7',
      seats: 5,
      transmission: '오토 (Auto)',
      daily_price_krw: 58000,
      image_url: 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?w=600'
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
    렌터카 예약 정보를 불러오는 중입니다...
  </div>

  <div v-else-if="car" class="max-w-6xl mx-auto px-4 py-8 space-y-8">
    <!-- 헤더 -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <div class="flex items-center gap-2 text-xs text-slate-400 mb-1">
          <NuxtLink to="/cars" class="hover:underline">렌터카</NuxtLink> <span>›</span>
          <span class="text-slate-800 font-bold">운전자 정보 및 결제</span>
        </div>
        <h1 class="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">렌터카 대여 예약</h1>
      </div>

      <div class="flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-200 text-trip-blue rounded-xl text-xs font-bold">
        <span>🚗</span>
        <span>인수 24시간 전 100% 무료 취소 보장</span>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
      <!-- 좌측: 대여 차량 및 운전자 정보 -->
      <div class="lg:col-span-8 space-y-6">
        <!-- 차량 요약 -->
        <div class="bg-white rounded-3xl border border-slate-200/90 p-6 shadow-sm flex flex-col sm:flex-row items-start sm:items-center gap-5">
          <img :src="car.image_url" class="w-full sm:w-40 h-28 object-cover rounded-2xl flex-shrink-0" />
          <div class="space-y-1.5 flex-1">
            <span class="px-2.5 py-0.5 bg-slate-100 text-slate-700 text-[10px] font-bold rounded">
              {{ car.company_name }}
            </span>
            <h3 class="font-black text-slate-900 text-lg">{{ car.vehicle_model }}</h3>
            <div class="flex items-center gap-3 text-xs text-slate-500 font-semibold">
              <span>👥 {{ car.seats }}인승</span>
              <span>•</span>
              <span>⚙️ {{ car.transmission }}</span>
              <span>•</span>
              <span class="text-emerald-600 font-bold">✓ 주행거리 무제한</span>
            </div>
            <div class="text-xs text-slate-400 pt-1">
              📍 인수 장소: {{ pickupLocation }}
            </div>
          </div>
        </div>

        <!-- 보험 옵션 선택 (Super CDW) -->
        <div class="bg-white rounded-3xl border border-slate-200/90 p-6 shadow-sm space-y-4">
          <h3 class="font-black text-base text-slate-900">자차 손해 면책 보험 (CDW) 선택</h3>
          
          <div class="space-y-3 text-xs">
            <div
              @click="insuranceType = 'SUPER_CDW'; calculatePrice()"
              :class="[
                'p-4 rounded-2xl border cursor-pointer transition flex items-start justify-between gap-4',
                insuranceType === 'SUPER_CDW' ? 'border-trip-blue bg-blue-50/40 ring-2 ring-blue-500/20' : 'border-slate-200 hover:border-slate-300'
              ]"
            >
              <div class="space-y-1">
                <div class="font-bold text-sm text-slate-900 flex items-center gap-2">
                  <span>완전 자차 슈퍼 커버 (Super CDW)</span>
                  <span class="px-2 py-0.5 bg-blue-600 text-white rounded text-[10px] font-bold">추천 95%</span>
                </div>
                <p class="text-slate-500 leading-relaxed">
                  사고 시 자기부담금 0원 + 단독사고/타이어/휠/유리창 파손 전액 보상 + 휴차보상료 100% 면제
                </p>
              </div>
              <div class="font-black text-trip-blue font-mono whitespace-nowrap">+₩30,000</div>
            </div>

            <div
              @click="insuranceType = 'BASIC'; calculatePrice()"
              :class="[
                'p-4 rounded-2xl border cursor-pointer transition flex items-start justify-between gap-4',
                insuranceType === 'BASIC' ? 'border-trip-blue bg-blue-50/40 ring-2 ring-blue-500/20' : 'border-slate-200 hover:border-slate-300'
              ]"
            >
              <div class="space-y-1">
                <div class="font-bold text-sm text-slate-900">기본 자차 보험 (Basic CDW)</div>
                <p class="text-slate-400 leading-relaxed">사고 시 건당 자기부담금 최대 50만원 발생 및 휴차보상료 본인 부담</p>
              </div>
              <div class="font-bold text-slate-600 font-mono whitespace-nowrap">+₩0</div>
            </div>
          </div>
        </div>

        <!-- 운전자 정보 -->
        <div class="bg-white rounded-3xl border border-slate-200/90 p-6 shadow-sm space-y-4">
          <h3 class="font-black text-base text-slate-900">제1 운전자 정보</h3>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label class="text-xs font-bold text-slate-600 block mb-1">운전자 성명</label>
              <input
                v-model="driverName"
                type="text"
                class="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
              />
            </div>

            <div>
              <label class="text-xs font-bold text-slate-600 block mb-1">휴대폰 번호</label>
              <input
                v-model="driverPhone"
                type="tel"
                class="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
              />
            </div>

            <div>
              <label class="text-xs font-bold text-slate-600 block mb-1">생년월일 (만 21세 이상)</label>
              <input
                v-model="driverBirth"
                type="date"
                class="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
              />
            </div>

            <div>
              <label class="text-xs font-bold text-slate-600 block mb-1">운전면허 종류</label>
              <select
                v-model="licenseType"
                class="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
              >
                <option value="DOMESTIC_CLASS_2">국내 2종 보통 면허 이상 (취득 1년 이상)</option>
                <option value="DOMESTIC_CLASS_1">국내 1종 보통 면허</option>
                <option value="IDP_INTERNATIONAL">국제운전면허증 (IDP) 소지자</option>
              </select>
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

      <!-- 우측: 결제 금액 내역 -->
      <div class="lg:col-span-4 sticky top-24 bg-white rounded-3xl border border-slate-200 shadow-xl p-6 space-y-5">
        <h3 class="font-black text-lg text-slate-900">렌터카 요금 명세서</h3>

        <div v-if="priceDetail" class="space-y-3 text-xs text-slate-600">
          <div class="flex justify-between">
            <span>차량 대여료 (3일)</span>
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
          class="w-full py-3.5 bg-trip-blue hover:bg-blue-600 text-white font-black text-sm rounded-2xl shadow-lg transition flex items-center justify-center gap-2 disabled:bg-slate-300"
        >
          <span v-if="isSubmitting">예약 승인 진행 중...</span>
          <span v-else>💳 렌터카 즉시 결제 및 바우처 발급</span>
        </button>

        <div class="text-[10px] text-slate-400 space-y-1 leading-relaxed">
          <div>✓ 인수 현장에서 실물 운전면허증 및 본인 명의 신용카드를 제시해야 합니다.</div>
          <div>✓ 대여 시작 24시간 전까지 100% 위약금 없이 무료 취소 가능합니다.</div>
        </div>
      </div>
    </div>
  </div>
</template>

