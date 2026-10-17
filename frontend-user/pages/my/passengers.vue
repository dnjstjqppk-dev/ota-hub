<script setup lang="ts">
import { ref } from 'vue'

const isAddModalOpen = ref(false)

const passengers = ref([
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
])

const newP = ref({
  nameKo: '',
  nameEn: '',
  gender: 'MALE',
  birth: '',
  passportNumber: '',
  passportExpiry: '',
  nationality: 'KOR'
})

const addPassenger = () => {
  if (!newP.value.nameKo || !newP.value.nameEn) {
    alert('한글 성명과 영문 성명을 입력해 주세요.')
    return
  }
  passengers.value.push({
    id: 'p-' + Math.random().toString(36).substring(2, 6),
    ...newP.value,
    isPrimary: false
  })
  isAddModalOpen.value = false
  alert('새 여행자 정보가 성공적으로 등록되었습니다.')
}

const deletePassenger = (idx: number) => {
  if (confirm('이 여행자 정보를 삭제하시겠습니까?')) {
    passengers.value.splice(idx, 1)
  }
}
</script>

<template>
  <div class="max-w-4xl mx-auto px-4 py-8 space-y-6">
    <div class="flex items-center justify-between border-b border-slate-200 pb-4">
      <div class="flex items-center gap-3">
        <NuxtLink to="/my" class="text-xs font-bold text-slate-400 hover:text-slate-600">‹ 마이 콘솔</NuxtLink>
        <h1 class="text-xl font-black text-slate-900">저장된 여행자 및 여권 정보 관리</h1>
      </div>
      <button
        @click="isAddModalOpen = true"
        class="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-sm transition"
      >
        + 새 여행자 등록
      </button>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div
        v-for="(p, idx) in passengers"
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
            @click="deletePassenger(idx)"
            class="text-slate-400 hover:text-rose-500 font-bold text-xs"
          >
            삭제
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
      <div class="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl space-y-4">
        <div class="flex justify-between items-center border-b pb-3">
          <h3 class="text-base font-black text-slate-900">새 여행자 여권 정보 추가</h3>
          <button @click="isAddModalOpen = false" class="text-slate-400 text-lg font-bold">✕</button>
        </div>

        <div class="space-y-3 text-xs">
          <div>
            <label class="block font-bold text-slate-700 mb-1">한글 성명</label>
            <input v-model="newP.nameKo" type="text" placeholder="예: 홍길동" class="w-full p-2.5 border rounded-xl" />
          </div>
          <div>
            <label class="block font-bold text-slate-700 mb-1">여권 영문 성명 (대문자)</label>
            <input v-model="newP.nameEn" type="text" placeholder="예: HONG GILDONG" class="w-full p-2.5 border rounded-xl font-mono uppercase" />
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block font-bold text-slate-700 mb-1">성별</label>
              <select v-model="newP.gender" class="w-full p-2.5 border rounded-xl">
                <option value="MALE">남성 (M)</option>
                <option value="FEMALE">여성 (F)</option>
              </select>
            </div>
            <div>
              <label class="block font-bold text-slate-700 mb-1">생년월일</label>
              <input v-model="newP.birth" type="date" class="w-full p-2.5 border rounded-xl font-mono" />
            </div>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block font-bold text-slate-700 mb-1">여권번호</label>
              <input v-model="newP.passportNumber" type="text" placeholder="M12345678" class="w-full p-2.5 border rounded-xl font-mono uppercase" />
            </div>
            <div>
              <label class="block font-bold text-slate-700 mb-1">여권 만료일</label>
              <input v-model="newP.passportExpiry" type="date" class="w-full p-2.5 border rounded-xl font-mono" />
            </div>
          </div>
        </div>

        <div class="flex justify-end gap-2 pt-3 border-t">
          <button @click="isAddModalOpen = false" class="px-4 py-2 bg-slate-100 rounded-xl font-bold text-xs">취소</button>
          <button @click="addPassenger" class="px-5 py-2 bg-trip-blue text-white rounded-xl font-black text-xs shadow">저장</button>
        </div>
      </div>
    </div>
  </div>
</template>

