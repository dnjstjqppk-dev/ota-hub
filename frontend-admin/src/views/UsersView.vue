<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { apiUrl } from '../config/api'

interface UserRow {
  id: string
  email: string
  full_name: string
  phone_number: string
  role: 'USER' | 'ADMIN'
  tier: string
  coin_balance: number
  is_active: number
  created_at: string
}

const users = ref<UserRow[]>([])
const loading = ref(false)
const searchQuery = ref('')
const filterRole = ref<string>('ALL')
const selectedUser = ref<UserRow | null>(null)
const isModalOpen = ref(false)
const targetRole = ref<'USER' | 'ADMIN'>('USER')
const targetActive = ref(true)
const actionLoading = ref(false)

const filteredUsers = computed(() => {
  return users.value.filter(u => {
    const matchRole = filterRole.value === 'ALL' || u.role === filterRole.value
    const matchQuery = !searchQuery.value ||
      u.email.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
      (u.full_name && u.full_name.toLowerCase().includes(searchQuery.value.toLowerCase())) ||
      (u.phone_number && u.phone_number.includes(searchQuery.value))
    return matchRole && matchQuery
  })
})

const fetchUsers = async () => {
  loading.value = true
  try {
    const token = localStorage.getItem('getfortrip_admin_token')
    const res = await fetch(apiUrl('/admin/users'), {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (res.ok) {
      const json = await res.json()
      users.value = json.users || []
    }
  } catch (e) {
    console.error('Failed to load users', e)
  } finally {
    loading.value = false
  }
}

const openEditModal = (u: UserRow) => {
  selectedUser.value = u
  targetRole.value = u.role
  targetActive.value = u.is_active === 1
  isModalOpen.value = true
}

const handleSaveUser = async () => {
  if (!selectedUser.value) return
  actionLoading.value = true
  try {
    const token = localStorage.getItem('getfortrip_admin_token')
    const res = await fetch(apiUrl(`/admin/users/${selectedUser.value.id}`), {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        role: targetRole.value,
        isActive: targetActive.value
      })
    })
    if (res.ok) {
      isModalOpen.value = false
      await fetchUsers()
    } else {
      const err = await res.json()
      alert(err.error || '사용자 정보 수정에 실패했습니다.')
    }
  } catch (e: any) {
    alert(e.message || '오류가 발생했습니다.')
  } finally {
    actionLoading.value = false
  }
}

