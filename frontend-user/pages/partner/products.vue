<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { usePartnerStore } from '~/stores/partner'

definePageMeta({
  middleware: 'partner-auth'
})

const router = useRouter()
const partnerStore = usePartnerStore()

onMounted(() => {
  if (!partnerStore.isLoggedIn || !partnerStore.partner) {
    router.replace('/partner/login')
  }
})

const isAddModalOpen = ref(false)
const searchQuery = ref('')
const filterCategory = ref('ALL')

const products = ref([
  {
    id: 'ptn_prod_01',
    name: '디럭스 킹 룸 (시티뷰 조식 포함)',
    category: 'HOTEL',
    basePriceKrw: 320000,
    costPriceKrw: 288000,
    stockCount: 8,
    status: 'ACTIVE',
    cancellationRule: '체크인 48시간 전 무료 취소',
    imageUrl: 'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=600'
  },
  {
    id: 'ptn_prod_02',
    name: '프리미어 이그제큐티브 스위트',
    category: 'HOTEL',
    basePriceKrw: 680000,
    costPriceKrw: 612000,
    stockCount: 3,
    status: 'ACTIVE',
    cancellationRule: '체크인 72시간 전 무료 취소',
    imageUrl: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=600'
  },
  {
    id: 'ptn_prod_03',
    name: '스탠다드 퀸 룸 (얼리버드 프로모션)',
    category: 'HOTEL',
    basePriceKrw: 185000,
    costPriceKrw: 166500,
    stockCount: 15,
    status: 'ACTIVE',
    cancellationRule: '환불 불가 특가',
    imageUrl: 'https://images.unsplash.com/photo-1590559899731-a372a146979d?w=600'
  },
  {
    id: 'ptn_prod_04',
    name: '클럽 라운지 엑세스 킹룸 (해피아워 포함)',
    category: 'HOTEL',
    basePriceKrw: 420000,
    costPriceKrw: 378000,
    stockCount: 0,
    status: 'SOLD_OUT',
    cancellationRule: '체크인 24시간 전 무료 취소',
    imageUrl: 'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=600'
  }
])

const newProduct = ref({
  name: '',
  category: 'HOTEL',
  basePriceKrw: 250000,
  stockCount: 10,
  cancellationRule: '체크인 48시간 전 무료 취소',
  imageUrl: 'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=600'
})

const handleAddProduct = () => {
  if (!newProduct.value.name) {
    alert('상품명을 입력해 주세요.')
    return
  }

  products.value.unshift({
    id: 'ptn_prod_' + Math.random().toString(36).substring(2, 7),
    name: newProduct.value.name,
    category: newProduct.value.category,
    basePriceKrw: Number(newProduct.value.basePriceKrw),
    costPriceKrw: Math.round(Number(newProduct.value.basePriceKrw) * 0.9),
    stockCount: Number(newProduct.value.stockCount),
    status: 'ACTIVE',
    cancellationRule: newProduct.value.cancellationRule,
    imageUrl: newProduct.value.imageUrl
  })

  isAddModalOpen.value = false
  newProduct.value.name = ''
  alert('신규 상품이 파트너 인벤토리에 성공적으로 등록되었습니다.')
}

const toggleStatus = (idx: number) => {
  const cur = products.value[idx].status
  products.value[idx].status = cur === 'ACTIVE' ? 'PAUSED' : 'ACTIVE'
}

const updateStock = (idx: number, delta: number) => {
  products.value[idx].stockCount = Math.max(0, products.value[idx].stockCount + delta)
  if (products.value[idx].stockCount === 0) {
    products.value[idx].status = 'SOLD_OUT'
  } else if (products.value[idx].status === 'SOLD_OUT') {
    products.value[idx].status = 'ACTIVE'
  }
}
</script>

