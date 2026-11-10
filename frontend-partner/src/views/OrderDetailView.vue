<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { apiUrl, partnerToken } from '../config/api'

const route = useRoute()
const router = useRouter()
const id = String(route.params.id || '')

const booking = ref<any>(null)
const payments = ref<any[]>([])
const refunds = ref<any[]>([])
const history = ref<any[]>([])
const loading = ref(false)
const error = ref('')

const krw = (v: number | null | undefined) => (typeof v === 'number' ? `${v.toLocaleString()}원` : '-')

async function fetchDetail() {
  loading.value = true
  error.value = ''
  try {
    const res = await fetch(apiUrl(`/partner/orders/${encodeURIComponent(id)}`), {
      credentials: 'include',
      headers: { Authorization: `Bearer ${partnerToken()}` }
    })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error((j as any).error || '주문을 불러오지 못했습니다.')
    booking.value = j.booking
    payments.value = j.payments || []
    refunds.value = j.refunds || []
    history.value = j.history || []
  } catch (e: any) {
    error.value = e.message || '주문을 불러오지 못했습니다.'
  } finally {
    loading.value = false
  }
}

onMounted(fetchDetail)
</script>

<template>
  <div class="space-y-6">
    <div>
      <button type="button" class="mb-3 text-xs font-bold text-ink-muted hover:text-primary" @click="router.back()">← 주문 목록으로</button>
      <h1 class="font-mono text-xl font-black tracking-tight text-ink">{{ booking?.booking_number || id }}</h1>
      <p v-if="booking" class="mt-1 text-sm font-medium text-ink-subtle">{{ booking.title }}</p>
    </div>

    <div v-if="error" class="rounded-2xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm font-semibold text-danger">
      {{ error }}
      <button type="button" class="ml-2 underline" @click="fetchDetail">다시 시도</button>
    </div>
    <p v-if="loading" class="py-8 text-center text-sm font-bold text-ink-subtle">주문 상세를 불러오는 중입니다...</p>

    <template v-if="booking">
      <div class="card grid grid-cols-2 gap-4 p-5 text-xs md:grid-cols-4">
        <div><p class="label">상태</p><p class="font-black text-ink">{{ booking.status }}</p></div>
        <div><p class="label">결제 상태</p><p class="font-bold text-ink">{{ booking.payment_status }}</p></div>
        <div><p class="label">공급 상태</p><p class="font-bold text-ink">{{ booking.supplier_status }}</p></div>
        <div><p class="label">예약자</p><p class="font-bold text-ink">{{ booking.customerNameMasked }}</p></div>
        <div><p class="label">이용 기간</p><p class="font-bold text-ink">{{ booking.service_start || '-' }}<span v-if="booking.service_end"> ~ {{ booking.service_end }}</span></p></div>
        <div><p class="label">총액</p><p class="font-black tabular text-primary">{{ krw(booking.total_minor) }}</p></div>
        <div><p class="label">결제 / 환불</p><p class="font-bold tabular text-ink">{{ krw(booking.paid_minor) }} / {{ krw(booking.refunded_minor) }}</p></div>
        <div><p class="label">공급사 확정번호</p><p class="font-mono font-bold text-ink">{{ booking.supplier_reference || '-' }}</p></div>
      </div>

      <div class="card overflow-hidden">
        <h2 class="border-b border-line px-4 py-3 text-sm font-black text-ink">결제 내역</h2>
        <div class="overflow-x-auto">
          <table class="table !min-w-[560px] text-xs">
            <thead><tr><th>수단</th><th>모드</th><th class="text-right">금액</th><th>상태</th><th>승인 시각</th></tr></thead>
            <tbody class="font-medium">
              <tr v-if="!payments.length"><td colspan="5" class="p-6 text-center text-ink-subtle">결제 내역이 없어요.</td></tr>
              <tr v-for="p in payments" :key="p.id">
                <td class="font-bold">{{ p.method || p.provider }}</td>
                <td>{{ p.mode }}</td>
                <td class="text-right tabular">{{ krw(p.amount_minor) }}</td>
                <td>{{ p.status }}</td>
                <td class="font-mono text-[11px] text-ink-subtle">{{ (p.approved_at || p.created_at || '').slice(0, 16).replace('T', ' ') }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div v-if="refunds.length" class="card overflow-hidden">
        <h2 class="border-b border-line px-4 py-3 text-sm font-black text-ink">환불 내역</h2>
        <div class="overflow-x-auto">
          <table class="table !min-w-[560px] text-xs">
            <thead><tr><th class="text-right">금액</th><th>사유</th><th>상태</th><th>일시</th></tr></thead>
            <tbody class="font-medium">
              <tr v-for="r in refunds" :key="r.id">
                <td class="text-right tabular">{{ krw(r.amount_minor) }}</td>
                <td>{{ r.reason }}</td>
                <td>{{ r.status }}</td>
                <td class="font-mono text-[11px] text-ink-subtle">{{ (r.created_at || '').slice(0, 16).replace('T', ' ') }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="card p-5">
        <h2 class="mb-3 text-sm font-black text-ink">상태 변경 이력</h2>
        <p v-if="!history.length" class="text-xs text-ink-subtle">이력이 없어요.</p>
        <ol v-else class="space-y-2">
          <li v-for="(h, i) in history" :key="i" class="flex flex-wrap items-center gap-2 font-mono text-[11px]">
            <span class="text-ink-subtle">{{ (h.created_at || '').slice(0, 16).replace('T', ' ') }}</span>
            <span class="font-bold text-ink">{{ h.from_status || '—' }} → {{ h.to_status }}</span>
            <span class="rounded bg-surface-sunken px-1.5 py-0.5 text-ink-muted">{{ h.actor_type }}</span>
            <span v-if="h.reason" class="w-full font-sans text-ink-subtle">{{ h.reason }}</span>
          </li>
        </ol>
      </div>
    </template>
  </div>
</template>
