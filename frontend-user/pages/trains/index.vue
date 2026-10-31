<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useCurrencyStore } from '~/stores/currency'
import SearchAutocomplete from '~/components/SearchAutocomplete.vue'

const router = useRouter()
const currencyStore = useCurrencyStore()

type RailNetwork = 'KTX_SRT' | 'SHINKANSEN' | 'EUROSTAR' | 'CHINA_HSR'
const railNetwork = ref<RailNetwork>('KTX_SRT')

const depStation = ref('서울역 (Seoul)')
const arrStation = ref('부산역 (Busan)')
const trainDate = ref('2026-11-01')
const seatClass = ref('STANDARD')
const passengerCount = ref(1)

const handleSearch = () => {
  router.push({
    path: '/trains/search',
    query: {
      network: railNetwork.value,
      dep: depStation.value,
      arr: arrStation.value,
      date: trainDate.value,
      class: seatClass.value,
      passengers: passengerCount.value
    }
  })
}

const networkPresets: Record<RailNetwork, { dep: string; arr: string; placeholder: string }> = {
  KTX_SRT: { dep: '서울역 (Seoul)', arr: '부산역 (Busan)', placeholder: '한국 KTX / SRT 역' },
  SHINKANSEN: { dep: '도쿄역 (Tokyo)', arr: '신오사카역 (Shin-Osaka)', placeholder: '일본 신칸센 JR 역' },
  EUROSTAR: { dep: '런던 세인트 판크라스 (STP)', arr: '파리 북역 (Paris Nord)', placeholder: '유럽 유로스타 역' },
  CHINA_HSR: { dep: '상하이 홍차오 (Shanghai Hongqiao)', arr: '베이징 남역 (Beijing South)', placeholder: '중국 고속철 역' }
}

const selectNetwork = (net: RailNetwork) => {
  railNetwork.value = net
  depStation.value = networkPresets[net].dep
  arrStation.value = networkPresets[net].arr
}

const popularRoutes = [
  { network: '한국 KTX', from: '서울역', to: '부산역', duration: '2시간 15분', price: 59800, img: 'https://images.unsplash.com/photo-1548115184-bc6544d06a58?w=600' },
  { network: '한국 KTX', from: '서울역', to: '강릉역', duration: '1시간 40분', price: 27600, img: 'https://images.unsplash.com/photo-1534274988757-a28bf1a57c17?w=600' },
  { network: '일본 신칸센', from: '도쿄역', to: '신오사카역', duration: '2시간 28분 (노조미)', price: 135000, img: 'https://images.unsplash.com/photo-1503899036084-c55cdd92da26?w=600' },
  { network: '일본 신칸센', from: '도쿄역', to: '교토역', duration: '2시간 15분', price: 128000, img: 'https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?w=600' },
  { network: '유럽 유로스타', from: '런던 세인트 판크라스', to: '파리 북역', duration: '2시간 16분', price: 112000, img: 'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=600' },
  { network: '중국 고속철', from: '상하이 홍차오', to: '베이징 남역', duration: '4시간 28분 (푸싱호)', price: 115000, img: 'https://images.unsplash.com/photo-1508804185872-d7badad00f7d?w=600' }
]
</script>

