<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { apiUrl } from '../config/api'

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

const fetchDashboard = async () => {
  loading.value = true
  try {
    const token = localStorage.getItem('getfortrip_partner_token')
    const res = await fetch(apiUrl('/partner/dashboard'), {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (res.ok) {
      const json = await res.json()
      stats.value = json.stats
      partnerInfo.value = json.partner
      recentOrders.value = json.recentOrders || []
    }
  } catch (e) {
    console.error('Failed to load partner dashboard', e)
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
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div>
        <h1 class="text-2xl font-black tracking-tight text-slate-900 flex items-center gap-2">
          <span>파트너 운영 대시보드</span>
          <span class="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
            {{ partnerInfo?.companyName || '파트너' }}
          </span>
        </h1>
        <p class="text-sm text-slate-500 font-medium mt-1">
          실시간 상품 공급 현황, 접수된 고객 주문 및 정산 예상액을 확인합니다.
        </p>
      </div>
      <div class="flex items-center gap-2">
        <router-link
          to="/products"
          class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-black rounded-xl shadow-md shadow-blue-500/20 transition flex items-center gap-1.5"
        >
          <span>➕</span>
          <span>신규 상품 등록</span>
        </router-link>
      </div>
    </div>

    <!-- KPI Cards -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <div class="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm space-y-2">
        <div class="text-xs font-bold text-slate-400 uppercase tracking-wider">등록 공급 상품</div>
        <div class="text-2xl font-black text-slate-900">{{ stats.activeProductsCount }}개</div>
        <div class="text-[11px] text-emerald-600 font-bold">정상 판매 중</div>
      </div>
      <div class="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm space-y-2">
        <div class="text-xs font-bold text-slate-400 uppercase tracking-wider">처리 대기 주문</div>
        <div class="text-2xl font-black text-amber-600">{{ stats.pendingBookingsCount }}건</div>
        <div class="text-[11px] text-slate-400">확정/발권 대기 중</div>
      </div>
      <div class="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm space-y-2">
        <div class="text-xs font-bold text-slate-400 uppercase tracking-wider">금월 총 매출액 (GMV)</div>
        <div class="text-2xl font-black text-slate-900">{{ (stats.monthlyGrossKrw || 0).toLocaleString() }}원</div>
        <div class="text-[11px] text-slate-400">플랫폼 수수료율 {{ stats.commissionRatePercent }}%</div>
      </div>
      <div class="bg-white p-5 rounded-2xl border border-blue-200 shadow-sm bg-gradient-to-br from-blue-50/50 to-white space-y-2">
        <div class="text-xs font-bold text-blue-600 uppercase tracking-wider">정산 예정액 (Net Payout)</div>
        <div class="text-2xl font-black text-blue-700">{{ (stats.monthlyNetKrw || 0).toLocaleString() }}원</div>
        <div class="text-[11px] text-blue-500 font-medium">수수료 공제 후 실입금액</div>
      </div>
    </div>

    <!-- Quick Navigation Banner -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <router-link
        to="/inventory"
        class="bg-white p-4 rounded-2xl border border-slate-200 hover:border-blue-500 hover:shadow-md transition flex items-center gap-3.5"
      >
        <span class="text-2xl p-2.5 rounded-xl bg-blue-50">📅</span>
        <div>
          <div class="text-xs font-black text-slate-900">가격 / 재고 캘린더</div>
          <div class="text-[11px] text-slate-400 mt-0.5">일자별 잔여 수량 및 요금 조정</div>
        </div>
      </router-link>
      <router-link
        to="/orders"
        class="bg-white p-4 rounded-2xl border border-slate-200 hover:border-blue-500 hover:shadow-md transition flex items-center gap-3.5"
      >
        <span class="text-2xl p-2.5 rounded-xl bg-emerald-50">📑</span>
        <div>
          <div class="text-xs font-black text-slate-900">주문 / 예약 접수 관리</div>
          <div class="text-[11px] text-slate-400 mt-0.5">고객 주문 확정 및 바우처 전송</div>
        </div>
      </router-link>
      <router-link
        to="/settlements"
        class="bg-white p-4 rounded-2xl border border-slate-200 hover:border-blue-500 hover:shadow-md transition flex items-center gap-3.5"
      >
        <span class="text-2xl p-2.5 rounded-xl bg-purple-50">💰</span>
        <div>
          <div class="text-xs font-black text-slate-900">정산 명세서 & 계좌</div>
          <div class="text-[11px] text-slate-400 mt-0.5">월별 매출 정산 내역 및 입금 통장</div>
        </div>
      </router-link>
    </div>

    <!-- Recent Orders Table -->
    <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div class="p-4 border-b border-slate-100 flex items-center justify-between">
        <h3 class="text-sm font-black text-slate-900 flex items-center gap-2">
          <span>최근 접수된 예약 주문</span>
          <span class="text-xs font-bold text-slate-400">({{ recentOrders.length }}건)</span>
        </h3>
        <router-link to="/orders" class="text-xs font-bold text-blue-600 hover:underline">
          전체 주문 보기 →
        </router-link>
      </div>

      <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse text-xs">
          <thead>
            <tr class="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider">
              <th class="p-3.5">예약번호</th>
              <th class="p-3.5">상품명</th>
              <th class="p-3.5">이용 일시</th>
              <th class="p-3.5">고객명</th>
              <th class="p-3.5">결제 금액</th>
              <th class="p-3.5">상태</th>
              <th class="p-3.5 text-right">관리</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 font-medium">
            <tr v-if="loading">
              <td colspan="7" class="p-8 text-center text-slate-400 font-bold">
                주문 내역을 불러오는 중입니다...
              </td>
            </tr>
            <tr v-else-if="recentOrders.length === 0">
              <td colspan="7" class="p-8 text-center text-slate-400 font-bold">
                최근 접수된 예약 주문이 없습니다.
              </td>
            </tr>
            <tr
              v-else
              v-for="o in recentOrders"
              :key="o.id"
              class="hover:bg-slate-50/80 transition"
            >
              <td class="p-3.5 font-mono font-bold text-slate-700">{{ o.booking_number || o.id }}</td>
              <td class="p-3.5 font-bold text-slate-900">{{ o.title }}</td>
              <td class="p-3.5 text-slate-500">{{ o.service_start || '-' }}</td>
              <td class="p-3.5 text-slate-600">{{ o.customerNameMasked || '김**' }}</td>
              <td class="p-3.5 font-bold text-blue-600">{{ (o.total_minor || 0).toLocaleString() }}원</td>
              <td class="p-3.5">
                <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                  {{ o.status }}
                </span>
              </td>
              <td class="p-3.5 text-right">
                <router-link
                  to="/orders"
                  class="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-bold text-[11px] transition"
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