<template>
  <div v-if="partnerStore.isLoggedIn && partnerStore.partner" class="min-h-screen bg-slate-100">
    <header class="bg-slate-900 text-white border-b border-slate-800 sticky top-0 z-40">
      <div class="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        <div class="flex items-center gap-6">
          <NuxtLink to="/partner" class="flex items-center gap-2">
            <img src="/logo-white.svg" alt="getfortrip" class="h-7 w-auto" />
            <span class="px-2 py-0.5 rounded text-[10px] font-black bg-blue-600 text-white uppercase tracking-wider">
              Partner Hub
            </span>
          </NuxtLink>
          <nav class="hidden md:flex items-center gap-1 text-xs font-bold text-slate-300">
            <NuxtLink to="/partner" class="px-3 py-2 rounded-xl hover:bg-slate-800 hover:text-white transition">대시보드</NuxtLink>
            <NuxtLink to="/partner/products" class="px-3 py-2 rounded-xl bg-slate-800 text-white">상품 및 재고 관리</NuxtLink>
            <NuxtLink to="/partner/bookings" class="px-3 py-2 rounded-xl hover:bg-slate-800 hover:text-white transition">예약·바우처 관리</NuxtLink>
            <NuxtLink to="/partner/settlement" class="px-3 py-2 rounded-xl hover:bg-slate-800 hover:text-white transition">정산 및 수수료</NuxtLink>
            <NuxtLink to="/partner/settings" class="px-3 py-2 rounded-xl hover:bg-slate-800 hover:text-white transition">연동 API/설정</NuxtLink>
          </nav>
        </div>
        <div class="flex items-center gap-4 text-xs">
          <span class="font-bold text-slate-300">{{ partnerStore.partner?.companyName }}</span>
          <button @click="partnerStore.logout(); router.push('/partner/login')" class="text-rose-400 font-bold">로그아웃</button>
        </div>
      </div>
    </header>

    <main class="max-w-7xl mx-auto px-4 py-8 space-y-6">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 class="text-2xl font-black text-slate-900">상품 및 인벤토리 요금 관리</h1>
          <p class="text-xs text-slate-500 mt-1">판매 중인 객실, 티켓, 차량 상품의 일일 재고 및 공급 요금을 실시간으로 변경합니다.</p>
        </div>
        <button
          @click="isAddModalOpen = true"
          class="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-black shadow transition flex items-center gap-1.5 self-start"
        >
          <span>+</span>
          <span>신규 공급 상품 등록</span>
        </button>
      </div>

      <!-- 상품 테이블 -->
      <div class="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs">
            <thead class="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
              <tr>
                <th class="py-3.5 px-4">상품 정보</th>
                <th class="py-3.5 px-4">카테고리</th>
                <th class="py-3.5 px-4">소비자 판매가</th>
                <th class="py-3.5 px-4">파트너 정산가 (90%)</th>
                <th class="py-3.5 px-4">남은 재고(수량)</th>
                <th class="py-3.5 px-4">취소/환불 규정</th>
                <th class="py-3.5 px-4 text-center">판매 상태</th>
                <th class="py-3.5 px-4 text-center">관리</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              <tr v-for="(prod, idx) in products" :key="prod.id" class="hover:bg-slate-50/80 transition">
                <td class="py-3.5 px-4">
                  <div class="flex items-center gap-3">
                    <img :src="prod.imageUrl" class="w-12 h-12 rounded-xl object-cover border border-slate-200 flex-shrink-0" />
                    <div>
                      <div class="font-bold text-slate-900 text-sm">{{ prod.name }}</div>
                      <div class="text-[10px] text-slate-400 font-mono">ID: {{ prod.id }}</div>
                    </div>
                  </div>
                </td>
                <td class="py-3.5 px-4">
                  <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                    {{ prod.category }}
                  </span>
                </td>
                <td class="py-3.5 px-4 font-black text-slate-900">
                  ₩{{ prod.basePriceKrw.toLocaleString() }}
                </td>
                <td class="py-3.5 px-4 font-black text-emerald-600">
                  ₩{{ prod.costPriceKrw.toLocaleString() }}
                </td>
                <td class="py-3.5 px-4">
                  <div class="flex items-center gap-2">
                    <button @click="updateStock(idx, -1)" class="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold flex items-center justify-center">-</button>
                    <span class="font-bold font-mono text-slate-900 min-w-6 text-center">{{ prod.stockCount }}</span>
                    <button @click="updateStock(idx, 1)" class="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold flex items-center justify-center">+</button>
                  </div>
                </td>
                <td class="py-3.5 px-4 text-slate-500 text-[11px]">
                  {{ prod.cancellationRule }}
                </td>
                <td class="py-3.5 px-4 text-center">
                  <span
                    :class="[
                      'px-2 py-0.5 rounded-full text-[10px] font-black',
                      prod.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : prod.status === 'SOLD_OUT' ? 'bg-rose-50 text-rose-600 border border-rose-200' : 'bg-slate-100 text-slate-500'
                    ]"
                  >
                    {{ prod.status === 'ACTIVE' ? '판매 중' : prod.status === 'SOLD_OUT' ? '매진' : '일시 중단' }}
                  </span>
                </td>
                <td class="py-3.5 px-4 text-center">
                  <button
                    @click="toggleStatus(idx)"
                    class="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] transition"
                  >
                    {{ prod.status === 'ACTIVE' ? '판매 중단' : '판매 개시' }}
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </main>

    <!-- 신규 상품 등록 모달 -->
    <div v-if="isAddModalOpen" class="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div class="bg-white rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl space-y-5">
        <div class="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 class="text-lg font-black text-slate-900">신규 공급 상품 등록</h3>
          <button @click="isAddModalOpen = false" class="text-slate-400 hover:text-slate-600 font-bold text-lg">✕</button>
        </div>

        <div class="space-y-4 text-xs">
          <div>
            <label class="block font-bold text-slate-700 mb-1">상품 카테고리</label>
            <select v-model="newProduct.category" class="w-full p-2.5 border border-slate-200 rounded-xl font-bold bg-slate-50">
              <option value="HOTEL">호텔 / 객실</option>
              <option value="TOUR">투어 & 티켓</option>
              <option value="CAR">렌터카</option>
              <option value="TRANSFER">공항 픽업</option>
            </select>
          </div>

          <div>
            <label class="block font-bold text-slate-700 mb-1">상품명 (고객 표시 명칭)</label>
            <input v-model="newProduct.name" type="text" placeholder="예: 시그니처 오션뷰 더블룸 (조식 포함)" class="w-full p-2.5 border border-slate-200 rounded-xl" />
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block font-bold text-slate-700 mb-1">소비자 판매가 (KRW)</label>
              <input v-model="newProduct.basePriceKrw" type="number" class="w-full p-2.5 border border-slate-200 rounded-xl font-mono" />
            </div>
            <div>
              <label class="block font-bold text-slate-700 mb-1">일일 초기 재고 (수량)</label>
              <input v-model="newProduct.stockCount" type="number" class="w-full p-2.5 border border-slate-200 rounded-xl font-mono" />
            </div>
          </div>

          <div>
            <label class="block font-bold text-slate-700 mb-1">취소 / 환불 규정</label>
            <input v-model="newProduct.cancellationRule" type="text" class="w-full p-2.5 border border-slate-200 rounded-xl" />
          </div>

          <div>
            <label class="block font-bold text-slate-700 mb-1">대표 이미지 URL</label>
            <input v-model="newProduct.imageUrl" type="text" class="w-full p-2.5 border border-slate-200 rounded-xl font-mono text-[11px]" />
          </div>
        </div>

        <div class="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
          <button @click="isAddModalOpen = false" class="px-4 py-2 bg-slate-100 text-slate-700 font-bold rounded-xl text-xs">취소</button>
          <button @click="handleAddProduct" class="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-black rounded-xl text-xs shadow">등록 완료</button>
        </div>
      </div>
    </div>
  </div>

  <div v-else class="min-h-screen bg-slate-100 flex items-center justify-center p-4">
    <div class="bg-white p-8 rounded-3xl shadow-sm border border-slate-200 max-w-md w-full text-center space-y-4">
      <div class="w-14 h-14 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mx-auto text-2xl font-bold">
        🔒
      </div>
      <div>
        <h2 class="text-xl font-black text-slate-900 tracking-tight">파트너 인증 필요</h2>
        <p class="text-xs text-slate-500 mt-1.5 leading-relaxed">
          상품 가격, 원가 및 인벤토리 재고 관리는 인가된 파트너 계정으로 로그인한 상태에서만 접근할 수 있습니다.
        </p>
      </div>
      <div class="pt-2">
        <NuxtLink
          to="/partner/login"
          class="w-full inline-block py-3 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs rounded-xl shadow-md transition"
        >
          파트너 로그인 바로가기 →
        </NuxtLink>
      </div>
    </div>
  </div>
</template>

