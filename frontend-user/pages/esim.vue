<script setup lang="ts">
import { ref, computed } from 'vue'
import { BRAND } from '~/config/brand'

const searchQuery = ref('')
const selectedRegion = ref('전체')

const regions = ['전체', '일본', '동남아', '유럽', '미국/미주', '대만/홍콩']

const plans = ref([
  {
    id: 'esim-jp-01',
    country: '일본',
    flag: '🇯🇵',
    title: '일본 매일 2GB + 무제한 데이터 (Docomo/Softbank)',
    dataAmount: '매일 2GB (소진 시 저속 무제한)',
    validityDays: 5,
    priceKrw: 11900,
    network: 'Docomo / Softbank 5G/LTE',
    deliveryType: '결제 즉시 이메일 QR 코드 전송 (5분 이내)',
    hot: true
  },
  {
    id: 'esim-jp-02',
    country: '일본',
    flag: '🇯🇵',
    title: '일본 완전 무제한 데이터 로컬 프리미엄 eSIM',
    dataAmount: '속도 제한 없는 완전 무제한',
    validityDays: 4,
    priceKrw: 15900,
    network: 'Softbank 로컬망 직결',
    deliveryType: 'QR 즉시 발송',
    hot: false
  },
  {
    id: 'esim-vn-01',
    country: '베트남',
    flag: '🇻🇳',
    title: '베트남 다낭/나트랑 매일 3GB 로컬 eSIM (Viettel)',
    dataAmount: '매일 3GB 고속 데이터',
    validityDays: 5,
    priceKrw: 8900,
    network: 'Viettel 4G LTE 1위 통신사',
    deliveryType: 'QR 즉시 발송',
    hot: true
  },
  {
    id: 'esim-eu-01',
    country: '유럽',
    flag: '🇪🇺',
    title: '유럽 33개국 통합 10GB 데이터 + 30일 패키지',
    dataAmount: '총 10GB 고속 데이터',
    validityDays: 30,
    priceKrw: 24500,
    network: 'Vodafone / Orange 유럽 전역',
    deliveryType: 'QR 즉시 발송',
    hot: false
  },
  {
    id: 'esim-us-01',
    country: '미국/미주',
    flag: '🇺🇸',
    title: '미국/하와이 완전 무제한 데이터 eSIM (T-Mobile)',
    dataAmount: 'T-Mobile 5G 고속 무제한',
    validityDays: 7,
    priceKrw: 29000,
    network: 'T-Mobile 미국 본토 및 하와이',
    deliveryType: 'QR 즉시 발송',
    hot: true
  },
  {
    id: 'esim-tw-01',
    country: '대만/홍콩',
    flag: '🇹🇼',
    title: '대만 타이베이 매일 2GB 무제한 eSIM (Chunghwa)',
    dataAmount: '매일 2GB + 저속 무제한',
    validityDays: 4,
    priceKrw: 9500,
    network: '중화전통 5G/LTE',
    deliveryType: 'QR 즉시 발송',
    hot: false
  }
])

const filteredPlans = computed(() => {
  return plans.value.filter(p => {
    if (selectedRegion.value !== '전체' && p.country !== selectedRegion.value) {
      return false
    }
    if (searchQuery.value) {
      const q = searchQuery.value.toLowerCase()
      return p.country.toLowerCase().includes(q) || p.title.toLowerCase().includes(q)
    }
    return true
  })
})

const selectedPlan = ref<any>(null)
const isModalOpen = ref(false)
const buyerEmail = ref('')
const isSuccess = ref(false)
const qrVoucher = ref('')

const buyEsim = (plan: any) => {
  selectedPlan.value = plan
  buyerEmail.value = 'user@getfortrip.com'
  isSuccess.value = false
  isModalOpen.value = true
}

const completeEsimPurchase = () => {
  if (!buyerEmail.value) {
    alert('QR 코드를 수신할 이메일을 입력해 주세요.')
    return
  }
  qrVoucher.value = `LPA:1$getfortrip.esim.com$GFT-${Date.now().toString(36).toUpperCase()}`
  isSuccess.value = true
}
</script>

