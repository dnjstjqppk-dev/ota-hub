<script setup lang="ts">
import { computed, ref } from 'vue'
import { BRAND } from '~/config/brand'

const { t } = useI18n()
useSeoPage({ site: `https://${useRuntimeConfig().public.brandDomain}`, path: '/faq', title: t('seo.faq.title'), description: t('seo.faq.description'), koOnly: true })

// Q&A bodies are Korean-only content; category keys stay stable while labels translate.
const CAT_KEYS = ['ALL', 'HOTEL', 'FLIGHT', 'PAYMENT', 'REWARD', 'ETC'] as const
const CAT_VALUE: Record<string, string> = { ALL: '전체', HOTEL: '호텔', FLIGHT: '항공권', PAYMENT: '결제/환불', REWARD: '회원/리워드', ETC: '기타' }
const selectedCat = ref<string>('ALL')
const catLabel = (key: string) => t(`faq.cat.${key}`)

const faqList = [
  {
    cat: '호텔',
    q: '체크인 시 어떤 서류를 제시해야 하나요?',
    a: 'getfortrip 모바일 마이페이지의 전자 바우처(또는 인쇄본)와 투숙객 본인의 유효한 여권(외국인) 또는 신분증(국내)을 프런트 데스크에 제시하시면 됩니다. 보증금(디포짓) 결제를 위한 본인 명의 신용카드가 요구될 수 있습니다.',
    to: '/help'
  },
  {
    cat: '호텔',
    q: '조식 포함 여부 및 침대 타입 변경은 어떻게 하나요?',
    a: '예약 시 선택하신 룸 타입 옵션(조식 포함 / 미포함)에 따라 적용됩니다. 킹베드/트윈베드 등 세부 침대 요청은 예약 상세 화면의 특별요청란 또는 도움 센터 문의를 통해 호텔에 전달하실 수 있으며, 최종 배정은 현지 호텔 당일 상황에 따라 결정됩니다.',
    to: '/help'
  },
  {
    cat: '항공권',
    q: '항공권 E-티켓(전자 항공권)은 언제 발권되나요?',
    a: '결제 후 공급사 확인을 거쳐 발권이 진행되며, PNR(예약번호)과 e-티켓 번호는 발권 완료 후 예약 상세에서 확인하실 수 있습니다. 자동 즉시 발권과 확인 이메일 발송은 준비 중입니다.',
    to: '/help'
  },
  {
    cat: '항공권',
    q: '위탁 수하물 규정은 어디서 확인하나요?',
    a: '항공권 검색 결과 및 예약 상세 페이지에 무료 위탁 수하물 허용량(예: 1인당 23kg 1개)이 명시되어 있습니다. 추가 수하물이 필요한 경우 항공사 공식 웹사이트에서 사전 구매하시거나 공항 카운터에서 추가 결제하실 수 있습니다.',
    to: '/help'
  },
  {
    cat: '결제/환불',
    q: '결제 시 지원되는 결제 수단은 무엇인가요?',
    a: '신용/체크카드 결제를 지원하며 모든 결제는 원화(KRW)로 처리됩니다. 간편결제와 다른 통화 결제는 준비 중입니다.',
    to: '/terms'
  },
  {
    cat: '결제/환불',
    q: '취소 후 환불금은 언제 입금되나요?',
    a: '무료 취소 건은 접수 후 PG 승인 취소가 진행되며 카드사 반영까지는 영업일 기준 수 일이 걸릴 수 있습니다. PG 응답이 확인되지 않으면 운영자 검토 후 처리되며 별도 안내해 드립니다.',
    to: '/refund-policy'
  },
  {
    cat: '회원/리워드',
    q: 'getfortrip 코인(G-Coin)은 어떻게 모으고 쓰나요?',
    a: '보유한 G-Coin은 1코인 = ₩1의 가치로 다음 예약 시 보유 잔액과 결제 금액 한도 내에서 차감 사용할 수 있습니다. 결제액 자동 적립 프로그램은 준비 중입니다.',
    to: '/rewards'
  }
]

const filteredFaqs = computed(() => {
  if (selectedCat.value === 'ALL') return faqList
  return faqList.filter(f => f.cat === (CAT_VALUE[selectedCat.value] || ''))
})

// S2: the same list drives the shared SeoFaq accordion, so the visible Q&A and
// the FAQPage JSON-LD can never drift apart (all answers stay in the SSR DOM).
const seoFaqItems = computed(() => filteredFaqs.value.map((f) => ({ q: f.q, a: f.a, to: f.to })))
</script>

<template>
  <div class="max-w-4xl mx-auto px-4 py-12 space-y-10">
    <div class="text-center space-y-3">
      <span class="px-3.5 py-1 bg-blue-50 text-trip-blue rounded-full text-xs font-black uppercase tracking-wider">
        FAQ
      </span>
      <h1 class="text-3xl sm:text-4xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
        {{ $t('faq.title') }}
      </h1>
      <p class="text-sm text-slate-500 dark:text-slate-400 max-w-xl mx-auto">
        {{ $t('faq.sub', { brand: BRAND.name }) }}
      </p>
    </div>

    <!-- 카테고리 탭 -->
    <div class="flex items-center justify-center gap-2 flex-wrap">
      <button
        v-for="cat in CAT_KEYS"
        :key="cat"
        @click="selectedCat = cat"
        :class="[
          'px-4 py-2 rounded-xl text-xs font-bold transition',
          selectedCat === cat ? 'bg-slate-900 text-white shadow-sm' : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
        ]"
      >
        {{ catLabel(cat) }}
      </button>
    </div>

    <!-- FAQ 아코디언 (S2: SeoFaq emits the matching FAQPage JSON-LD) -->
    <SeoFaq :items="seoFaqItems" />
  </div>
</template>

