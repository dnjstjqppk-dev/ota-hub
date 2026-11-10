<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { apiUrl, partnerToken } from '../config/api'

const route = useRoute()
const partner = ref<any>(null)
// C1: PENDING owners land here from login (?onboarding=1) and complete the
// company profile + verification docs before the admin can approve them.
const onboardingPending = computed(() => {
  const st = String(partner.value?.profile?.status || '').toUpperCase()
  return route.query.onboarding === '1' || st === 'PENDING_APPROVAL' || st === 'PENDING'
})
const contactPhone = ref('')
const bankName = ref('')
const bankAccountNumber = ref('')
const bankAccountHolder = ref('')
const taxInvoiceEmail = ref('')
const loading = ref(false)
const error = ref('')
const saveLoading = ref(false)
const saveSuccess = ref(false)
const saveError = ref('')

const uploadState = ref<Record<string, string>>({})
const uploadFile = async (purpose: 'BUSINESS_CERT' | 'BANK_CERT', ev: Event) => {
  const input = ev.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  uploadState.value = { ...uploadState.value, [purpose]: '업로드 중…' }
  saveError.value = ''
  try {
    const form = new FormData()
    form.append('file', file)
    form.append('purpose', purpose)
    const res = await fetch(apiUrl('/uploads'), {
      credentials: 'include',
      method: 'POST',
      headers: { Authorization: `Bearer ${partnerToken()}` },
      body: form
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(json.error || '업로드에 실패했습니다.')
    uploadState.value = { ...uploadState.value, [purpose]: '등록 완료' }
    await fetchProfile()
  } catch (e: any) {
    uploadState.value = { ...uploadState.value, [purpose]: '' }
    saveError.value = e.message || '업로드에 실패했습니다.'
  } finally {
    input.value = ''
  }
}

const fetchProfile = async () => {
  loading.value = true
  error.value = ''
  try {
    const token = partnerToken()
    const res = await fetch(apiUrl('/partner/profile'), {
      credentials: 'include',
      headers: { Authorization: `Bearer ${token}` }
    })
    if (!res.ok) throw new Error('회사 정보를 불러오지 못했습니다.')
    const json = await res.json()
    partner.value = json.partner
    contactPhone.value = json.partner.contact_phone || ''
    if (json.partner.profile) {
      bankName.value = json.partner.profile.bank_name || ''
      bankAccountNumber.value = json.partner.profile.bank_account_number || ''
      bankAccountHolder.value = json.partner.profile.bank_account_holder || ''
      taxInvoiceEmail.value = json.partner.profile.tax_invoice_email || ''
    }
  } catch (e: any) {
    error.value = e.message || '회사 정보를 불러오지 못했습니다.'
  } finally {
    loading.value = false
  }
}

const handleSaveProfile = async () => {
  saveLoading.value = true
  saveSuccess.value = false
  saveError.value = ''
  try {
    const token = partnerToken()
    const res = await fetch(apiUrl('/partner/profile'), {
      credentials: 'include',
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        contactPhone: contactPhone.value,
        bankName: bankName.value,
        bankAccountNumber: bankAccountNumber.value,
        bankAccountHolder: bankAccountHolder.value,
        taxInvoiceEmail: taxInvoiceEmail.value
      })
    })

    if (res.ok) {
      saveSuccess.value = true
      await fetchProfile()
    } else {
      const err = await res.json().catch(() => ({}))
      saveError.value = err.error || '저장에 실패했습니다.'
    }
  } catch (e: any) {
    saveError.value = e.message || '오류가 발생했습니다.'
  } finally {
    saveLoading.value = false
  }
}

onMounted(() => {
  fetchProfile()
})
</script>

