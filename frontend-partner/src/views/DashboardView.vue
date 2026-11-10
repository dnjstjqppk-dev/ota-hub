<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { apiUrl, partnerToken } from '../config/api'

interface OrderRow {
  id: string
  booking_number: string
  domain_type: string
  title: string
  status: string
  total_minor: number
  currency: string
  customerNameMasked: string
  service_start: string
  created_at: string
}

const stats = ref({
  activeProductsCount: 0,
  monthlyGrossKrw: 0,
  monthlyNetKrw: 0,
  pendingBookingsCount: 0,
  commissionRatePercent: 10
})

const partnerInfo = ref<any>(null)
const recentOrders = ref<OrderRow[]>([])
const loading = ref(false)
const error = ref('')

const fetchDashboard = async () => {
  loading.value = true
  error.value = ''
  try {
    const token = partnerToken()
    const res = await fetch(apiUrl('/partner/dashboard'), {
      credentials: 'include',
      headers: { Authorization: `Bearer ${token}` }
    })
    if (!res.ok) throw new Error('대시보드를 불러오지 못했습니다.')
    const json = await res.json()
    stats.value = json.stats
    partnerInfo.value = json.partner
    recentOrders.value = json.recentOrders || []
  } catch (e: any) {
    error.value = e.message || '대시보드를 불러오지 못했습니다.'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  fetchDashboard()
})
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex flex-col justify-between gap-4 md:flex-row md:items-center">
      <div>
        <h1 class="flex items-center gap-2 text-2xl font-black tracking-tight text-ink">
          <span>파트너 운영 대시보드</span>
          <span class="rounded-full bg-primary-soft px-2 py-0.5 text-xs font-bold text-primary">
            {{ partnerInfo?.companyName || '파트너' }}
          </span>
        </h1>
        <p class="mt-1 text-sm font-medium text-ink-subtle">
          실시간 상품 공급 현황, 접수된 고객 주문 및 정산 예상액을 확인합니다.
        </p>
      </div>
      <div class="flex items-center gap-2">
        <router-link
          to="/products"
          class="btn-primary btn-sm !text-xs"
        >
          <AppIcon name="plus" :size="14" />
          <span>신규 상품 등록</span>
        </router-link>
      </div>
    </div>

    <div v-if="error" class="rounded-2xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm font-semibold text-danger">
      {{ error }}
      <button type="button" class="ml-2 underline" @click="fetchDashboard">다시 시도</button>
    </div>

    <!-- KPI Cards -->
    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div class="card space-y-2 p-5">
        <div class="text-xs font-bold uppercase tracking-wider text-ink-subtle">등록 공급 상품</div>
        <div class="text-2xl font-black tabular text-ink">{{ stats.activeProductsCount }}개</div>
        <div class="text-[11px] font-bold text-success">정상 판매 중</div>
      </div>
      <div class="card space-y-2 p-5">
        <div class="text-xs font-bold uppercase tracking-wider text-ink-subtle">처리 대기 주문</div>
        <div class="text-2xl font-black tabular text-warning">{{ stats.pendingBookingsCount }}건</div>
        <div class="text-[11px] text-ink-subtle">확정/발권 대기 중</div>
      </div>
      <div class="card space-y-2 p-5">
        <div class="text-xs font-bold uppercase tracking-wider text-ink-subtle">금월 총 매출액 (GMV)</div>
        <div class="text-2xl font-black tabular text-ink">{{ (stats.monthlyGrossKrw || 0).toLocaleString() }}원</div>
        <div class="text-[11px] text-ink-subtle">플랫폼 수수료율 {{ stats.commissionRatePercent }}%</div>
      </div>
      <div class="rounded-card border border-primary/30 bg-primary-soft p-5 shadow-card space-y-2">
        <div class="text-xs font-bold uppercase tracking-wider text-primary">정산 예정액 (Net Payout)</div>
        <div class="text-2xl font-black tabular text-ink">{{ (stats.monthlyNetKrw || 0).toLocaleString() }}원</div>
        <div class="text-[11px] font-medium text-ink-muted">수수료 공제 후 실입금액</div>
      </div>
    </div>

    <!-- Quick Navigation Banner -->
    <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
      <router-link
        to="/inventory"
        class="card flex items-center gap-3.5 p-4 transition hover:border-primary hover:shadow-card"
      >
        <span class="rounded-xl bg-primary-soft p-2.5 text-primary"><AppIcon name="calendar" :size="22" /></span>
        <div>
          <div class="text-xs font-black text-ink">가격 / 재고 캘린더</div>
          <div class="mt-0.5 text-[11px] text-ink-subtle">일자별 잔여 수량 및 요금 조정</div>
        </div>
      </router-link>
      <router-link
        to="/orders"
        class="card flex items-center gap-3.5 p-4 transition hover:border-primary hover:shadow-card"
      >
        <span class="rounded-xl bg-success-soft p-2.5 text-success"><AppIcon name="bookings" :size="22" /></span>
        <div>
          <div class="text-xs font-black text-ink">주문 / 예약 접수 관리</div>
          <div class="mt-0.5 text-[11px] text-ink-subtle">고객 주문 확정 및 바우처 전송</div>
        </div>
      </router-link>
      <router-link
        to="/settlements"
        class="card flex items-center gap-3.5 p-4 transition hover:border-primary hover:shadow-card"
      >
        <span class="rounded-xl bg-warning-soft p-2.5 text-warning"><AppIcon name="coins" :size="22" /></span>
        <div>
          <div class="text-xs font-black text-ink">정산 명세서 & 계좌</div>
          <div class="mt-0.5 text-[11px] text-ink-subtle">월별 매출 정산 내역 및 입금 통장</div>
        </div>
      </router-link>
    </div>

    <!-- Recent Orders Table -->
    <div class="card overflow-hidden">
      <div class="flex items-center justify-between border-b border-line p-4">
        <h3 class="flex items-center gap-2 text-sm font-black text-ink">
          <span>최근 접수된 예약 주문</span>
          <span class="text-xs font-bold text-ink-subtle">({{ recentOrders.length }}건)</span>
        </h3>
        <router-link to="/orders" class="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline">
          전체 주문 보기 <AppIcon name="arrow-right" :size="14" />
        </router-link>
      </div>

      <div class="overflow-x-auto">
        <table :class="['table text-xs', loading || recentOrders.length ? '!min-w-[640px]' : 'w-full !min-w-0']">
          <thead>
            <tr>
              <th>예약번호</th>
              <th>상품명</th>
              <th>이용 일시</th>
              <th>고객명</th>
              <th>결제 금액</th>
              <th>상태</th>
              <th class="!text-right">관리</th>
            </tr>
          </thead>
          <tbody class="font-medium">
            <tr v-if="loading">
              <td colspan="7" class="p-8 text-center font-bold text-ink-subtle">
                주문 내역을 불러오는 중입니다...
              </td>
            </tr>
            <tr v-else-if="recentOrders.length === 0">
              <td colspan="7" class="p-8 text-center font-bold text-ink-subtle">
                최근 접수된 예약 주문이 없습니다.
              </td>
            </tr>
            <tr
              v-else
              v-for="o in recentOrders"
              :key="o.id"
              class="transition hover:bg-surface-sunken"
            >
              <td class="font-mono font-bold">{{ o.booking_number || o.id }}</td>
              <td class="font-bold">{{ o.title }}</td>
              <td class="text-ink-subtle">{{ o.service_start || '-' }}</td>
              <td class="text-ink-muted">{{ o.customerNameMasked || '-' }}</td>
              <td class="font-bold tabular text-primary">{{ (o.total_minor || 0).toLocaleString() }}원</td>
              <td>
                <span class="rounded-full bg-primary-soft px-2 py-0.5 text-[10px] font-bold text-primary">
                  {{ o.status }}
                </span>
              </td>
              <td class="!text-right">
                <router-link
                  to="/orders"
                  class="rounded-lg bg-surface-sunken px-2.5 py-1 text-[11px] font-bold text-ink-muted transition hover:text-ink"
                >
                  주문 확인
                </router-link>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
