<script setup lang="ts">
import { ref } from 'vue'

const activeSection = ref<'auth' | 'hotels' | 'bookings' | 'webhooks' | 'errors' | 'limits'>('auth')
const copied = ref(false)

const copySample = (text: string) => {
  navigator.clipboard.writeText(text)
  copied.value = true
  setTimeout(() => { copied.value = false }, 2000)
}
</script>

<template>
  <div class="max-w-7xl mx-auto px-4 py-8 space-y-8">
    <!-- Header -->
    <div class="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-3xl p-8 text-white shadow-xl border border-slate-800">
      <div class="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div class="space-y-2">
          <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 text-xs font-bold border border-indigo-400/30">
            <span>🔌</span>
            <span>getfortrip Partner B2B REST OpenAPI v1.4</span>
          </div>
          <h1 class="text-2xl md:text-3xl font-black tracking-tight">파트너 개발자 센터 & OpenAPI 명세서</h1>
          <p class="text-xs md:text-sm text-slate-300 max-w-2xl leading-relaxed">
            호텔, 항공권, 렌터카, 투어 공급사용 공식 OpenAPI 규격입니다. 실시간 가격 및 재고(ARI) 동기화, 2-Phase Commit 예약 승인, 웹훅 이벤트를 연동하세요.
          </p>
        </div>

        <div class="bg-slate-800/80 backdrop-blur-md p-4 rounded-2xl border border-slate-700/80 text-right space-y-2">
          <div class="text-[11px] text-slate-400 font-mono">Base API Endpoint</div>
          <div class="text-sm font-mono font-bold text-amber-400 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800">
            https://api.getfortrip.com/api/v1
          </div>
          <div class="text-[10px] text-slate-400">Sandbox: https://sandbox-api.getfortrip.com/api/v1</div>
        </div>
      </div>
    </div>

    <!-- Main Docs Grid -->
    <div class="grid grid-cols-1 lg:grid-cols-4 gap-8">
      <!-- Sidebar Nav -->
      <aside class="space-y-2 lg:sticky lg:top-24 h-fit">
        <div class="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-1 text-xs font-bold">
          <button
            @click="activeSection = 'auth'"
            :class="['w-full text-left px-3 py-2.5 rounded-xl transition flex items-center justify-between', activeSection === 'auth' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-600 hover:bg-slate-50']"
          >
            <span>🔐 1. 인증 및 API 키 발급</span>
            <span v-if="activeSection === 'auth'">›</span>
          </button>

          <button
            @click="activeSection = 'hotels'"
            :class="['w-full text-left px-3 py-2.5 rounded-xl transition flex items-center justify-between', activeSection === 'hotels' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-600 hover:bg-slate-50']"
          >
            <span>🏨 2. 호텔 & 상품/재고 API</span>
            <span v-if="activeSection === 'hotels'">›</span>
          </button>

          <button
            @click="activeSection = 'bookings'"
            :class="['w-full text-left px-3 py-2.5 rounded-xl transition flex items-center justify-between', activeSection === 'bookings' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-600 hover:bg-slate-50']"
          >
            <span>📄 3. 예약 수신 & 확정/취소</span>
            <span v-if="activeSection === 'bookings'">›</span>
          </button>

          <button
            @click="activeSection = 'webhooks'"
            :class="['w-full text-left px-3 py-2.5 rounded-xl transition flex items-center justify-between', activeSection === 'webhooks' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-600 hover:bg-slate-50']"
          >
            <span>⚡ 4. 실시간 웹훅 (Webhooks)</span>
            <span v-if="activeSection === 'webhooks'">›</span>
          </button>

          <button
            @click="activeSection = 'errors'"
            :class="['w-full text-left px-3 py-2.5 rounded-xl transition flex items-center justify-between', activeSection === 'errors' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-600 hover:bg-slate-50']"
          >
            <span>⚠️ 5. 오류 코드 규격 (Error Codes)</span>
            <span v-if="activeSection === 'errors'">›</span>
          </button>

          <button
            @click="activeSection = 'limits'"
            :class="['w-full text-left px-3 py-2.5 rounded-xl transition flex items-center justify-between', activeSection === 'limits' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-600 hover:bg-slate-50']"
          >
            <span>⏱️ 6. 호출 제한 (Rate Limit)</span>
            <span v-if="activeSection === 'limits'">›</span>
          </button>
        </div>

        <div class="bg-indigo-50 rounded-2xl p-4 border border-indigo-100 text-xs space-y-2">
          <div class="font-black text-indigo-950">기술 지원 문의</div>
          <p class="text-indigo-800 text-[11px] leading-relaxed">
            API 연동 중 문의사항은 전담 파트너 엔지니어링 팀으로 연락주시기 바랍니다.
          </p>
          <div class="font-mono text-indigo-600 font-bold">api-support@getfortrip.com</div>
        </div>
      </aside>

      <!-- Content Area -->
      <main class="lg:col-span-3 space-y-8">
        <!-- 1. Authentication -->
        <section v-if="activeSection === 'auth'" class="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-sm space-y-6">
          <div class="border-b border-slate-100 pb-4">
            <h2 class="text-xl font-black text-slate-900">1. 인증 및 보안 헤더 (Authentication)</h2>
            <p class="text-xs text-slate-500 mt-1">모든 파트너 API 요청은 HTTPS 환경에서 Bearer 토큰으로 인증되어야 합니다.</p>
          </div>

          <div class="space-y-4 text-xs">
            <h3 class="font-bold text-slate-900">필수 HTTP 헤더</h3>
            <div class="bg-slate-900 text-slate-200 p-4 rounded-2xl font-mono space-y-1">
              <div>Authorization: Bearer ptn_live_sec_••••••••••••••••</div>
              <div>Content-Type: application/json</div>
              <div>X-Partner-Id: ptn_org_98214</div>
              <div>X-Idempotency-Key: idemp_9824982194812 (중복 생성 방지용 UUID)</div>
            </div>

            <div class="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-amber-900 space-y-1">
              <div class="font-bold">⚠️ 보안 주의사항</div>
              <p class="text-[11px] leading-relaxed">
                라이브 시크릿 키는 클라이언트 측(브라우저, 모바일 앱)에 절대 노출되어서는 안 되며, 공급사의 백엔드 서버에서만 안전하게 보관되어야 합니다.
              </p>
            </div>
          </div>
        </section>

        <!-- 2. Hotels & ARI API -->
        <section v-if="activeSection === 'hotels'" class="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-sm space-y-6">
          <div class="border-b border-slate-100 pb-4">
            <h2 class="text-xl font-black text-slate-900">2. 호텔 & 상품/재고 API (ARI Sync)</h2>
            <p class="text-xs text-slate-500 mt-1">공급사의 호텔 정보, 룸타입, 일자별 요금 및 잔여 재고를 실시간 업데이트합니다.</p>
          </div>

          <!-- Endpoint: POST /partner/hotels/rates -->
          <div class="border border-slate-200 rounded-2xl p-5 space-y-4">
            <div class="flex items-center gap-3">
              <span class="px-2.5 py-1 bg-emerald-600 text-white font-mono font-black text-xs rounded">POST</span>
              <span class="font-mono text-sm font-bold text-slate-900">/v1/partner/hotels/rates</span>
              <span class="text-xs text-slate-500">일자별 요금/재고 동기화</span>
            </div>

            <div class="bg-slate-900 text-slate-200 p-4 rounded-xl font-mono text-xs overflow-x-auto">
