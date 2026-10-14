<script setup lang="ts">
import { ref } from 'vue'

const faqs = [
  { q: '호텔 예약 취소 시 환불은 언제 입금되나요?', a: '무료 취소 기한 내 취소 시 즉시 환불 승인되며, 카드사 전산에 따라 영업일 기준 3~5일 이내 결제 취소 또는 계좌 입금됩니다.' },
  { q: '항공권 여권 정보(이름, 번호) 변경이 가능한가요?', a: '영문 철자 오탈자의 경우 항공사 규정에 따라 1~2자 이내 수수료 면제 수정이 가능하며, 마이페이지 셀프서비스 또는 24/7 고객센터를 통해 신청하실 수 있습니다.' },
  { q: '트립코인(Trip Coins)은 어떻게 적립 및 사용하나요?', a: '트립닷컴 웹/앱에서 여행 상품 이용 완료 후 자동 확정 적립되며, 100코인당 ₩1,000원 단위로 다음 예약 시 현금처럼 차감 할인받으실 수 있습니다.' }
]

const activeFaq = ref<number | null>(0)
</script>

<template>
  <div class="max-w-4xl mx-auto px-4 py-12 space-y-8">
    <div class="text-center space-y-2">
      <span class="px-3 py-1 bg-blue-50 text-trip-blue rounded-full text-xs font-black uppercase tracking-wider">
        🎧 24/7 글로벌 고객센터
      </span>
      <h1 class="text-3xl font-black text-slate-900 tracking-tight">무엇을 도와드릴까요?</h1>
      <p class="text-sm text-slate-500">예약 취소, 일정 변경, 환불 및 항공기 결항 등 자주 묻는 질문을 확인하세요.</p>
    </div>

    <!-- 자주 묻는 질문 아코디언 -->
    <div class="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm divide-y divide-slate-100">
      <div v-for="(f, i) in faqs" :key="f.q" class="py-4 cursor-pointer" @click="activeFaq = activeFaq === i ? null : i">
        <div class="flex items-center justify-between font-bold text-slate-900 text-sm">
          <span>Q. {{ f.q }}</span>
          <span class="text-slate-400 text-lg">{{ activeFaq === i ? '−' : '+' }}</span>
        </div>
        <p v-if="activeFaq === i" class="text-xs text-slate-600 mt-2 leading-relaxed bg-slate-50 p-4 rounded-xl border border-slate-100">
          {{ f.a }}
        </p>
      </div>
    </div>

    <!-- 1:1 상담 안내 박스 -->
    <div class="bg-trip-navy text-white rounded-3xl p-8 flex flex-col md:flex-row items-center justify-between gap-6 shadow-xl">
      <div class="space-y-1">
        <h3 class="text-xl font-black">실시간 채팅 상담이 필요하신가요?</h3>
        <p class="text-xs text-blue-100">연중무휴 24시간 한국어 전문 상담원이 즉시 답변해 드립니다.</p>
      </div>
      <button class="px-6 py-3 bg-trip-blue hover:bg-trip-hover text-white font-bold text-xs rounded-xl shadow-lg whitespace-nowrap">
        1:1 실시간 상담 시작
      </button>
    </div>
  </div>
</template>

