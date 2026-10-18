<template>
  <div class="relative w-full" ref="containerRef">
    <!-- Search Input Field -->
    <div class="relative flex items-center">
      <span class="absolute left-3.5 text-slate-400 pointer-events-none flex items-center justify-center">
        <!-- Plane Icon -->
        <svg v-if="icon === 'plane'" class="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
        </svg>
        <!-- Train Icon -->
        <svg v-else-if="icon === 'train'" class="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 4h8l2 5H6l2-5zm0 0V2m8 2V2M5 9h14v7a2 2 0 01-2 2H7a2 2 0 01-2-2V9zm3 6h.01M16 15h.01M9 19l-2 2m8-2l2 2" />
        </svg>
        <!-- Car Icon -->
        <svg v-else-if="icon === 'car'" class="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" />
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0" />
        </svg>
        <!-- Ticket Icon -->
        <svg v-else-if="icon === 'ticket'" class="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
        </svg>
        <!-- Map Pin / Default Search -->
        <svg v-else class="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </span>

      <input
        v-model="internalValue"
        role="combobox"
        :aria-expanded="isOpen"
        aria-autocomplete="list"
        aria-haspopup="listbox"
        @focus="handleFocus"
        @input="handleInput"
        @keydown.down.prevent="navigateHighlight(1)"
        @keydown.up.prevent="navigateHighlight(-1)"
        @keydown.enter.prevent="selectHighlighted"
        @keydown.esc="isOpen = false"
        :placeholder="computedPlaceholder"
        :class="inputClass || 'w-full pl-11 pr-9 py-3 text-sm md:text-base font-semibold text-slate-800 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all shadow-sm'"
      />

      <!-- Clear Button (✕) -->
      <button
        v-if="internalValue"
        @click="clearInput"
        type="button"
        class="absolute right-3 p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>

    <!-- Autocomplete Popup Dropdown (getfortrip Style) -->
    <div
      v-if="isOpen"
      class="absolute left-0 right-0 top-full mt-2 bg-white rounded-2xl shadow-2xl border border-slate-100 z-50 overflow-hidden transition-all max-h-[460px] overflow-y-auto"
      style="box-shadow: 0 12px 36px -4px rgba(15, 23, 42, 0.16), 0 4px 12px -2px rgba(15, 23, 42, 0.08);"
    >
      <!-- [A] Empty State: 최근 검색 & 실시간 인기 여행지 -->
      <div v-if="!internalValue.trim()" class="p-4 space-y-4">
        <!-- 최근 검색어 섹션 -->
        <div v-if="recentSearches.length > 0">
          <div class="flex items-center justify-between text-xs font-bold text-slate-400 mb-2">
            <span class="flex items-center gap-1.5">
              <svg class="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              최근 검색 기록
            </span>
            <button @click="clearAllRecent" type="button" class="text-[11px] text-slate-400 hover:text-red-500 font-medium transition-colors">
              전체 삭제
            </button>
          </div>
          <div class="flex flex-wrap gap-2">
            <div
              v-for="(item, idx) in recentSearches"
              :key="idx"
              @click="handleItemSelect(item)"
              class="group inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-50 hover:bg-blue-50 text-slate-700 hover:text-blue-600 text-xs font-semibold cursor-pointer border border-slate-100 transition-all"
            >
              <span>{{ item.title }}</span>
              <button
                @click.stop="removeRecentItem(idx)"
                type="button"
                class="text-slate-300 group-hover:text-slate-500 hover:text-red-500 transition-colors ml-0.5"
              >
                &times;
              </button>
            </div>
          </div>
        </div>

        <!-- 인기 추천 목적지 섹션 (getfortrip Trending) -->
        <div>
          <div class="flex items-center gap-1.5 text-xs font-bold text-slate-400 mb-2.5">
            <span>🔥</span>
            <span>지금 가장 인기 있는 {{ domainLabel }} 목적지</span>
          </div>
          <div class="grid grid-cols-2 md:grid-cols-3 gap-2">
            <div
              v-for="item in domainPopularList"
              :key="item.id"
              @click="handleItemSelect(item)"
              class="flex items-center gap-2.5 p-2.5 rounded-xl hover:bg-slate-50 cursor-pointer transition-all border border-transparent hover:border-slate-100 group"
            >
              <div class="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center text-sm font-bold flex-shrink-0 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                <span v-if="item.type === 'city'">🏙️</span>
                <span v-else-if="item.type === 'airport'">✈️</span>
                <span v-else-if="item.type === 'station'">🚆</span>
                <span v-else-if="item.type === 'car'">🚗</span>
                <span v-else-if="item.type === 'activity'">🎟️</span>
                <span v-else>📍</span>
              </div>
              <div class="min-w-0">
                <div class="text-xs font-bold text-slate-800 truncate group-hover:text-blue-600 transition-colors">{{ item.title }}</div>
                <div class="text-[11px] text-slate-400 truncate">{{ item.count_info || item.subtitle }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- [B] Searching State: 실시간 자동완성 결과 -->
      <div v-else class="py-2">
        <div v-if="loading" class="p-6 text-center text-xs text-slate-400">
          <div class="animate-spin inline-block w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full mb-2"></div>
          <div>실시간 여행지를 찾고 있습니다...</div>
        </div>

        <div v-else-if="suggestions.length === 0" class="p-8 text-center text-slate-400 text-sm">
          <div class="text-2xl mb-2">🔍</div>
          <div class="font-medium text-slate-600">일치하는 여행지가 없습니다.</div>
          <div class="text-xs text-slate-400 mt-1">도시명(도쿄, 방콕), 공항 코드(ICN, NRT), 또는 호텔명을 입력해 보세요.</div>
        </div>

        <div v-else class="divide-y divide-slate-50">
          <div
            v-for="(item, idx) in suggestions"
            :key="item.id"
            @click="handleItemSelect(item)"
            :class="[
              'flex items-center justify-between px-4 py-3 cursor-pointer transition-all border-l-4',
              highlightIndex === idx ? 'bg-blue-50/90 border-blue-600' : 'hover:bg-slate-50 border-transparent'
            ]"
          >
            <div class="flex items-center gap-3 min-w-0">
              <!-- 카테고리 아이콘 배지 -->
              <div class="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-base" :class="getIconBgClass(item.type)">
                <span v-if="item.type === 'city'">🏙️</span>
                <span v-else-if="item.type === 'airport'">✈️</span>
                <span v-else-if="item.type === 'hotel'">🏨</span>
                <span v-else-if="item.type === 'station'">🚆</span>
                <span v-else-if="item.type === 'car'">🚗</span>
                <span v-else-if="item.type === 'activity'">🎟️</span>
                <span v-else-if="item.type === 'package'">📦</span>
                <span v-else>📍</span>
              </div>

              <!-- 타이틀 & 서브텍스트 & 배지 -->
              <div class="min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="text-sm font-bold text-slate-900" v-html="highlightMatch(item.title)"></span>
                  <span v-if="item.code" class="px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 text-[10px] font-extrabold uppercase">
                    {{ item.code }}
                  </span>
                  <span class="text-[10px] px-1.5 py-0.5 rounded font-medium" :class="getBadgeClass(item.type)">
                    {{ item.badge }}
                  </span>
                </div>
                <div class="text-xs text-slate-400 mt-0.5 truncate" v-html="highlightMatch(item.subtitle)"></div>
              </div>
            </div>

            <!-- 우측 통계 메타 (숙소 개수, 운항편 등) -->
            <div v-if="item.count_info" class="text-xs font-semibold text-blue-600 flex-shrink-0 ml-3">
              {{ item.count_info }}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useApiUrl } from '~/composables/useApi'