<template>
  <div class="max-w-3xl space-y-6">
    <div>
      <h1 class="text-2xl font-black tracking-tight text-ink">
        파트너 회사 정보 & 정산 계좌 관리
      </h1>
      <p class="mt-1 text-sm font-medium text-ink-subtle">
        사업자등록 기본 정보, 세금계산서 수신 이메일 및 정산 대금 입금 계좌를 설정합니다.
      </p>
    </div>

    <div v-if="onboardingPending" class="rounded-2xl border border-warning/40 bg-warning-soft px-4 py-3 text-xs font-semibold text-ink" role="status">
      <p class="font-black">입점 심사 전 정보 입력 단계입니다.</p>
      <p class="mt-1 font-medium text-ink-subtle">
        아래 회사 정보와 정산 계좌를 입력하고 사업자등록증·통장사본을 등록해 주세요. 서류가 갖춰지면 관리자가 심사 후 승인하며, 승인 완료 전까지 상품·주문·정산 메뉴는 이용할 수 없습니다.
      </p>
    </div>

    <div v-if="error" class="rounded-2xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm font-semibold text-danger">
      {{ error }}
      <button type="button" class="ml-2 underline" @click="fetchProfile">다시 시도</button>
    </div>

    <div v-if="saveSuccess" class="flex items-center gap-2 rounded-2xl border border-success/30 bg-success-soft p-4 text-xs font-bold text-success" role="status">
      <AppIcon name="check" :size="16" />
      <span>파트너 정보가 성공적으로 업데이트되었습니다.</span>
    </div>

    <div v-if="saveError" class="rounded-2xl bg-danger-soft px-4 py-3 text-xs font-medium text-danger" role="alert">{{ saveError }}</div>

    <form v-if="!loading" class="card space-y-6 p-6 text-xs sm:p-8" @submit.prevent="handleSaveProfile">
      <div class="space-y-4">
        <h3 class="border-b border-line pb-2 text-sm font-black text-ink">기본 사업자 정보</h3>
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div class="space-y-1">
            <label class="label">파트너 상호명</label>
            <input
              :value="partner?.company_name"
              disabled
              class="input cursor-not-allowed bg-surface-sunken font-bold"
            />
          </div>
          <div class="space-y-1">
            <label class="label">사업자등록번호</label>
            <input
              :value="partner?.business_number"
              disabled
              class="input cursor-not-allowed bg-surface-sunken font-mono font-bold"
            />
          </div>
          <div class="space-y-1">
            <label class="label">계정 이메일</label>
            <input
              :value="partner?.email"
              disabled
              class="input cursor-not-allowed bg-surface-sunken font-bold"
            />
          </div>
          <div class="space-y-1">
            <label class="label">담당자 연락처</label>
            <input
              v-model="contactPhone"
              type="tel"
              required
              class="input font-medium"
            />
          </div>
        </div>
      </div>

      <div class="space-y-4">
        <h3 class="border-b border-line pb-2 text-sm font-black text-ink">정산 대금 입금 통장 정보</h3>
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div class="space-y-1">
            <label class="label">은행명</label>
            <input
              v-model="bankName"
              type="text"
              required
              placeholder="예: 신한은행"
              class="input font-bold"
            />
          </div>
          <div class="space-y-1 sm:col-span-2">
            <label class="label">계좌번호 (숫자만 입력)</label>
            <input
              v-model="bankAccountNumber"
              type="text"
              required
              inputmode="numeric"
              placeholder="숫자만 입력"
              class="input font-mono font-medium"
            />
          </div>
          <div class="space-y-1">
            <label class="label">예금주</label>
            <input
              v-model="bankAccountHolder"
              type="text"
              required
              placeholder="상호명 또는 대표자"
              class="input font-medium"
            />
          </div>
          <div class="space-y-1 sm:col-span-2">
            <label class="label">전자세금계산서 수신 이메일</label>
            <input
              v-model="taxInvoiceEmail"
              type="email"
              placeholder="tax@company.com"
              class="input font-medium"
            />
          </div>
        </div>
      </div>

      <div class="space-y-4">
        <h3 class="border-b border-line pb-2 text-sm font-black text-ink">입점 심사 서류 (승인 필수)</h3>
        <p class="-mt-2 text-xs text-ink-subtle">사업자등록증과 통장사본을 등록해야 관리자 승인이 진행돼요. 이미지 또는 PDF, 장당 8MB 이하.</p>
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div class="space-y-1">
            <label class="label">사업자등록증 {{ partner?.profile?.business_cert_url ? '· 등록됨' : '· 미등록' }}</label>
            <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" class="input text-xs" @change="uploadFile('BUSINESS_CERT', $event)" />
            <p v-if="uploadState['BUSINESS_CERT']" class="text-xs font-bold text-success">{{ uploadState['BUSINESS_CERT'] }}</p>
          </div>
          <div class="space-y-1">
            <label class="label">통장사본 {{ partner?.profile?.bank_cert_url ? '· 등록됨' : '· 미등록' }}</label>
            <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" class="input text-xs" @change="uploadFile('BANK_CERT', $event)" />
            <p v-if="uploadState['BANK_CERT']" class="text-xs font-bold text-success">{{ uploadState['BANK_CERT'] }}</p>
          </div>
        </div>
      </div>

      <div class="flex justify-end border-t border-line pt-4">
        <button
          type="submit"
          :disabled="saveLoading"
          class="btn-primary btn-sm"
        >
          {{ saveLoading ? '저장 중...' : '정보 변경 저장' }}
        </button>
      </div>
    </form>
    <p v-else class="py-8 text-center text-sm font-bold text-ink-subtle">회사 정보를 불러오는 중입니다...</p>
  </div>
</template>
