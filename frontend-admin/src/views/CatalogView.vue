<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { apiUrl } from '../config/api'

const activeDomain = ref<'hotels' | 'flights' | 'trains' | 'cars' | 'activities' | 'packages'>('hotels')
const items = ref<any[]>([])
const loading = ref(false)

const fetchDomainItems = async () => {
  loading.value = true
  try {
    const res = await fetch(apiUrl(`/${activeDomain.value}`))
    const json = await res.json()
    items.value = json.data || []
  } catch (e) {
    console.error(e)
  } finally {
    loading.value = false
  }
}

const switchDomain = (dom: any) => {
  activeDomain.value = dom
  fetchDomainItems()
}

onMounted(() => {
  fetchDomainItems()
})
</script>

<template>
  <div class="p-8 space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-black text-slate-900 tracking-tight">상품 및 인벤토리 카탈로그 마스터</h1>
        <p class="text-sm text-slate-500 mt-1">7대 글로벌 OTA 도메인 실시간 상품 마스터 데이터 및 재고 제어</p>
      </div>
    </div>

    <!-- 도메인 스위처 탭 -->
    <div class="flex border-b border-slate-200 gap-2">
      <button
        v-for="d in [
          { id: 'hotels', label: '숙소 (Hotels)' },
          { id: 'flights', label: '항공권 (Flights)' },
          { id: 'trains', label: '기차표 (Trains)' },
          { id: 'cars', label: '렌터카 (Cars)' },
          { id: 'activities', label: '투어/티켓/eSIM' },
          { id: 'packages', label: '항공+호텔 패키지' }
        ]"
        :key="d.id"
        @click="switchDomain(d.id)"
        :class="[
          'px-5 py-3 text-sm font-bold border-b-2 transition-all',
          activeDomain === d.id
            ? 'border-trip-blue text-trip-blue bg-white'
            : 'border-transparent text-slate-500 hover:text-slate-800'
        ]"
      >
        {{ d.label }}
      </button>
    </div>

    <!-- 상품 목록 테이블 -->
    <div class="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
      <div v-if="loading" class="p-12 text-center text-slate-400">데이터 로딩 중...</div>
      
      <!-- 호텔 목록 -->
      <table v-else-if="activeDomain === 'hotels'" class="w-full text-left text-sm">
        <thead class="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
          <tr>
            <th class="p-4">호텔명</th>
            <th class="p-4">도시 / 국가</th>
            <th class="p-4">성급 / 평점</th>
            <th class="p-4">객실 수</th>
            <th class="p-4">편의시설</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          <tr v-for="h in items" :key="h.id" class="hover:bg-slate-50/70">
            <td class="p-4">
              <div class="font-bold text-slate-900">{{ h.name_ko }}</div>
              <div class="text-xs text-slate-400">{{ h.name_en }}</div>
            </td>
            <td class="p-4 text-slate-600 font-medium">{{ h.city }}, {{ h.country }}</td>
            <td class="p-4">
              <span class="text-amber-500 font-bold">★ {{ h.star_rating }}성급</span>
              <span class="text-slate-400 text-xs ml-1">({{ h.review_score }}점 / {{ h.review_count }}리뷰)</span>
            </td>
            <td class="p-4 font-mono font-bold text-blue-600">{{ h.rooms?.length || 0 }}개 타입</td>
            <td class="p-4">
              <div class="flex gap-1 flex-wrap">
                <span v-for="a in h.amenities" :key="a" class="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs rounded font-medium">
                  {{ a }}
                </span>
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      <!-- 항공 목록 -->
      <table v-else-if="activeDomain === 'flights'" class="w-full text-left text-sm">
        <thead class="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
          <tr>
            <th class="p-4">편명 / 항공사</th>
            <th class="p-4">구간</th>
            <th class="p-4">스케줄</th>
            <th class="p-4">클래스</th>
            <th class="p-4">기준 운임</th>
            <th class="p-4">잔여석</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          <tr v-for="f in items" :key="f.id" class="hover:bg-slate-50/70">
            <td class="p-4 font-bold text-slate-900">{{ f.flight_number }} ({{ f.airline_name }})</td>
            <td class="p-4 font-mono text-slate-700">{{ f.departure_airport }} → {{ f.arrival_airport }}</td>
            <td class="p-4 text-xs text-slate-600">{{ new Date(f.departure_time).toLocaleString() }}</td>
            <td class="p-4"><span class="px-2 py-0.5 bg-blue-50 text-blue-600 text-xs rounded font-bold">{{ f.cabin_class }}</span></td>
            <td class="p-4 font-mono font-bold text-slate-900">₩{{ f.base_price_krw.toLocaleString() }}</td>
            <td class="p-4 font-bold text-emerald-600">{{ f.available_seats }}석</td>
          </tr>
        </tbody>
      </table>

      <!-- 기타 도메인 -->
      <div v-else class="p-6">
        <pre class="bg-slate-900 text-emerald-400 p-4 rounded-xl text-xs overflow-x-auto">{{ JSON.stringify(items, null, 2) }}</pre>
      </div>
    </div>
  </div>
</template>
