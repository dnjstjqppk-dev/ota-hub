<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { apiUrl } from '../config/api'

type DomainKey = 'hotels' | 'flights' | 'trains' | 'cars' | 'transfers' | 'activities' | 'packages' | 'curated'

const activeDomain = ref<DomainKey>('hotels')
const items = ref<any[]>([])
const loading = ref(false)
const searchQuery = ref('')
const selectedItem = ref<any | null>(null)
const isDetailOpen = ref(false)

const domains: { id: DomainKey; label: string; countBadge?: number }[] = [
  { id: 'hotels', label: '숙소 (Hotels)' },
  { id: 'flights', label: '항공권 (Flights)' },
  { id: 'trains', label: '기차표 (Trains)' },
  { id: 'cars', label: '렌터카 (Cars)' },
  { id: 'transfers', label: '공항 픽업 (Transfers)' },
  { id: 'activities', label: '투어/명소/eSIM' },
  { id: 'packages', label: '동적 패키지' },
  { id: 'curated', label: '5대 OTA AI 큐레이션 마스터' }
]

const fetchDomainItems = async () => {
  loading.value = true
  try {
    let endpoint = `/${activeDomain.value}`
    if (activeDomain.value === 'curated') {
      endpoint = '/curated/products'
    }
    const res = await fetch(apiUrl(endpoint))
    const json = await res.json()
    items.value = json.data || []
  } catch (e) {
    console.error(e)
    items.value = []
  } finally {
    loading.value = false
  }
}

const switchDomain = (dom: DomainKey) => {
  activeDomain.value = dom
  searchQuery.value = ''
  fetchDomainItems()
}

const openDetail = (item: any) => {
  selectedItem.value = JSON.parse(JSON.stringify(item))
  isDetailOpen.value = true
}

const closeDetail = () => {
  isDetailOpen.value = false
  selectedItem.value = null
}

const resyncWebhook = async (item: any) => {
  try {
    const res = await fetch(apiUrl(`/curated/products/${item.id}/sync-webhook`), { method: 'POST' })
    const json = await res.json()
    alert('travel-checkin 웹훅 재동기화 결과: ' + (json.code === 200 ? '성공' : '실패'))
    fetchDomainItems()
  } catch (e) {
    alert('웹훅 재동기화 오류: ' + String(e))
  }
}

onMounted(() => {
  fetchDomainItems()
})
</script>

