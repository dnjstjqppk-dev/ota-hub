<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import SearchAutocomplete from './SearchAutocomplete.vue'

type TabType = 'hotels' | 'flights' | 'trains' | 'cars' | 'transfers' | 'activities' | 'packages'
const activeTab = ref<TabType>('hotels')

// 1. 숙소 상태값
const hotelCity = ref('도쿄')
const checkIn = ref('2026-11-01')
const checkOut = ref('2026-11-03')
const guests = ref({ adults: 2, rooms: 1 })

// 2. 항공권 상태값
const flightOrigin = ref('인천국제공항 (ICN)')
const flightDest = ref('도쿄 하네다 (HND)')
const flightDate = ref('2026-11-01')

// 3. 기차표 상태값
const trainDepart = ref('서울역 (Seoul)')
const trainArrival = ref('부산역 (Busan)')
const trainDate = ref('2026-11-01')

// 4. 렌터카 상태값
const carPickupLocation = ref('제주공항 렌터카 셔틀 스테이션')
const carPickupDate = ref('2026-11-01')
const carReturnDate = ref('2026-11-03')

// 5. 공항 픽업 상태값
const transferAirport = ref('인천국제공항 T1/T2')
const transferHotel = ref('명동 롯데호텔 서울')

// 6. 투어·티켓 / 액티비티 / eSIM 상태값
const activityKeyword = ref('유니버설 스튜디오 재팬 (USJ)')

// 7. 항공+호텔 패키지 상태값
const packageDest = ref('도쿄 (Tokyo)')

const router = useRouter()

const handleSearch = () => {
  if (activeTab.value === 'hotels') {
    router.push({
      path: '/hotels/list',
      query: {
        city: hotelCity.value,
        checkIn: checkIn.value,
        checkOut: checkOut.value,
        adults: guests.value.adults,
        rooms: guests.value.rooms
      }
    })
  } else if (activeTab.value === 'flights') {
    router.push({
      path: '/flights/search',
      query: {
        origin: flightOrigin.value,
        dest: flightDest.value,
        date: flightDate.value
      }
    })
  } else if (activeTab.value === 'trains') {
    router.push({
      path: '/trains/search',
      query: {
        dep: trainDepart.value,
        arr: trainArrival.value,
        date: trainDate.value
      }
    })
  } else if (activeTab.value === 'cars') {
    router.push({
      path: '/cars',
      query: {
        loc: carPickupLocation.value,
        pickup: carPickupDate.value,
        return: carReturnDate.value
      }
    })
  } else if (activeTab.value === 'transfers') {
    router.push({
      path: '/transfers',
      query: {
        airport: transferAirport.value,
        destination: transferHotel.value
      }
    })
  } else if (activeTab.value === 'activities') {
    router.push({
      path: '/things-to-do',
      query: {
        q: activityKeyword.value
      }
    })
  } else if (activeTab.value === 'packages') {
    router.push({
      path: '/packages/builder',
      query: {
        dest: packageDest.value
      }
    })
  }
}
</script>

