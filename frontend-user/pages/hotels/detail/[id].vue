<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useCurrencyStore } from '~/stores/currency'
import { useApiUrl } from '~/composables/useApi'

const route = useRoute()
const currencyStore = useCurrencyStore()

const hotel = ref<any>(null)
const loading = ref(true)

const fallbackHotelDetail = {
  id: 'htl_tokyo_01',
  name_ko: '그랜드 하얏트 도쿄 롯폰기 힐스',
  name_en: 'Grand Hyatt Tokyo Roppongi Hills',
  city: '도쿄',
  country: '일본',
  address: '도쿄도 미나토구 롯폰기 6-10-3',
  star_rating: 5,
  review_score: 4.9,
  review_count: 2180,
  neighborhood: '롯폰기 힐스 쇼핑가',
  subway_nearby: '지하철 롯폰기역 도보 3분',
  property_type: 'HOTEL',
  free_cancellation: true,
  free_breakfast: true,
  thumbnail_url: 'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=800',
  images: [
    'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=800',
    'https://images.unsplash.com/photo-1571003123894-1f0594d2b5d9?w=800',
    'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=800'
  ],
  amenities: ['실내 수영장', '무료 초고속 Wi-Fi', '24시간 피트니스 센터', '에비앙 럭셔리 스파', '미쉐린 스타 다이닝', '발레파킹 서비스'],
  rooms: [
    {
      id: 'rm_01',
      name_ko: '디럭스 킹 룸 (시티뷰)',
      bed_type: '킹베드 1개',
      max_occupancy: 2,
      room_size_sqm: 42,
      base_price_krw: 385000,
      breakfast_included: true,
      free_cancellation: true,
      available_inventory: 4
    },
    {
      id: 'rm_02',
      name_ko: '그랜드 클럽 이그제큐티브 스위트',
      bed_type: '슈퍼킹베드 1개 + 소파베드',
      max_occupancy: 3,
      room_size_sqm: 75,
      base_price_krw: 680000,
      breakfast_included: true,
      free_cancellation: true,
      available_inventory: 2
    }
  ],
  reviews: [
    { id: 'rev_1', author: '이** 여행자', rating: 5.0, date: '2026-10-10', comment: '위치, 룸 컨디션, 서비스 모두 최고였습니다. 롯폰기 힐스와 직결되어 쇼핑과 식사가 정말 편했습니다.' },
    { id: 'rev_2', author: 'Park S.H.', rating: 4.8, date: '2026-09-28', comment: '도쿄 타워 뷰가 환상적이고 조식 뷔페 퀄리티가 대단히 높습니다. 재방문 의사 100%입니다.' }
  ]
}

import { getHotelById } from '~/data/hotelCatalog'

