<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { apiUrl } from '../config/api'

interface StaffRow {
  id: string
  email: string
  full_name: string
  role: 'OWNER' | 'MANAGER' | 'STAFF'
  is_active: number
  created_at: string
}

const staffList = ref<StaffRow[]>([])
const loading = ref(false)
const isModalOpen = ref(false)
const newEmail = ref('')
const newName = ref('')
const newRole = ref('STAFF')
const newPassword = ref('PartnerStaff123!')
const addLoading = ref(false)

const fetchStaff = async () => {
  loading.value = true
  try {
    const token = localStorage.getItem('getfortrip_partner_token')
    const res = await fetch(apiUrl('/partner/staff'), {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (res.ok) {
      const json = await res.json()
      staffList.value = json.staff || []
    }
  } catch (e) {
    console.error('Failed to load staff', e)
  } finally {
    loading.value = false
  }
}

const handleAddStaff = async () => {
  if (!newEmail.value || !newName.value) return
  addLoading.value = true
  try {
    const token = localStorage.getItem('getfortrip_partner_token')
    const res = await fetch(apiUrl('/partner/staff'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        email: newEmail.value,
        fullName: newName.value,
        role: newRole.value,
        password: newPassword.value
      })
    })

    if (res.ok) {
      isModalOpen.value = false
      newEmail.value = ''
      newName.value = ''
      await fetchStaff()
    } else {
      const err = await res.json()
      alert(err.error || '직원 계정 등록에 실패했습니다.')
    }
  } catch (e: any) {
    alert(e.message || '오류가 발생했습니다.')
  } finally {
    addLoading.value = false
  }
}

onMounted(() => {
  fetchStaff()
})
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div>
        <h1 class="text-2xl font-black tracking-tight text-slate-900 flex items-center gap-2">
          <span>직원 계정 & 권한 관리</span>
          <span class="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
            {{ staffList.length }}명
          </span>
        </h1>
        <p class="text-sm text-slate-500 font-medium mt-1">
          익스트라넷을 함께 관리할 운영 담당자 및 예약 실무자 계정을 관리합니다.
        </p>
      </div>
      <div>
        <button
          @click="isModalOpen = true"
          class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-black rounded-xl shadow-md shadow-blue-500/20 transition flex items-center gap-1.5"
        >
          <span>➕</span>
          <span>담당자 계정 추가</span>
        </button>
      </div>
    </div>

    <!-- Staff Table -->
    <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse text-xs">
          <thead>
            <tr class="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider">
              <th class="p-3.5">직원 ID</th>
              <th class="p-3.5">이름</th>
              <th class="p-3.5">이메일</th>
              <th class="p-3.5">직책 및 권한</th>
              <th class="p-3.5">계정 상태</th>
              <th class="p-3.5">등록 일시</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 font-medium">
            <tr v-if="loading">
              <td colspan="6" class="p-8 text-center text-slate-400 font-bold">
                직원 목록을 불러오는 중입니다...
              </td>
            </tr>
            <tr
              v-else
              v-for="s in staffList"
              :key="s.id"
              class="hover:bg-slate-50/80 transition"
            >
              <td class="p-3.5 font-mono text-slate-400">{{ s.id }}</td>
              <td class="p-3.5 font-bold text-slate-900">{{ s.full_name }}</td>
              <td class="p-3.5 text-slate-600">{{ s.email }}</td>
              <td class="p-3.5">
                <span
                  :class="[
                    s.role === 'OWNER' ? 'bg-purple-100 text-purple-800' :
                    s.role === 'MANAGER' ? 'bg-blue-100 text-blue-800' :
                    'bg-slate-100 text-slate-700',
                    'px-2 py-0.5 rounded font-black text-[10px]'
                  ]"
                >
                  {{ s.role }}
                </span>
              </td>
              <td class="p-3.5">
                <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                  활성
                </span>
              </td>
              <td class="p-3.5 text-slate-400 font-mono text-[11px]">{{ (s.created_at || '').slice(0, 10) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Modal -->
    <div
      v-if="isModalOpen"
      class="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
    >
      <div class="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-100 space-y-5">
        <div class="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 class="text-base font-black text-slate-900">직원 계정 생성</h3>
          <button @click="isModalOpen = false" class="text-slate-400 hover:text-slate-600 font-bold text-sm">✕</button>
        </div>

        <form @submit.prevent="handleAddStaff" class="space-y-4 text-xs">
          <div class="space-y-1">
            <label class="font-bold text-slate-700">성명</label>
            <input
              v-model="newName"
              type="text"
              required
              placeholder="예: 홍길동 팀장"
              class="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl font-medium outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div class="space-y-1">
            <label class="font-bold text-slate-700">로그인 이메일</label>
            <input
              v-model="newEmail"
              type="email"
              required
              placeholder="staff@company.com"
              class="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl font-medium outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div class="space-y-1">
            <label class="font-bold text-slate-700">역할 권한</label>
            <select
              v-model="newRole"
              class="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl font-bold text-slate-800 outline-none"
            >
              <option value="MANAGER">매니저 (상품/재고/주문 관리)</option>
              <option value="STAFF">실무자 (주문 확인 및 접수)</option>
            </select>
          </div>
          <div class="space-y-1">
            <label class="font-bold text-slate-700">초기 임시 비밀번호</label>
            <input
              v-model="newPassword"
              type="text"
              required
              class="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl font-mono text-slate-800 outline-none"
            />
          </div>

          <div class="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              @click="isModalOpen = false"
              class="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl font-bold"
            >
              취소
            </button>
            <button
              type="submit"
              :disabled="addLoading"
              class="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black shadow-md disabled:opacity-50"
            >
              {{ addLoading ? '생성 중...' : '계정 생성' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>
