<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { apiUrl } from '../config/api'

interface ProductRow {
  id: string
  title: string
  domain_type: string
  city: string
  base_price_krw: number
  is_active: number
}

const products = ref<ProductRow[]>([])
const loading = ref(false)
const isModalOpen = ref(false)

const newDomain = ref('HOTEL')
const newTitle = ref('')
const newCity = ref('서울')
const newPrice = ref(120000)
const submitLoading = ref(false)

const fetchProducts = async () => {
  loading.value = true
  try {
    const token = localStorage.getItem('getfortrip_partner_token')
    const res = await fetch(apiUrl('/partner/products'), {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (res.ok) {
      const json = await res.json()
      products.value = json.products || []
    }
  } catch (e) {
    console.error('Failed to load products', e)
  } finally {
    loading.value = false
  }
}

const handleCreateProduct = async () => {
  if (!newTitle.value) return
  submitLoading.value = true
  try {
    const token = localStorage.getItem('getfortrip_partner_token')
    const res = await fetch(apiUrl('/partner/products'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        domain: newDomain.value,
        title: newTitle.value,
        city: newCity.value,
        price: newPrice.value
      })
    })

    if (res.ok) {
      isModalOpen.value = false
      newTitle.value = ''
      await fetchProducts()
    } else {
      const err = await res.json()
      alert(err.error || '상품 등록에 실패했습니다.')
    }
  } catch (e: any) {
    alert(e.message || '오류가 발생했습니다.')
  } finally {
    submitLoading.value = false
  }
}

onMounted(() => {
  fetchProducts()
})
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div>
        <h1 class="text-2xl font-black tracking-tight text-slate-900 flex items-center gap-2">
          <span>파트너 공급 상품 관리</span>
          <span class="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
            총 {{ products.length }}개
          </span>
        </h1>
        <p class="text-sm text-slate-500 font-medium mt-1">
          귀사에서 GetForTrip 플랫폼에 공급 중인 상품 목록과 기본 요금을 관리합니다.
        </p>
      </div>
      <div>
        <button
          @click="isModalOpen = true"
          class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-black rounded-xl shadow-md shadow-blue-500/20 transition flex items-center gap-1.5"
        >
          <span>➕</span>
          <span>신규 상품 추가</span>
        </button>
      </div>
    </div>

    <!-- Product Table -->
    <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse text-xs">
          <thead>
            <tr class="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider">
              <th class="p-3.5">상품 ID</th>
              <th class="p-3.5">도메인</th>
              <th class="p-3.5">상품명</th>
              <th class="p-3.5">위치/도시</th>
              <th class="p-3.5">기본 기준 요금</th>
              <th class="p-3.5">판매 상태</th>
              <th class="p-3.5 text-right">관리</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 font-medium">
            <tr v-if="loading">
              <td colspan="7" class="p-8 text-center text-slate-400 font-bold">
                상품 목록을 불러오는 중입니다...
              </td>
            </tr>
            <tr v-else-if="products.length === 0">
              <td colspan="7" class="p-8 text-center text-slate-400 font-bold">
                등록된 공급 상품이 없습니다. 신규 상품을 등록해보세요.
              </td>
            </tr>
            <tr
              v-else
              v-for="p in products"
              :key="p.id"
              class="hover:bg-slate-50/80 transition"
            >
              <td class="p-3.5 font-mono text-slate-400">{{ p.id }}</td>
              <td class="p-3.5">
                <span class="px-2 py-0.5 rounded font-black text-[10px] bg-slate-100 text-slate-700">
                  {{ p.domain_type }}
                </span>
              </td>
              <td class="p-3.5 font-bold text-slate-900">{{ p.title }}</td>
              <td class="p-3.5 text-slate-600">{{ p.city }}</td>
              <td class="p-3.5 font-bold text-blue-600">
                {{ (p.base_price_krw || 0).toLocaleString() }}원
              </td>
              <td class="p-3.5">
                <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                  판매 중
                </span>
              </td>
              <td class="p-3.5 text-right">
                <router-link
                  to="/inventory"
                  class="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-bold text-[11px] transition inline-block"
                >
                  재고/캘린더 조정
                </router-link>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Create Product Modal -->
    <div
      v-if="isModalOpen"
      class="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
    >
      <div class="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-5">
        <div class="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 class="text-base font-black text-slate-900">신규 공급 상품 등록</h3>
          <button @click="isModalOpen = false" class="text-slate-400 hover:text-slate-600 font-bold text-sm">✕</button>
        </div>

        <form @submit.prevent="handleCreateProduct" class="space-y-4 text-xs">
          <div class="space-y-1">
            <label class="font-bold text-slate-700">카테고리</label>
            <select
              v-model="newDomain"
              class="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl font-bold text-slate-800 outline-none"
            >
              <option value="HOTEL">호텔 / 객실</option>
              <option value="CAR">렌터카 차량</option>
              <option value="ACTIVITY">투어 & 티켓</option>
            </select>
          </div>

          <div class="space-y-1">
            <label class="font-bold text-slate-700">상품명 (노출명) *</label>
            <input
              v-model="newTitle"
              type="text"
              required
              placeholder="예: 디럭스 더블룸 (시티뷰 조식포함)"
              class="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl font-medium outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div class="space-y-1">
              <label class="font-bold text-slate-700">도시 / 지역</label>
              <input
                v-model="newCity"
                type="text"
                required
                class="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl font-medium outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div class="space-y-1">
              <label class="font-bold text-slate-700">기본 1박/1일 요금 (KRW)</label>
              <input
                v-model.number="newPrice"
                type="number"
                step="1000"
                required
                class="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl font-bold text-slate-900 outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div class="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              @click="isModalOpen = false"
              class="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl font-bold"
            >
              취소
            </button>
            <button
              type="submit"
              :disabled="submitLoading"
              class="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black shadow-md disabled:opacity-50"
            >
              {{ submitLoading ? '등록 중...' : '상품 등록 완료' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

