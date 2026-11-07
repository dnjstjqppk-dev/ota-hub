<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { apiUrl, partnerToken } from '../config/api'

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
const error = ref('')
const isModalOpen = ref(false)
const newEmail = ref('')
const newName = ref('')
const newRole = ref('STAFF')
const newPassword = ref('')
const addLoading = ref(false)
const addError = ref('')

const fetchStaff = async () => {
  loading.value = true
  error.value = ''
  try {
    const token = partnerToken()
    const res = await fetch(apiUrl('/partner/staff'), {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (!res.ok) throw new Error('직원 목록을 불러오지 못했습니다.')
    const json = await res.json()
    staffList.value = json.staff || []
  } catch (e: any) {
    error.value = e.message || '직원 목록을 불러오지 못했습니다.'
  } finally {
    loading.value = false
  }
}

const handleAddStaff = async () => {
  if (!newEmail.value || !newName.value) return
  addLoading.value = true
  addError.value = ''
  try {
    const token = partnerToken()
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
      newPassword.value = ''
      await fetchStaff()
    } else {
      const err = await res.json().catch(() => ({}))
      addError.value = err.error || '직원 계정 등록에 실패했습니다.'
    }
  } catch (e: any) {
    addError.value = e.message || '오류가 발생했습니다.'
  } finally {
    addLoading.value = false
  }
}

function roleBadge(role: string) {
  if (role === 'OWNER') return 'bg-primary-soft text-primary'
  if (role === 'MANAGER') return 'bg-warning-soft text-warning'
  return 'bg-surface-sunken text-ink-muted'
}

const rowBusy = ref('')

async function patchStaff(s: StaffRow, patch: { role?: string; isActive?: boolean }) {
  rowBusy.value = s.id
  error.value = ''
  try {
    const res = await fetch(apiUrl(`/partner/staff/${s.id}`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${partnerToken()}` },
      body: JSON.stringify(patch)
    })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error((j as any).error || '수정에 실패했습니다.')
    await fetchStaff()
  } catch (e: any) {
    error.value = e.message || '수정에 실패했습니다.'
  } finally {
    rowBusy.value = ''
  }
}

onMounted(() => {
  fetchStaff()
})
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-col justify-between gap-4 md:flex-row md:items-center">
      <div>
        <h1 class="flex items-center gap-2 text-2xl font-black tracking-tight text-ink">
          <span>직원 계정 & 권한 관리</span>
          <span class="rounded-full bg-primary-soft px-2 py-0.5 text-xs font-bold text-primary">
            {{ staffList.length }}명
          </span>
        </h1>
        <p class="mt-1 text-sm font-medium text-ink-subtle">
          익스트라넷을 함께 관리할 운영 담당자 및 예약 실무자 계정을 관리합니다.
        </p>
      </div>
      <div>
        <button
          type="button"
          class="btn-primary btn-sm !text-xs"
          @click="isModalOpen = true"
        >
          <AppIcon name="plus" :size="14" />
          <span>담당자 계정 추가</span>
        </button>
      </div>
    </div>

    <div v-if="error" class="rounded-2xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm font-semibold text-danger">
      {{ error }}
      <button type="button" class="ml-2 underline" @click="fetchStaff">다시 시도</button>
    </div>

    <!-- Staff Table -->
    <div class="card overflow-hidden">
      <div class="overflow-x-auto">
        <table :class="['table text-xs', loading || staffList.length ? '!min-w-[600px]' : 'w-full !min-w-0']">
          <thead>
            <tr>
              <th>직원 ID</th>
              <th>이름</th>
              <th>이메일</th>
              <th>직책 및 권한</th>
              <th>계정 상태</th>
              <th>등록 일시</th>
            </tr>
          </thead>
          <tbody class="font-medium">
            <tr v-if="loading">
              <td colspan="6" class="p-8 text-center font-bold text-ink-subtle">
                직원 목록을 불러오는 중입니다...
              </td>
            </tr>
            <tr v-else-if="staffList.length === 0">
              <td colspan="6" class="p-8 text-center font-bold text-ink-subtle">
                등록된 직원 계정이 없습니다.
              </td>
            </tr>
            <tr
              v-else
              v-for="s in staffList"
              :key="s.id"
              class="transition hover:bg-surface-sunken"
            >
              <td class="max-w-[170px] truncate font-mono text-ink-subtle" :title="s.id">{{ s.id }}</td>
              <td class="font-bold">{{ s.full_name }}</td>
              <td class="text-ink-muted">{{ s.email }}</td>
              <td>
                <select
                  v-if="s.role !== 'OWNER'"
                  :value="s.role"
                  :disabled="rowBusy === s.id"
                  :aria-label="`${s.full_name} 역할`"
                  class="input !min-h-[32px] !w-auto !py-1 !text-[11px] font-bold"
                  @change="patchStaff(s, { role: ($event.target as HTMLSelectElement).value })"
                >
                  <option value="MANAGER">MANAGER</option>
                  <option value="STAFF">STAFF</option>
                </select>
                <span v-else :class="['rounded px-2 py-0.5 text-[10px] font-black', roleBadge(s.role)]">
                  {{ s.role }}
                </span>
              </td>
              <td>
                <button
                  v-if="s.role !== 'OWNER'"
                  type="button"
                  :disabled="rowBusy === s.id"
                  :class="[
                    'rounded-full px-2 py-0.5 text-[10px] font-bold underline',
                    s.is_active === 1 ? 'bg-success-soft text-success' : 'bg-surface-sunken text-ink-subtle'
                  ]"
                  @click="patchStaff(s, { isActive: s.is_active !== 1 })"
                >
                  {{ s.is_active === 1 ? '활성 (클릭 시 비활성)' : '비활성 (클릭 시 활성)' }}
                </button>
                <span
                  v-else
                  :class="[
                    'rounded-full px-2 py-0.5 text-[10px] font-bold',
                    s.is_active === 1 ? 'bg-success-soft text-success' : 'bg-surface-sunken text-ink-subtle'
                  ]"
                >
                  {{ s.is_active === 1 ? '활성' : '비활성' }}
                </span>
              </td>
              <td class="font-mono text-[11px] text-ink-subtle">{{ (s.created_at || '').slice(0, 10) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Modal -->
    <div
      v-if="isModalOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-midnight-950/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="직원 계정 생성"
    >
      <div class="w-full max-w-sm space-y-5 rounded-2xl border border-line bg-surface-raised p-6 shadow-pop">
        <div class="flex items-center justify-between border-b border-line pb-3">
          <h3 class="text-base font-black text-ink">직원 계정 생성</h3>
          <button type="button" aria-label="닫기" class="flex h-9 w-9 items-center justify-center rounded-full text-ink-muted hover:bg-surface-sunken" @click="isModalOpen = false"><AppIcon name="close" :size="18" /></button>
        </div>

        <form class="space-y-4 text-xs" @submit.prevent="handleAddStaff">
          <div v-if="addError" class="rounded-xl bg-danger-soft px-3.5 py-2.5 font-medium text-danger" role="alert">{{ addError }}</div>
          <div class="space-y-1">
            <label class="label">성명</label>
            <input
              v-model="newName"
              type="text"
              required
              placeholder="예: 홍길동 팀장"
              class="input font-medium"
            />
          </div>
          <div class="space-y-1">
            <label class="label">로그인 이메일</label>
            <input
              v-model="newEmail"
              type="email"
              required
              placeholder="staff@company.com"
              class="input font-medium"
            />
          </div>
          <div class="space-y-1">
            <label class="label">역할 권한</label>
            <select
              v-model="newRole"
              class="input font-bold"
            >
              <option value="MANAGER">매니저 (상품/재고/주문 관리)</option>
              <option value="STAFF">실무자 (주문 확인 및 접수)</option>
            </select>
          </div>
          <div class="space-y-1">
            <label class="label">초기 임시 비밀번호 (8자 이상)</label>
            <input
              v-model="newPassword"
              type="text"
              required
              minlength="8"
              autocomplete="new-password"
              placeholder="직원에게 전달할 임시 비밀번호"
              class="input font-mono"
            />
          </div>

          <div class="flex items-center justify-end gap-2 border-t border-line pt-2">
            <button
              type="button"
              class="btn-secondary btn-sm"
              @click="isModalOpen = false"
            >
              취소
            </button>
            <button
              type="submit"
              :disabled="addLoading"
              class="btn-primary btn-sm"
            >
              {{ addLoading ? '생성 중...' : '계정 생성' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>
