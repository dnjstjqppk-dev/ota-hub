<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { apiUrl } from '../config/api'

const router = useRouter()
const companyName = ref('')
const email = ref('')
const password = ref('')
const partnerType = ref('HOTEL')
const businessNumber = ref('')
const contactPhone = ref('')
const representativeName = ref('')
const bankName = ref('신한은행')
const bankAccountNumber = ref('')
const bankAccountHolder = ref('')
const agreeTerms = ref(false)

const loading = ref(false)
const errorMessage = ref('')
const successMessage = ref('')

const handleRegister = async () => {
  errorMessage.value = ''
  successMessage.value = ''

  if (!agreeTerms.value) {
    errorMessage.value = '파트너 이용약관 및 정산 정책에 동의해야 신청할 수 있습니다.'
    return
  }

  loading.value = true
  try {
    const res = await fetch(apiUrl('/partner/register'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyName: companyName.value,
        email: email.value.trim().toLowerCase(),
        password: password.value,
        partnerType: partnerType.value,
        businessNumber: businessNumber.value,
        contactPhone: contactPhone.value,
        representativeName: representativeName.value,
        bankName: bankName.value,
        bankAccountNumber: bankAccountNumber.value,
        bankAccountHolder: bankAccountHolder.value || representativeName.value
      })
    })

    const data = await res.json()
    if (!res.ok) {
      throw new Error(data.error || '입점 신청에 실패했습니다.')
    }

    successMessage.value = data.message || '입점 신청이 완료되었습니다. 관리자 심사 완료 후 안내 이메일이 발송됩니다.'
  } catch (err: any) {
    errorMessage.value = err.message || '오류가 발생했습니다.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-slate-900 py-12 px-4 sm:px-6 lg:px-8 font-sans">
    <div class="max-w-2xl mx-auto space-y-6">
      <div class="text-center space-y-2">
        <h1 class="text-3xl font-black text-white tracking-tight flex items-center justify-center gap-2">
          <span>getfor<span class="text-blue-500">trip</span></span>
          <span class="text-xs uppercase bg-blue-600 text-white px-2 py-0.5 rounded font-black">Partner Onboarding</span>
        </h1>
        <p class="text-sm text-slate-400 font-medium">
          GetForTrip 글로벌 판매 네트워크에 상품을 직접 공급하고 매출을 확대하세요.
        </p>
      </div>

      <div class="bg-white p-8 rounded-3xl shadow-2xl border border-slate-100 space-y-6">
        <div v-if="successMessage" class="p-6 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl space-y-3">
          <div class="text-base font-black flex items-center gap-2">
            <span>🎉</span>
            <span>파트너 입점 신청 접수 완료</span>
          </div>
          <p class="text-xs leading-relaxed">
            {{ successMessage }}
          </p>
          <div class="pt-2">
            <router-link
              to="/login"
              class="inline-block px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-md transition"
            >
              로그인 화면으로 이동
            </router-link>
          </div>
        </div>

        <form v-else @submit.prevent="handleRegister" class="space-y-5 text-xs">
          <div v-if="errorMessage" class="p-3.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl font-bold flex items-center gap-2">
            <span>⚠️</span>
            <span>{{ errorMessage }}</span>
          </div>

          <div class="space-y-4">
            <h3 class="text-sm font-black text-slate-900 border-b border-slate-100 pb-2">1. 기업 및 공급자 정보</h3>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div class="space-y-1">
                <label class="font-bold text-slate-700">회사명 (법인/상호명) *</label>
                <input
                  v-model="companyName"
                  type="text"
                  required
                  placeholder="(주)하얏트 코리아"
                  class="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl font-medium outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div class="space-y-1">
                <label class="font-bold text-slate-700">공급 상품 유형 *</label>
                <select
                  v-model="partnerType"
                  class="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="HOTEL">호텔 / 숙박시설 (HOTEL)</option>
                  <option value="CAR">렌터카 / 차량 대여 (CAR)</option>
                  <option value="ACTIVITY">투어 & 티켓 / 액티비티 (ACTIVITY)</option>
                  <option value="TRANSFER">공항 픽업 / 샌딩 (TRANSFER)</option>
                  <option value="FLIGHT">항공사 / 총판 (FLIGHT)</option>
                </select>
              </div>
              <div class="space-y-1">
                <label class="font-bold text-slate-700">사업자등록번호 *</label>
                <input
                  v-model="businessNumber"
                  type="text"
                  required
                  placeholder="000-00-00000"
                  class="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl font-medium outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                />
              </div>
              <div class="space-y-1">
                <label class="font-bold text-slate-700">대표자 성명 *</label>
                <input
                  v-model="representativeName"
                  type="text"
                  required
                  placeholder="대표자 이름"
                  class="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl font-medium outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          <div class="space-y-4">
            <h3 class="text-sm font-black text-slate-900 border-b border-slate-100 pb-2">2. 계정 및 연락처</h3>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div class="space-y-1">
                <label class="font-bold text-slate-700">파트너 로그인 이메일 *</label>
                <input
                  v-model="email"
                  type="email"
                  required
                  placeholder="partner@company.com"
                  class="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl font-medium outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div class="space-y-1">
                <label class="font-bold text-slate-700">비밀번호 (8자 이상) *</label>
                <input
                  v-model="password"
                  type="password"
                  required
                  minlength="8"
                  placeholder="••••••••"
                  class="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl font-medium outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div class="space-y-1 md:col-span-2">
                <label class="font-bold text-slate-700">담당자 연락처 (휴대전화) *</label>
                <input
                  v-model="contactPhone"
                  type="tel"
                  required
                  placeholder="010-0000-0000"
                  class="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl font-medium outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          <div class="space-y-4">
            <h3 class="text-sm font-black text-slate-900 border-b border-slate-100 pb-2">3. 정산 입금 계좌 정보</h3>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div class="space-y-1">
                <label class="font-bold text-slate-700">은행명</label>
                <select
                  v-model="bankName"
                  class="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="신한은행">신한은행</option>
                  <option value="국민은행">국민은행</option>
                  <option value="하나은행">하나은행</option>
                  <option value="우리은행">우리은행</option>
                  <option value="기업은행">기업은행</option>
                  <option value="농협은행">농협은행</option>
                </select>
              </div>
              <div class="space-y-1 md:col-span-2">
                <label class="font-bold text-slate-700">계좌번호 (숫자만)</label>
                <input
                  v-model="bankAccountNumber"
                  type="text"
                  placeholder="110-000-000000"
                  class="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl font-medium outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                />
              </div>
            </div>
          </div>

          <div class="pt-2 border-t border-slate-100">
            <label class="flex items-center gap-2 cursor-pointer text-slate-700 font-medium">
              <input type="checkbox" v-model="agreeTerms" required class="rounded text-blue-600" />
              <span>GetForTrip 파트너 공급 규정 및 정산 정책에 동의합니다. (필수)</span>
            </label>
          </div>

          <div class="flex items-center justify-between pt-2">
            <router-link to="/login" class="text-slate-500 hover:text-slate-700 font-bold">
              ← 로그인으로 돌아가기
            </router-link>
            <button
              type="submit"
              :disabled="loading"
              class="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-xl shadow-lg shadow-blue-500/25 transition disabled:opacity-50"
            >
              {{ loading ? '신청 처리 중...' : '파트너 입점 신청 완료' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

