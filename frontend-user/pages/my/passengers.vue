<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { useAuthStore } from '~/stores/auth'
import { useApiUrl } from '~/composables/useApi'

const authStore = useAuthStore()
const isAddModalOpen = ref(false)

interface Passenger {
  id: string
  nameKo: string
  nameEn: string
  gender: string
  birth: string
  passportNumber: string
  passportExpiry: string
  nationality: string
  isPrimary: boolean
}

const passengers = ref<Passenger[]>([])
const isLoading = ref(false)
const isSaving = ref(false)
const deletingId = ref<string | null>(null)
const loadError = ref('')
let sessionVersion = 0
const isDemo = () => authStore.user?.id === 'usr-demo-vip' && authStore.token === 'demo_jwt_token_sample_2026'

const loadPassengers = async () => {
  const version = ++sessionVersion
  passengers.value = []
  loadError.value = ''
  isAddModalOpen.value = false
  isSaving.value = false
  deletingId.value = null
  isLoading.value = false
  newP.value = { nameKo: '', nameEn: '', gender: 'MALE', birth: '', passportNumber: '', passportExpiry: '', nationality: 'KOR' }
  if (authStore.isLoggedIn && authStore.user) {
    if (!isDemo()) {
      isLoading.value = true
      try {
        if (!authStore.token) throw new Error('로그인이 필요합니다.')
        const res = await fetch(useApiUrl('/user/passengers'), {
          headers: { Authorization: `Bearer ${authStore.token}` }
        })
        if (version !== sessionVersion) return
        if (res.ok) {
          const json = await res.json()
          if (version !== sessionVersion) return
          if (Array.isArray(json.passengers)) {
            passengers.value = json.passengers.map((p: any) => ({
              id: p.id,
              nameKo: p.name_ko,
              nameEn: `${p.last_name_en || ''} ${p.first_name_en || ''}`.trim(),
              gender: p.gender,
              birth: p.birth_date,
              passportNumber: p.passport_number,
              passportExpiry: p.passport_expiry,
              nationality: p.nationality,
              isPrimary: !!p.is_primary
            }))
            return
          }
        }
        throw new Error('여행자 정보를 불러오지 못했습니다.')
      } catch {
        if (version === sessionVersion) loadError.value = '여행자 정보를 불러오지 못했습니다. 다시 시도해 주세요.'
      } finally {
        if (version === sessionVersion) isLoading.value = false
      }
      return
    }

    if (isDemo()) {
      try {
        const stored = localStorage.getItem(`passengers_${authStore.user.id}`)
        const parsed = stored ? JSON.parse(stored) : null
        if (Array.isArray(parsed)) {
          passengers.value = parsed
          return
        }
      } catch {}
      passengers.value = [
        {
          id: 'p-01',
          nameKo: '김여행',
          nameEn: 'KIM YEOHAENG',
          gender: 'MALE',
          birth: '1990-05-15',
          passportNumber: 'M88192049',
          passportExpiry: '2031-10-12',
          nationality: '대한민국 (KOR)',
          isPrimary: true
        },
        {
          id: 'p-02',
          nameKo: '이수진',
          nameEn: 'LEE SOOJIN',
          gender: 'FEMALE',
          birth: '1992-08-20',
          passportNumber: 'M44910293',
          passportExpiry: '2029-05-18',
          nationality: '대한민국 (KOR)',
          isPrimary: false
        }
      ]
    }
  }
}

onMounted(() => {
  stopWatching = watch(
    () => [authStore.isLoggedIn, authStore.user?.id, authStore.token],
    loadPassengers,
    { immediate: true, flush: 'sync' }
  )
})
let stopWatching: (() => void) | undefined
onBeforeUnmount(() => {
  stopWatching?.()
  sessionVersion++
})

const newP = ref({
  nameKo: '',
  nameEn: '',
  gender: 'MALE',
  birth: '',
  passportNumber: '',
  passportExpiry: '',
  nationality: 'KOR'
})

