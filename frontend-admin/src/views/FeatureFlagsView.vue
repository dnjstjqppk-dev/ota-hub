<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { adminFetch } from '../config/api'

interface FeatureFlag {
  key: string
  category: string
  display_name: string
  description: string
  is_enabled: number
  default_enabled: number
  requires_flags: string[]
  is_external_dependent: number
  external_contract_status: 'NOT_REQUIRED' | 'PENDING_CONTRACT' | 'ACTIVE'
  updated_by: string | null
  updated_at: string
}

const flags = ref<FeatureFlag[]>([])
const loading = ref(true)
const activeCategory = ref<string>('ALL')
const searchQuery = ref('')
const feedbackMessage = ref<{ type: 'success' | 'error'; text: string } | null>(null)
const togglingKey = ref<string | null>(null)

const categories = [
  { id: 'ALL', label: '전체 보기' },
  { id: 'BOOKING_DOMAIN', label: '예약 도메인' },
  { id: 'PRODUCT_INGESTION', label: '상품 자동 수집' },
  { id: 'AUTOMATION', label: '자동화 엔진' },
  { id: 'FINANCIAL', label: '재무/정산' }
]

const categoryLabels: Record<string, string> = {
  BOOKING_DOMAIN: '예약 도메인',
  PRODUCT_INGESTION: '상품 수집',
  AUTOMATION: '자동화',
  FINANCIAL: '재무/정산',
  SYSTEM: '시스템'
}

const fetchFlags = async () => {
  loading.value = true
  try {
    const res = await adminFetch('/admin/feature-flags')
    if (res.ok) {
      const data = await res.json()
      flags.value = data.flags || []
    }
  } catch (err: any) {
    console.error('Failed to load feature flags', err)
    feedbackMessage.value = { type: 'error', text: '기능 플래그 목록을 불러오지 못했습니다.' }
  } finally {
    loading.value = false
  }
}

const filteredFlags = computed(() => {
  return flags.value.filter((f) => {
    const matchesCat = activeCategory.value === 'ALL' || f.category === activeCategory.value
    const matchesQuery =
      !searchQuery.value.trim() ||
      f.display_name.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
      f.key.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
      f.description.toLowerCase().includes(searchQuery.value.toLowerCase())
    return matchesCat && matchesQuery
  })
})

const stats = computed(() => {
  const total = flags.value.length
  const enabled = flags.value.filter((f) => f.is_enabled === 1).length
  const disabled = total - enabled
  const externalPending = flags.value.filter((f) => f.external_contract_status === 'PENDING_CONTRACT').length
  return { total, enabled, disabled, externalPending }
})

const toggleFlag = async (flag: FeatureFlag) => {
  const nextState = flag.is_enabled === 0
  togglingKey.value = flag.key
  feedbackMessage.value = null

  try {
    const res = await adminFetch(`/admin/feature-flags/${flag.key}`, {
      method: 'PATCH',
      body: JSON.stringify({
        is_enabled: nextState,
        reason: `Admin toggle via console (${nextState ? 'ENABLE' : 'DISABLE'})`
      })
    })

    const data = await res.json()
    if (!res.ok) {
      throw new Error(data.error || '플래그 상태 변경에 실패했습니다.')
    }

    flag.is_enabled = nextState ? 1 : 0
    flag.updated_at = new Date().toISOString()
    feedbackMessage.value = {
      type: 'success',
      text: `[${flag.display_name}] 기능이 ${nextState ? 'ON (활성화)' : 'OFF (비활성화)'} 처리되었습니다.`
    }
  } catch (err: any) {
    feedbackMessage.value = {
      type: 'error',
      text: err.message || '상태 변경 중 오류가 발생했습니다.'
    }
  } finally {
    togglingKey.value = null
  }
}

onMounted(() => {
  fetchFlags()
})
</script>

