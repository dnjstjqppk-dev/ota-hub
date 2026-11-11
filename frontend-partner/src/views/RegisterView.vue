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
      credentials: 'include',
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
  <div class="min-h-screen bg-midnight-900 px-4 py-12 font-sans sm:px-6 lg:px-8">
    <div class="mx-auto max-w-2xl space-y-6">
      <div class="space-y-2 text-center">
        <h1 class="flex items-center justify-center gap-2 text-3xl font-black tracking-tight text-white">
          <span>getfor<span class="text-sapphire-400">trip</span></span>
          <span class="rounded bg-primary px-2 py-0.5 text-xs font-black uppercase text-primary-ink">Partner Onboarding</span>
        </h1>
        <p class="text-sm font-medium text-sapphire-300">
          getfortrip 글로벌 판매 네트워크에 상품을 직접 공급하고 매출을 확대하세요.
        </p>
      </div>

      <div class="space-y-6 rounded-3xl border border-line bg-surface p-8 shadow-pop">
        <div v-if="successMessage" class="space-y-3 rounded-2xl border border-success/30 bg-success-soft p-6 text-success">
          <div class="flex items-center gap-2 text-base font-black">
            <AppIcon name="check" :size="20" />
            <span>파트너 입점 신청 접수 완료</span>
          </div>
          <p class="text-xs leading-relaxed">
            {{ successMessage }}
          </p>
          <div class="pt-2">
            <router-link
              to="/login"
              class="inline-block rounded-xl bg-success px-5 py-2.5 text-xs font-bold text-white shadow-md transition hover:opacity-90"
            >
              로그인 화면으로 이동
            </router-link>
          </div>
        </div>

        <form v-else class="space-y-5 text-xs" @submit.prevent="handleRegister">
          <div v-if="errorMessage" class="flex items-center gap-2 rounded-2xl border border-danger/30 bg-danger-soft p-3.5 font-bold text-danger" role="alert">
            <AppIcon name="alert" :size="16" />
            <span>{{ errorMessage }}</span>
          </div>

          <div class="space-y-4">
            <h3 class="border-b border-line pb-2 text-sm font-black text-ink">1. 기업 및 공급자 정보</h3>
            <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div class="space-y-1">
                <label class="label">회사명 (법인/상호명) *</label>
                <input
                  v-model="companyName"
                  type="text"
                  required
                  placeholder="주식회사 하얏트 코리아"
                  class="input font-medium"
                />
              </div>
              <div class="space-y-1">
                <label class="label">공급 상품 유형 *</label>
                <select
                  v-model="partnerType"
                  class="input font-bold"
                >
                  <option value="HOTEL">호텔 / 숙박시설 (HOTEL)</option>
                  <option value="CAR">렌터카 / 차량 대여 (CAR)</option>
                  <option value="ACTIVITY">투어 & 티켓 / 액티비티 (ACTIVITY)</option>
                  <option value="TRANSFER">공항 픽업 / 샌딩 (TRANSFER)</option>
                  <option value="FLIGHT">항공사 / 총판 (FLIGHT)</option>
                </select>
              </div>
              <div class="space-y-1">
                <label class="label">사업자등록번호 *</label>
                <input
                  v-model="businessNumber"
                  type="text"
                  required
                  inputmode="numeric"
                  placeholder="000-00-00000"
                  class="input font-mono font-medium"
                />
              </div>
              <div class="space-y-1">
                <label class="label">대표자 성명 *</label>
                <input
                  v-model="representativeName"
                  type="text"
                  required
                  placeholder="대표자 이름"
                  class="input font-medium"
                />
              </div>
            </div>
          </div>

          <div class="space-y-4">
            <h3 class="border-b border-line pb-2 text-sm font-black text-ink">2. 계정 및 연락처</h3>
            <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div class="space-y-1">
                <label class="label">파트너 로그인 이메일 *</label>
                <input
                  v-model="email"
                  type="email"
                  required
                  autocomplete="username"
                  placeholder="partner@company.com"
                  class="input font-medium"
                />
              </div>
              <div class="space-y-1">
                <label class="label">비밀번호 (8자 이상) *</label>
                <input
                  v-model="password"
                  type="password"
                  required
                  minlength="8"
                  autocomplete="new-password"
                  placeholder="••••••••"
                  class="input font-medium"
                />
              </div>
              <div class="space-y-1 md:col-span-2">
                <label class="label">담당자 연락처 (휴대전화) *</label>
                <input
                  v-model="contactPhone"
                  type="tel"
                  required
                  autocomplete="tel"
                  placeholder="010-0000-0000"
                  class="input font-medium"
                />
              </div>
            </div>
          </div>

          <div class="space-y-4">
            <h3 class="border-b border-line pb-2 text-sm font-black text-ink">3. 정산 입금 계좌 정보</h3>
            <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div class="space-y-1">
                <label class="label">은행명</label>
                <select
                  v-model="bankName"
                  class="input font-bold"
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
                <label class="label">계좌번호 (숫자만)</label>
                <input
                  v-model="bankAccountNumber"
                  type="text"
                  inputmode="numeric"
                  placeholder="숫자만 입력"
                  class="input font-mono font-medium"
                />
              </div>
            </div>
          </div>

          <div class="border-t border-line pt-2">
            <label class="flex cursor-pointer items-center gap-2 font-medium text-ink-muted">
              <input v-model="agreeTerms" type="checkbox" required class="h-4 w-4 rounded accent-primary" />
              <span><router-link to="/terms" target="_blank" class="font-bold text-primary hover:underline" @click.stop>getfortrip 파트너 공급 규정 및 정산 정책</router-link>에 동의합니다. (필수)</span>
            </label>
          </div>

          <div class="flex items-center justify-between pt-2">
            <router-link to="/login" class="inline-flex items-center gap-1 font-bold text-ink-subtle hover:text-ink">
              <AppIcon name="arrow-right" :size="14" class="rotate-180" /> 로그인으로 돌아가기
            </router-link>
            <button
              type="submit"
              :disabled="loading"
              class="btn-primary"
            >
              {{ loading ? '신청 처리 중...' : '파트너 입점 신청 완료' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>