const addPassenger = async () => {
  if (isSaving.value || isLoading.value || loadError.value || !authStore.user || !authStore.isLoggedIn) return
  const version = sessionVersion
  const draft = { ...newP.value, nameKo: newP.value.nameKo.trim(), nameEn: newP.value.nameEn.trim().replace(/\s+/g, ' ').toUpperCase(), passportNumber: newP.value.passportNumber.trim().toUpperCase() }
  if (!draft.nameKo || !draft.nameEn) {
    alert('한글 성명과 영문 성명을 입력해 주세요.')
    return
  }
  const newItem = {
    id: 'p-' + crypto.randomUUID(),
    ...draft,
    isPrimary: isDemo() && passengers.value.length === 0
  }
  isSaving.value = true
  try {
  if (!isDemo()) {
    if (!authStore.token) throw new Error('로그인이 필요합니다.')
    const parts = draft.nameEn.split(' ')
    const lastName = parts[0]
    const firstName = parts.slice(1).join(' ')
    const res = await fetch(useApiUrl('/user/passengers'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authStore.token}`
      },
      body: JSON.stringify({
        nameKo: draft.nameKo,
        lastNameEn: lastName,
        firstNameEn: firstName,
        birthDate: draft.birth,
        gender: draft.gender,
        passportNumber: draft.passportNumber,
        passportExpiry: draft.passportExpiry,
        nationality: draft.nationality
      })
    })
    if (!res.ok) throw new Error('저장 실패')
    const json = await res.json()
    if (!json.success || typeof json.id !== 'string') throw new Error('잘못된 저장 응답')
    newItem.id = json.id
  }
  if (version !== sessionVersion) return
  if (isDemo()) localStorage.setItem(`passengers_${authStore.user.id}`, JSON.stringify([...passengers.value, newItem]))
  passengers.value.push(newItem)
  isAddModalOpen.value = false
  newP.value = { nameKo: '', nameEn: '', gender: 'MALE', birth: '', passportNumber: '', passportExpiry: '', nationality: 'KOR' }
  alert('새 여행자 정보가 성공적으로 등록되었습니다.')
  } catch {
    if (version === sessionVersion) alert('여행자 정보를 저장하지 못했습니다. 입력 내용을 확인하고 다시 시도해 주세요.')
  } finally {
    if (version === sessionVersion) isSaving.value = false
  }
}

const deletePassenger = async (id: string) => {
  if (deletingId.value || !authStore.isLoggedIn || !authStore.user) return
  const version = sessionVersion
  if (confirm('이 여행자 정보를 삭제하시겠습니까?')) {
    deletingId.value = id
    try {
    if (!isDemo()) {
      if (!authStore.token) throw new Error('로그인이 필요합니다.')
      const res = await fetch(useApiUrl(`/user/passengers/${encodeURIComponent(id)}`), {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${authStore.token}` }
      })
      if (!res.ok) throw new Error('삭제 실패')
    }
    if (version !== sessionVersion) return
    const remaining = passengers.value.filter(p => p.id !== id)
    if (isDemo()) localStorage.setItem(`passengers_${authStore.user.id}`, JSON.stringify(remaining))
    passengers.value = remaining
    } catch {
      if (version === sessionVersion) alert('여행자 정보를 삭제하지 못했습니다. 다시 시도해 주세요.')
    } finally {
      if (version === sessionVersion) deletingId.value = null
    }
  }
}
</script>