<template>
  <div class="max-w-6xl mx-auto -mt-20 relative z-30 px-4">
    <div class="bg-white rounded-3xl shadow-2xl overflow-visible border border-slate-200/80">
      <!-- 7대 도메인 탭 스위처 -->
      <div class="flex border-b border-slate-100 bg-slate-50/80 overflow-x-auto scrollbar-none rounded-t-3xl">
        <button
          v-for="t in [
            { id: 'hotels', label: '숙소', icon: '🏨' },
            { id: 'flights', label: '항공권', icon: '✈️' },
            { id: 'trains', label: '기차표', icon: '🚄' },
            { id: 'cars', label: '렌터카', icon: '🚗' },
            { id: 'transfers', label: '공항픽업', icon: '🚐' },
            { id: 'activities', label: '투어·티켓', icon: '🎟️' },
            { id: 'packages', label: '항공+호텔', icon: '🏖️' }
          ]"
          :key="t.id"
          @click="activeTab = t.id as TabType"
          :class="[
            'flex items-center gap-2 px-6 py-4 font-bold text-sm transition-all whitespace-nowrap',
            activeTab === t.id
              ? 'bg-white text-blue-600 border-b-2 border-blue-600 shadow-sm'
              : 'text-slate-600 hover:text-blue-600'
          ]"
        >
          <span class="text-base">{{ t.icon }}</span>
          <span>{{ t.label }}</span>
        </button>
      </div>

      <!-- 동적 검색 폼 영역 -->
      <div class="p-6">
        <!-- 1. 숙소 (Hotels) 검색 폼 -->
        <div v-if="activeTab === 'hotels'" class="grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
          <div class="border border-slate-200 rounded-2xl p-2.5 hover:border-blue-500 transition-colors">
            <label class="text-[11px] font-bold text-slate-400 block mb-1">목적지 / 숙소명</label>
            <SearchAutocomplete
              v-model="hotelCity"
              domain="hotels"
              placeholder="도시, 랜드마크, 호텔명 검색"
              icon="search"
              inputClass="w-full font-bold text-slate-900 outline-none text-sm bg-transparent border-none pl-6 pr-2 py-0 focus:ring-0 shadow-none"
            />
          </div>

          <div class="border border-slate-200 rounded-2xl p-3 hover:border-blue-500 transition-colors">
            <label class="text-[11px] font-bold text-slate-400 block mb-0.5">체크인 - 체크아웃</label>
            <div class="flex items-center gap-2 text-sm font-bold text-slate-900">
              <input v-model="checkIn" type="date" class="outline-none text-xs font-bold bg-transparent" />
              <span>~</span>
              <input v-model="checkOut" type="date" class="outline-none text-xs font-bold bg-transparent" />
            </div>
          </div>

          <div class="border border-slate-200 rounded-2xl p-3 hover:border-blue-500 transition-colors">
            <label class="text-[11px] font-bold text-slate-400 block mb-0.5">인원 및 객실</label>
            <div class="text-sm font-bold text-slate-900">
              성인 {{ guests.adults }}명, 객실 {{ guests.rooms }}개
            </div>
          </div>

          <button
            @click="handleSearch"
            type="button"
            class="h-full min-h-[56px] bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-base rounded-2xl flex items-center justify-center gap-2 transition shadow-lg shadow-blue-500/30"
          >
            <span>호텔 검색</span>
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
          </button>
        </div>

        <!-- 2. 항공권 (Flights) 검색 폼 -->
        <div v-else-if="activeTab === 'flights'" class="grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
          <div class="border border-slate-200 rounded-2xl p-2.5 hover:border-blue-500 transition-colors">
            <label class="text-[11px] font-bold text-slate-400 block mb-1">출발지 (공항/도시)</label>
            <SearchAutocomplete
              v-model="flightOrigin"
              domain="flights"
              placeholder="출발 공항 또는 도시 (ICN, 서울)"
              icon="plane"
              inputClass="w-full font-bold text-slate-900 outline-none text-sm bg-transparent border-none pl-6 pr-2 py-0 focus:ring-0 shadow-none"
            />
          </div>

          <div class="border border-slate-200 rounded-2xl p-2.5 hover:border-blue-500 transition-colors">
            <label class="text-[11px] font-bold text-slate-400 block mb-1">도착지 (공항/도시)</label>
            <SearchAutocomplete
              v-model="flightDest"
              domain="flights"
              placeholder="도착 공항 또는 도시 (HND, NRT, 도쿄)"
              icon="plane"
              inputClass="w-full font-bold text-slate-900 outline-none text-sm bg-transparent border-none pl-6 pr-2 py-0 focus:ring-0 shadow-none"
            />
          </div>

          <div class="border border-slate-200 rounded-2xl p-3 hover:border-blue-500 transition-colors">
            <label class="text-[11px] font-bold text-slate-400 block mb-0.5">출발일</label>
            <input v-model="flightDate" type="date" class="w-full text-xs font-bold outline-none bg-transparent" />
          </div>

          <button
            @click="handleSearch"
            type="button"
            class="h-full min-h-[56px] bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-base rounded-2xl flex items-center justify-center gap-2 transition shadow-lg shadow-blue-500/30"
          >
            <span>항공권 검색</span>
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
          </button>
        </div>

        <!-- 3. 기차표 (Trains) 검색 폼 -->
        <div v-else-if="activeTab === 'trains'" class="grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
          <div class="border border-slate-200 rounded-2xl p-2.5 hover:border-blue-500 transition-colors">
            <label class="text-[11px] font-bold text-slate-400 block mb-1">출발역</label>
            <SearchAutocomplete
              v-model="trainDepart"
              domain="trains"
              placeholder="출발역 (서울역, 도쿄역)"
              icon="train"
              inputClass="w-full font-bold text-slate-900 outline-none text-sm bg-transparent border-none pl-6 pr-2 py-0 focus:ring-0 shadow-none"
            />
          </div>

          <div class="border border-slate-200 rounded-2xl p-2.5 hover:border-blue-500 transition-colors">
            <label class="text-[11px] font-bold text-slate-400 block mb-1">도착역</label>
            <SearchAutocomplete
              v-model="trainArrival"
              domain="trains"
              placeholder="도착역 (부산역, 신오사카역)"
              icon="train"
              inputClass="w-full font-bold text-slate-900 outline-none text-sm bg-transparent border-none pl-6 pr-2 py-0 focus:ring-0 shadow-none"
            />
          </div>

          <div class="border border-slate-200 rounded-2xl p-3 hover:border-blue-500 transition-colors">
            <label class="text-[11px] font-bold text-slate-400 block mb-0.5">탑승일</label>
            <input v-model="trainDate" type="date" class="w-full text-xs font-bold outline-none bg-transparent" />
          </div>

          <button
            @click="handleSearch"
            type="button"
            class="h-full min-h-[56px] bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-base rounded-2xl flex items-center justify-center gap-2 transition shadow-lg shadow-blue-500/30"
          >
            <span>열차표 검색</span>
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
          </button>
        </div>

        <!-- 4. 렌터카 (Cars) 검색 폼 -->
        <div v-else-if="activeTab === 'cars'" class="grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
          <div class="border border-slate-200 rounded-2xl p-2.5 hover:border-blue-500 transition-colors md:col-span-2">
            <label class="text-[11px] font-bold text-slate-400 block mb-1">인수 지점 (공항 / 주요 역 / 시내)</label>
            <SearchAutocomplete
              v-model="carPickupLocation"
              domain="cars"
              placeholder="인수 지점 검색 (제주공항, 나리타공항, 후쿠오카공항 등)"
              icon="car"
              inputClass="w-full font-bold text-slate-900 outline-none text-sm bg-transparent border-none pl-6 pr-2 py-0 focus:ring-0 shadow-none"
            />
          </div>

          <div class="border border-slate-200 rounded-2xl p-3 hover:border-blue-500 transition-colors">
            <label class="text-[11px] font-bold text-slate-400 block mb-0.5">대여 기간</label>
            <div class="flex items-center gap-1.5 text-xs font-bold text-slate-900">
              <input v-model="carPickupDate" type="date" class="outline-none text-[11px] font-bold bg-transparent" />
              <span>~</span>
              <input v-model="carReturnDate" type="date" class="outline-none text-[11px] font-bold bg-transparent" />
            </div>
          </div>

          <button
            @click="handleSearch"
            type="button"
            class="h-full min-h-[56px] bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-base rounded-2xl flex items-center justify-center gap-2 transition shadow-lg shadow-blue-500/30"
          >
            <span>렌터카 검색</span>
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
          </button>
        </div>

        <!-- 5. 공항 픽업 (Transfers) 검색 폼 -->
        <div v-else-if="activeTab === 'transfers'" class="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
          <div class="border border-slate-200 rounded-2xl p-2.5 hover:border-blue-500 transition-colors">
            <label class="text-[11px] font-bold text-slate-400 block mb-1">픽업 공항</label>
            <SearchAutocomplete
              v-model="transferAirport"
              domain="flights"
              placeholder="공항 검색 (인천공항, 김포공항, 하네다공항)"
              icon="plane"
              inputClass="w-full font-bold text-slate-900 outline-none text-sm bg-transparent border-none pl-6 pr-2 py-0 focus:ring-0 shadow-none"
            />
          </div>

          <div class="border border-slate-200 rounded-2xl p-2.5 hover:border-blue-500 transition-colors">
            <label class="text-[11px] font-bold text-slate-400 block mb-1">도착지 호텔 / 주소</label>
            <SearchAutocomplete
              v-model="transferHotel"
              domain="hotels"
              placeholder="도착 호텔 또는 랜드마크 검색"
              icon="search"
              inputClass="w-full font-bold text-slate-900 outline-none text-sm bg-transparent border-none pl-6 pr-2 py-0 focus:ring-0 shadow-none"
            />
          </div>

          <button
            @click="handleSearch"
            type="button"
            class="h-full min-h-[56px] bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-base rounded-2xl flex items-center justify-center gap-2 transition shadow-lg shadow-blue-500/30"
          >
            <span>픽업 차량 조회</span>
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
          </button>
        </div>

        <!-- 6. 투어·티켓 / 액티비티 / eSIM (Activities) 검색 폼 -->
        <div v-else-if="activeTab === 'activities'" class="grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
          <div class="border border-slate-200 rounded-2xl p-2.5 hover:border-blue-500 transition-colors md:col-span-3">
            <label class="text-[11px] font-bold text-slate-400 block mb-1">명소, 테마파크, 액티비티, 또는 데이터 eSIM</label>
            <SearchAutocomplete
              v-model="activityKeyword"
              domain="things-to-do"
              placeholder="유니버설 스튜디오, 디즈니랜드, 시부야 스카이, 일본 무제한 eSIM 등"
              icon="ticket"
              inputClass="w-full font-bold text-slate-900 outline-none text-sm bg-transparent border-none pl-6 pr-2 py-0 focus:ring-0 shadow-none"
            />
          </div>

          <button
            @click="handleSearch"
            type="button"
            class="h-full min-h-[56px] bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-base rounded-2xl flex items-center justify-center gap-2 transition shadow-lg shadow-blue-500/30"
          >
            <span>티켓 검색</span>
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
          </button>
        </div>

        <!-- 7. 항공+호텔 패키지 (Packages) 검색 폼 -->
        <div v-else-if="activeTab === 'packages'" class="grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
          <div class="border border-slate-200 rounded-2xl p-2.5 hover:border-blue-500 transition-colors md:col-span-3">
            <label class="text-[11px] font-bold text-slate-400 block mb-1">패키지 여행 목적지 (항공+호텔 결합 할인)</label>
            <SearchAutocomplete
              v-model="packageDest"
              domain="packages"
              placeholder="도쿄, 오사카, 다낭, 방콕 등 에어텔 추천 목적지"
              icon="search"
              inputClass="w-full font-bold text-slate-900 outline-none text-sm bg-transparent border-none pl-6 pr-2 py-0 focus:ring-0 shadow-none"
            />
          </div>

          <button
            @click="handleSearch"
            type="button"
            class="h-full min-h-[56px] bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-base rounded-2xl flex items-center justify-center gap-2 transition shadow-lg shadow-blue-500/30"
          >
            <span>패키지 찾기</span>
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