const props = withDefaults(defineProps<{
  modelValue?: string
  domain?: string // 'hotels' | 'flights' | 'trains' | 'cars' | 'things-to-do' | 'packages' | 'all'
  type?: string // fallback for domain prop
  placeholder?: string
  icon?: string // 'search' | 'plane' | 'train' | 'car' | 'ticket'
  inputClass?: string
  autoNavigate?: boolean
}>(), {
  modelValue: '',
  domain: '',
  type: '',
  icon: 'search',
  autoNavigate: false
})

const effectiveDomain = computed(() => props.domain || props.type || 'hotels')

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'select', item: any): void
  (e: 'select-code', code: string): void
}>()

const router = useRouter()
const internalValue = ref(props.modelValue)
const isOpen = ref(false)
const loading = ref(false)
const highlightIndex = ref(-1)
const suggestions = ref<any[]>([])
const containerRef = ref<HTMLElement | null>(null)

// Sync modelValue
watch(() => props.modelValue, (newVal) => {
  internalValue.value = newVal
})

const handleFocus = () => {
  isOpen.value = true
}

const handleInput = () => {
  emit('update:modelValue', internalValue.value)
}

const clearInput = () => {
  internalValue.value = ''
  emit('update:modelValue', '')
  suggestions.value = []
}

