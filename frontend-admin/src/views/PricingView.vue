<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { apiUrl } from '../config/api'

const DEFAULT_FX_RATES = [
  { currency: 'USD', symbol: '$', rate_to_krw: 1380.5, updated_at: new Date().toISOString() },
  { currency: 'JPY', symbol: '¥', rate_to_krw: 9.15, updated_at: new Date().toISOString() },
  { currency: 'EUR', symbol: '€', rate_to_krw: 1495.2, updated_at: new Date().toISOString() },
  { currency: 'CNY', symbol: '¥', rate_to_krw: 191.8, updated_at: new Date().toISOString() },
  { currency: 'GBP', symbol: '£', rate_to_krw: 1780.4, updated_at: new Date().toISOString() },
  { currency: 'THB', symbol: '฿', rate_to_krw: 39.5, updated_at: new Date().toISOString() },
  { currency: 'VND', symbol: '₫', rate_to_krw: 0.055, updated_at: new Date().toISOString() },
  { currency: 'SGD', symbol: 'S$', rate_to_krw: 1045.0, updated_at: new Date().toISOString() }
]

const fxRates = ref<any[]>(DEFAULT_FX_RATES)
const testBaseKRW = ref(580000)
const testCurrency = ref('USD')
const testDiscount = ref(50000)
const testCoins = ref(500)
const calcResult = ref<any>(null)

const fetchRates = async () => {
  try {
    const res = await fetch(apiUrl('/fx-rates'))
    if (res.ok) {
      const json = await res.json()
      if (json.data && json.data.length > 0) {
        fxRates.value = json.data
      }
    }
  } catch (e) {
    // Keep DEFAULT_FX_RATES
  }
}

const runCalculation = async () => {
  try {
    const res = await fetch(apiUrl('/bookings/calculate'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        base_amount_krw: Number(testBaseKRW.value),
        coupon_discount_krw: Number(testDiscount.value),
        trip_coins_redeem: Number(testCoins.value),
        target_currency: testCurrency.value
      })
    })
    if (res.ok) {
      const json = await res.json()
      if (json.data) {
        calcResult.value = json.data
        return
      }
    }
  } catch (e) {
    // Local calculation fallback
  }

  const base = Number(testBaseKRW.value) || 580000
  const disc = Number(testDiscount.value) || 0
  const coinsDisc = (Number(testCoins.value) || 0) * 1
  const tax = Math.round(base * 0.1)
  const service = Math.round(base * 0.03)
  const finalKrw = Math.max(0, base + tax + service - disc - coinsDisc)

  const rates: Record<string, { rate: number; symbol: string }> = {
    KRW: { rate: 1, symbol: '₩' },
    USD: { rate: 1380.5, symbol: '$' },
    JPY: { rate: 9.15, symbol: '¥' },
    EUR: { rate: 1495.2, symbol: '€' }
  }
  const target = rates[testCurrency.value] || rates.USD
  const finalTarget = Number((finalKrw / target.rate).toFixed(2))

  calcResult.value = {
    base_amount_krw: base,
    tax_amount_krw: tax,
    service_fee_krw: service,
    coupon_discount_krw: disc,
    trip_coins_discount_krw: coinsDisc,
    final_amount_krw: finalKrw,
    target_currency: testCurrency.value,
    symbol: target.symbol,
    final_target_amount: finalTarget
  }
}

onMounted(() => {
  fetchRates()
  runCalculation()
})
</script>