<template>
  <div class="max-w-4xl mx-auto px-4 py-8 space-y-6">
    <!-- 비로그인 차단 게이트웨이 카드 -->
    <div v-if="!authStore.isLoggedIn || !authStore.user" class="bg-white rounded-3xl border border-slate-200 p-8 sm:p-12 text-center space-y-4 shadow-sm">
      <div class="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto text-3xl shadow-sm">
        🔒
      </div>
      <h2 class="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
        로그인이 필요한 서비스입니다
      </h2>
      <p class="text-xs sm:text-sm text-slate-500 max-w-md mx-auto">
        여행자 여권 정보 및 개인정보 보호를 위해 본인 인증 후 열람하실 수 있습니다.
      </p>
      <div class="pt-2">
        <NuxtLink
          to="/login"
          class="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md transition"
        >
          <span>로그인 페이지로 이동</span>
          <span>→</span>
        </NuxtLink>
      </div>
    </div>

    <!-- 로그인 시 표시되는 관리 화면 -->
    <div v-else class="space-y-6">
      <div class="flex items-center justify-between border-b border-slate-200 pb-4">
        <div class="flex items-center gap-3">
          <NuxtLink to="/my" class="text-xs font-bold text-slate-400 hover:text-slate-600">‹ 마이 콘솔</NuxtLink>
          <h1 class="text-xl font-black text-slate-900">저장된 여행자 및 여권 정보 관리</h1>
        </div>
        <button
          @click="isAddModalOpen = true"
          :disabled="isLoading || !!loadError || isSaving"
          class="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-sm transition"
        >
          + 새 여행자 등록
        </button>
      </div>

      <div v-if="isLoading" role="status" class="p-12 text-center text-sm text-slate-500">여행자 정보를 불러오는 중입니다.</div>
      <div v-else-if="loadError" role="alert" class="p-8 text-center text-sm text-rose-600 space-y-3">
        <p>{{ loadError }}</p>
        <button @click="loadPassengers" class="font-bold underline">다시 시도</button>
      </div>
      <div v-else-if="passengers.length === 0" class="bg-white rounded-3xl border border-slate-200 p-12 text-center text-slate-400 text-sm">
        등록된 여행자 정보가 없습니다. '+ 새 여행자 등록' 버튼을 눌러 여권 정보를 등록하세요.
      </div>

      <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div
          v-for="p in passengers"
          :key="p.id"
          class="bg-white rounded-3xl border border-slate-200/90 p-5 shadow-sm space-y-3"
        >
          <div class="flex items-center justify-between border-b border-slate-100 pb-2.5">
            <div class="flex items-center gap-2">
              <span class="font-black text-sm text-slate-900">{{ p.nameKo }}</span>
              <span class="text-xs font-mono text-slate-400">({{ p.nameEn }})</span>
              <span v-if="p.isPrimary" class="px-2 py-0.5 rounded bg-blue-50 text-blue-600 text-[10px] font-bold">대표</span>
            </div>
            <button
              v-if="!p.isPrimary"
              @click="deletePassenger(p.id)"
              :disabled="deletingId !== null"
              class="text-slate-400 hover:text-rose-500 font-bold text-xs"
            >
              {{ deletingId === p.id ? '삭제 중…' : '삭제' }}
            </button>
          </div>

          <div class="grid grid-cols-2 gap-2 text-xs text-slate-600 font-mono">
            <div><span class="text-slate-400">국적:</span> {{ p.nationality }}</div>
            <div><span class="text-slate-400">성별:</span> {{ p.gender }}</div>
            <div><span class="text-slate-400">생년월일:</span> {{ p.birth }}</div>
            <div><span class="text-slate-400">여권번호:</span> {{ p.passportNumber }}</div>
            <div><span class="text-slate-400">여권만료:</span> {{ p.passportExpiry }}</div>
          </div>
        </div>
      </div>

      <!-- 추가 모달 -->
      <div v-if="isAddModalOpen" class="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
        <div role="dialog" aria-modal="true" aria-labelledby="passenger-modal-title" class="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full max-h-[90vh] overflow-y-auto shadow-2xl space-y-4">
          <div class="flex justify-between items-center border-b border-slate-100 pb-3">
            <h3 id="passenger-modal-title" class="font-black text-base text-slate-900">새 여행자 여권 정보 등록</h3>
            <button @click="isAddModalOpen = false" :disabled="isSaving" aria-label="닫기" class="text-slate-400 hover:text-slate-600 text-lg font-bold">✕</button>
          </div>

          <fieldset :disabled="isSaving" class="space-y-3 text-xs">
            <div class="grid grid-cols-2 gap-2">
              <div>
                <label class="block font-bold text-slate-600 mb-1">한글 성명</label>
                <input v-model="newP.nameKo" type="text" placeholder="홍길동" class="w-full p-2.5 border border-slate-200 rounded-xl" />
              </div>
              <div>
                <label class="block font-bold text-slate-600 mb-1">영문 성명 (여권 표기)</label>
                <input v-model="newP.nameEn" type="text" placeholder="HONG GILDONG" class="w-full p-2.5 border border-slate-200 rounded-xl uppercase font-mono" />
              </div>
            </div>

            <div class="grid grid-cols-2 gap-2">
              <div>
                <label class="block font-bold text-slate-600 mb-1">생년월일</label>
                <input v-model="newP.birth" type="date" class="w-full p-2.5 border border-slate-200 rounded-xl font-mono" />
              </div>
              <div>
                <label class="block font-bold text-slate-600 mb-1">성별</label>
                <select v-model="newP.gender" class="w-full p-2.5 border border-slate-200 rounded-xl">
                  <option value="MALE">남성 (MALE)</option>
                  <option value="FEMALE">여성 (FEMALE)</option>
                </select>
              </div>
            </div>

            <div>
              <label class="block font-bold text-slate-600 mb-1">여권번호 (Passport No.)</label>
              <input v-model="newP.passportNumber" type="text" placeholder="M12345678" class="w-full p-2.5 border border-slate-200 rounded-xl uppercase font-mono font-bold" />
            </div>

            <div>
              <label class="block font-bold text-slate-600 mb-1">여권 만료일</label>
              <input v-model="newP.passportExpiry" type="date" class="w-full p-2.5 border border-slate-200 rounded-xl font-mono" />
            </div>
          </fieldset>

          <div class="flex gap-2 pt-2">
            <button @click="isAddModalOpen = false" :disabled="isSaving" class="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition">
              취소
            </button>
            <button @click="addPassenger" :disabled="isSaving" class="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md transition">
              {{ isSaving ? '저장 중…' : '등록 완료' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
