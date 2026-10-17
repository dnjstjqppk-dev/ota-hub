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

import { getPackageById, searchPackageCatalog } from '~/data/packageCatalog'

const pkgId = (route.query.packageId as string) || 'pkg_tokyo_4d3n'
const initialPkg = getPackageById(pkgId) || searchPackageCatalog('')[0]

const pkg = ref<any>(initialPkg)
const loading = ref(false)

// Guest & Passenger info
const contactName = ref(authStore.user?.fullName || '')
const contactEmail = ref(authStore.user?.email || '')
const contactPhone = ref(authStore.user?.phone || '+82-10-1234-5678')
const leadTravelerName = ref('KIM MINSU')
const passportNumber = ref('M98765432')
const specialRequests = ref('고층 배정 및 창가 좌석 배정 요청')

// Discounts & Coins
const couponCode = ref('WELCOME2026')
const couponApplied = ref(true)
const couponDiscount = ref(30000)
const tripCoinsToUse = ref(500)

const priceDetail = ref<any>(null)
const isSubmitting = ref(false)

const calculatePrice = async () => {
  if (!pkg.value) return
  const rawBase = pkg.value.total_package_krw || 750000
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
    console.warn('Package calculatePrice fallback', e)
  }
  const fallbackBase = (pkg.value?.total_package_krw || 750000) * travelerCount.value
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
    couponDiscount.value = 30000
    calculatePrice()
  } else {
    alert('유효하지 않은 쿠폰 코드입니다.')
  }
}