<template>
  <div class="p-8 space-y-6 max-w-7xl mx-auto">
    <!-- Header -->
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-6">
      <div>
        <div class="flex items-center gap-2">
          <span class="text-2xl">🚩</span>
          <h1 class="text-2xl font-bold text-slate-900">중앙 기능 플래그 (Feature Flags) 관리</h1>
          <span class="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
            Realtime DB Control
          </span>
        </div>
        <p class="text-sm text-slate-500 mt-1">
          GetForTrip의 전 영역(항공/호텔/투어/렌터카/eSIM/자동화) 기능을 실시간으로 안전하게 활성화 또는 비활성화합니다.
        </p>
      </div>

      <button
        @click="fetchFlags"
        class="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 shadow-sm"
      >
        <span>🔄</span> 새로고침
      </button>
    </div>

    <!-- Alert / Toast -->
    <div
      v-if="feedbackMessage"
      :class="[
        'p-4 rounded-xl flex items-center justify-between text-sm shadow-sm transition-all',
        feedbackMessage.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'
      ]"
    >
      <div class="flex items-center gap-2 font-medium">
        <span>{{ feedbackMessage.type === 'success' ? '✅' : '⚠️' }}</span>
        <span>{{ feedbackMessage.text }}</span>
      </div>
      <button @click="feedbackMessage = null" class="text-xs opacity-70 hover:opacity-100">✕ 닫기</button>
    </div>

    <!-- Metric Cards -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div class="p-5 bg-white rounded-xl border border-slate-200 shadow-sm">
        <p class="text-xs font-medium text-slate-500 uppercase tracking-wider">전체 관리 기능</p>
        <p class="text-2xl font-bold text-slate-900 mt-1">{{ stats.total }}개</p>
        <p class="text-xs text-slate-400 mt-1">PO 지시 16개 핵심 플래그</p>
      </div>
      <div class="p-5 bg-white rounded-xl border border-slate-200 shadow-sm">
        <p class="text-xs font-medium text-emerald-600 uppercase tracking-wider">활성 기능 (ON)</p>
        <p class="text-2xl font-bold text-emerald-600 mt-1">{{ stats.enabled }}개</p>
        <p class="text-xs text-slate-400 mt-1">실시간 서비스 운영 중</p>
      </div>
      <div class="p-5 bg-white rounded-xl border border-slate-200 shadow-sm">
        <p class="text-xs font-medium text-slate-500 uppercase tracking-wider">비활성 기능 (OFF)</p>
        <p class="text-2xl font-bold text-slate-600 mt-1">{{ stats.disabled }}개</p>
        <p class="text-xs text-slate-400 mt-1">안전 차단 및 사전 격리</p>
      </div>
      <div class="p-5 bg-white rounded-xl border border-slate-200 shadow-sm">
        <p class="text-xs font-medium text-amber-600 uppercase tracking-wider">외부 계약 대기</p>
        <p class="text-2xl font-bold text-amber-600 mt-1">{{ stats.externalPending }}개</p>
        <p class="text-xs text-slate-400 mt-1">GDS/공급사 제휴 인가 대기</p>
      </div>
    </div>

    <!-- Filters & Search -->
    <div class="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
      <div class="flex flex-wrap gap-1.5">
        <button
          v-for="c in categories"
          :key="c.id"
          @click="activeCategory = c.id"
          :class="[
            'px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors',
            activeCategory === c.id ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
          ]"
        >
          {{ c.label }}
        </button>
      </div>

      <div class="relative w-full sm:w-64">
        <input
          v-model="searchQuery"
          type="text"
          placeholder="기능명, 플래그 키 검색..."
          class="w-full pl-9 pr-4 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <span class="absolute left-3 top-2.5 text-xs text-slate-400">🔍</span>
      </div>
    </div>

    <!-- Flags Grid -->
    <div v-if="loading" class="p-12 text-center text-slate-400">
      <div class="inline-block animate-spin text-2xl mb-2">⚙️</div>
      <p class="text-sm">기능 플래그 목록을 불러오는 중입니다...</p>
    </div>

    <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div
        v-for="flag in filteredFlags"
        :key="flag.key"
        :class="[
          'p-5 bg-white rounded-xl border transition-all duration-200 shadow-sm hover:shadow-md flex flex-col justify-between',
          flag.is_enabled === 1 ? 'border-slate-200' : 'border-slate-200 bg-slate-50/70 opacity-90'
        ]"
      >
        <div>
          <!-- Top row: Category tag & Switch -->
          <div class="flex items-center justify-between mb-3">
            <div class="flex items-center gap-2">
              <span class="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-700">
                {{ categoryLabels[flag.category] || flag.category }}
              </span>

              <span
                v-if="flag.external_contract_status === 'PENDING_CONTRACT'"
                class="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-100 text-amber-800 flex items-center gap-1"
                title="외부 정식 계약 승인 전까지 안전 모드로 제어됩니다."
              >
                <span>🔒</span> 계약 대기
              </span>

              <span
                v-else-if="flag.external_contract_status === 'ACTIVE'"
                class="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-100 text-emerald-800"
              >
                연동 준비 완료
              </span>
            </div>

            <!-- Toggle Switch -->
            <button
              @click="toggleFlag(flag)"
              :disabled="togglingKey === flag.key"
              :class="[
                'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2',
                flag.is_enabled === 1 ? 'bg-emerald-500' : 'bg-slate-300'
              ]"
            >
              <span
                :class="[
                  'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
                  flag.is_enabled === 1 ? 'translate-x-5' : 'translate-x-0'
                ]"
              />
            </button>
          </div>

          <!-- Flag Name & Key -->
          <h3 class="text-base font-bold text-slate-900">{{ flag.display_name }}</h3>
          <code class="text-[11px] font-mono text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded inline-block mt-0.5">
            {{ flag.key }}
          </code>

          <!-- Description -->
          <p class="text-xs text-slate-600 mt-2.5 leading-relaxed">{{ flag.description }}</p>

          <!-- Prerequisites & Dependencies -->
          <div v-if="flag.requires_flags && flag.requires_flags.length > 0" class="mt-3.5 text-xs text-slate-500 bg-amber-50/60 p-2.5 rounded-lg border border-amber-200/60">
            <span class="font-medium text-amber-800">📌 필수 선행 기능:</span>
            <span class="ml-1 text-slate-700 font-mono text-[11px]">{{ flag.requires_flags.join(', ') }}</span>
          </div>
        </div>

        <!-- Card Footer -->
        <div class="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
          <span>최근 갱신: {{ new Date(flag.updated_at).toLocaleString('ko-KR') }}</span>
          <span v-if="flag.updated_by" class="truncate max-w-[140px]">수정자: {{ flag.updated_by }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