<pre>{
  "hotel_id": "htl_tokyo_01",
  "room_type_id": "rm_01",
  "rates": [
    {
      "date": "2026-11-01",
      "currency": "KRW",
      "base_price": 385000,
      "available_inventory": 4,
      "breakfast_included": true,
      "free_cancellation": true
    }
  ]
}</pre>
            </div>
          </div>
        </section>

        <!-- 3. Bookings API -->
        <section v-if="activeSection === 'bookings'" class="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-sm space-y-6">
          <div class="border-b border-slate-100 pb-4">
            <h2 class="text-xl font-black text-slate-900">3. 예약 수신 & 확정/취소 API (Booking OMS)</h2>
            <p class="text-xs text-slate-500 mt-1">고객 결제 완료 후 공급사 예약 시스템과 연동하는 2-Phase Commit 규격입니다.</p>
          </div>

          <!-- Endpoint: POST /partner/bookings/:id/confirm -->
          <div class="border border-slate-200 rounded-2xl p-5 space-y-4">
            <div class="flex items-center gap-3">
              <span class="px-2.5 py-1 bg-blue-600 text-white font-mono font-black text-xs rounded">POST</span>
              <span class="font-mono text-sm font-bold text-slate-900">/v1/partner/bookings/{bookingId}/confirm</span>
              <span class="text-xs text-slate-500">공급사 확정 번호 등록</span>
            </div>

            <div class="bg-slate-900 text-slate-200 p-4 rounded-xl font-mono text-xs overflow-x-auto">
<pre>{
  "supplier_confirmation_number": "HYATT-TYO-982149",
  "confirmed_at": "2026-10-17T13:45:00Z",
  "room_number_assigned": "902",
  "checkin_instruction": "호텔 프런트 데스크에서 getfortrip 바우처 및 여권 제시"
}</pre>
            </div>
          </div>
        </section>

        <!-- 4. Webhooks -->
        <section v-if="activeSection === 'webhooks'" class="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-sm space-y-6">
          <div class="border-b border-slate-100 pb-4">
            <h2 class="text-xl font-black text-slate-900">4. 실시간 웹훅 (Webhooks)</h2>
            <p class="text-xs text-slate-500 mt-1">예약 생성, 취소 요청, 결제 승인 이벤트를 공급사 엔드포인트로 즉시 전송합니다.</p>
          </div>

          <div class="space-y-4 text-xs text-slate-700">
            <p>모든 웹훅 요청에는 위변조 방지를 위한 HMAC-SHA256 서명이 <code class="bg-slate-100 px-2 py-0.5 rounded text-blue-600 font-mono">X-GetforTrip-Signature</code> 헤더로 포함됩니다.</p>
            <div class="bg-slate-900 text-slate-200 p-4 rounded-xl font-mono text-xs overflow-x-auto">
