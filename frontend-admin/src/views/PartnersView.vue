<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { apiUrl } from '../config/api'

interface PartnerRow {
  id: string
  company_name: string
  email: string
  partner_type: string
  business_number: string
  contact_phone: string
  is_active: number
  profile_status: 'PENDING_APPROVAL' | 'ACTIVE' | 'REJECTED' | 'SUSPENDED'
  settlement_rate_bps: number
  representative_name: string
  bank_name: string
  bank_account_number: string
  bank_account_holder: string
  created_at: string
}

const partners = ref<PartnerRow[]>([])
const loading = ref(false)
const filterStatus = ref<string>('ALL')
const searchQuery = ref<string>('')
const selectedPartner = ref<PartnerRow | null>(null)
const isModalOpen = ref(false)
const actionType = ref<'APPROVE' | 'REJECT' | 'SUSPEND' | 'EDIT_RATE'>('APPROVE')
const actionReason = ref('')
const newRateBps = ref(1000)
const actionLoading = ref(false)

const filteredPartners = computed(() => {
  return partners.value.filter(p => {
    const matchStatus = filterStatus.value === 'ALL' || p.profile_status === filterStatus.value
    const matchQuery = !searchQuery.value ||
      p.company_name.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
      p.email.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
      p.business_number.includes(searchQuery.value)
    return matchStatus && matchQuery
  })
})