onMounted(() => {
  fetchUsers()
})
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div>
        <h1 class="text-2xl font-black tracking-tight text-slate-900 flex items-center gap-2">
          <span>회원 계정 및 RBAC 권한 관리</span>
          <span class="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
            총 {{ users.length }}명
          </span>
        </h1>
        <p class="text-sm text-slate-500 font-medium mt-1">
          B2C 회원 및 백오피스 관리자 권한을 부여·회수하고 비정상 계정을 정지합니다.
        </p>
      </div>
      <div class="flex items-center gap-2">
        <button
          @click="fetchUsers"
          class="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl shadow-sm transition flex items-center gap-1.5"
        >
          <span>🔄</span>
          <span>새로고침</span>
        </button>
      </div>
    </div>

    <!-- Filters & Search -->
    <div class="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4 justify-between">
      <div class="flex items-center gap-2">
        <button
          v-for="r in [
            { id: 'ALL', label: '전체 회원' },
            { id: 'USER', label: '일반 회원 (B2C)' },
            { id: 'ADMIN', label: '관리자 (ADMIN) 👑' }
          ]"
          :key="r.id"
          @click="filterRole = r.id"
          :class="[
            filterRole === r.id
              ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
            'px-3.5 py-1.5 rounded-xl text-xs font-bold transition'
          ]"
        >
          {{ r.label }}
        </button>
      </div>

      <div class="relative w-full md:w-72">
        <input
          v-model="searchQuery"
          type="text"
          placeholder="이메일, 이름, 연락처 검색..."
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
              <th class="p-3.5">회원 ID</th>
              <th class="p-3.5">이메일 / 이름</th>
              <th class="p-3.5">연락처</th>
              <th class="p-3.5">권한 역할 (RBAC)</th>
              <th class="p-3.5">멤버십 등급</th>
              <th class="p-3.5">보유 코인 잔액</th>
              <th class="p-3.5">계정 상태</th>
              <th class="p-3.5">가입 일시</th>
              <th class="p-3.5 text-right">관리</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 font-medium">
            <tr v-if="loading">
              <td colspan="9" class="p-8 text-center text-slate-400 font-bold">
                회원 목록을 불러오는 중입니다...
              </td>
            </tr>
            <tr v-else-if="filteredUsers.length === 0">
              <td colspan="9" class="p-8 text-center text-slate-400 font-bold">
                일치하는 회원이 없습니다.
              </td>
            </tr>
            <tr
              v-else
              v-for="u in filteredUsers"
              :key="u.id"
              class="hover:bg-slate-50/80 transition"
            >
              <td class="p-3.5 font-mono text-slate-400">{{ u.id }}</td>
              <td class="p-3.5">
                <div class="font-bold text-slate-900">{{ u.email }}</div>
                <div class="text-[11px] text-slate-400">{{ u.full_name || '이름 미설정' }}</div>
              </td>
              <td class="p-3.5 font-mono text-slate-600">{{ u.phone_number || '-' }}</td>
              <td class="p-3.5">
                <span
                  :class="[
                    u.role === 'ADMIN' ? 'bg-purple-100 text-purple-800 border-purple-200' : 'bg-slate-100 text-slate-700 border-slate-200',
                    'px-2 py-0.5 rounded font-black text-[10px] border inline-flex items-center gap-1'
                  ]"
                >
                  <span v-if="u.role === 'ADMIN'">👑</span>
                  {{ u.role }}
                </span>
              </td>
              <td class="p-3.5">
                <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                  {{ u.tier || 'SILVER' }}
                </span>
              </td>
              <td class="p-3.5 font-bold text-slate-800">{{ (u.coin_balance || 0).toLocaleString() }} C</td>
              <td class="p-3.5">
                <span
                  :class="[
                    u.is_active === 1 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800',
                    'px-2 py-0.5 rounded-full text-[10px] font-bold'
                  ]"
                >
                  {{ u.is_active === 1 ? '정상 활성' : '이용 정지' }}
                </span>
              </td>
              <td class="p-3.5 text-slate-400 font-mono text-[11px]">
                {{ (u.created_at || '').slice(0, 10) }}
              </td>
              <td class="p-3.5 text-right">
                <button
                  @click="openEditModal(u)"
                  class="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-bold text-[11px] transition"
                >
                  권한/상태 설정
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Edit Modal -->
    <div
      v-if="isModalOpen && selectedUser"
      class="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
    >
      <div class="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-100 space-y-5">
        <div class="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 class="text-base font-black text-slate-900">회원 권한 & 상태 변경</h3>
          <button @click="isModalOpen = false" class="text-slate-400 hover:text-slate-600 font-bold text-sm">✕</button>
        </div>

        <div class="space-y-4 text-xs">
          <div class="bg-slate-50 p-3 rounded-xl border border-slate-100">
            <div class="font-bold text-slate-900">{{ selectedUser.email }}</div>
            <div class="text-slate-400">{{ selectedUser.full_name }} · {{ selectedUser.id }}</div>
          </div>

          <div class="space-y-1.5">
            <label class="font-bold text-slate-700">RBAC 역할 지정</label>
            <div class="grid grid-cols-2 gap-2">
              <button
                type="button"
                @click="targetRole = 'USER'"
                :class="[
                  targetRole === 'USER' ? 'border-blue-600 bg-blue-50 text-blue-700 font-bold' : 'border-slate-200 text-slate-600',
                  'p-2.5 rounded-xl border text-center transition'
                ]"
              >
                일반 회원 (USER)
              </button>
              <button
                type="button"
                @click="targetRole = 'ADMIN'"
                :class="[
                  targetRole === 'ADMIN' ? 'border-purple-600 bg-purple-50 text-purple-700 font-bold' : 'border-slate-200 text-slate-600',
                  'p-2.5 rounded-xl border text-center transition'
                ]"
              >
                관리자 (ADMIN) 👑
              </button>
            </div>
            <p v-if="targetRole === 'ADMIN'" class="text-[11px] text-amber-600 font-medium">
              ⚠️ 관리자 권한은 백오피스 전체 시스템과 원장 데이터에 접근할 수 있습니다.
            </p>
          </div>

          <div class="space-y-1.5">
            <label class="font-bold text-slate-700">계정 활성화 상태</label>
            <div class="flex items-center gap-3">
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="radio" :value="true" v-model="targetActive" class="text-blue-600" />
                <span class="font-medium">정상 활성 (로그인 가능)</span>
              </label>
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="radio" :value="false" v-model="targetActive" class="text-rose-600" />
                <span class="font-medium text-rose-600">이용 정지</span>
              </label>
            </div>
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
            @click="handleSaveUser"
            :disabled="actionLoading"
            class="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black text-xs shadow-md shadow-blue-500/25 disabled:opacity-50"
          >
            {{ actionLoading ? '저장 중...' : '변경 저장' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
