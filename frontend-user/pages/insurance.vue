<script setup lang="ts">
import { ref } from 'vue'
import { BRAND } from '~/config/brand'

const durationDays = ref(5)
const planType = ref<'standard' | 'premium' | 'vip'>('premium')

const plans = {
  standard: {
    name: '실속 플랜 (Basic)',
    medical: '해외 의료비 최대 3,000만원 보장',
    baggage: '휴대품 도난/파손 최대 50만원',
    flightDelay: '항공기 결항/지연 20만원 지원',
    emergency: '24시간 한국어 긴급 의료 지원',
    priceKrw: 8900
  },
  premium: {
    name: '표준 안심 플랜 (Recommended)',
    medical: '해외 의료비 최대 7,000만원 보장',
    baggage: '휴대품 도난/파손 최대 100만원',
    flightDelay: '항공기 결항/지연 40만원 지원',
    emergency: '긴급 이송 및 구조비 5,000만원 지원',
    priceKrw: 14500
  },
  vip: {
    name: 'VIP 프리미엄 무제한 케어',
    medical: '해외 의료비 최대 1억원 전액 보장',
    baggage: '휴대품 도난/파손 최대 200만원',
    flightDelay: '항공기 결항/지연 60만원 지원',
    emergency: '긴급 후송 1억원 + 전담 의료진 케어',
    priceKrw: 22800
  }
}

const isModalOpen = ref(false)
const travelerName = ref('')
const travelerBirth = ref('')
const isEnrolled = ref(false)
const policyNumber = ref('')

const enroll = () => {
  travelerName.value = '홍길동'
  travelerBirth.value = '1990-05-15'
  isEnrolled.value = false
  isModalOpen.value = true
}

const completeEnrollment = () => {
  if (!travelerName.value) {
    alert('피보험자 성함을 입력해 주세요.')
    return
  }
  policyNumber.value = `GFT-INS-${Date.now().toString(36).toUpperCase()}`
  isEnrolled.value = true
}
</script>

