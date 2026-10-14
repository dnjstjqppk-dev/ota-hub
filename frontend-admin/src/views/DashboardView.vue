<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { apiUrl } from '../config/api'

interface DashboardStats {
  total_gmv_krw: number
  total_bookings: number
  active_users: number
  domain_breakdown: Record<string, number>
  status_breakdown: Record<string, number>
  timestamp: string
}

const stats = ref<DashboardStats | null>(null)
const loading = ref(true)

const fetchStats = async () => {
  try {
    loading.value = true
    const res = await fetch(apiUrl('/admin/dashboard'))
    const json = await res.json()
    stats.value = json.data
  } catch (e) {
    console.error(e)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  fetchStats()
})
</script>

<template>
  <div class="p-8 space-y-6">
    <!-- 헤더 -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-black text-slate-900 tracking-tight">통합 관제 대시보드</h1>
        <p class="text-sm text-slate-500 mt-1">실시간 총 거래액(GMV), 7대 도메인 예약 현황 및 시스템 헬스</p>
      </div>
      <button
        @click="fetchStats"
        class="flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 rounded-xl text-sm font-semibold hover:bg-slate-50 shadow-sm"
      >
        <span>🔄</span> 새로고침
      </button>
    </div>

    <!-- 핵심 KPI 카드 그리드 -->
    <div class="grid grid-cols-1 md:grid-cols-4 gap-5">
      <div class="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
        <div class="flex items-center justify-between text-slate-500 text-xs font-bold uppercase tracking-wider">
          <span>누적 총 거래액 (GMV)</span>
          <span class="text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full font-mono">KRW</span>
        </div>
        <div class="text-3xl font-black text-slate-900 mt-3">
          ₩{{ stats?.total_gmv_krw.toLocaleString() || '0' }}
        </div>
        <div class="flex items-center gap-1.5 text-xs text-emerald-600 font-bold mt-2">
          <span>↑ 18.4%</span>
          <span class="text-slate-400 font-normal">전주 대비 성장</span>
        </div>
      </div>

      <div class="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
        <div class="flex items-center justify-between text-slate-500 text-xs font-bold uppercase tracking-wider">
          <span>총 유효 예약 건수</span>
          <span class="text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full font-mono">Real-time</span>
        </div>
        <div class="text-3xl font-black text-slate-900 mt-3">
          {{ stats?.total_bookings || 0 }} <span class="text-lg font-medium text-slate-500">건</span>
        </div>
        <div class="text-xs text-slate-400 mt-2 font-medium">발권 완료 및 대기 포함</div>
      </div>

      <div class="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
        <div class="flex items-center justify-between text-slate-500 text-xs font-bold uppercase tracking-wider">
          <span>활성 회원 수</span>
          <span class="text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full font-mono">Members</span>
        </div>
        <div class="text-3xl font-black text-slate-900 mt-3">
          {{ stats?.active_users || 0 }} <span class="text-lg font-medium text-slate-500">명</span>
        </div>
        <div class="text-xs text-slate-400 mt-2 font-medium">VIP 다이아몬드 등급 포함</div>
      </div>

      <div class="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
        <div class="flex items-center justify-between text-slate-500 text-xs font-bold uppercase tracking-wider">
          <span>백엔드 API 레이턴시</span>
          <span class="text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full font-mono">24ms</span>
        </div>
        <div class="text-3xl font-black text-emerald-600 mt-3">
          99.98%
        </div>
        <div class="text-xs text-slate-400 mt-2 font-medium">Goroutine 병렬 검색 엔진 가동중</div>
      </div>
    </div>

    <!-- 도메인별 점유율 및 상태 차트 영역 -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div class="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
        <h3 class="text-base font-bold text-slate-900 mb-4">도메인별 예약 분포</h3>
        <div class="space-y-3">
          <div v-for="(cnt, dom) in stats?.domain_breakdown" :key="dom" class="flex items-center justify-between text-sm">
            <span class="font-semibold text-slate-700 flex items-center gap-2">
              <span class="w-2.5 h-2.5 rounded-full bg-trip-blue"></span>
              {{ dom }}
            </span>
            <span class="font-mono font-bold text-slate-900">{{ cnt }} 건</span>
          </div>
        </div>
      </div>

      <div class="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
        <h3 class="text-base font-bold text-slate-900 mb-4">예약 상태 머신 현황</h3>
        <div class="space-y-3">
          <div v-for="(cnt, st) in stats?.status_breakdown" :key="st" class="flex items-center justify-between text-sm">
            <span class="font-semibold text-slate-700 flex items-center gap-2">
              <span :class="[
                'w-2.5 h-2.5 rounded-full',
                st === 'CONFIRMED' ? 'bg-emerald-500' :
                st === 'ISSUE_FAILED' ? 'bg-rose-500' : 'bg-amber-500'
              ]"></span>
              {{ st }}
            </span>
            <span class="font-mono font-bold text-slate-900">{{ cnt }} 건</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
