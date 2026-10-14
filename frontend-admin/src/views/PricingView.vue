<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { apiUrl } from '../config/api'

const fxRates = ref<any[]>([])
const testBaseKRW = ref(580000)
const testCurrency = ref('USD')
const testDiscount = ref(50000)
const testCoins = ref(500)
const calcResult = ref<any>(null)

const fetchRates = async () => {
  const res = await fetch(apiUrl('/fx-rates'))
  const json = await res.json()
  fxRates.value = json.data || []
}

const runCalculation = async () => {
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
  const json = await res.json()
  calcResult.value = json.data
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
            <label class="text-xs font-bold text-slate-600 block mb-1">트립코인 사용량</label>
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