const handlePayment = async () => {
  isSubmitting.value = true
  let finalBookingId = `GF-PKG-${Math.floor(10000 + Math.random() * 90000)}`
  const finalAmount = priceDetail.value?.final_amount_krw || 710000
  try {
    const draftRes = await fetch(useApiUrl('/bookings'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: authStore.user?.id || 'usr_guest',
        domain_type: 'PACKAGE',
        base_amount_krw: priceDetail.value?.base_amount_krw || 750000,
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
            name: leadTravelerName.value,
            passport: passportNumber.value
          }
        ],
        special_requests: `항공+호텔 결합 패키지: ${pkg.value?.title}, ${specialRequests.value}`
      })
    })
    const draftJson = await draftRes.json()
    if (draftJson?.data?.id) {
      finalBookingId = draftJson.data.id
      // Payment transition
      await fetch(useApiUrl(`/bookings/${finalBookingId}/pay`), { method: 'POST' })
    }
  } catch (e) {
    console.warn('API package booking fallback to mock storage:', e)
  }

  // Save to local storage for My Bookings
  const pkgTitle = pkg.value?.title || '도쿄 4박 5일 항공+특급호텔 힐링 패키지'
  const pkgSchedule = '2026.11.01 ~ 2026.11.05 (4박 5일)'
  try {
    const newRecord = {
      id: finalBookingId,
      domain: 'PACKAGE',
      title: pkgTitle,
      schedule: pkgSchedule,
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

  router.push(`/booking/success?bookingId=${finalBookingId}&domain=PACKAGE&amount=${finalAmount}&title=${encodeURIComponent(pkgTitle)}&schedule=${encodeURIComponent(pkgSchedule)}&contact=${encodeURIComponent(contactName.value + ' (' + contactPhone.value + ')')}`)
}

onMounted(async () => {
  loading.value = true
  try {
    const res = await fetch(useApiUrl('/packages'))
    const json = await res.json()
    const pkgs = json.data || []
    pkg.value = pkgs.find((p: any) => p.id === route.query.packageId) || pkgs[0] || {
      title: '도쿄 4박 5일 항공+특급호텔 힐링 패키지',
      thumbnail_url: 'https://images.unsplash.com/photo-1503899036084-c55cdd92da26?w=800',
      total_original_krw: 920000,
      total_package_krw: 750000,
      package_discount_rate: 20,
      flight: {
        airline_name: '대한항공 (Korean Air)',
        departure_city: '서울/인천',
        arrival_city: '도쿄/나리타'
      },
      hotel: {
        name_ko: '그랜드 하얏트 도쿄 (Grand Hyatt Tokyo)',
        city: '도쿄'
      }
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
    패키지 예약 정보를 불러오는 중입니다...
  </div>

  <div v-else-if="pkg" class="max-w-6xl mx-auto px-4 py-8 space-y-8">
    <!-- 헤더 -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <div class="flex items-center gap-2 text-xs text-slate-400 mb-1">
          <NuxtLink to="/packages" class="hover:underline">항공+호텔 패키지</NuxtLink> <span>›</span>
          <span class="text-slate-800 font-bold">결합 예약 및 결제</span>
        </div>
        <h1 class="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">항공+호텔 번들 결합 예약</h1>
      </div>

      <div class="flex items-center gap-2 px-3 py-1.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-bold">
        <span>🏖️</span>
        <span>결합 번들 {{ pkg.package_discount_rate }}% 즉시 할인 적용</span>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
      <!-- 좌측: 결합 상품 세부 내역 & 여행자 정보 -->
      <div class="lg:col-span-8 space-y-6">
        <!-- 패키지 품목 요약 카드 -->
        <div class="bg-white rounded-3xl border border-slate-200/90 p-6 shadow-sm space-y-4">
          <div class="flex flex-col sm:flex-row items-start sm:items-center gap-5 pb-4 border-b border-slate-100">
            <img :src="pkg.thumbnail_url" class="w-full sm:w-36 h-28 object-cover rounded-2xl flex-shrink-0" />
            <div class="space-y-1">
              <span class="px-2.5 py-0.5 bg-rose-50 text-rose-700 text-[10px] font-black rounded">
                번들 결합 패키지
              </span>
              <h3 class="font-black text-slate-900 text-lg">{{ pkg.title }}</h3>
              <p class="text-xs text-slate-400 font-medium">항공권과 특급 호텔을 결합하여 번들 할인가로 예약합니다.</p>
            </div>
          </div>

          <!-- 포함 내역 그리드 -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div class="p-4 bg-sky-50/60 rounded-2xl border border-sky-100 space-y-1.5">
              <div class="font-bold text-sky-950 flex items-center gap-1.5 text-sm">
                <span>✈️</span> 왕복 항공권 포함
              </div>
              <div class="text-slate-700">항공사: {{ pkg.flight?.airline_name }}</div>
              <div class="text-slate-500">구간: {{ pkg.flight?.departure_city }} ↔ {{ pkg.flight?.arrival_city }}</div>
              <div class="text-emerald-700 font-bold">✓ 위탁 수하물 23kg & 기내식 포함</div>
            </div>

            <div class="p-4 bg-indigo-50/60 rounded-2xl border border-indigo-100 space-y-1.5">
              <div class="font-bold text-indigo-950 flex items-center gap-1.5 text-sm">
                <span>🏨</span> 특급 숙소 포함
              </div>
              <div class="text-slate-700">숙소명: {{ pkg.hotel?.name_ko }}</div>
              <div class="text-slate-500">위치: {{ pkg.hotel?.city }} 도심 중심가</div>
              <div class="text-emerald-700 font-bold">✓ 2인 뷔페 조식 & 무료 Wi-Fi 포함</div>
            </div>
          </div>
        </div>

        <!-- 대표 여행자 및 탑승자 정보 -->
        <div class="bg-white rounded-3xl border border-slate-200/90 p-6 shadow-sm space-y-4">
          <h3 class="font-black text-base text-slate-900">대표 예약자 및 여행자 여권 정보</h3>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label class="text-xs font-bold text-slate-600 block mb-1">예약자 성명</label>
              <input
                v-model="contactName"
                type="text"
                class="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
              />
            </div>

            <div>
              <label class="text-xs font-bold text-slate-600 block mb-1">휴대폰 번호</label>
              <input
                v-model="contactPhone"
                type="tel"
                class="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
              />
            </div>

            <div>
              <label class="text-xs font-bold text-slate-600 block mb-1">이메일 (e-티켓 및 바우처 수령)</label>
              <input
                v-model="contactEmail"
                type="email"
                class="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
              />
            </div>

            <div>
              <label class="text-xs font-bold text-slate-600 block mb-1">대표 여행자 영문 성명 (여권명)</label>
              <input
                v-model="leadTravelerName"
                type="text"
                class="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono uppercase font-bold text-slate-800"
              />
            </div>

            <div>
              <label class="text-xs font-bold text-slate-600 block mb-1">여권 번호</label>
              <input
                v-model="passportNumber"
                type="text"
                class="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono uppercase font-bold text-slate-800"
              />
            </div>

            <div>
              <label class="text-xs font-bold text-slate-600 block mb-1">숙소 특별 요청사항</label>
              <input
                v-model="specialRequests"
                type="text"
                class="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800"
              />
            </div>
          </div>
        </div>

        <!-- 할인 쿠폰 & 코인 -->
        <div class="bg-white rounded-3xl border border-slate-200/90 p-6 shadow-sm space-y-4">
          <h3 class="font-black text-base text-slate-900">추가 할인 및 혜택 적용</h3>

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

      <!-- 우측: 패키지 운임 명세서 -->
      <div class="lg:col-span-4 sticky top-24 bg-white rounded-3xl border border-slate-200 shadow-xl p-6 space-y-5">
        <h3 class="font-black text-lg text-slate-900">패키지 결제 명세서</h3>

        <div v-if="priceDetail" class="space-y-3 text-xs text-slate-600">
          <div class="flex justify-between">
            <span>패키지 기준 금액</span>
            <span class="font-mono font-bold">{{ currencyStore.formatKRW(priceDetail.base_amount_krw) }}</span>
          </div>

          <div class="flex justify-between text-emerald-600 font-bold">
            <span>항공+호텔 결합 할인</span>
            <span class="font-mono">-{{ currencyStore.formatKRW(pkg.total_original_krw - pkg.total_package_krw) }}</span>
          </div>

          <div v-if="priceDetail.coupon_discount_krw > 0" class="flex justify-between text-rose-600 font-bold">
            <span>쿠폰 추가 할인</span>
            <span class="font-mono">-{{ currencyStore.formatKRW(priceDetail.coupon_discount_krw) }}</span>
          </div>

          <div v-if="priceDetail.trip_coins_discount_krw > 0" class="flex justify-between text-amber-600 font-bold">
            <span>코인 사용 할인</span>
            <span class="font-mono">-{{ currencyStore.formatKRW(priceDetail.trip_coins_discount_krw) }}</span>
          </div>

          <div class="pt-4 border-t border-slate-200 flex items-baseline justify-between">
            <span class="font-bold text-slate-900 text-sm">최종 결제 금액</span>
            <div class="text-right">
              <div class="text-2xl font-black text-rose-600 font-mono">
                {{ currencyStore.activeCurrency }} {{ priceDetail.final_target_amount?.toLocaleString() }}
              </div>
              <div class="text-[10px] text-slate-400">약 {{ currencyStore.formatKRW(priceDetail.final_amount_krw) }}</div>
            </div>
          </div>
        </div>

        <button
          @click="handlePayment"
          :disabled="isSubmitting"
          class="w-full py-3.5 bg-rose-600 hover:bg-rose-700 text-white font-black text-sm rounded-2xl shadow-lg transition flex items-center justify-center gap-2 disabled:bg-slate-300"
        >
          <span v-if="isSubmitting">패키지 일괄 발권 중...</span>
          <span v-else>💳 항공+호텔 패키지 즉시 일괄 결제</span>
        </button>

        <div class="text-[10px] text-slate-400 space-y-1 leading-relaxed">
          <div>✓ 결제 완료 시 항공 e-티켓 및 호텔 숙박 바우처가 한 번에 발급됩니다.</div>
          <div>✓ 출발 7일 전까지 100% 무료 취소가 가능합니다.</div>
        </div>
      </div>
    </div>
  </div>
</template>

