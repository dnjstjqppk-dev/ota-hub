<script setup lang="ts">
import { ref } from 'vue'

const faqs = [
  { q: '호텔 예약 취소 시 환불은 언제 입금되나요?', a: '무료 취소 기한 내 취소 시 즉시 환불 승인되며, 카드사 전산에 따라 영업일 기준 3~5일 이내 결제 취소 또는 계좌 입금됩니다.' },
  { q: '항공권 여권 정보(이름, 번호) 변경이 가능한가요?', a: '영문 철자 오탈자의 경우 항공사 규정에 따라 1~2자 이내 수수료 면제 수정이 가능하며, 마이페이지 셀프서비스 또는 24/7 고객센터를 통해 신청하실 수 있습니다.' },
  { q: 'getfortrip 코인(G-Coins)은 어떻게 적립 및 사용하나요?', a: 'getfortrip 웹/앱에서 여행 상품 이용 완료 후 자동 확정 적립되며, 100코인당 ₩1,000원 단위로 다음 예약 시 현금처럼 차감 할인받으실 수 있습니다.' },
  { q: 'eSIM QR 코드를 수신하지 못했습니다. 어떻게 재발송받나요?', a: '예약 시 입력하신 이메일의 스팸함을 먼저 확인해 주시고, 마이페이지의 예약 상세 내역에서 언제든지 [QR 코드 재발급/확인] 버튼을 통해 즉시 확인하실 수 있습니다.' }
]

const activeFaq = ref<number | null>(0)

// 1:1 실시간 상담 모달 상태
const isChatOpen = ref(false)
const chatInput = ref('')
const isAgentTyping = ref(false)
const messages = ref([
  { id: 1, sender: 'agent', text: '안녕하세요! getfortrip 24/7 고객 지원 센터입니다. 어떤 도움이 필요하신가요?', time: '방금 전' }
])

const openChat = () => {
  isChatOpen.value = true
}

const closeChat = () => {
  isChatOpen.value = false
}

const sendMessage = () => {
  const text = chatInput.value.trim()
  if (!text) return

  messages.value.push({
    id: Date.now(),
    sender: 'user',
    text,
    time: '방금 전'
  })
  chatInput.value = ''
  isAgentTyping.value = true

  setTimeout(() => {
    isAgentTyping.value = false
    let reply = '문의해 주셔서 감사합니다. 접수된 요청을 확인하였으며 담당 상담원이 신속히 조치해 드리겠습니다.'
    if (text.includes('취소') || text.includes('환불')) {
      reply = '예약 취소 및 환불 문의의 경우, 마이페이지 > [예약 내역]에서 셀프서비스 취소가 즉시 가능하며, 수수료 면제 규정에 맞춰 자동 처리됩니다.'
    } else if (text.includes('항공') || text.includes('비행기')) {
      reply = '항공권 문의 건이 접수되었습니다. 예약 번호와 탑승객 여권상 영문 성함을 알려주시면 실시간 항공 GDS 전산에서 확인해 드리겠습니다.'
    } else if (text.includes('eSIM') || text.includes('유심')) {
      reply = 'eSIM 활성화 및 QR 재발송 건은 마이페이지 상세 화면에서 실시간 QR 코드를 즉시 다시 확인하실 수 있습니다.'
    }
    messages.value.push({
      id: Date.now() + 1,
      sender: 'agent',
      text: reply,
      time: '방금 전'
    })
  }, 800)
}
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
      <button
        @click="openChat"
        type="button"
        class="px-6 py-3 bg-trip-blue hover:bg-trip-hover text-white font-bold text-xs rounded-xl shadow-lg whitespace-nowrap transition transform active:scale-95"
      >
        1:1 실시간 상담 시작
      </button>
    </div>

    <!-- 1:1 실시간 채팅 모달 -->
    <div v-if="isChatOpen" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div class="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden flex flex-col h-[520px]">
        <!-- 모달 헤더 -->
        <div class="bg-trip-navy text-white px-6 py-4 flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="w-3 h-3 rounded-full bg-emerald-400 animate-pulse"></div>
            <div>
              <div class="text-sm font-bold">getfortrip 24/7 한국어 전문 상담원</div>
              <div class="text-[11px] text-blue-200">평균 응답 시간: 1분 이내</div>
            </div>
          </div>
          <button @click="closeChat" class="text-white/80 hover:text-white text-xl font-bold p-1">✕</button>
        </div>

        <!-- 메시지 영역 -->
        <div class="flex-1 p-4 overflow-y-auto space-y-3 bg-slate-50 text-xs">
          <div
            v-for="msg in messages"
            :key="msg.id"
            :class="['flex flex-col', msg.sender === 'user' ? 'items-end' : 'items-start']"
          >
            <div
              :class="[
                'max-w-[80%] rounded-2xl px-4 py-2.5 leading-relaxed shadow-sm',
                msg.sender === 'user' ? 'bg-trip-blue text-white rounded-br-none' : 'bg-white text-slate-800 border border-slate-200 rounded-bl-none'
              ]"
            >
              {{ msg.text }}
            </div>
            <span class="text-[10px] text-slate-400 mt-1 px-1">{{ msg.time }}</span>
          </div>

          <div v-if="isAgentTyping" class="flex items-center gap-1.5 text-slate-400 text-[11px] px-2">
            <span class="inline-block w-2 h-2 rounded-full bg-slate-400 animate-bounce"></span>
            <span class="inline-block w-2 h-2 rounded-full bg-slate-400 animate-bounce" style="animation-delay: 0.2s"></span>
            <span class="inline-block w-2 h-2 rounded-full bg-slate-400 animate-bounce" style="animation-delay: 0.4s"></span>
            <span class="ml-1">상담원이 답변을 작성 중입니다...</span>
          </div>
        </div>

        <!-- 입력창 -->
        <div class="p-3 bg-white border-t border-slate-200 flex items-center gap-2">
          <input
            v-model="chatInput"
            @keydown.enter.prevent="sendMessage"
            placeholder="상담 내용을 입력하세요..."
            class="flex-1 bg-slate-100 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            @click="sendMessage"
            class="px-4 py-2.5 bg-trip-blue hover:bg-trip-hover text-white rounded-xl text-xs font-bold transition"
          >
            전송
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