<template>
  <div class="p-8 space-y-6">
    <!-- 헤더 -->
    <div class="flex items-center justify-between">
      <div>
        <div class="flex items-center gap-2">
          <span class="px-2.5 py-0.5 bg-blue-100 text-blue-700 text-xs font-black rounded-md">Trip-Architecture 1:1 Mapping</span>
          <h1 class="text-2xl font-black text-slate-900 tracking-tight">상품 및 인벤토리 카탈로그 마스터</h1>
        </div>
        <p class="text-sm text-slate-500 mt-1">글로벌 OTA 표준 UX/UI 규격에 맞춘 8대 도메인 실시간 상품 마스터 데이터 및 1:1 속성 제어</p>
      </div>

      <div class="flex items-center gap-3">
        <input
          v-model="searchQuery"
          type="text"
          placeholder="목록 내 실시간 검색..."
          class="px-4 py-2 text-xs bg-white border border-slate-200 rounded-xl w-64 focus:ring-2 focus:ring-blue-500 outline-none"
        />
        <button
          @click="fetchDomainItems"
          class="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition"
        >
          새로고침
        </button>
      </div>
    </div>

    <!-- 8대 도메인 스위처 탭 -->
    <div class="flex border-b border-slate-200 gap-1 overflow-x-auto pb-px">
      <button
        v-for="d in domains"
        :key="d.id"
        @click="switchDomain(d.id)"
        :class="[
          'px-4 py-3 text-xs font-bold border-b-2 transition-all whitespace-nowrap',
          activeDomain === d.id
            ? 'border-blue-600 text-blue-600 bg-white shadow-sm rounded-t-lg'
            : 'border-transparent text-slate-500 hover:text-slate-800'
        ]"
      >
        {{ d.label }}
      </button>
    </div>

    <!-- 상품 목록 테이블 카드 -->
    <div class="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
      <div v-if="loading" class="p-16 text-center text-slate-400 font-bold">
        카탈로그 데이터를 불러오는 중입니다...
      </div>

      <!-- 1. 숙소 (Hotels) 1:1 매핑 테이블 -->
      <table v-else-if="activeDomain === 'hotels'" class="w-full text-left text-xs">
        <thead class="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
          <tr>
            <th class="p-4">호텔명 (국문/영문)</th>
            <th class="p-4">위치 (도시/국가/상세주소)</th>
            <th class="p-4">성급 / 종합평점</th>
            <th class="p-4">유형 / 중심가 거리</th>
            <th class="p-4">세부 평점 (청결/위치/서비스/시설)</th>
            <th class="p-4">객실 타입</th>
            <th class="p-4 text-center">관리</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          <tr v-for="h in items" :key="h.id" class="hover:bg-slate-50/70 transition">
            <td class="p-4">
              <div class="font-bold text-slate-900">{{ h.name_ko }}</div>
              <div class="text-[11px] text-slate-400">{{ h.name_en }}</div>
            </td>
            <td class="p-4">
              <div class="font-semibold text-slate-700">{{ h.city }}, {{ h.country }}</div>
              <div class="text-[10px] text-slate-400 max-w-xs truncate">{{ h.address }}</div>
            </td>
            <td class="p-4">
              <span class="text-amber-500 font-bold">★ {{ h.star_rating }}성급</span>
              <span class="text-slate-500 ml-1">({{ h.review_score }}점 / {{ h.review_count }}리뷰)</span>
            </td>
            <td class="p-4">
              <span class="px-2 py-0.5 bg-slate-100 font-bold text-slate-700 rounded">{{ h.property_type || 'HOTEL' }}</span>
              <div class="text-[10px] text-slate-400 mt-0.5">중심가 {{ h.distance_to_center_km || 1.0 }}km</div>
            </td>
            <td class="p-4 font-mono text-[11px] text-slate-600">
              청결 {{ h.cleanliness_score || 4.8 }} · 위치 {{ h.location_score || 4.9 }} · 서비스 {{ h.service_score || 4.7 }}
            </td>
            <td class="p-4 font-mono font-bold text-blue-600">
              {{ h.rooms?.length || 0 }}개 룸타입
            </td>
            <td class="p-4 text-center">
              <button
                @click="openDetail(h)"
                class="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg text-xs transition"
              >
                1:1 상세 편집
              </button>
            </td>
          </tr>
        </tbody>
      </table>

      <!-- 2. 항공권 (Flights) 1:1 매핑 테이블 -->
      <table v-else-if="activeDomain === 'flights'" class="w-full text-left text-xs">
        <thead class="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
          <tr>
            <th class="p-4">편명 / 항공사</th>
            <th class="p-4">노선 구간</th>
            <th class="p-4">출발 / 도착 스케줄</th>
            <th class="p-4">경유 여부 / 시간대</th>
            <th class="p-4">좌석 등급 / 수하물</th>
            <th class="p-4">기준 운임</th>
            <th class="p-4 text-center">관리</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          <tr v-for="f in items" :key="f.id" class="hover:bg-slate-50/70 transition">
            <td class="p-4">
              <div class="font-bold text-slate-900">{{ f.flight_number }}</div>
              <div class="text-[11px] text-slate-400">{{ f.airline_name }} ({{ f.airline_code }})</div>
            </td>
            <td class="p-4 font-mono font-bold text-slate-800">
              {{ f.departure_airport }} ({{ f.departure_city }}) → {{ f.arrival_airport }} ({{ f.arrival_city }})
            </td>
            <td class="p-4 text-[11px] text-slate-600">
              <div>출발: {{ new Date(f.departure_time).toLocaleTimeString() }}</div>
              <div>도착: {{ new Date(f.arrival_time).toLocaleTimeString() }} ({{ f.duration_minutes }}분)</div>
            </td>
            <td class="p-4">
              <span :class="['px-2 py-0.5 rounded text-[10px] font-bold', f.stops === 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700']">
                {{ f.stops === 0 ? '직항' : f.stops + '회 경유' }}
              </span>
              <div class="text-[10px] text-slate-400 mt-0.5">{{ f.departure_time_slot || 'MORNING' }}</div>
            </td>
            <td class="p-4">
              <div class="font-bold text-blue-600">{{ f.cabin_class }}</div>
              <div class="text-[10px] text-slate-400">위탁 {{ f.free_baggage_kg || 23 }}kg 무료</div>
            </td>
            <td class="p-4 font-mono font-bold text-slate-900">
              ₩{{ f.base_price_krw.toLocaleString() }}
              <div class="text-[10px] text-emerald-600 font-semibold">{{ f.available_seats }}석 잔여</div>
            </td>
            <td class="p-4 text-center">
              <button
                @click="openDetail(f)"
                class="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg text-xs transition"
              >
                1:1 상세 편집
              </button>
            </td>
          </tr>
        </tbody>
      </table>

      <!-- 3. 기차표 (Trains) 1:1 매핑 테이블 -->
      <table v-else-if="activeDomain === 'trains'" class="w-full text-left text-xs">
        <thead class="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
          <tr>
            <th class="p-4">열차 번호 / 시스템</th>
            <th class="p-4">출발역 → 도착역</th>
            <th class="p-4">운행 시간 / 소요</th>
            <th class="p-4">좌석 등급</th>
            <th class="p-4">운임</th>
            <th class="p-4 text-center">관리</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          <tr v-for="t in items" :key="t.id" class="hover:bg-slate-50/70 transition">
            <td class="p-4">
              <span class="font-bold text-slate-900">{{ t.train_number }}</span>
              <span class="ml-1.5 px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded text-[10px] font-bold">{{ t.train_type }}</span>
            </td>
            <td class="p-4 font-semibold text-slate-800">{{ t.departure_station }} → {{ t.arrival_station }}</td>
            <td class="p-4 text-slate-600 text-[11px]">
              {{ new Date(t.departure_time).toLocaleTimeString() }} ~ {{ new Date(t.arrival_time).toLocaleTimeString() }} ({{ t.duration_minutes }}분)
            </td>
            <td class="p-4 font-bold text-slate-700">{{ t.seat_class }}</td>
            <td class="p-4 font-mono font-bold text-slate-900">₩{{ t.price_krw.toLocaleString() }}</td>
            <td class="p-4 text-center">
              <button @click="openDetail(t)" class="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg text-xs transition">
                1:1 상세
              </button>
            </td>
          </tr>
        </tbody>
      </table>

      <!-- 4. 렌터카 (Cars) 1:1 매핑 테이블 -->
      <table v-else-if="activeDomain === 'cars'" class="w-full text-left text-xs">
        <thead class="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
          <tr>
            <th class="p-4">차량 모델 / 업체</th>
            <th class="p-4">차종 / 변속기</th>
            <th class="p-4">인승</th>
            <th class="p-4">인수 장소</th>
            <th class="p-4">보험 포함</th>
            <th class="p-4">일일 렌트비</th>
            <th class="p-4 text-center">관리</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          <tr v-for="c in items" :key="c.id" class="hover:bg-slate-50/70 transition">
            <td class="p-4 font-bold text-slate-900">{{ c.vehicle_model }} ({{ c.company_name }})</td>
            <td class="p-4"><span class="px-2 py-0.5 bg-slate-100 rounded text-[10px] font-bold">{{ c.vehicle_type }}</span> / {{ c.transmission }}</td>
            <td class="p-4 font-semibold text-slate-700">{{ c.seats }}인승</td>
            <td class="p-4 text-slate-600">{{ c.pickup_location }}</td>
            <td class="p-4"><span class="text-emerald-600 font-bold">✓ 종합보험 포함</span></td>
            <td class="p-4 font-mono font-bold text-slate-900">₩{{ c.daily_price_krw.toLocaleString() }}</td>
            <td class="p-4 text-center">
              <button @click="openDetail(c)" class="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg text-xs transition">
                1:1 상세
              </button>
            </td>
          </tr>
        </tbody>
      </table>

      <!-- 5. 공항 픽업 (Transfers) 1:1 매핑 테이블 -->
      <table v-else-if="activeDomain === 'transfers'" class="w-full text-left text-xs">
        <thead class="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
          <tr>
            <th class="p-4">서비스명</th>
            <th class="p-4">공항 / 목적지</th>
            <th class="p-4">차량 등급</th>
            <th class="p-4">탑승 인원 / 수하물</th>
            <th class="p-4">편도 운임</th>
            <th class="p-4 text-center">관리</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          <tr v-for="tf in items" :key="tf.id" class="hover:bg-slate-50/70 transition">
            <td class="p-4 font-bold text-slate-900">{{ tf.service_title }}</td>
            <td class="p-4 font-semibold text-slate-800">{{ tf.airport_code }} ↔ {{ tf.destination_area }}</td>
            <td class="p-4 font-mono text-blue-600 font-bold">{{ tf.vehicle_class }}</td>
            <td class="p-4 text-slate-600">최대 {{ tf.max_passengers }}인 / 수하물 {{ tf.max_luggage }}개</td>
            <td class="p-4 font-mono font-bold text-slate-900">₩{{ tf.price_krw.toLocaleString() }}</td>
            <td class="p-4 text-center">
              <button @click="openDetail(tf)" class="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg text-xs transition">
                1:1 상세
              </button>
            </td>
          </tr>
        </tbody>
      </table>

      <!-- 6. 투어/명소/eSIM (Activities) 1:1 매핑 테이블 -->
      <table v-else-if="activeDomain === 'activities'" class="w-full text-left text-xs">
        <thead class="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
          <tr>
            <th class="p-4">상품명</th>
            <th class="p-4">카테고리 / 도시</th>
            <th class="p-4">소요시간 / 언어</th>
            <th class="p-4">바우처 규격</th>
            <th class="p-4">평점 / 리뷰</th>
            <th class="p-4">기준 가격</th>
            <th class="p-4 text-center">관리</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          <tr v-for="a in items" :key="a.id" class="hover:bg-slate-50/70 transition">
            <td class="p-4">
              <div class="font-bold text-slate-900 max-w-sm">{{ a.title }}</div>
              <div class="text-[10px] text-slate-400 mt-0.5">{{ a.highlights?.length || 0 }}개 핵심 특장점 등록됨</div>
            </td>
            <td class="p-4">
              <span class="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-[10px] font-bold">{{ a.category }}</span>
              <div class="text-[11px] text-slate-500 mt-0.5">{{ a.city }}, {{ a.country }}</div>
            </td>
            <td class="p-4 text-slate-600">
              <div>{{ a.duration_type || 'HALF_DAY' }}</div>
              <div class="text-[10px] text-slate-400">{{ a.guide_language === 'KO' ? '한국어 가이드' : a.guide_language }}</div>
            </td>
            <td class="p-4">
              <span class="px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded text-[10px] font-bold">{{ a.voucher_type || 'QR_CODE' }}</span>
              <div class="text-[10px] text-slate-400 mt-0.5">{{ a.instant_confirmation ? '즉시 확정' : '24h 확정' }}</div>
            </td>
            <td class="p-4 font-bold text-amber-500">
              ★ {{ a.review_score }} <span class="text-slate-400 font-normal">({{ a.review_count }})</span>
            </td>
            <td class="p-4 font-mono font-bold text-slate-900">
              ₩{{ a.price_krw.toLocaleString() }}
            </td>
            <td class="p-4 text-center">
              <button
                @click="openDetail(a)"
                class="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg text-xs transition"
              >
                1:1 상세 편집
              </button>
            </td>
          </tr>
        </tbody>
      </table>

      <!-- 7. 동적 패키지 (Packages) 1:1 매핑 테이블 -->
      <table v-else-if="activeDomain === 'packages'" class="w-full text-left text-xs">
        <thead class="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
          <tr>
            <th class="p-4">패키지 타이틀</th>
            <th class="p-4">목적지</th>
            <th class="p-4">연동 항공 / 호텔 ID</th>
            <th class="p-4">할인율</th>
            <th class="p-4">정가 → 결합 특가</th>
            <th class="p-4 text-center">관리</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          <tr v-for="pkg in items" :key="pkg.id" class="hover:bg-slate-50/70 transition">
            <td class="p-4 font-bold text-slate-900">{{ pkg.title }}</td>
            <td class="p-4 font-semibold text-slate-800">{{ pkg.destination_city }}</td>
            <td class="p-4 font-mono text-[10px] text-slate-500">
              <div>호텔: {{ pkg.hotel_id }}</div>
              <div>항공: {{ pkg.flight_id }}</div>
            </td>
            <td class="p-4"><span class="px-2 py-0.5 bg-rose-50 text-rose-600 font-black rounded">{{ pkg.package_discount_rate }}% OFF</span></td>
            <td class="p-4 font-mono">
              <div class="line-through text-slate-400 text-[11px]">₩{{ pkg.total_original_krw.toLocaleString() }}</div>
              <div class="font-bold text-blue-600 text-sm">₩{{ pkg.total_package_krw.toLocaleString() }}</div>
            </td>
            <td class="p-4 text-center">
              <button @click="openDetail(pkg)" class="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg text-xs transition">
                1:1 상세
              </button>
            </td>
          </tr>
        </tbody>
      </table>

      <!-- 8. 5대 OTA 크롤링 및 AI 큐레이션 마스터 1:1 매핑 테이블 -->
      <table v-else-if="activeDomain === 'curated'" class="w-full text-left text-xs">
        <thead class="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
          <tr>
            <th class="p-4">OTA 플랫폼</th>
            <th class="p-4">원본 상품 ID / 원본 타이틀</th>
            <th class="p-4">Gemini AI 생성 B2C 타이틀</th>
            <th class="p-4">기준 가격</th>
            <th class="p-4">최종 수익화 레퍼럴 딥링크</th>
            <th class="p-4">travel-checkin 동기화</th>
            <th class="p-4 text-center">관리</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          <tr v-for="p in items" :key="p.id" class="hover:bg-slate-50/70 transition">
            <td class="p-4">
              <span class="px-2.5 py-1 bg-slate-900 text-white font-black text-[10px] rounded-lg tracking-wider">
                {{ p.platform }}
              </span>
            </td>
            <td class="p-4">
              <div class="font-mono text-[10px] text-slate-400">ID: {{ p.source_product_id }}</div>
              <div class="font-semibold text-slate-800 line-clamp-1 max-w-xs">{{ p.original_title }}</div>
            </td>
            <td class="p-4">
              <div class="font-bold text-blue-700 line-clamp-1 max-w-sm">{{ p.curated_content?.b2c_title || '생성 대기 중' }}</div>
              <div class="text-[10px] text-slate-500 line-clamp-1">{{ p.curated_content?.one_line_summary }}</div>
            </td>
            <td class="p-4 font-mono font-bold text-slate-900">
              ₩{{ p.base_price_krw.toLocaleString() }}
            </td>
            <td class="p-4 font-mono text-[10px] text-slate-500 max-w-xs truncate">
              <a
                v-if="p.affiliate_referral?.final_referral_url"
                :href="p.affiliate_referral.final_referral_url"
                target="_blank"
                class="text-blue-600 underline font-semibold"
              >
                {{ p.affiliate_referral.final_referral_url }}
              </a>
              <span v-else class="text-slate-400">합성 대기</span>
            </td>
            <td class="p-4">
              <span :class="['px-2 py-0.5 rounded text-[10px] font-bold', p.curation_status === 'PUBLISHED' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700']">
                {{ p.curation_status }}
              </span>
            </td>
            <td class="p-4 text-center space-x-1 whitespace-nowrap">
              <button
                @click="openDetail(p)"
                class="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg text-[11px] transition"
              >
                상세
              </button>
              <button
                @click="resyncWebhook(p)"
                class="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-600 font-bold rounded-lg text-[11px] transition"
              >
                웹훅 재전송
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 1:1 데이터 상세 및 JSON 속성 인스펙터 Drawer / Modal -->
    <div
      v-if="isDetailOpen"
      class="fixed inset-0 z-50 flex items-center justify-end bg-slate-900/60 backdrop-blur-sm transition-opacity"
      @click.self="closeDetail"
    >
      <div class="bg-white w-full max-w-2xl h-full shadow-2xl overflow-y-auto p-8 flex flex-col justify-between">
        <div class="space-y-6">
          <div class="flex items-center justify-between border-b border-slate-200 pb-4">
            <div>
              <span class="px-2 py-0.5 bg-blue-100 text-blue-800 text-[10px] font-black rounded uppercase">{{ activeDomain }}</span>
              <h2 class="text-xl font-black text-slate-900 mt-1">1:1 데이터 스키마 속성 인스펙터</h2>
            </div>
            <button
              @click="closeDetail"
              class="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center font-bold text-slate-500"
            >
              ✕
            </button>
          </div>

          <!-- 주요 필드 1:1 폼 뷰 -->
          <div v-if="selectedItem" class="space-y-4">
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="text-[11px] font-bold text-slate-400 block mb-1">고유 식별자 (ID)</label>
                <input
                  :value="selectedItem.id"
                  disabled
                  class="w-full px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg text-slate-500"
                />
              </div>
              <div>
                <label class="text-[11px] font-bold text-slate-400 block mb-1">도시 / 국가 (Location)</label>
                <input
                  :value="`${selectedItem.city || selectedItem.destination_city || ''}, ${selectedItem.country || ''}`"
                  disabled
                  class="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-700"
                />
              </div>
            </div>

            <!-- AI 큐레이션 전용 속성 -->
            <div v-if="selectedItem.curated_content" class="p-4 bg-blue-50/60 rounded-xl border border-blue-200 space-y-3">
              <div class="text-xs font-black text-blue-900 flex items-center gap-1.5">
                <span>🤖</span> Gemini 2.5 AI B2C 큐레이션 결과
              </div>
              <div>
                <div class="text-[10px] font-bold text-blue-600">B2C 상품명</div>
                <div class="text-xs font-bold text-slate-900">{{ selectedItem.curated_content.b2c_title }}</div>
              </div>
              <div>
                <div class="text-[10px] font-bold text-blue-600">1줄 요약</div>
                <div class="text-xs text-slate-700">{{ selectedItem.curated_content.one_line_summary }}</div>
              </div>
              <div>
                <div class="text-[10px] font-bold text-blue-600">핵심 특장점 3선</div>
                <ul class="list-disc list-inside text-xs text-slate-700 space-y-0.5">
                  <li v-for="b in selectedItem.curated_content.key_benefits" :key="b">{{ b }}</li>
                </ul>
              </div>
            </div>

            <!-- 스키마 전체 JSON 1:1 매핑 덤프 -->
            <div>
              <label class="text-[11px] font-bold text-slate-400 block mb-1">데이터베이스 1:1 전체 엔티티 덤프 (JSON)</label>
              <pre class="bg-slate-900 text-emerald-400 p-4 rounded-xl text-xs font-mono overflow-x-auto max-h-96 leading-relaxed">{{ JSON.stringify(selectedItem, null, 2) }}</pre>
            </div>
          </div>
        </div>

        <div class="pt-6 border-t border-slate-200 flex items-center justify-end gap-3">
          <button
            @click="closeDetail"
            class="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
