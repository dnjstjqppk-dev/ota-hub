<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { apiUrl } from '../config/api'

const partner = ref<any>(null)
const contactPhone = ref('')
const bankName = ref('')
const bankAccountNumber = ref('')
const bankAccountHolder = ref('')
const taxInvoiceEmail = ref('')
const loading = ref(false)
const saveLoading = ref(false)
const saveSuccess = ref(false)

const fetchProfile = async () => {
  loading.value = true
  try {
    const token = localStorage.getItem('getfortrip_partner_token')
    const res = await fetch(apiUrl('/partner/profile'), {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (res.ok) {
      const json = await res.json()
      partner.value = json.partner
      contactPhone.value = json.partner.contact_phone || ''
      if (json.partner.profile) {
        bankName.value = json.partner.profile.bank_name || ''
        bankAccountNumber.value = json.partner.profile.bank_account_number || ''
        bankAccountHolder.value = json.partner.profile.bank_account_holder || ''
        taxInvoiceEmail.value = json.partner.profile.tax_invoice_email || ''
      }
    }
  } catch (e) {
    console.error('Failed to load profile', e)
  } finally {
    loading.value = false
  }
}

const handleSaveProfile = async () => {
  saveLoading.value = true
  saveSuccess.value = false
  try {
    const token = localStorage.getItem('getfortrip_partner_token')
    const res = await fetch(apiUrl('/partner/profile'), {
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
      const err = await res.json()
      alert(err.error || '저장에 실패했습니다.')
    }
  } catch (e: any) {
    alert(e.message || '오류가 발생했습니다.')
  } finally {
    saveLoading.value = false
  }
}

onMounted(() => {
  fetchProfile()
})
</script>

<template>
  <div class="space-y-6 max-w-3xl">
    <div>
      <h1 class="text-2xl font-black tracking-tight text-slate-900">
        파트너 회사 정보 & 정산 계좌 관리
      </h1>
      <p class="text-sm text-slate-500 font-medium mt-1">
        사업자등록 기본 정보, 세금계산서 수신 이메일 및 정산 대금 입금 계좌를 설정합니다.
      </p>
    </div>

    <div v-if="saveSuccess" class="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-xs font-bold flex items-center gap-2">
      <span>✅</span>
      <span>파트너 정보가 성공적으로 업데이트되었습니다.</span>
    </div>

    <form @submit.prevent="handleSaveProfile" class="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm space-y-6 text-xs">
      <div class="space-y-4">
        <h3 class="text-sm font-black text-slate-900 border-b border-slate-100 pb-2">기본 사업자 정보</h3>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div class="space-y-1">
            <label class="font-bold text-slate-400">파트너 상호명</label>
            <input
              :value="partner?.company_name"
              disabled
              class="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 cursor-not-allowed"
            />
          </div>
          <div class="space-y-1">
            <label class="font-bold text-slate-400">사업자등록번호</label>
            <input
              :value="partner?.business_number"
              disabled
              class="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold font-mono text-slate-800 cursor-not-allowed"
            />
          </div>
          <div class="space-y-1">
            <label class="font-bold text-slate-400">계정 이메일</label>
            <input
              :value="partner?.email"
              disabled
              class="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 cursor-not-allowed"
            />
          </div>
          <div class="space-y-1">
            <label class="font-bold text-slate-700">담당자 연락처</label>
            <input
              v-model="contactPhone"
              type="tel"
              required
              class="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl font-medium outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      <div class="space-y-4">
        <h3 class="text-sm font-black text-slate-900 border-b border-slate-100 pb-2">정산 대금 입금 통장 정보</h3>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div class="space-y-1">
            <label class="font-bold text-slate-700">은행명</label>
            <input
              v-model="bankName"
              type="text"
              required
              placeholder="예: 신한은행"
              class="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div class="space-y-1 sm:col-span-2">
            <label class="font-bold text-slate-700">계좌번호 (하이픈 포함 가능)</label>
            <input
              v-model="bankAccountNumber"
              type="text"
              required
              placeholder="110-123-456789"
              class="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl font-medium outline-none focus:ring-2 focus:ring-blue-500 font-mono"
            />
          </div>
          <div class="space-y-1">
            <label class="font-bold text-slate-700">예금주</label>
            <input
              v-model="bankAccountHolder"
              type="text"
              required
              placeholder="상호명 또는 대표자"
              class="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl font-medium outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div class="space-y-1 sm:col-span-2">
            <label class="font-bold text-slate-700">전자세금계산서 수신 이메일</label>
            <input
              v-model="taxInvoiceEmail"
              type="email"
              placeholder="tax@company.com"
              class="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl font-medium outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      <div class="pt-4 border-t border-slate-100 flex justify-end">
        <button
          type="submit"
          :disabled="saveLoading"
          class="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-xl shadow-md shadow-blue-500/25 transition disabled:opacity-50"
        >
          {{ saveLoading ? '저장 중...' : '정보 변경 저장' }}
        </button>
      </div>
    </form>
  </div>
</template>