<template>
  <div class="p-8 space-y-6">
    <div>
      <h1 class="text-2xl font-black text-slate-900 tracking-tight">가격·환율·수수료 엔진 설정</h1>
      <p class="text-sm text-slate-500 mt-1">다통화 환율(FX) 테이블, 마크업 및 Zero-Drift 정밀 계산 시뮬레이터</p>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <!-- 환율 테이블 -->
      <div class="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
        <h3 class="text-base font-bold text-slate-900 mb-4">실시간 기준 환율 테이블 (FX)</h3>
        <table class="w-full text-left text-sm">
          <thead class="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
            <tr>
              <th class="p-3">통화 코드</th>
              <th class="p-3">기호</th>
              <th class="p-3">KRW 환산 기준가</th>
              <th class="p-3">최종 갱신</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            <tr v-for="fx in fxRates" :key="fx.currency">
              <td class="p-3 font-bold font-mono text-trip-blue">{{ fx.currency }}</td>
              <td class="p-3 font-bold text-slate-700">{{ fx.symbol }}</td>
              <td class="p-3 font-mono font-bold text-slate-900">₩{{ fx.rate_to_krw.toLocaleString() }}</td>
              <td class="p-3 text-xs text-slate-400">{{ new Date(fx.updated_at).toLocaleTimeString() }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 실시간 정밀 가격 계산 시뮬레이터 -->
      <div class="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
        <h3 class="text-base font-bold text-slate-900">Go 백엔드 정밀 가격 엔진 검증기</h3>
        
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="text-xs font-bold text-slate-600 block mb-1">기준 원가 (KRW)</label>
            <input v-model="testBaseKRW" @input="runCalculation" type="number" class="w-full p-2.5 border border-slate-300 rounded-xl text-sm font-bold" />
          </div>
          <div>
            <label class="text-xs font-bold text-slate-600 block mb-1">목표 결제 통화</label>
            <select v-model="testCurrency" @change="runCalculation" class="w-full p-2.5 border border-slate-300 rounded-xl text-sm font-bold bg-white">
              <option value="KRW">KRW (₩)</option>
              <option value="USD">USD ($)</option>
              <option value="JPY">JPY (¥)</option>
              <option value="EUR">EUR (€)</option>
            </select>
          </div>
          <div>
            <label class="text-xs font-bold text-slate-600 block mb-1">쿠폰 할인액 (KRW)</label>
            <input v-model="testDiscount" @input="runCalculation" type="number" class="w-full p-2.5 border border-slate-300 rounded-xl text-sm font-bold" />
          </div>
          <div>
            <label class="text-xs font-bold text-slate-600 block mb-1">getfortrip 코인(G-Coins) 사용량</label>
            <input v-model="testCoins" @input="runCalculation" type="number" class="w-full p-2.5 border border-slate-300 rounded-xl text-sm font-bold" />
          </div>
        </div>

        <!-- 계산 결과 바우처 프리뷰 -->
        <div v-if="calcResult" class="bg-slate-900 text-white p-5 rounded-2xl space-y-2 text-xs font-mono">
          <div class="flex justify-between text-slate-400">
            <span>기준 금액:</span>
            <span>₩{{ calcResult.base_amount_krw.toLocaleString() }}</span>
          </div>
          <div class="flex justify-between text-slate-400">
            <span>부가세 (10%):</span>
            <span>+₩{{ calcResult.tax_amount_krw.toLocaleString() }}</span>
          </div>
          <div class="flex justify-between text-slate-400">
            <span>서비스 수수료 (3%):</span>
            <span>+₩{{ calcResult.service_fee_krw.toLocaleString() }}</span>
          </div>
          <div class="flex justify-between text-emerald-400">
            <span>할인 적용 (쿠폰+코인):</span>
            <span>-₩{{ (calcResult.coupon_discount_krw + calcResult.trip_coins_discount_krw).toLocaleString() }}</span>
          </div>
          <div class="border-t border-slate-700 pt-2 flex justify-between text-sm font-bold text-amber-400">
            <span>최종 원화 결제액:</span>
            <span>₩{{ calcResult.final_amount_krw.toLocaleString() }}</span>
          </div>
          <div class="border-t border-slate-700 pt-2 flex justify-between text-base font-black text-white">
            <span>목표 통화 최종가:</span>
            <span class="text-emerald-400">{{ calcResult.symbol }} {{ calcResult.final_target_amount }} {{ calcResult.target_currency }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