<pre>{
  "event": "booking.created",
  "timestamp": 1792189200,
  "data": {
    "booking_id": "GF-HT-98214",
    "product_type": "HOTEL",
    "total_amount_krw": 550000,
    "guest_name": "김**",
    "guest_contact": "010-****-5678",
    "check_in": "2026-11-01",
    "check_out": "2026-11-03"
  }
}</pre>
            </div>
          </div>
        </section>

        <!-- 5. Error Codes -->
        <section v-if="activeSection === 'errors'" class="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-sm space-y-6">
          <div class="border-b border-slate-100 pb-4">
            <h2 class="text-xl font-black text-slate-900">5. 오류 코드 규격 (Error Codes)</h2>
            <p class="text-xs text-slate-500 mt-1">REST API 호출 시 반환되는 표준 HTTP 상태 및 비즈니스 에러 코드입니다.</p>
          </div>

          <table class="w-full text-left text-xs border-collapse">
            <thead>
              <tr class="border-b border-slate-200 text-slate-400 font-bold">
                <th class="py-2.5">HTTP</th>
                <th>Error Code</th>
                <th>설명 및 대응 가이드</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 font-medium text-slate-700">
              <tr>
                <td class="py-3 font-bold text-amber-600 font-mono">400</td>
                <td class="font-mono text-slate-900 font-bold">INVALID_PAYLOAD</td>
                <td>필수 파라미터 누락 또는 날짜 형식(ISO 8601) 불일치</td>
              </tr>
              <tr>
                <td class="py-3 font-bold text-rose-600 font-mono">401</td>
                <td class="font-mono text-slate-900 font-bold">UNAUTHORIZED</td>
                <td>유효하지 않은 API 키 또는 서명 불일치</td>
              </tr>
              <tr>
                <td class="py-3 font-bold text-rose-600 font-mono">403</td>
                <td class="font-mono text-slate-900 font-bold">FORBIDDEN</td>
                <td>해당 파트너 조직 소유가 아닌 상품/예약에 접근 시도</td>
              </tr>
              <tr>
                <td class="py-3 font-bold text-amber-600 font-mono">409</td>
                <td class="font-mono text-slate-900 font-bold">INVENTORY_EXHAUSTED</td>
                <td>요청 시점에 잔여 객실/좌석 재고 부족 (동시성 경합)</td>
              </tr>
              <tr>
                <td class="py-3 font-bold text-amber-600 font-mono">429</td>
                <td class="font-mono text-slate-900 font-bold">RATE_LIMIT_EXCEEDED</td>
                <td>초당 허용 호출 수 초과 (잠시 후 재시도)</td>
              </tr>
            </tbody>
          </table>
        </section>

        <!-- 6. Rate Limit -->
        <section v-if="activeSection === 'limits'" class="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-sm space-y-6">
          <div class="border-b border-slate-100 pb-4">
            <h2 class="text-xl font-black text-slate-900">6. 호출 제한 (Rate Limit)</h2>
            <p class="text-xs text-slate-500 mt-1">시스템 안정성 유지를 위해 파트너 티어별 Rate Limit을 적용합니다.</p>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div class="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
              <div class="font-black text-slate-900">스탠다드 파트너</div>
              <div class="text-xl font-black text-indigo-600 font-mono">60 req/min</div>
              <p class="text-slate-500 text-[11px]">일반 입점 호텔 및 렌터카 공급사 기본 한도</p>
            </div>
            <div class="p-5 rounded-2xl bg-indigo-50 border border-indigo-200 space-y-2">
              <div class="font-black text-indigo-950">프리미엄 B2B 직연동</div>
              <div class="text-xl font-black text-indigo-600 font-mono">300 req/min</div>
              <p class="text-indigo-800 text-[11px]">대형 체인 호텔 및 GDS 항공권 공급사</p>
            </div>
            <div class="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
              <div class="font-black text-slate-900">웹훅 수신 처리</div>
              <div class="text-xl font-black text-indigo-600 font-mono">1,000 req/min</div>
              <p class="text-slate-500 text-[11px]">대량 재고 변경 이벤트 큐 처리 한도</p>
            </div>
          </div>
        </section>
      </main>
    </div>
  </div>
</template>

