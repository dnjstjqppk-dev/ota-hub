<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { apiUrl } from '../config/api'

const promotions = ref<any[]>([])
const loading = ref(false)

const fetchPromotions = async () => {
  loading.value = true
  try {
    const res = await fetch(apiUrl('/promotions'))
    const json = await res.json()
    promotions.value = json.data || []
  } catch (e) {
    console.error(e)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  fetchPromotions()
})
</script>

<template>
  <div class="p-8 space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-black text-slate-900 tracking-tight">마케팅 & 쿠폰 & 리워드 관리</h1>
        <p class="text-sm text-slate-500 mt-1">글로벌 프로모션 코드 발급, 트립코인 적립 배율 및 멤버십 혜택 관리</p>
      </div>
    </div>

    <!-- 쿠폰 목록 테이블 -->
    <div class="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
      <table class="w-full text-left text-sm">
        <thead class="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
          <tr>
            <th class="p-4">쿠폰 코드</th>
            <th class="p-4">프로모션 명</th>
            <th class="p-4">할인 유형</th>
            <th class="p-4">할인 혜택</th>
            <th class="p-4">최소 주문액 / 최대 할인</th>
            <th class="p-4">유효 기간</th>
            <th class="p-4 text-center">활성 상태</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          <tr v-for="p in promotions" :key="p.id" class="hover:bg-slate-50/70">
            <td class="p-4 font-mono font-bold text-trip-blue">{{ p.code }}</td>
            <td class="p-4 font-bold text-slate-900">{{ p.title }}</td>
            <td class="p-4">
              <span class="px-2 py-0.5 rounded bg-blue-50 text-blue-700 text-xs font-bold">{{ p.discount_type }}</span>
            </td>
            <td class="p-4 font-mono font-bold text-emerald-600">
              {{ p.discount_type === 'PERCENTAGE' ? `${p.discount_value}%` : `₩${p.discount_value.toLocaleString()}` }}
            </td>
            <td class="p-4 text-xs text-slate-600">
              최소 ₩{{ p.min_order_amount_krw.toLocaleString() }} / 최대 ₩{{ p.max_discount_krw.toLocaleString() }}
            </td>
            <td class="p-4 text-xs text-slate-400">
              {{ new Date(p.valid_from).toLocaleDateString() }} ~ {{ new Date(p.valid_until).toLocaleDateString() }}
            </td>
            <td class="p-4 text-center">
              <span :class="['px-2.5 py-1 rounded-full text-xs font-bold', p.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500']">
                {{ p.is_active ? '활성 (ACTIVE)' : '만료' }}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