<template>
  <div class="max-w-6xl mx-auto px-4 py-8 space-y-8">
    <!-- 상단 배너 -->
    <div class="bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 rounded-3xl p-6 sm:p-10 text-white shadow-xl relative overflow-hidden">
      <div class="space-y-3 max-w-xl relative z-10">
        <span class="px-3 py-1 bg-white/20 backdrop-blur-md rounded-full text-xs font-black uppercase tracking-wider">
          📱 해외 eSIM 즉시 개통
        </span>
        <h1 class="text-2xl sm:text-4xl font-black tracking-tight leading-tight">
          실물 유심 교체 없이 QR 스캔으로 5분 만에 현지 데이터 개통
        </h1>
        <p class="text-xs sm:text-sm text-blue-100">
          택배 대기 No! 인천공항 수령 대기 No! 결제 즉시 발송되는 QR 코드로 출국 전 바로 등록하세요.
        </p>
      </div>
    </div>

    <!-- 검색 및 필터 -->
    <div class="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
      <div class="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto pb-2 md:pb-0">
        <button
          v-for="reg in regions"
          :key="reg"
          @click="selectedRegion = reg"
          :class="[
            'px-3.5 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap',
            selectedRegion === reg ? 'bg-slate-900 text-white' : 'bg-slate-50 hover:bg-slate-100 text-slate-600'
          ]"
        >
          {{ reg }}
        </button>
      </div>

      <div class="w-full md:w-64">
        <input
          v-model="searchQuery"
          type="text"
          placeholder="국가명, 통신사 검색..."
          class="w-full px-3.5 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50 outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
    </div>

    <!-- 상품 그리드 -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
      <div
        v-for="plan in filteredPlans"
        :key="plan.id"
        class="bg-white rounded-3xl border border-slate-200/90 p-5 shadow-sm hover:shadow-md transition space-y-4 flex flex-col justify-between"
      >
        <div class="space-y-3">
          <div class="flex items-center justify-between">
            <span class="text-2xl">{{ plan.flag }}</span>
            <span v-if="plan.hot" class="px-2 py-0.5 rounded-full bg-rose-50 text-rose-600 text-[10px] font-black border border-rose-200">
              인기 베스트
            </span>
          </div>

          <div>
            <span class="text-[10px] font-bold text-slate-400 block mb-0.5">{{ plan.country }}</span>
            <h3 class="font-black text-sm text-slate-900 leading-snug">{{ plan.title }}</h3>
          </div>

          <div class="bg-slate-50 p-3 rounded-2xl space-y-1.5 text-xs">
            <div class="flex justify-between text-slate-600">
              <span class="text-slate-400">제공 데이터:</span>
              <span class="font-bold text-slate-900">{{ plan.dataAmount }}</span>
            </div>
            <div class="flex justify-between text-slate-600">
              <span class="text-slate-400">사용 기간:</span>
              <span class="font-bold text-slate-900">{{ plan.validityDays }}일</span>
            </div>
            <div class="flex justify-between text-slate-600">
              <span class="text-slate-400">현지 통신망:</span>
              <span class="font-bold text-blue-600">{{ plan.network }}</span>
            </div>
          </div>
        </div>

        <div class="pt-3 border-t border-slate-100 flex items-center justify-between">
          <div>
            <span class="text-[10px] text-slate-400 block">특가 요금</span>
            <span class="text-lg font-black text-slate-900 font-mono">₩{{ plan.priceKrw.toLocaleString() }}</span>
          </div>
          <button
            @click="buyEsim(plan)"
            class="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-black shadow-sm transition"
          >
            즉시 구매하기
          </button>
        </div>
      </div>
    </div>

    <!-- eSIM 즉시 구매 & QR 발급 모달 -->
    <div v-if="isModalOpen" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div class="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden p-6 space-y-6">
        <div class="flex items-center justify-between pb-3 border-b border-slate-100">
          <div class="flex items-center gap-2">
            <span class="text-xl">📱</span>
            <h3 class="font-bold text-slate-900 text-sm">eSIM 즉시 결제 & QR 발급</h3>
          </div>
          <button @click="isModalOpen = false" class="text-slate-400 hover:text-slate-600 text-lg font-bold">✕</button>
        </div>

        <div v-if="!isSuccess" class="space-y-4 text-xs">
          <div class="bg-blue-50/70 p-4 rounded-2xl border border-blue-100 space-y-1">
            <div class="font-bold text-blue-900">{{ selectedPlan?.title }}</div>
            <div class="text-[11px] text-blue-700">{{ selectedPlan?.country }} · {{ selectedPlan?.network }} 로컬망</div>
            <div class="text-base font-black text-blue-900 pt-2 font-mono">₩{{ selectedPlan?.priceKrw.toLocaleString() }}</div>
          </div>

          <div class="space-y-1.5">
            <label class="font-bold text-slate-700 block">QR 코드 수신 이메일</label>
            <input
              v-model="buyerEmail"
              type="email"
              placeholder="example@getfortrip.com"
              class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <span class="text-[10px] text-slate-400">결제 완료 시 위 이메일로 활성화 프로파일이 즉시 발송됩니다.</span>
          </div>

          <button
            @click="completeEsimPurchase"
            class="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold text-xs shadow-md transition"
          >
            ₩{{ selectedPlan?.priceKrw.toLocaleString() }} 결제 및 QR 발급
          </button>
        </div>

        <!-- 발급 완료 상태 -->
        <div v-else class="text-center space-y-4 py-2">
          <div class="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto text-xl font-black">✓</div>
          <div class="space-y-1">
            <h4 class="font-black text-slate-900 text-base">eSIM 발급이 완료되었습니다!</h4>
            <p class="text-[11px] text-slate-500">{{ buyerEmail }}로 활성화 QR 코드가 전송되었습니다.</p>
          </div>
          <div class="bg-slate-50 p-4 rounded-2xl border border-dashed border-slate-300 space-y-2">
            <div class="text-4xl py-2">📶</div>
            <div class="text-[10px] text-slate-400 font-mono break-all">{{ qrVoucher }}</div>
            <div class="text-[11px] font-bold text-blue-600">휴대폰 설정 > 셀룰러 > eSIM 추가에서 등록하세요</div>
          </div>
          <button
            @click="isModalOpen = false"
            class="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition"
          >
            확인 및 닫기
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