<template>
  <div class="max-w-5xl mx-auto px-4 py-8 space-y-10">
    <!-- 상단 배너 -->
    <div class="bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 rounded-3xl p-6 sm:p-10 text-white shadow-xl">
      <div class="space-y-3 max-w-xl">
        <span class="px-3 py-1 bg-white/20 backdrop-blur-md rounded-full text-xs font-black uppercase tracking-wider">
          🛡️ 해외 여행자 안심 보험
        </span>
        <h1 class="text-2xl sm:text-4xl font-black tracking-tight leading-tight">
          출국 1분 전에도 간편 가입! 든든한 해외 의료비 & 수하물 보장
        </h1>
        <p class="text-xs sm:text-sm text-emerald-100">
          해외 현지 병원비 폭탄, 휴대폰 파손, 항공기 지연까지 공식 공인 보험 플랜으로 완벽하게 대비하세요.
        </p>
      </div>
    </div>

    <!-- 플랜 비교 카드 그리드 -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div
        v-for="(info, key) in plans"
        :key="key"
        :class="[
          'bg-white rounded-3xl border p-6 shadow-sm transition space-y-5 flex flex-col justify-between',
          planType === key ? 'border-2 border-emerald-500 shadow-md ring-2 ring-emerald-100' : 'border-slate-200'
        ]"
      >
        <div class="space-y-4">
          <div class="flex items-center justify-between">
            <span
              v-if="key === 'premium'"
              class="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-black border border-emerald-200"
            >
              가장 많은 여행자 선택
            </span>
            <span v-else class="text-[10px] text-slate-400 font-bold">여행자 보장</span>
          </div>

          <div>
            <h3 class="text-lg font-black text-slate-900">{{ info.name }}</h3>
            <div class="mt-2 text-2xl font-black text-emerald-600 font-mono">
              ₩{{ (info.priceKrw * (durationDays / 5)).toLocaleString() }}
              <span class="text-xs font-normal text-slate-400">/ 5일 기준</span>
            </div>
          </div>

          <div class="space-y-2.5 text-xs text-slate-600 border-t border-slate-100 pt-4">
            <div class="flex items-start gap-2">
              <span class="text-emerald-500">✓</span>
              <span>{{ info.medical }}</span>
            </div>
            <div class="flex items-start gap-2">
              <span class="text-emerald-500">✓</span>
              <span>{{ info.baggage }}</span>
            </div>
            <div class="flex items-start gap-2">
              <span class="text-emerald-500">✓</span>
              <span>{{ info.flightDelay }}</span>
            </div>
            <div class="flex items-start gap-2">
              <span class="text-emerald-500">✓</span>
              <span>{{ info.emergency }}</span>
            </div>
          </div>
        </div>

        <button
          @click="planType = key as any; enroll()"
          :class="[
            'w-full py-3 rounded-xl text-xs font-black transition shadow-sm',
            planType === key ? 'bg-emerald-600 hover:bg-emerald-500 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-800'
          ]"
        >
          {{ planType === key ? '이 플랜으로 가입하기' : '선택하기' }}
        </button>
      </div>
    </div>

    <!-- 여행자 보험 가입 신청 모달 -->
    <div v-if="isModalOpen" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div class="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden p-6 space-y-6">
        <div class="flex items-center justify-between pb-3 border-b border-slate-100">
          <div class="flex items-center gap-2">
            <span class="text-xl">🛡️</span>
            <h3 class="font-bold text-slate-900 text-sm">해외 여행자보험 가입 신청</h3>
          </div>
          <button @click="isModalOpen = false" class="text-slate-400 hover:text-slate-600 text-lg font-bold">✕</button>
        </div>

        <div v-if="!isEnrolled" class="space-y-4 text-xs">
          <div class="bg-emerald-50/70 p-4 rounded-2xl border border-emerald-100 space-y-1">
            <div class="font-bold text-emerald-900">{{ plans[planType].name }}</div>
            <div class="text-[11px] text-emerald-700">{{ plans[planType].medical }}</div>
            <div class="text-[11px] text-emerald-700">{{ plans[planType].baggage }}</div>
            <div class="text-base font-black text-emerald-900 pt-2 font-mono">보험료 ₩{{ plans[planType].priceKrw.toLocaleString() }} (총 1인)</div>
          </div>

          <div class="space-y-2">
            <div class="space-y-1">
              <label class="font-bold text-slate-700 block">피보험자 성명 (한글)</label>
              <input
                v-model="travelerName"
                placeholder="홍길동"
                class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div class="space-y-1">
              <label class="font-bold text-slate-700 block">생년월일 (YYYY-MM-DD)</label>
              <input
                v-model="travelerBirth"
                placeholder="1990-05-15"
                class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          <button
            @click="completeEnrollment"
            class="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-xs shadow-md transition"
          >
            ₩{{ plans[planType].priceKrw.toLocaleString() }} 결제 및 보험 증권 발급
          </button>
        </div>

        <!-- 가입 완료 상태 -->
        <div v-else class="text-center space-y-4 py-2">
          <div class="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto text-xl font-black">✓</div>
          <div class="space-y-1">
            <h4 class="font-black text-slate-900 text-base">보험 가입이 완료되었습니다!</h4>
            <p class="text-[11px] text-slate-500">증권 번호: <span class="font-mono font-bold text-slate-800">{{ policyNumber }}</span></p>
          </div>
          <div class="bg-slate-50 p-4 rounded-2xl border border-dashed border-slate-300 space-y-1.5 text-left text-[11px] text-slate-600">
            <div>• <strong>피보험자:</strong> {{ travelerName }}</div>
            <div>• <strong>보장 플랜:</strong> {{ plans[planType].name }}</div>
            <div>• <strong>보장 효력:</strong> 출국 심사 완료 시점부터 즉시 유효</div>
          </div>
          <button
            @click="isModalOpen = false"
            class="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition"
          >
            확인 및 닫기
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

