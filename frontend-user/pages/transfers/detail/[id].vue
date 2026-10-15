<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useCurrencyStore } from '~/stores/currency'
import { useApiUrl } from '~/composables/useApi'

const route = useRoute()
const currencyStore = useCurrencyStore()

const fallbackTransfer = {
  id: 'tf_icn_van_01',
  airport_code: 'ICN',
  airport_name: '인천국제공항 제1/제2여객터미널',
  destination_zone: '서울 도심 (명동/중구/용산/강남) 전역',
  vehicle_tier: 'BUSINESS_VAN',
  vehicle_name: '비즈니스 밴 리무진 (Business Van)',
  vehicle_model_example: '현대 스타리아 라운지 리무진 / 기아 카니발 하이리무진',
  max_passengers: 6,
  max_luggage: 6,
  price_krw: 120000,
  free_waiting_mins: 60,
  flight_tracking: true,
  meet_and_greet: true,
  free_cancellation_hours: 24,
  image_url: 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?w=800',
  service_highlights: [
    '항공편 실시간 자동 추적: 항공기 조기 착륙 또는 지연 착륙 시 기사님이 착륙 시간에 맞춰 자동 대기',
    '입국장 무료 대기 60분: 비행기 착륙 시각부터 60분간 무료 대기 제공 (입국심사 및 수하물 수취 여유 보장)',
    '입국장 피켓 영접: 입국장 게이트 앞에서 고객님 성함이 적힌 네임보드를 든 전담 기사님 영접',
    '추가 요금 제로: 공항 고속도로 통행료, 주차료, 유류비 일체 포함 정찰제 요금',
    '무료 생수 및 스마트폰 초고속 충전기 구비'
  ],
  meeting_guide: '입국장 세관 통과 후 메인 로비로 나오시면, 입국 게이트 바로 앞에서 고객님의 영문 성함이 기재된 getforTrip 네임보드를 들고 계신 전담 기사님을 만나실 수 있습니다.'
}

const transfer = ref<any>(fallbackTransfer)
const loading = ref(false)

onMounted(async () => {
  try {
    const tfId = route.params.id || route.query.id || 'tf_icn_van_01'
    const res = await fetch(useApiUrl(`/transfers/${tfId}`))
    if (res.ok) {
      const json = await res.json()
      transfer.value = json.data ? { ...fallbackTransfer, ...json.data } : fallbackTransfer
    } else {
      transfer.value = fallbackTransfer
    }
  } catch (e) {
    transfer.value = fallbackTransfer
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div v-if="loading" class="max-w-6xl mx-auto px-4 py-24 text-center text-slate-400 font-bold">
    공항 픽업 차량 상세 정보를 불러오는 중입니다...
  </div>

  <div v-else-if="transfer" class="max-w-6xl mx-auto px-4 py-8 space-y-8">
    <!-- 상단 브레드크럼 -->
    <div>
      <div class="flex items-center gap-2 text-xs text-slate-400 mb-2">
        <NuxtLink to="/" class="hover:underline">홈</NuxtLink> <span>›</span>
        <NuxtLink to="/transfers" class="hover:underline">공항픽업</NuxtLink> <span>›</span>
        <NuxtLink to="/transfers/list" class="hover:underline">차량 목록</NuxtLink> <span>›</span>
        <span class="text-slate-800 font-bold">{{ transfer.vehicle_name }}</span>
      </div>

      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div class="flex items-center gap-2 mb-1">
            <span class="px-2.5 py-0.5 bg-cyan-50 text-cyan-700 text-xs font-bold rounded">
              {{ transfer.airport_name }} 전용 픽업
            </span>
          </div>
          <h1 class="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">
            {{ transfer.vehicle_model_example }}
          </h1>
          <p class="text-xs text-slate-500 mt-1">목적지: {{ transfer.destination_zone }}</p>
        </div>

        <div class="text-right">
          <span class="text-xs text-slate-400">차량 1대당 전용 운임 (총액)</span>
          <div class="text-3xl font-black text-cyan-600 font-mono">
            {{ currencyStore.formatKRW(transfer.price_krw) }}
          </div>
          <div class="text-[11px] text-slate-400">통행료/유류비/기사팁 일체 포함</div>
        </div>
      </div>
    </div>

    <!-- 차량 이미지 & 탑승 스펙 -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
      <img :src="transfer.image_url" class="w-full h-80 object-cover rounded-3xl border border-slate-200 shadow-md" />

      <div class="bg-white rounded-3xl border border-slate-200 p-6 md:p-8 shadow-sm space-y-6">
        <h2 class="text-lg font-black text-slate-900">차량 탑승 규정 & 수하물 허용량</h2>
        
        <div class="grid grid-cols-2 gap-4 text-xs">
          <div class="p-3 bg-slate-50 rounded-xl space-y-1">
            <span class="text-slate-400 block">최대 탑승 인원</span>
            <span class="font-black text-slate-800 text-sm">👥 최대 {{ transfer.max_passengers }}명</span>
          </div>
          <div class="p-3 bg-slate-50 rounded-xl space-y-1">
            <span class="text-slate-400 block">최대 수하물 적재</span>
            <span class="font-black text-slate-800 text-sm">🧳 28인치 캐리어 {{ transfer.max_luggage }}개</span>
          </div>
          <div class="p-3 bg-slate-50 rounded-xl space-y-1">
            <span class="text-slate-400 block">무료 대기 시간</span>
            <span class="font-black text-cyan-600 text-sm">착륙 후 {{ transfer.free_waiting_mins }}분 무료</span>
          </div>
          <div class="p-3 bg-slate-50 rounded-xl space-y-1">
            <span class="text-slate-400 block">무료 취소 기한</span>
            <span class="font-black text-emerald-600 text-sm">픽업 {{ transfer.free_cancellation_hours }}시간 전 무료</span>
          </div>
        </div>

        <div class="p-4 bg-cyan-50 border border-cyan-200 rounded-2xl text-xs space-y-1.5">
          <span class="font-bold text-cyan-900 flex items-center gap-1.5">
            📍 입국장 미팅 장소 안내
          </span>
          <p class="text-slate-700 leading-relaxed">{{ transfer.meeting_guide }}</p>
        </div>
      </div>
    </div>

    <!-- 픽업 서비스 특징 체크리스트 -->
    <div class="bg-white rounded-3xl border border-slate-200 p-6 md:p-8 shadow-sm space-y-4">
      <h2 class="text-lg font-black text-slate-900">포함 서비스 및 안심 보장 안내</h2>
      <ul class="space-y-3 text-xs text-slate-700">
        <li v-for="highlight in transfer.service_highlights" :key="highlight" class="flex items-start gap-2.5">
          <span class="text-cyan-600 font-bold text-sm">✓</span>
          <span>{{ highlight }}</span>
        </li>
      </ul>
    </div>

    <!-- 하단 예약 CTA -->
    <div class="bg-white rounded-3xl border border-slate-200 p-6 flex items-center justify-between gap-4 shadow-sm">
      <div>
        <span class="text-xs text-slate-400">편도 픽업 총액 요금</span>
        <div class="text-2xl md:text-3xl font-black text-cyan-600 font-mono">
          {{ currencyStore.formatKRW(transfer.price_krw) }}
        </div>
      </div>
      <NuxtLink
        :to="`/transfers/booking?vehicleId=${transfer.id}&price=${transfer.price_krw}`"
        class="px-8 py-4 bg-cyan-600 hover:bg-cyan-700 text-white font-black text-sm rounded-2xl shadow-lg transition"
      >
        이 차량 픽업 예약하기 →
      </NuxtLink>
    </div>
  </div>
</template>
