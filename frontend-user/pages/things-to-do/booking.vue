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

const activity = ref<any>(null)
const loading = ref(true)

const selectedDate = ref(route.query.date as string || new Date().toISOString().split('T')[0])
const adultCount = ref(Number(route.query.adults) || 1)
const childCount = ref(Number(route.query.children) || 0)
const selectedPackageName = ref('기본 입장권 (General Admission)')

// Primary contact
const contactName = ref(authStore.user.fullName)
const contactEmail = ref(authStore.user.email)
const contactPhone = ref('+82-10-1234-5678')
const leadTravelerName = ref('HONG GILDONG')
const specialRequests = ref('현장 영문 모바일 바우처 발송 요청')

// Discount & Coins
const couponCode = ref('WELCOME2026')
const couponApplied = ref(true)
const couponDiscount = ref(10000)
const tripCoinsToUse = ref(300)

const priceDetail = ref<any>(null)
const isSubmitting = ref(false)

const calculatePrice = async () => {
  if (!activity.value) return
  const rawBase = (activity.value.price_krw || 50000) * adultCount.value + (activity.value.price_krw || 50000) * 0.7 * childCount.value
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
    couponDiscount.value = 10000
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
        domain_type: 'ACTIVITY',
        base_amount_krw: priceDetail.value?.base_amount_krw || 50000,
        tax_amount_krw: priceDetail.value?.tax_amount_krw || 5000,
        service_fee_krw: priceDetail.value?.service_fee_krw || 0,
        discount_amount_krw: (priceDetail.value?.coupon_discount_krw || 0) + (priceDetail.value?.trip_coins_discount_krw || 0),
        trip_coins_used: Number(tripCoinsToUse.value),
        final_amount_krw: priceDetail.value?.final_amount_krw || 45000,
        paid_currency: currencyStore.activeCurrency,
        paid_currency_amount: priceDetail.value?.final_target_amount || 45000,
        primary_contact_name: contactName.value,
        primary_contact_email: contactEmail.value,
        primary_contact_phone: contactPhone.value,
        traveler_details: [{ name: leadTravelerName.value, type: 'ADULT' }],
        special_requests: specialRequests.value
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
    alert('투어 예약 처리 중 오류가 발생했습니다.')
  } finally {
    isSubmitting.value = false
  }
}