onMounted(async () => {
  const hotelId = (route.params.id || route.query.hotelId || route.query.id || 'htl_tokyo_01') as string
  const catalogHotel = getHotelById(hotelId) || fallbackHotelDetail

  try {
    const res = await fetch(useApiUrl(`/hotels/${hotelId}`), { signal: AbortSignal.timeout(1500) })
    if (res.ok) {
      const json = await res.json()
      hotel.value = json.data ? { ...catalogHotel, ...json.data } : catalogHotel
    } else {
      hotel.value = catalogHotel
    }
  } catch (e) {
    hotel.value = catalogHotel
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div v-if="loading" class="max-w-6xl mx-auto px-4 py-24 text-center text-slate-400 font-bold">
    호텔 상세 정보를 실시간으로 불러오는 중입니다...
  </div>

  <div v-else-if="hotel" class="max-w-7xl mx-auto px-4 py-8 space-y-8">
    <!-- 1. 상단 브레드크럼 & 호텔 헤더 (Trip-style) -->
    <div>
      <div class="flex items-center gap-2 text-xs text-slate-400 mb-2">
        <NuxtLink to="/" class="hover:underline">홈</NuxtLink> <span>›</span>
        <NuxtLink to="/hotels/list" class="hover:underline">호텔 목록</NuxtLink> <span>›</span>
        <span>{{ hotel.city }}</span> <span>›</span>
        <span class="text-slate-800 font-bold truncate max-w-xs">{{ hotel.name_ko || hotel.name }}</span>
      </div>

      <div class="flex flex-wrap items-center gap-2 mb-2">
        <span class="text-amber-500 font-black text-sm">★ {{ hotel.star_rating }}성급 {{ hotel.property_type || 'HOTEL' }}</span>
        <span class="text-slate-400 text-xs">• {{ hotel.city }}, {{ hotel.country }}</span>
        <span class="px-2 py-0.5 bg-blue-50 text-blue-700 text-[10px] font-bold rounded">
          📍 {{ hotel.neighborhood || '도심 중심' }}
        </span>
      </div>

      <h1 class="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">{{ hotel.name_ko || hotel.name }}</h1>
      <p class="text-xs md:text-sm text-slate-400 font-medium mt-1">{{ hotel.name_en }} · {{ hotel.address }}</p>
    </div>

    <!-- 2. 모자이크 사진 갤러리 그리드 (Trip-style 1+2 레이아웃) -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-3 h-80 md:h-96 rounded-3xl overflow-hidden shadow-sm">
      <img :src="hotel.thumbnail_url || hotel.image_url" class="md:col-span-2 w-full h-full object-cover" />
      <div class="hidden md:grid grid-rows-2 gap-3 h-full">
        <img v-for="(img, idx) in (hotel.images?.length ? hotel.images.slice(0, 2) : [hotel.thumbnail_url || hotel.image_url])" :key="idx" :src="img" class="w-full h-full object-cover" />
      </div>
    </div>

    <!-- 3. 상세 평점 breakdown 카드 (Trip-style) -->
    <div class="bg-white rounded-3xl border border-slate-200/90 p-6 shadow-sm flex flex-col md:flex-row items-center justify-between gap-6">
      <div class="flex items-center gap-6">
        <div class="w-20 h-20 bg-trip-blue text-white rounded-2xl flex flex-col items-center justify-center font-black shadow-md flex-shrink-0">
          <span class="text-3xl font-mono">{{ hotel.score_overall?.toFixed(1) || hotel.rating?.toFixed(1) || '4.8' }}</span>
          <span class="text-[10px] tracking-wider text-blue-100 uppercase">최고 인기</span>
        </div>

        <div>
          <div class="text-base font-black text-slate-900">
            고객 후기 {{ hotel.review_count || 1280 }}개 분석 완료
          </div>
          <div class="text-xs text-slate-500 mt-1">
            "지하철역 도보 3분 거리로 접근성이 매우 뛰어나며 침구가 청결하고 프론트 직원이 매우 친절합니다."
          </div>
        </div>
      </div>

      <!-- 세부 항목별 평점 -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 w-full md:w-auto text-center border-t md:border-t-0 md:border-l border-slate-100 pt-4 md:pt-0 md:pl-6">
        <div class="space-y-1">
          <div class="text-xs text-slate-400 font-bold">청결도</div>
          <div class="text-sm font-black text-slate-800 font-mono">⭐ {{ hotel.score_cleanliness?.toFixed(1) || '4.9' }}</div>
        </div>
        <div class="space-y-1">
          <div class="text-xs text-slate-400 font-bold">위치 편의성</div>
          <div class="text-sm font-black text-slate-800 font-mono">⭐ {{ hotel.score_location?.toFixed(1) || '5.0' }}</div>
        </div>
        <div class="space-y-1">
          <div class="text-xs text-slate-400 font-bold">서비스 친절도</div>
          <div class="text-sm font-black text-slate-800 font-mono">⭐ {{ hotel.score_service?.toFixed(1) || '4.8' }}</div>
        </div>
        <div class="space-y-1">
          <div class="text-xs text-slate-400 font-bold">부대시설</div>
          <div class="text-sm font-black text-slate-800 font-mono">⭐ {{ hotel.score_facilities?.toFixed(1) || '4.7' }}</div>
        </div>
      </div>
    </div>

    <!-- 4. 객실 및 요금 플랜 매트릭스 (Sub-rate plan Matrix) -->
    <div class="space-y-4">
      <h2 class="text-2xl font-black text-slate-900 tracking-tight">객실 선택 및 요금제 비교</h2>

      <div class="space-y-6">
        <div
          v-for="room in hotel.rooms"
          :key="room.id"
          class="bg-white rounded-3xl border border-slate-200/90 overflow-hidden shadow-sm hover:shadow-md transition grid grid-cols-1 lg:grid-cols-12"
        >
          <!-- 객실 사진 & 스펙 -->
          <div class="lg:col-span-4 p-6 border-b lg:border-b-0 lg:border-r border-slate-100 space-y-4">
            <img :src="room.image_url" class="w-full h-48 object-cover rounded-2xl" />
            <div>
              <h3 class="text-lg font-black text-slate-900">{{ room.name }}</h3>
              <div class="mt-2 flex flex-wrap gap-2 text-xs text-slate-500 font-medium">
                <span class="px-2 py-0.5 bg-slate-100 rounded">🛏️ {{ room.bed_type }}</span>
                <span class="px-2 py-0.5 bg-slate-100 rounded">👥 최대 {{ room.max_guests }}인</span>
                <span class="px-2 py-0.5 bg-slate-100 rounded">📐 32m²</span>
              </div>
            </div>
          </div>

          <!-- 하위 요금제 매트릭스 테이블 (Trip-style) -->
          <div class="lg:col-span-8 p-6 flex flex-col justify-between space-y-4">
            <div class="space-y-3">
              <div class="text-xs font-bold text-slate-400">선택 가능한 요금제 옵션</div>

              <!-- 서브 플랜 1: 기본 플랜 (룸 온리) -->
              <div class="p-4 rounded-2xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50/50">
                <div class="space-y-1">
                  <div class="font-bold text-sm text-slate-800 flex items-center gap-2">
                    <span>룸 온리 (Room Only)</span>
                    <span class="text-[10px] px-2 py-0.5 bg-slate-200 text-slate-700 rounded font-bold">특가</span>
                  </div>
                  <div class="text-xs text-slate-400 space-y-0.5">
                    <div>• 식사 불포함</div>
                    <div class="text-emerald-600 font-semibold">• 체크인 2일 전 18:00까지 무료 취소</div>
                  </div>
                </div>

                <div class="text-right flex items-center justify-between sm:justify-end gap-4">
                  <div>
                    <div class="text-xl font-black text-slate-900 font-mono">
                      {{ currencyStore.formatKRW(room.base_price_krw) }}
                    </div>
                    <div class="text-[10px] text-slate-400">1박 / 세금 포함</div>
                  </div>
                  <NuxtLink
                    :to="`/hotels/booking?hotelId=${hotel.id}&roomId=${room.id}&rate=ROOM_ONLY`"
                    class="px-5 py-2.5 bg-trip-blue hover:bg-blue-600 text-white text-xs font-black rounded-xl shadow-md transition whitespace-nowrap"
                  >
                    예약하기
                  </NuxtLink>
                </div>
              </div>

              <!-- 서브 플랜 2: 조식 포함 + 무료 취소 플랜 -->
              <div class="p-4 rounded-2xl border-2 border-blue-500/30 bg-blue-50/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div class="space-y-1">
                  <div class="font-bold text-sm text-trip-navy flex items-center gap-2">
                    <span>🍳 뷔페 조식 2인 포함 + 무료 취소</span>
                    <span class="text-[10px] px-2 py-0.5 bg-blue-600 text-white rounded font-bold">인기 1위</span>
                  </div>
                  <div class="text-xs text-slate-500 space-y-0.5">
                    <div class="text-blue-700 font-bold">• 1층 레스토랑 인터내셔널 모닝 뷔페</div>
                    <div class="text-emerald-600 font-semibold">• 당일 오후 14:00까지 위약금 0원 무료 취소</div>
                  </div>
                </div>

                <div class="text-right flex items-center justify-between sm:justify-end gap-4">
                  <div>
                    <div class="text-xl font-black text-trip-blue font-mono">
                      {{ currencyStore.formatKRW(room.base_price_krw + 35000) }}
                    </div>
                    <div class="text-[10px] text-slate-400">1박 / 조식 & 세금 포함</div>
                  </div>
                  <NuxtLink
                    :to="`/hotels/booking?hotelId=${hotel.id}&roomId=${room.id}&rate=BREAKFAST_INCLUDED`"
                    class="px-5 py-2.5 bg-trip-blue hover:bg-blue-600 text-white text-xs font-black rounded-xl shadow-md transition whitespace-nowrap"
                  >
                    예약하기
                  </NuxtLink>
                </div>
              </div>
            </div>

            <div class="text-xs text-slate-400 flex items-center gap-2 pt-2">
              <span>⚡ 즉시 확정</span>
              <span>•</span>
              <span>호텔 현장 결제 옵션 지원</span>
              <span>•</span>
              <span>getfortrip 보상 적립 대상</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 5. 호텔 정책 & 부대시설 안내 -->
    <div class="bg-white rounded-3xl border border-slate-200/90 p-8 space-y-6">
      <h3 class="text-xl font-black text-slate-900 tracking-tight">호텔 이용 안내 및 정책</h3>
      
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs text-slate-600">
        <div class="space-y-2 p-4 bg-slate-50 rounded-2xl">
          <div class="font-bold text-slate-900 text-sm">🕒 체크인 / 체크아웃</div>
          <div>• 체크인: 15:00 이후</div>
          <div>• 체크아웃: 11:00 이전</div>
          <div class="text-slate-400">• 얼리 체크인은 당일 객실 현황에 따라 현장에서 요청 가능합니다.</div>
        </div>

        <div class="space-y-2 p-4 bg-slate-50 rounded-2xl">
          <div class="font-bold text-slate-900 text-sm">🛡️ 무료 취소 규정</div>
          <div class="text-emerald-700 font-bold">• 체크인 2일 전 18:00까지 전액 무료 취소</div>
          <div>• 기한 이후 취소 또는 노쇼 시 첫 1박 요금 부과</div>
          <div class="text-slate-400">• 마이페이지에서 셀프서비스로 즉시 취소 가능합니다.</div>
        </div>

        <div class="space-y-2 p-4 bg-slate-50 rounded-2xl">
          <div class="font-bold text-slate-900 text-sm">🏊 주요 부대시설</div>
          <div>• 실내/야외 인피니티 온수풀 (투숙객 무료)</div>
          <div>• 24시간 피트니스 센터 & 비즈니스 라운지</div>
          <div>• 전 객실 초고속 무료 Wi-Fi</div>
        </div>
      </div>
    </div>
  </div>
</template>
