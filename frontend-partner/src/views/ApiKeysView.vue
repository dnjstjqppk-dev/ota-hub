<script setup lang="ts">
import { ref } from 'vue'

const apiKey = ref('gft_live_ptn_99812480129a8f')
const webhookUrl = ref('https://api.partnercompany.com/webhook/gft-events')
const copied = ref(false)

const handleCopyKey = () => {
  navigator.clipboard.writeText(apiKey.value)
  copied.value = true
  setTimeout(() => (copied.value = false), 2000)
}
</script>

<template>
  <div class="space-y-6 max-w-3xl">
    <div>
      <h1 class="text-2xl font-black tracking-tight text-slate-900">
        API 연동 & 웹훅(Webhook) 설정
      </h1>
      <p class="text-sm text-slate-500 font-medium mt-1">
        공급사 자체 PMS / ERP 시스템과 GetForTrip을 실시간 API로 연동합니다.
      </p>
    </div>

    <div class="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm space-y-6 text-xs">
      <div class="space-y-3">
        <label class="font-bold text-slate-700 block">파트너 REST API 인증키 (Bearer Token)</label>
        <div class="flex items-center gap-2">
          <input
            :value="apiKey"
            readonly
            class="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-slate-800 outline-none"
          />
          <button
            @click="handleCopyKey"
            class="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl whitespace-nowrap transition"
          >
            {{ copied ? '복사됨!' : '키 복사' }}
          </button>
        </div>
        <p class="text-[11px] text-slate-400">
          API 요청 시 <code class="bg-slate-100 px-1 py-0.5 rounded font-mono">Authorization: Bearer [API_KEY]</code> 헤더에 포함하여 전송하세요.
        </p>
      </div>

      <div class="space-y-3">
        <label class="font-bold text-slate-700 block">주문 이벤트 실시간 웹훅 (Webhook URL)</label>
        <input
          v-model="webhookUrl"
          type="url"
          placeholder="https://your-domain.com/webhook"
          class="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl font-mono text-slate-800 outline-none focus:ring-2 focus:ring-blue-500"
        />
        <p class="text-[11px] text-slate-400">
          신규 예약 접수(<code class="font-mono">booking.created</code>), 취소 요청(<code class="font-mono">booking.cancelled</code>) 발생 시 JSON 페이로드가 POST 전송됩니다.
        </p>
      </div>

      <div class="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-2">
        <div class="font-black text-slate-800 flex items-center gap-1.5">
          <span>📖</span>
          <span>OpenAPI 3.0 사양 & 규격서</span>
        </div>
        <p class="text-slate-500 text-[11px]">
          호텔 객실 재고 자동 푸시(ARI), 차량 가용성 동기화 및 바우처 전송 규격을 지원합니다.
        </p>
        <div class="pt-1">
          <a
            href="/partner/api-docs"
            class="text-blue-600 font-bold hover:underline inline-flex items-center gap-1"
          >
            <span>OpenAPI 스펙 문서 바로가기</span>
            <span>→</span>
          </a>
        </div>
      </div>
    </div>
  </div>
</template>