const fetchPartners = async () => {
  loading.value = true
  try {
    const token = localStorage.getItem('getfortrip_admin_token')
    const res = await fetch(apiUrl('/admin/partners'), {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (res.ok) {
      const json = await res.json()
      partners.value = json.partners || []
    }
  } catch (e) {
    console.error('Failed to load partners', e)
  } finally {
    loading.value = false
  }
}

const openActionModal = (p: PartnerRow, type: 'APPROVE' | 'REJECT' | 'SUSPEND' | 'EDIT_RATE') => {
  selectedPartner.value = p
  actionType.value = type
  actionReason.value = ''
  newRateBps.value = p.settlement_rate_bps || 1000
  isModalOpen.value = true
}

const handleConfirmAction = async () => {
  if (!selectedPartner.value) return
  actionLoading.value = true
  try {
    const token = localStorage.getItem('getfortrip_admin_token')
    let body: any = {}
    if (actionType.value === 'APPROVE') {
      body = { status: 'ACTIVE', settlementRateBps: newRateBps.value }
    } else if (actionType.value === 'REJECT') {
      body = { status: 'REJECTED', reason: actionReason.value || '사업자 인증 요건 미충족' }
    } else if (actionType.value === 'SUSPEND') {
      body = { status: 'SUSPENDED', reason: actionReason.value || '운영 정책 위반' }
    } else if (actionType.value === 'EDIT_RATE') {
      body = { settlementRateBps: newRateBps.value }
    }

    const res = await fetch(apiUrl(`/admin/partners/${selectedPartner.value.id}`), {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(body)
    })
    if (res.ok) {
      isModalOpen.value = false
      await fetchPartners()
    } else {
      const err = await res.json()
      alert(err.error || '처리에 실패했습니다.')
    }
  } catch (e: any) {
    alert(e.message || '오류가 발생했습니다.')
  } finally {
    actionLoading.value = false
  }
}

onMounted(() => {
  fetchPartners()
})
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div>
        <h1 class="text-2xl font-black tracking-tight text-slate-900 flex items-center gap-2">
          <span>파트너 / 공급사 입점 관리</span>
          <span class="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
            {{ partners.length }}개사 등록
          </span>
        </h1>
        <p class="text-sm text-slate-500 font-medium mt-1">
          글로벌 호텔, 렌터카, 투어 공급사의 입점 신청 승인, 수수료율 설정 및 정산 계좌를 관리합니다.
        </p>
      </div>
      <div class="flex items-center gap-2">
        <button
          @click="fetchPartners"
          class="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl shadow-sm transition flex items-center gap-1.5"
        >
          <span>🔄</span>
          <span>새로고침</span>
        </button>
      </div>
    </div>

    <!-- Filters & Search -->
    <div class="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4 justify-between">
      <!-- Status Tabs -->
      <div class="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0">
        <button
          v-for="st in [
            { id: 'ALL', label: '전체 파트너' },
            { id: 'PENDING_APPROVAL', label: '승인 대기 ⏳' },
            { id: 'ACTIVE', label: '정상 운영 ✅' },
            { id: 'SUSPENDED', label: '이용 정지 ⛔' },
            { id: 'REJECTED', label: '반려됨 ❌' }
          ]"
          :key="st.id"
          @click="filterStatus = st.id"
          :class="[
            filterStatus === st.id
              ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
            'px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex-shrink-0'
          ]"
        >
          {{ st.label }}
        </button>
      </div>

      <!-- Search Input -->
      <div class="relative w-full md:w-72">
        <input
          v-model="searchQuery"
          type="text"
          placeholder="회사명, 이메일, 사업자번호 검색..."
          class="w-full pl-9 pr-3 py-2 text-xs font-medium border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
        />
        <span class="absolute left-3 top-2.5 text-xs text-slate-400">🔍</span>
      </div>
    </div>

    <!-- Table -->
    <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse text-xs">
          <thead>
            <tr class="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider">
              <th class="p-3.5">파트너 ID</th>
              <th class="p-3.5">회사명 / 대표자</th>
              <th class="p-3.5">유형</th>
              <th class="p-3.5">사업자 번호</th>
              <th class="p-3.5">정산 수수료율</th>
              <th class="p-3.5">정산 지급 계좌</th>
              <th class="p-3.5">상태</th>
              <th class="p-3.5 text-right">관리 작업</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 font-medium">
            <tr v-if="loading">
              <td colspan="8" class="p-8 text-center text-slate-400 font-bold">
                파트너 목록을 불러오는 중입니다...
              </td>
            </tr>
            <tr v-else-if="filteredPartners.length === 0">
              <td colspan="8" class="p-8 text-center text-slate-400 font-bold">
                조건에 맞는 파트너가 없습니다.
              </td>
            </tr>
            <tr
              v-else
              v-for="p in filteredPartners"
              :key="p.id"
              class="hover:bg-slate-50/80 transition"
            >
              <td class="p-3.5 font-mono text-slate-500">{{ p.id }}</td>
              <td class="p-3.5">
                <div class="font-bold text-slate-900">{{ p.company_name }}</div>
                <div class="text-[11px] text-slate-400">{{ p.email }} · {{ p.representative_name || '-' }}</div>
              </td>
              <td class="p-3.5">
                <span class="px-2 py-0.5 rounded font-black text-[10px] bg-slate-100 text-slate-700">
                  {{ p.partner_type }}
                </span>
              </td>
              <td class="p-3.5 font-mono">{{ p.business_number }}</td>
              <td class="p-3.5 font-bold text-blue-600">
                {{ (p.settlement_rate_bps || 1000) / 100 }}%
                <button
                  @click="openActionModal(p, 'EDIT_RATE')"
                  class="ml-1 text-[10px] text-slate-400 hover:text-blue-600 underline"
                >
                  변경
                </button>
              </td>
              <td class="p-3.5">
                <div class="text-slate-800">{{ p.bank_name || '미등록' }} {{ p.bank_account_number || '' }}</div>
                <div class="text-[10px] text-slate-400">예금주: {{ p.bank_account_holder || '-' }}</div>
              </td>
              <td class="p-3.5">
                <span
                  :class="[
                    p.profile_status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-800 border-emerald-200' :
                    p.profile_status === 'PENDING_APPROVAL' ? 'bg-amber-100 text-amber-800 border-amber-200 animate-pulse' :
                    p.profile_status === 'SUSPENDED' ? 'bg-rose-100 text-rose-800 border-rose-200' :
                    'bg-slate-100 text-slate-600 border-slate-200',
                    'px-2 py-0.5 text-[11px] font-black rounded-full border'
                  ]"
                >
                  {{
                    p.profile_status === 'ACTIVE' ? '정상 운영' :
                    p.profile_status === 'PENDING_APPROVAL' ? '승인 대기' :
                    p.profile_status === 'SUSPENDED' ? '이용 정지' : '가입 반려'
                  }}
                </span>
              </td>
              <td class="p-3.5 text-right space-x-1.5">
                <button
                  v-if="p.profile_status === 'PENDING_APPROVAL'"
                  @click="openActionModal(p, 'APPROVE')"
                  class="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-[11px] shadow-sm transition"
                >
                  승인
                </button>
                <button
                  v-if="p.profile_status === 'PENDING_APPROVAL'"
                  @click="openActionModal(p, 'REJECT')"
                  class="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg font-bold text-[11px] transition"
                >
                  반려
                </button>
                <button
                  v-if="p.profile_status === 'ACTIVE'"
                  @click="openActionModal(p, 'SUSPEND')"
                  class="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded-lg font-bold text-[11px] transition"
                >
                  정지
                </button>
                <button
                  v-if="p.profile_status === 'SUSPENDED'"
                  @click="openActionModal(p, 'APPROVE')"
                  class="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-[11px] shadow-sm transition"
                >
                  정지 해제
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Action Modal -->
    <div
      v-if="isModalOpen && selectedPartner"
      class="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
    >
      <div class="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-5">
        <div class="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 class="text-base font-black text-slate-900">
            {{
              actionType === 'APPROVE' ? '파트너 입점 승인' :
              actionType === 'REJECT' ? '파트너 신청 반려' :
              actionType === 'SUSPEND' ? '파트너 계정 정지' : '수수료율 변경'
            }}
          </h3>
          <button @click="isModalOpen = false" class="text-slate-400 hover:text-slate-600 font-bold text-sm">✕</button>
        </div>

        <div class="space-y-3 text-xs">
          <div class="bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-1">
            <div class="font-bold text-slate-900">{{ selectedPartner.company_name }}</div>
            <div class="text-slate-500">{{ selectedPartner.email }} · {{ selectedPartner.business_number }}</div>
          </div>

          <!-- Commission Rate Edit -->
          <div v-if="actionType === 'APPROVE' || actionType === 'EDIT_RATE'" class="space-y-1">
            <label class="font-bold text-slate-700">플랫폼 수수료율 (기본 10% = 1000 bps)</label>
            <div class="flex items-center gap-2">
              <input
                v-model.number="newRateBps"
                type="number"
                step="50"
                min="0"
                max="5000"
                class="w-full px-3 py-2 border border-slate-200 rounded-xl font-bold text-slate-900"
              />
              <span class="font-black text-blue-600 text-sm whitespace-nowrap">
                = {{ (newRateBps / 100).toFixed(2) }}%
              </span>
            </div>
            <p class="text-[11px] text-slate-400">파트너 매출에서 공제되는 플랫폼 수수료율입니다.</p>
          </div>

          <!-- Reason input -->
          <div v-if="actionType === 'REJECT' || actionType === 'SUSPEND'" class="space-y-1">
            <label class="font-bold text-slate-700">사유 입력</label>
            <textarea
              v-model="actionReason"
              rows="3"
              placeholder="반려 또는 정지 사유를 구체적으로 입력하세요..."
              class="w-full p-2.5 border border-slate-200 rounded-xl font-medium outline-none"
            ></textarea>
          </div>
        </div>

        <div class="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
          <button
            @click="isModalOpen = false"
            class="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl font-bold text-xs"
          >
            취소
          </button>
          <button
            @click="handleConfirmAction"
            :disabled="actionLoading"
            class="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black text-xs shadow-md shadow-blue-500/25 disabled:opacity-50"
          >
            {{ actionLoading ? '처리 중...' : '확인 완료' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