// 스마트 플레이스홀더 텍스트
const computedPlaceholder = computed(() => {
  if (props.placeholder) return props.placeholder
  switch (effectiveDomain.value) {
    case 'flights':
      return '도시명, 공항명, 또는 IATA 코드 (예: ICN, 도쿄, NRT)'
    case 'trains':
      return '출발역 또는 도착역 (예: 서울역, 부산역, 도쿄역)'
    case 'cars':
      return '인수 지점 (공항, KTX역, 시내 중심부)'
    case 'things-to-do':
      return '명소, 테마파크, 액티비티, eSIM (예: 유니버설, 디즈니)'
    case 'packages':
      return '항공+호텔 패키지 목적지 (예: 도쿄, 다낭, 방콕)'
    default:
      return '목적지, 도시, 랜드마크, 호텔명 (예: 도쿄, 신주쿠, 그레이스리)'
  }
})

const domainLabel = computed(() => {
  switch (effectiveDomain.value) {
    case 'flights': return '항공'
    case 'trains': return '열차'
    case 'cars': return '렌터카'
    case 'things-to-do': return '투어&티켓'
    case 'packages': return '패키지'
    default: return '추천'
  }
})

// 도메인별 큐레이션 인기 목적지 목록 (getfortrip 인기 지점)
const domainPopularList = computed(() => {
  switch (effectiveDomain.value) {
    case 'flights':
      return [
        { id: 'p-icn', title: '인천국제공항 (ICN)', subtitle: '대한민국 서울/인천', code: 'ICN', type: 'airport', badge: '인기 허브', count_info: '일일 320편', target_url: '/flights/search?dest=ICN' },
        { id: 'p-hnd', title: '도쿄 하네다 (HND)', subtitle: '일본 도쿄', code: 'HND', type: 'airport', badge: '인기 노선', count_info: '일일 125편', target_url: '/flights/search?dest=HND' },
        { id: 'p-kix', title: '오사카 간사이 (KIX)', subtitle: '일본 오사카', code: 'KIX', type: 'airport', badge: '인기 노선', count_info: '일일 110편', target_url: '/flights/search?dest=KIX' },
        { id: 'p-fuk', title: '후쿠오카 (FUK)', subtitle: '일본 규슈', code: 'FUK', type: 'airport', badge: '단거리 인기', count_info: '일일 75편', target_url: '/flights/search?dest=FUK' },
        { id: 'p-bkk', title: '방콕 수완나품 (BKK)', subtitle: '태국 방콕', code: 'BKK', type: 'airport', badge: '동남아 1위', count_info: '일일 160편', target_url: '/flights/search?dest=BKK' },
        { id: 'p-dad', title: '다낭 국제공항 (DAD)', subtitle: '베트남 다낭', code: 'DAD', type: 'airport', badge: '휴양지 직항', count_info: '일일 65편', target_url: '/flights/search?dest=DAD' },
      ]
    case 'trains':
      return [
        { id: 'pt-seoul', title: '서울역 (Seoul)', subtitle: '대한민국 KTX/경부선', code: 'KTX', type: 'station', badge: '환승역', count_info: 'KTX 출발', target_url: '/trains?dep=서울역' },
        { id: 'pt-busan', title: '부산역 (Busan)', subtitle: '대한민국 KTX 종착역', code: 'KTX', type: 'station', badge: '인기 종착역', count_info: 'KTX 종착', target_url: '/trains?arr=부산역' },
        { id: 'pt-tokyo', title: '도쿄역 (Tokyo)', subtitle: '일본 도카이도 신칸센', code: 'JR', type: 'station', badge: '신칸센', count_info: '도카이도선', target_url: '/trains?dep=도쿄역' },
        { id: 'pt-osa', title: '신오사카역 (Shin-Osaka)', subtitle: '일본 산요 신칸센', code: 'JR', type: 'station', badge: '신칸센', count_info: '간사이 중심', target_url: '/trains?arr=신오사카역' },
        { id: 'pt-daegu', title: '동대구역 (Dongdaegu)', subtitle: '대한민국 KTX/SRT', code: 'KTX', type: 'station', badge: '고속열차', count_info: 'KTX/SRT', target_url: '/trains?arr=동대구역' },
        { id: 'pt-kyoto', title: '교토역 (Kyoto)', subtitle: '일본 교토 JR', code: 'JR', type: 'station', badge: '관광 거점', count_info: '신칸센 정차', target_url: '/trains?arr=교토역' },
      ]
    case 'cars':
      return [
        { id: 'pc-icn', title: '인천국제공항 T1/T2 렌터카', subtitle: '대한민국 인천공항 터미널 지점', type: 'car', badge: '공항 픽업', count_info: '차량 120대+', target_url: '/cars?loc=인천공항' },
        { id: 'pc-cju', title: '제주공항 렌터카 셔틀 스테이션', subtitle: '대한민국 제주특별자치도', type: 'car', badge: '완전자차 포함', count_info: '차량 250대+', target_url: '/cars?loc=제주공항' },
        { id: 'pc-nrt', title: '나리타공항 렌터카 카운터', subtitle: '일본 나리타공항 제1/2터미널', type: 'car', badge: '공항 지점', count_info: 'ETC 카드 지원', target_url: '/cars?loc=나리타공항' },
        { id: 'pc-fuk', title: '후쿠오카공항 국제선 렌터카', subtitle: '일본 후쿠오카 하카타구', type: 'car', badge: '한국어 지원', count_info: '네비게이션 무료', target_url: '/cars?loc=후쿠오카공항' },
      ]
    case 'things-to-do':
      return [
        { id: 'pa-usj', title: '유니버설 스튜디오 재팬 (USJ)', subtitle: '일본 오사카 · 익스프레스 패스', type: 'activity', badge: '테마파크', count_info: '즉시 확정', target_url: '/things-to-do?q=유니버설' },
        { id: 'pa-disney', title: '도쿄 디즈니랜드 / 디즈니씨 1일권', subtitle: '일본 지바현 우라야스시', type: 'activity', badge: '테마파크', count_info: 'e-티켓 즉시 발권', target_url: '/things-to-do?q=디즈니랜드' },
        { id: 'pa-sky', title: '시부야 스카이 전망대 입장권', subtitle: '일본 도쿄 시부야 스크램블 최상층', type: 'activity', badge: '전망대', count_info: '일몰 인기', target_url: '/things-to-do?q=시부야스카이' },
        { id: 'pa-esim', title: '일본 매일 2GB+ 무제한 고속 eSIM', subtitle: 'Softbank/Docomo 로컬망', type: 'activity', badge: '베스트셀러', count_info: 'QR 3분 발송', target_url: '/things-to-do?category=esim' },
      ]
    case 'packages':
      return [
        { id: 'pp-tyo', title: '[항공+호텔] 도쿄 3박 4일 에어텔', subtitle: '왕복 항공권 + 시부야/신주쿠 호텔 패키지', code: 'TYO', type: 'package', badge: '인기 패키지', count_info: '최대 25% 할인', target_url: '/packages/builder?dest=도쿄' },
        { id: 'pp-osa', title: '[항공+호텔] 오사카 2박 3일 미식 에어텔', subtitle: '왕복 항공권 + 난바/도톤보리 호텔 패키지', code: 'OSA', type: 'package', badge: '인기 패키지', count_info: '최대 30% 할인', target_url: '/packages/builder?dest=오사카' },
        { id: 'pp-dad', title: '[항공+호텔] 다낭 4박 5일 풀빌라 패키지', subtitle: '국적기 직항 + 미케비치 5성급 리조트', code: 'DAD', type: 'package', badge: '휴양 패키지', count_info: '최대 35% 할인', target_url: '/packages/builder?dest=다낭' },
      ]
    default:
      // Hotels & General
      return [
        { id: 'ph-tyo', title: '도쿄 (Tokyo)', subtitle: '일본 간토 지방, 도쿄도', code: 'TYO', type: 'city', badge: '인기 1위', count_info: '숙소 2,450개', target_url: '/hotels/list?city=도쿄' },
        { id: 'ph-osa', title: '오사카 (Osaka)', subtitle: '일본 간사이 지방, 오사카부', code: 'OSA', type: 'city', badge: '인기 2위', count_info: '숙소 1,820개', target_url: '/hotels/list?city=오사카' },
        { id: 'ph-fuk', title: '후쿠오카 (Fukuoka)', subtitle: '일본 규슈 지방', code: 'FUK', type: 'city', badge: '인기 3위', count_info: '숙소 980개', target_url: '/hotels/list?city=후쿠오카' },
        { id: 'ph-sel', title: '서울 (Seoul)', subtitle: '대한민국 수도권', code: 'SEL', type: 'city', badge: '도심 호캉스', count_info: '숙소 3,120개', target_url: '/hotels/list?city=서울' },
        { id: 'ph-cju', title: '제주 (Jeju)', subtitle: '대한민국 제주특별자치도', code: 'CJU', type: 'city', badge: '휴양 1위', count_info: '숙소 1,450개', target_url: '/hotels/list?city=제주' },
        { id: 'ph-bkk', title: '방콕 (Bangkok)', subtitle: '태국 방콕', code: 'BKK', type: 'city', badge: '가성비 5성급', count_info: '숙소 3,400개', target_url: '/hotels/list?city=방콕' },
      ]
  }
})

