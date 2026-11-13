<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { apiFetch } from '~/composables/useApi'
import { useAuthStore } from '~/stores/auth'

useHead({
  title: '고객센터',
  meta: [{ name: 'description', content: 'getfortrip 자주 묻는 질문과 1:1 문의' }]
})

const auth = useAuthStore()

const faqs = [
  { q: '호텔 예약 취소 시 환불은 언제 입금되나요?', a: '무료 취소 기한 내 취소하면 환불이 승인되며, 카드사 전산에 따라 영업일 기준 3~5일 정도 걸릴 수 있습니다. 환불 상태는 내 예약 상세에서 확인할 수 있습니다.' },
  { q: '항공권 여권 정보(이름, 번호) 변경이 가능한가요?', a: '영문 철자 오탈자는 항공사 규정에 따라 수정 가능 여부가 다릅니다. 아래 1:1 문의로 예약 번호와 함께 남겨주시면 확인해 드립니다.' },
  { q: 'getfortrip 코인은 어떻게 적립되나요?', a: '코인은 이벤트와 고객지원을 통해 적립됩니다. 보유 코인은 멤버십 페이지에서 확인할 수 있습니다.' },
  { q: 'eSIM QR 코드를 수신하지 못했습니다. 어떻게 해야 하나요?', a: '예약 시 입력한 이메일의 스팸함을 먼저 확인해 주세요. 그래도 찾지 못하면 아래 1:1 문의로 예약 번호와 함께 남겨주세요.' }
]

const activeFaq = ref<number | null>(0)

const CATEGORIES = [
  { value: 'BOOKING', label: '예약' },
  { value: 'PAYMENT', label: '결제' },
  { value: 'REFUND', label: '취소/환불' },
  { value: 'ACCOUNT', label: '계정' },
  { value: 'TECHNICAL', label: '이용 오류' },
  { value: 'GENERAL', label: '기타' }
]
const STATUS_LABEL: Record<string, string> = { OPEN: '접수', IN_PROGRESS: '처리 중', RESOLVED: '답변 완료', CLOSED: '종료' }

interface Inquiry {
  id: string
  category: string
  subject: string
  body: string
  booking_id: string | null
  status: string
  admin_note: string | null
  created_at: string
}

interface MyBooking {
  id: string
  bookingNumber: string
  title: string
  status: string
}

const inquiries = ref<Inquiry[]>([])
const listState = ref<'loading' | 'ready' | 'error'>('loading')
const category = ref('BOOKING')
const subject = ref('')
const body = ref('')
// #154: optional booking link for the inquiry (server verifies ownership).
const bookingId = ref('')
const myBookings = ref<MyBooking[]>([])
const submitting = ref(false)
const submitError = ref('')
const submitted = ref(false)

const fetchMine = async () => {
  if (!auth.isLoggedIn) {
    listState.value = 'ready'
    return
  }
  listState.value = 'loading'
  const r = await apiFetch('/inquiries')
  if (r.ok && Array.isArray((r.data as any).inquiries)) {
    inquiries.value = (r.data as any).inquiries
    listState.value = 'ready'
  } else {
    listState.value = 'error'
  }
  const b = await apiFetch('/bookings')
  if (b.ok && Array.isArray((b.data as any).bookings)) {
    myBookings.value = (b.data as any).bookings
  }
}

function goLogin() {
  navigateTo({ path: '/login', query: { redirect: '/help' } })
}

const submitInquiry = async () => {
  const s = subject.value.trim()
  const b = body.value.trim()
  if (!s || !b || submitting.value) return
  submitting.value = true
  submitError.value = ''
  submitted.value = false
  const r = await apiFetch('/inquiries', { method: 'POST', body: { category: category.value, subject: s, body: b, ...(bookingId.value ? { bookingId: bookingId.value } : {}) } })
  submitting.value = false
  if (!r.ok) {
    submitError.value = (r.data as any)?.error || '접수에 실패했습니다. 다시 시도해주세요.'
    return
  }
  submitted.value = true
  subject.value = ''
  body.value = ''
  bookingId.value = ''
  fetchMine()
}

onMounted(() => {
  fetchMine()
})
</script>