<template>
  <div class="space-y-12 pb-16">
    <!-- 히어로 배너 & 기차 검색 바 -->
    <div class="relative bg-gradient-to-r from-emerald-950 via-trip-navy to-slate-900 text-white pt-12 pb-24 px-4 overflow-hidden">
      <div class="absolute -top-32 -right-32 w-80 h-80 bg-emerald-500/20 rounded-full blur-3xl pointer-events-none"></div>

      <div class="max-w-6xl mx-auto space-y-6 relative z-10">
        <div class="space-y-2">
          <span class="inline-block px-3 py-1 bg-white/10 backdrop-blur-md rounded-full text-xs font-bold text-emerald-200 border border-white/20">
            🚅 글로벌 고속철도 공식 실시간 예매처
          </span>
          <h1 class="text-3xl md:text-5xl font-black tracking-tight">
            전 세계 기차표 예약도 getfortrip
          </h1>
          <p class="text-sm md:text-base text-emerald-100 font-medium">
            한국 KTX·SRT, 일본 신칸센, 유럽 유로스타, 중국 고속철도 종이 티켓 없는 100% 모바일 QR 즉시 발권
          </p>
        </div>

        <!-- 기차표 검색 위젯 -->
        <div class="bg-white rounded-3xl p-6 shadow-2xl text-slate-800 border border-slate-100 space-y-4">
          <!-- 철도망 선택 탭 -->
          <div class="flex items-center gap-3 border-b border-slate-100 pb-3 overflow-x-auto no-scrollbar text-xs font-bold">
            <button
              @click="selectNetwork('KTX_SRT')"
              :class="['px-3 py-1.5 rounded-xl transition flex items-center gap-1.5', railNetwork === 'KTX_SRT' ? 'bg-trip-blue text-white shadow-sm' : 'bg-slate-50 text-slate-600 hover:bg-slate-100']"
            >
              <span>🇰🇷 한국 KTX / SRT</span>
            </button>
            <button
              @click="selectNetwork('SHINKANSEN')"
              :class="['px-3 py-1.5 rounded-xl transition flex items-center gap-1.5', railNetwork === 'SHINKANSEN' ? 'bg-trip-blue text-white shadow-sm' : 'bg-slate-50 text-slate-600 hover:bg-slate-100']"
            >
              <span>🇯🇵 일본 신칸센 / JR</span>
            </button>
            <button
              @click="selectNetwork('EUROSTAR')"
              :class="['px-3 py-1.5 rounded-xl transition flex items-center gap-1.5', railNetwork === 'EUROSTAR' ? 'bg-trip-blue text-white shadow-sm' : 'bg-slate-50 text-slate-600 hover:bg-slate-100']"
            >
              <span>🇪🇺 유럽 유로스타 / TGV</span>
            </button>
            <button
              @click="selectNetwork('CHINA_HSR')"
              :class="['px-3 py-1.5 rounded-xl transition flex items-center gap-1.5', railNetwork === 'CHINA_HSR' ? 'bg-trip-blue text-white shadow-sm' : 'bg-slate-50 text-slate-600 hover:bg-slate-100']"
            >
              <span>🇨🇳 중국 고속철 (HSR)</span>
            </button>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-12 gap-4">
            <!-- 출발역 / 도착역 -->
            <div class="md:col-span-5 grid grid-cols-2 gap-2">
              <div class="space-y-1">
                <label class="text-xs font-bold text-slate-400">출발역</label>
                <SearchAutocomplete
                  v-model="depStation"
                  domain="trains"
                  icon="train"
                  :placeholder="networkPresets[railNetwork].placeholder"
                  inputClass="w-full pl-10 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-trip-blue"
                />
              </div>
              <div class="space-y-1">
                <label class="text-xs font-bold text-slate-400">도착역</label>
                <SearchAutocomplete
                  v-model="arrStation"
                  domain="trains"
                  icon="train"
                  :placeholder="networkPresets[railNetwork].placeholder"
                  inputClass="w-full pl-10 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-trip-blue"
                />
              </div>
            </div>

            <!-- 탑승 날짜 -->
            <div class="md:col-span-3 space-y-1">
              <label class="text-xs font-bold text-slate-400">탑승 일자</label>
              <input
                v-model="trainDate"
                type="date"
                class="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-trip-blue"
              />
            </div>

            <!-- 좌석 등급 & 검색 버튼 -->
            <div class="md:col-span-4 space-y-1">
              <label class="text-xs font-bold text-slate-400">좌석 등급 / 승객</label>
              <div class="flex items-center gap-2">
                <select
                  v-model="seatClass"
                  class="flex-1 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-trip-blue cursor-pointer"
                >
                  <option value="STANDARD">일반실 (Standard)</option>
                  <option value="FIRST">특실 / 1등석 (First)</option>
                </select>
                <button
                  @click="handleSearch"
                  class="px-6 py-2.5 bg-trip-blue hover:bg-blue-600 text-white font-black text-sm rounded-xl shadow-md transition whitespace-nowrap"
                >
                  시간표 검색
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 인기 고속철도 노선 그리드 -->
    <div class="max-w-6xl mx-auto px-4 space-y-6">
      <div class="flex items-end justify-between">
        <div>
          <div class="flex items-center gap-2">
            <span class="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded text-[11px] font-black">TOP ROUTES</span>
            <h2 class="text-2xl font-black text-trip-navy tracking-tight">인기 글로벌 고속철도 노선</h2>
          </div>
          <p class="text-xs text-slate-500 mt-1">한국, 일본, 유럽, 중국 전 구간 실시간 좌석 예약</p>
        </div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
        <div
          v-for="r in popularRoutes"
          :key="r.to + r.from"
          class="bg-white rounded-3xl border border-slate-200/90 overflow-hidden shadow-sm hover:shadow-xl transition flex flex-col justify-between"
        >
          <div class="relative h-44 overflow-hidden bg-slate-100">
            <img :src="r.img" class="w-full h-full object-cover" />
            <div class="absolute top-3 left-3 bg-black/60 backdrop-blur-md text-white text-[10px] font-bold px-2 py-1 rounded-lg">
              {{ r.network }}
            </div>
            <div class="absolute bottom-3 right-3 bg-emerald-600 text-white text-[10px] font-bold px-2 py-1 rounded-lg">
              소요시간: {{ r.duration }}
            </div>
          </div>

          <div class="p-5 space-y-4">
            <div>
              <h3 class="text-lg font-black text-slate-900">
                {{ r.from }} → {{ r.to }}
              </h3>
              <div class="text-xs text-slate-400 mt-0.5">실시간 좌석 확인 및 즉시 예약 가능</div>
            </div>

            <div class="pt-3 border-t border-slate-100 flex items-center justify-between">
              <div>
                <span class="text-[10px] text-slate-400">편도 운임</span>
                <div class="text-xl font-black text-trip-blue font-mono">
                  {{ currencyStore.formatKRW(r.price) }}~
                </div>
              </div>
              <NuxtLink
                :to="`/trains/search?dep=${encodeURIComponent(r.from)}&arr=${encodeURIComponent(r.to)}`"
                class="px-4 py-2 bg-trip-blue hover:bg-blue-600 text-white font-bold text-xs rounded-xl shadow-md transition"
              >
                시간표 보기
              </NuxtLink>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 왜 getfortrip 기차표를 이용해야 할까요? -->
    <div class="max-w-6xl mx-auto px-4">
      <div class="bg-gradient-to-r from-emerald-50 via-teal-50 to-blue-50 border border-emerald-100 rounded-3xl p-8 grid grid-cols-1 md:grid-cols-3 gap-6">
        <div class="flex items-start gap-4">
          <div class="w-12 h-12 rounded-2xl bg-white shadow-sm border border-emerald-100 flex items-center justify-center text-2xl flex-shrink-0">
            📱
          </div>
          <div>
            <h4 class="font-black text-slate-900 text-sm">100% 모바일 e-티켓</h4>
            <p class="text-xs text-slate-500 mt-1">현장 매표소 대기 없이 모바일 QR코드로 게이트 즉시 통과</p>
          </div>
        </div>

        <div class="flex items-start gap-4">
          <div class="w-12 h-12 rounded-2xl bg-white shadow-sm border border-emerald-100 flex items-center justify-center text-2xl flex-shrink-0">
            💺
          </div>
          <div>
            <h4 class="font-black text-slate-900 text-sm">실시간 좌석 선택</h4>
            <p class="text-xs text-slate-500 mt-1">창가석, 복도석, 순방향 좌석 선호도 무료 반영</p>
          </div>
        </div>

        <div class="flex items-start gap-4">
          <div class="w-12 h-12 rounded-2xl bg-white shadow-sm border border-emerald-100 flex items-center justify-center text-2xl flex-shrink-0">
            🛡️
          </div>
          <div>
            <h4 class="font-black text-slate-900 text-sm">정식 철도청 연동 보증</h4>
            <p class="text-xs text-slate-500 mt-1">코레일, JR, 유로스타 공식 API 실시간 연동 보장</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