// 최근 검색어 로컬스토리지 관리
const recentSearches = ref<any[]>([])
const recentStorageKey = computed(() => `gft_recent_${effectiveDomain.value || 'all'}`)

onMounted(() => {
  try {
    const saved = localStorage.getItem(recentStorageKey.value)
    if (saved) recentSearches.value = JSON.parse(saved)
  } catch (e) {}
})

const saveRecentSearch = (item: any) => {
  try {
    const existingIdx = recentSearches.value.findIndex(r => r.title === item.title)
    if (existingIdx !== -1) {
      recentSearches.value.splice(existingIdx, 1)
    }
    recentSearches.value.unshift({
      title: item.title,
      subtitle: item.subtitle,
      target_url: item.target_url,
      type: item.type,
      domain: item.domain || effectiveDomain.value
    })
    if (recentSearches.value.length > 8) recentSearches.value.pop()
    localStorage.setItem(recentStorageKey.value, JSON.stringify(recentSearches.value))
  } catch (e) {}
}

const removeRecentItem = (idx: number) => {
  recentSearches.value.splice(idx, 1)
  try {
    localStorage.setItem(recentStorageKey.value, JSON.stringify(recentSearches.value))
  } catch (e) {}
}

const clearAllRecent = () => {
  recentSearches.value = []
  try {
    localStorage.removeItem(recentStorageKey.value)
  } catch (e) {}
}