<template>
  <div class="max-w-4xl mx-auto px-4 py-12 space-y-8">
    <div class="text-center space-y-2">
      <span class="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-50 text-trip-blue rounded-full text-xs font-black uppercase tracking-wider">
        <AppIcon name="support" :size="14" /> getfortrip 고객센터
      </span>
      <h1 class="text-3xl font-black text-slate-900 tracking-tight">무엇을 도와드릴까요?</h1>
      <p class="text-sm text-slate-500">자주 묻는 질문을 확인하거나 1:1 문의를 남겨주세요.</p>
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

    <!-- 1:1 문의 작성 -->
    <div class="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-4">
      <h2 class="text-lg font-black text-slate-900">1:1 문의하기</h2>
      <div v-if="!auth.isLoggedIn" class="rounded-2xl bg-slate-50 border border-slate-200 p-5 text-center space-y-3">
        <p class="text-xs text-slate-600">문의 작성과 내 문의 확인은 로그인이 필요합니다.</p>
        <button type="button" class="px-5 py-2.5 bg-trip-blue text-white text-xs font-bold rounded-xl" @click="goLogin">로그인하러 가기</button>
      </div>
      <div v-else class="space-y-3">
        <div class="grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-3">
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1" for="inq-category">문의 유형</label>
            <select id="inq-category" v-model="category" class="w-full p-2.5 border border-slate-300 rounded-xl text-xs font-bold bg-white">
              <option v-for="c in CATEGORIES" :key="c.value" :value="c.value">{{ c.label }}</option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1" for="inq-subject">제목</label>
            <input id="inq-subject" v-model="subject" type="text" maxlength="120" class="w-full p-2.5 border border-slate-300 rounded-xl text-xs font-bold" placeholder="문의 제목을 입력해 주세요" />
          </div>
        </div>
        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1" for="inq-booking">관련 예약 (선택)</label>
          <select id="inq-booking" v-model="bookingId" class="w-full p-2.5 border border-slate-300 rounded-xl text-xs font-bold bg-white">
            <option value="">예약 선택 안 함</option>
            <option v-for="b in myBookings" :key="b.id" :value="b.id">{{ b.bookingNumber }} · {{ b.title }}</option>
          </select>
        </div>
        <div>
          <label class="block text-xs font-bold text-slate-700 mb-1" for="inq-body">내용</label>
          <textarea id="inq-body" v-model="body" rows="5" maxlength="5000" class="w-full p-2.5 border border-slate-300 rounded-xl text-xs" placeholder="문의 내용을 입력해 주세요."></textarea>
        </div>
        <p v-if="submitError" class="text-xs font-bold text-danger" role="alert">{{ submitError }}</p>
        <p v-if="submitted" class="text-xs font-bold text-success" role="status">접수되었습니다. 확인 후 이 페이지에서 답변 상태를 볼 수 있습니다.</p>
        <button type="button" :disabled="submitting || !subject.trim() || !body.trim()" @click="submitInquiry" class="w-full sm:w-auto px-6 py-3 bg-trip-blue text-white font-bold rounded-xl text-xs shadow-md disabled:opacity-50">
          {{ submitting ? '접수 중…' : '문의 접수하기' }}
        </button>
      </div>
    </div>

    <!-- 내 문의 내역 -->
    <div v-if="auth.isLoggedIn" class="space-y-4">
      <h2 class="text-lg font-black text-slate-900">내 문의 내역</h2>
      <ResultsState
        :state="listState"
        :count="inquiries.length"
        icon="support"
        empty-title="접수한 문의가 없어요"
        empty-hint="위 양식으로 첫 문의를 남겨보세요."
        error-title="문의 내역을 불러오지 못했어요"
        @retry="fetchMine"
      >
        <div class="space-y-3">
          <div v-for="t in inquiries" :key="t.id" class="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-2">
            <div class="flex items-center justify-between gap-2">
              <span class="text-[11px] font-bold text-slate-500">{{ CATEGORIES.find((c) => c.value === t.category)?.label || t.category }} · {{ t.created_at ? new Date(t.created_at).toLocaleDateString() : '' }}</span>
              <span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold" :class="t.status === 'OPEN' ? 'bg-amber-50 text-amber-700' : t.status === 'IN_PROGRESS' ? 'bg-blue-50 text-trip-blue' : 'bg-emerald-50 text-emerald-700'">{{ STATUS_LABEL[t.status] || t.status }}</span>
            </div>
            <h3 class="font-bold text-slate-900 text-sm">{{ t.subject }}</h3>
            <p v-if="t.booking_id" class="text-[11px] font-bold text-trip-blue">관련 예약: {{ t.booking_id }}</p>
            <p class="text-xs text-slate-600 leading-relaxed whitespace-pre-line">{{ t.body }}</p>
            <p v-if="t.admin_note" class="text-xs text-slate-700 leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-100">답변: {{ t.admin_note }}</p>
          </div>
        </div>
      </ResultsState>
    </div>
  </div>
</template>