onMounted(async () => {
  loading.value = true
  try {
    const activityId = route.query.activityId as string || 'a0000000-0000-0000-0000-000000000001'
    const res = await fetch(useApiUrl(`/activities/${activityId}`))
    const json = await res.json()
    activity.value = json.data
    if (activity.value?.packages?.length) {
      const pkg = activity.value.packages.find((p: any) => p.id === route.query.packageId)
      if (pkg) selectedPackageName.value = pkg.name
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
    예약 정보를 불러오는 중입니다...
  </div>

  <div v-else-if="activity" class="max-w-6xl mx-auto px-4 py-8 space-y-8">
    <!-- 타이틀 & 안심 보장 -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <div class="flex items-center gap-2 text-xs text-slate-400 mb-1">
          <NuxtLink to="/things-to-do" class="hover:underline">투어·티켓</NuxtLink> <span>›</span>
          <span class="text-slate-800 font-bold">주문 및 결제</span>
        </div>
        <h1 class="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">투어 & 티켓 즉시 예약</h1>
      </div>

      <div class="flex items-center gap-2 px-3 py-1.5 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl text-xs font-bold">
        <span>⏱️</span>
        <span>최저가 보장 요금 15:00 잔여</span>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
      <!-- 좌측: 예약자 정보 & 옵션 -->
      <div class="lg:col-span-8 space-y-6">
        <!-- 상품 요약 카드 -->
        <div class="bg-white rounded-3xl border border-slate-200/90 p-6 shadow-sm flex items-start gap-5">
          <img :src="activity.thumbnail_url" class="w-28 h-28 object-cover rounded-2xl flex-shrink-0" />
          <div class="space-y-1.5 flex-1">
            <span class="px-2 py-0.5 bg-blue-50 text-blue-700 text-[10px] font-bold rounded">
              {{ activity.category }}
            </span>
            <h3 class="font-black text-slate-900 text-base leading-snug">{{ activity.title }}</h3>
            <div class="text-xs text-slate-500 font-medium">선택 옵션: <strong class="text-slate-800">{{ selectedPackageName }}</strong></div>
            <div class="flex items-center gap-3 text-xs text-slate-400 pt-1">
              <span>📅 이용일: {{ selectedDate }}</span>
              <span>•</span>
              <span>👥 성인 {{ adultCount }}명 / 아동 {{ childCount }}명</span>
            </div>
          </div>
        </div>

        <!-- 예약자 및 여행자 정보 입력 -->
        <div class="bg-white rounded-3xl border border-slate-200/90 p-6 shadow-sm space-y-4">
          <h3 class="font-black text-base text-slate-900">대표 예약자 및 여행자 정보</h3>
          <p class="text-xs text-slate-400">모바일 바우처 발송 및 현장 확인을 위한 필수 정보입니다.</p>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div>
              <label class="text-xs font-bold text-slate-600 block mb-1">예약자 성명</label>
              <input
                v-model="contactName"
                type="text"
                class="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-trip-blue"
              />
            </div>

            <div>
              <label class="text-xs font-bold text-slate-600 block mb-1">이메일 (바우처 수신용)</label>
              <input
                v-model="contactEmail"
                type="email"
                class="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-trip-blue"
              />
            </div>

            <div>
              <label class="text-xs font-bold text-slate-600 block mb-1">연락처 (휴대폰)</label>
              <input
                v-model="contactPhone"
                type="tel"
                class="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-trip-blue"
              />
            </div>

            <div>
              <label class="text-xs font-bold text-slate-600 block mb-1">대표 여행자 영문 성명 (여권 기준)</label>
              <input
                v-model="leadTravelerName"
                type="text"
                class="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 font-mono uppercase focus:outline-none focus:border-trip-blue"
              />
            </div>
          </div>

          <div class="pt-2">
            <label class="text-xs font-bold text-slate-600 block mb-1">요청 사항 (선택)</label>
            <input
              v-model="specialRequests"
              type="text"
              class="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-trip-blue"
              placeholder="호텔 픽업 위치 또는 기타 요청사항"
            />
          </div>
        </div>

        <!-- 할인 쿠폰 & getfortrip 코인 -->
        <div class="bg-white rounded-3xl border border-slate-200/90 p-6 shadow-sm space-y-4">
          <h3 class="font-black text-base text-slate-900">할인 및 혜택 적용</h3>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div class="space-y-1.5">
              <label class="text-xs font-bold text-slate-600 block">프로모션 쿠폰</label>
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
        <h3 class="font-black text-lg text-slate-900">결제 상세 내역</h3>

        <div v-if="priceDetail" class="space-y-3 text-xs text-slate-600">
          <div class="flex justify-between">
            <span>티켓 기본 금액</span>
            <span class="font-mono font-bold">{{ currencyStore.formatKRW(priceDetail.base_amount_krw) }}</span>
          </div>

          <div class="flex justify-between">
            <span>세금 및 제세공과금</span>
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
          <span v-if="isSubmitting">결제 승인 처리 중...</span>
          <span v-else>💳 즉시 결제 및 QR 바우처 발권</span>
        </button>

        <div class="text-[10px] text-slate-400 space-y-1 leading-relaxed">
          <div>✓ 결제 완료 시 즉시 예약 확정 바우처가 발급됩니다.</div>
          <div>✓ 이용일 24시간 전까지 100% 무료 취소가 가능합니다.</div>
        </div>
      </div>
    </div>
  </div>
</template>