// 아이템 선택 핸들러
const handleItemSelect = (item: any) => {
  internalValue.value = item.title
  emit('update:modelValue', item.title)
  emit('select', item)
  if (item.code) {
    emit('select-code', item.code)
  }
  saveRecentSearch(item)
  isOpen.value = false

  if (props.autoNavigate && item.target_url) {
    router.push(item.target_url)
  }
}

// 매칭 문자열 HTML 안전 이스케이프 및 하이라이트
const escapeHtml = (unsafe: string): string => {
  return String(unsafe)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}

const highlightMatch = (text: string) => {
  if (!text) return ''
  const escapedText = escapeHtml(text)
  const q = internalValue.value ? internalValue.value.trim() : ''
  if (!q) return escapedText
  const escapedQ = escapeHtml(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regex = new RegExp(`(${escapedQ})`, 'gi')
  return escapedText.replace(regex, '<span class="text-blue-600 font-extrabold bg-blue-50/50 rounded px-0.5">$1</span>')
}

// 배지 및 아이콘 스타일 클래스
const getIconBgClass = (type: string) => {
  switch (type) {
    case 'city': return 'bg-blue-50 text-blue-600'
    case 'airport': return 'bg-sky-50 text-sky-600'
    case 'hotel': return 'bg-amber-50 text-amber-600'
    case 'station': return 'bg-indigo-50 text-indigo-600'
    case 'car': return 'bg-emerald-50 text-emerald-600'
    case 'activity': return 'bg-purple-50 text-purple-600'
    case 'package': return 'bg-pink-50 text-pink-600'
    default: return 'bg-slate-50 text-slate-600'
  }
}

const getBadgeClass = (type: string) => {
  switch (type) {
    case 'city': return 'bg-blue-50 text-blue-700'
    case 'airport': return 'bg-sky-50 text-sky-700'
    case 'hotel': return 'bg-amber-50 text-amber-700'
    case 'station': return 'bg-indigo-50 text-indigo-700'
    case 'car': return 'bg-emerald-50 text-emerald-700'
    case 'activity': return 'bg-purple-50 text-purple-700'
    case 'package': return 'bg-pink-50 text-pink-700'
    default: return 'bg-slate-100 text-slate-600'
  }
}

// 150ms Debounced 실시간 자동완성 검색 API (AbortController 레이스 방지)
let debounceTimer: any = null
let abortController: AbortController | null = null

onUnmounted(() => {
  clearTimeout(debounceTimer)
  if (abortController) {
    abortController.abort()
  }
})

watch(internalValue, (val) => {
  clearTimeout(debounceTimer)
  if (abortController) {
    abortController.abort()
    abortController = null
  }
  const q = val.trim()
  if (!q) {
    suggestions.value = []
    loading.value = false
    return
  }
  loading.value = true
  debounceTimer = setTimeout(async () => {
    abortController = new AbortController()
    try {
      const url = useApiUrl(`/search/suggest?q=${encodeURIComponent(q)}&domain=${effectiveDomain.value || ''}`)
      const res = await fetch(url, { signal: abortController.signal })
      if (res.ok) {
        const json = await res.json()
        suggestions.value = Array.isArray(json?.data) ? json.data : (Array.isArray(json) ? json : [])
      } else {
        throw new Error('API failed')
      }
    } catch (e: any) {
      if (e?.name === 'AbortError') return
      // 로컬 지능형 폴백 필터 (IATA 공항 코드 & 글로벌 랜드마크 종합 인덱스)
      const qLower = q.toLowerCase()
      const combined = [
        ...domainPopularList.value,
        { id: 'iata-icn', title: '인천국제공항 (ICN)', subtitle: '대한민국 서울/인천 Incheon Int Airport', code: 'ICN', type: 'airport', badge: '한국 허브', count_info: '일일 450편+', target_url: '/flights/search?dest=ICN' },
        { id: 'iata-gmp', title: '김포국제공항 (GMP)', subtitle: '대한민국 서울 Gimpo Airport', code: 'GMP', type: 'airport', badge: '도심 공항', count_info: '일일 180편', target_url: '/flights/search?dest=GMP' },
        { id: 'iata-cju', title: '제주국제공항 (CJU)', subtitle: '대한민국 제주특별자치도 Jeju Int Airport', code: 'CJU', type: 'airport', badge: '휴양지 허브', count_info: '일일 220편', target_url: '/flights/search?dest=CJU' },
        { id: 'iata-pus', title: '김해국제공항 (PUS)', subtitle: '대한민국 부산/영남 Gimhae Int Airport', code: 'PUS', type: 'airport', badge: '영남 허브', count_info: '일일 140편', target_url: '/flights/search?dest=PUS' },
        { id: 'iata-nrt', title: '도쿄 나리타국제공항 (NRT)', subtitle: '일본 도쿄/지바 Tokyo Narita Airport', code: 'NRT', type: 'airport', badge: '국제선 허브', count_info: '일일 280편', target_url: '/flights/search?dest=NRT' },
        { id: 'iata-hnd', title: '도쿄 하네다공항 (HND)', subtitle: '일본 도쿄도 Tokyo Haneda Airport', code: 'HND', type: 'airport', badge: '도심 공항', count_info: '일일 320편', target_url: '/flights/search?dest=HND' },
        { id: 'iata-kix', title: '오사카 간사이국제공항 (KIX)', subtitle: '일본 오사카/간사이 Kansai Int Airport', code: 'KIX', type: 'airport', badge: '간사이 중심', count_info: '일일 210편', target_url: '/flights/search?dest=KIX' },
        { id: 'iata-fuk', title: '후쿠오카공항 (FUK)', subtitle: '일본 규슈 후쿠오카 Fukuoka Airport', code: 'FUK', type: 'airport', badge: '단거리 인기', count_info: '일일 110편', target_url: '/flights/search?dest=FUK' },
        { id: 'iata-cts', title: '삿포로 신치토세공항 (CTS)', subtitle: '일본 홋카이도 New Chitose Airport', code: 'CTS', type: 'airport', badge: '설경 인기', count_info: '일일 90편', target_url: '/flights/search?dest=CTS' },
        { id: 'iata-oka', title: '오키나와 나하공항 (OKA)', subtitle: '일본 오키나와 Naha Airport', code: 'OKA', type: 'airport', badge: '휴양 섬', count_info: '일일 85편', target_url: '/flights/search?dest=OKA' },
        { id: 'iata-bkk', title: '방콕 수완나품국제공항 (BKK)', subtitle: '태국 방콕 Suvarnabhumi Airport', code: 'BKK', type: 'airport', badge: '동남아 허브', count_info: '일일 340편', target_url: '/flights/search?dest=BKK' },
        { id: 'iata-dad', title: '다낭국제공항 (DAD)', subtitle: '베트남 다낭 Da Nang Int Airport', code: 'DAD', type: 'airport', badge: '가족 휴양', count_info: '일일 95편', target_url: '/flights/search?dest=DAD' },
        { id: 'iata-sin', title: '싱가포르 창이국제공항 (SIN)', subtitle: '싱가포르 Singapore Changi Airport', code: 'SIN', type: 'airport', badge: '세계 1위', count_info: '일일 380편', target_url: '/flights/search?dest=SIN' },
        { id: 'iata-tpe', title: '타이베이 타오위안공항 (TPE)', subtitle: '대만 타이베이 Taoyuan Int Airport', code: 'TPE', type: 'airport', badge: '식도락 인기', count_info: '일일 160편', target_url: '/flights/search?dest=TPE' },
        { id: 'iata-cdg', title: '파리 샤를드골국제공항 (CDG)', subtitle: '프랑스 파리 Charles de Gaulle Airport', code: 'CDG', type: 'airport', badge: '유럽 관문', count_info: '일일 420편', target_url: '/flights/search?dest=CDG' },
        { id: 'iata-lhr', title: '런던 히드로공항 (LHR)', subtitle: '영국 런던 London Heathrow Airport', code: 'LHR', type: 'airport', badge: '유럽 최대', count_info: '일일 480편', target_url: '/flights/search?dest=LHR' },
        { id: 'iata-jfk', title: '뉴욕 존F케네디국제공항 (JFK)', subtitle: '미국 뉴욕 New York JFK Int Airport', code: 'JFK', type: 'airport', badge: '미주 대표', count_info: '일일 510편', target_url: '/flights/search?dest=JFK' },
        { id: 'iata-lax', title: '로스앤젤레스국제공항 (LAX)', subtitle: '미국 캘리포니아 Los Angeles Airport', code: 'LAX', type: 'airport', badge: '서부 거점', count_info: '일일 490편', target_url: '/flights/search?dest=LAX' },
        { id: 'lmk-eiffel', title: '에펠탑 (Eiffel Tower)', subtitle: '프랑스 파리 7구 상드마르스 공원 명소', type: 'activity', badge: '세계 랜드마크', count_info: '입장권 예약', target_url: '/things-to-do?q=에펠탑' },
        { id: 'lmk-louvre', title: '루브르 박물관 (Louvre Museum)', subtitle: '프랑스 파리 1구 세계 최대 미술관', type: 'activity', badge: '미술관/박물관', count_info: '패스트트랙', target_url: '/things-to-do?q=루브르' },
        { id: 'lmk-usj', title: '유니버설 스튜디오 재팬 (USJ)', subtitle: '일본 오사카 익스프레스 패스 테마파크', type: 'activity', badge: '초인기 명소', count_info: '즉시 확정', target_url: '/things-to-do?q=유니버설' },
        { id: 'lmk-disney', title: '도쿄 디즈니랜드 / 디즈니씨', subtitle: '일본 지바현 우라야스시 테마파크 e-티켓', type: 'activity', badge: '초인기 명소', count_info: 'e-티켓 즉시 발권', target_url: '/things-to-do?q=디즈니랜드' },
        { id: 'lmk-mbs', title: '마리나 베이 샌즈 스카이파크', subtitle: '싱가포르 마리나 베이 57층 인피니티풀 전망대', type: 'activity', badge: '도시 랜드마크', count_info: '전망대 입장권', target_url: '/things-to-do?q=마리나베이' }
      ]

      // Filter and deduplicate
      const seen = new Set<string>()
      suggestions.value = combined.filter(item => {
        const matches = 
          item.title.toLowerCase().includes(qLower) ||
          (item.subtitle && item.subtitle.toLowerCase().includes(qLower)) ||
          (item.code && item.code.toLowerCase().includes(qLower))
        if (!matches) return false
        if (seen.has(item.title)) return false
        seen.add(item.title)
        return true
      }).slice(0, 8)
    } finally {
      loading.value = false
      highlightIndex.value = -1
    }
  }, 150)
})

// 키보드 탐색 기능 (위/아래 방향키, Enter, ESC)
const navigateHighlight = (direction: number) => {
  if (!isOpen.value || suggestions.value.length === 0) return
  highlightIndex.value += direction
  if (highlightIndex.value < 0) {
    highlightIndex.value = suggestions.value.length - 1
  } else if (highlightIndex.value >= suggestions.value.length) {
    highlightIndex.value = 0
  }
}

const selectHighlighted = () => {
  if (highlightIndex.value >= 0 && highlightIndex.value < suggestions.value.length) {
    handleItemSelect(suggestions.value[highlightIndex.value])
  } else if (suggestions.value.length > 0) {
    handleItemSelect(suggestions.value[0])
  }
}

// 외부 클릭 시 드롭다운 닫기
const handleClickOutside = (e: MouseEvent) => {
  if (containerRef.value && !containerRef.value.contains(e.target as Node)) {
    isOpen.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

