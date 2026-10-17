<script setup lang="ts">
import { ref } from 'vue'
import { BRAND } from '~/config/brand'

const categories = ['전체', '호텔', '항공권', '결제/환불', '회원/리워드', '기타']
const selectedCat = ref('전체')
const activeIndex = ref<number | null>(0)

const faqList = [
  {
    cat: '호텔',
    q: '체크인 시 어떤 서류를 제시해야 하나요?',
    a: 'getfortrip 모바일 마이페이지의 전자 바우처(또는 인쇄본)와 투숙객 본인의 유효한 여권(외국인) 또는 신분증(국내)을 프런트 데스크에 제시하시면 됩니다. 보증금(디포짓) 결제를 위한 본인 명의 신용카드가 요구될 수 있습니다.'
  },
  {
    cat: '호텔',
    q: '조식 포함 여부 및 침대 타입 변경은 어떻게 하나요?',
    a: '예약 시 선택하신 룸 타입 옵션(조식 포함 / 미포함)에 따라 적용됩니다. 킹베드/트윈베드 등 세부 침대 요청은 예약 상세 화면의 특별요청란 또는 24/7 고객센터를 통해 호텔에 전달하실 수 있으며, 최종 배정은 현지 호텔 당일 상황에 따라 결정됩니다.'
  },
  {
    cat: '항공권',
    q: '항공권 E-티켓(전자 항공권)은 언제 발권되나요?',
    a: '결제 완료 즉시 시스템에서 자동 발권 처리되며, 통상 1~10분 이내에 PNR(예약번호)과 e-티켓 번호가 포함된 확인서가 등록된 이메일로 발송되며 마이페이지에서도 실시간 확인 가능합니다.'
  },
  {
    cat: '항공권',
    q: '위탁 수하물 규정은 어디서 확인하나요?',
    a: '항공권 검색 결과 및 예약 상세 페이지에 무료 위탁 수하물 허용량(예: 1인당 23kg 1개)이 명시되어 있습니다. 추가 수하물이 필요한 경우 항공사 공식 웹사이트에서 사전 구매하시거나 공항 카운터에서 추가 결제하실 수 있습니다.'
  },
  {
    cat: '결제/환불',
    q: '결제 시 지원되는 결제 수단은 무엇인가요?',
    a: '국내외 모든 신용/체크카드(VISA, Mastercard, AMEX, JCB, BC 등), 카카오페이, 네이버페이, 토스페이, 애플페이 및 무통장 입금을 지원하며 다통화(KRW, USD, JPY, EUR 등) 결제가 가능합니다.'
  },
  {
    cat: '결제/환불',
    q: '취소 후 환불금은 언제 입금되나요?',
    a: '무료 취소 건은 접수 즉시 PG 승인 취소되며 카드사에 따라 영업일 기준 3~5일 이내 한도 복구 또는 환급됩니다. 체크카드나 계좌이체는 1~2영업일 이내 계좌로 자동 입금됩니다.'
  },
  {
    cat: '회원/리워드',
    q: 'getfortrip 코인(G-Coin)은 어떻게 모으고 쓰나요?',
    a: '모든 여행 상품 결제 및 실제 이용 완료 시 결제액의 최대 5%가 G-Coin으로 자동 적립됩니다. 적립된 코인은 1코인 = ₩1의 가치로 다음 예약 시 금액 제한 없이 현금처럼 차감 사용할 수 있습니다.'
  }
]

const filteredFaqs = computed(() => {
  if (selectedCat.value === '전체') return faqList
  return faqList.filter(f => f.cat === selectedCat.value)
})
</script>

<template>
  <div class="max-w-4xl mx-auto px-4 py-12 space-y-10">
    <div class="text-center space-y-3">
      <span class="px-3.5 py-1 bg-blue-50 text-trip-blue rounded-full text-xs font-black uppercase tracking-wider">
        FAQ
      </span>
      <h1 class="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">
        자주 묻는 질문
      </h1>
      <p class="text-sm text-slate-500 max-w-xl mx-auto">
        {{ BRAND.name }} 이용 중 궁금하신 점을 카테고리별로 빠르게 확인하세요.
      </p>
    </div>

    <!-- 카테고리 탭 -->
    <div class="flex items-center justify-center gap-2 flex-wrap">
      <button
        v-for="cat in categories"
        :key="cat"
        @click="selectedCat = cat"
        :class="[
          'px-4 py-2 rounded-xl text-xs font-bold transition',
          selectedCat === cat ? 'bg-slate-900 text-white shadow-sm' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
        ]"
      >
        {{ cat }}
      </button>
    </div>

    <!-- FAQ 아코디언 -->
    <div class="bg-white rounded-3xl border border-slate-200/90 shadow-sm divide-y divide-slate-100 p-6">
      <div
        v-for="(f, i) in filteredFaqs"
        :key="f.q"
        class="py-4 cursor-pointer"
        @click="activeIndex = activeIndex === i ? null : i"
      >
        <div class="flex items-center justify-between font-bold text-slate-900 text-sm">
          <div class="flex items-center gap-2">
            <span class="px-2 py-0.5 rounded bg-blue-50 text-trip-blue text-[10px] font-bold">{{ f.cat }}</span>
            <span>Q. {{ f.q }}</span>
          </div>
          <span class="text-slate-400 text-lg font-bold">{{ activeIndex === i ? '−' : '+' }}</span>
        </div>
        <p
          v-if="activeIndex === i"
          class="text-xs text-slate-600 mt-3 leading-relaxed bg-slate-50 p-4 rounded-2xl border border-slate-100"
        >
          {{ f.a }}
        </p>
      </div>
    </div>
  </div>
</template>

