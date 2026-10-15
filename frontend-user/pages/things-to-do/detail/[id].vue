<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useCurrencyStore } from '~/stores/currency'
import { useApiUrl } from '~/composables/useApi'

const route = useRoute()
const router = useRouter()
const currencyStore = useCurrencyStore()

const activity = ref<any>(null)
const loading = ref(true)

// Booking Options State
const selectedPackageId = ref<string>('')
const selectedDate = ref<string>(new Date(Date.now() + 86400000).toISOString().split('T')[0])
const adultCount = ref(1)
const childCount = ref(0)

const fetchActivityDetail = async () => {
  loading.value = true
  try {
    const id = route.params.id || route.query.activityId || route.query.id
    const res = await fetch(useApiUrl(`/activities/${id}`))
    const json = await res.json()
    activity.value = json.data
    if (activity.value?.packages?.length) {
      selectedPackageId.value = activity.value.packages[0].id
    }
  } catch (e) {
    console.error(e)
  } finally {
    loading.value = false
  }
}

const decreaseAdult = () => {
  if (adultCount.value > 1) adultCount.value--
}
const increaseAdult = () => {
  adultCount.value++
}
const decreaseChild = () => {
  if (childCount.value > 0) childCount.value--
}
const increaseChild = () => {
  childCount.value++
}

const activePackage = computed(() => {
  if (!activity.value?.packages) return null
  return activity.value.packages.find((p: any) => p.id === selectedPackageId.value) || activity.value.packages[0]
})

const calculateTotal = computed(() => {
  const base = activePackage.value?.price_krw || activity.value?.price_krw || 0
  const childPrice = base * 0.7
  return (adultCount.value * base) + (childCount.value * childPrice)
})

const goToBooking = () => {
  router.push({
    path: '/things-to-do/booking',
    query: {
      activityId: activity.value.id,
      packageId: selectedPackageId.value,
      date: selectedDate.value,
      adults: adultCount.value,
      children: childCount.value,
      total: calculateTotal.value
    }
  })
}

onMounted(() => {
  fetchActivityDetail()
})
</script>

<template>
  <div v-if="loading" class="max-w-6xl mx-auto px-4 py-24 text-center text-slate-400 font-bold">
    투어 및 액티비티 상세 정보를 실시간으로 불러오는 중입니다...
  </div>

  <div v-else-if="activity" class="max-w-7xl mx-auto px-4 py-8 space-y-8">
    <!-- 1. 상단 브레드크럼 & 헤더 -->
    <div>
      <div class="flex items-center gap-2 text-xs text-slate-400 mb-2">
        <NuxtLink to="/" class="hover:underline">홈</NuxtLink> <span>›</span>
        <NuxtLink to="/things-to-do" class="hover:underline">투어 & 액티비티</NuxtLink> <span>›</span>
        <span>{{ activity.city }}</span> <span>›</span>
        <span class="text-slate-800 font-bold truncate max-w-xs">{{ activity.title }}</span>
      </div>

      <div class="flex flex-wrap items-center gap-2 mb-2">
        <span class="px-2.5 py-0.5 bg-blue-600 text-white text-[10px] font-black rounded-md uppercase">
          {{ activity.category }}
        </span>
        <span v-if="activity.instant_confirmation" class="px-2 py-0.5 bg-emerald-50 text-emerald-700 text-[10px] font-bold rounded">
          ⚡ 즉시 확정
        </span>
        <span v-if="activity.free_cancellation" class="px-2 py-0.5 bg-blue-50 text-blue-700 text-[10px] font-bold rounded">
          ✓ 무료 취소 가능
        </span>
        <span class="text-slate-400 text-xs">📍 {{ activity.city }}, {{ activity.country }}</span>
      </div>

      <h1 class="text-2xl md:text-3xl font-black text-slate-900 tracking-tight leading-snug">
        {{ activity.title }}
      </h1>

      <div class="flex items-center gap-3 mt-2 text-xs">
        <span class="text-amber-500 font-black text-sm">★ {{ activity.review_score }}</span>
        <span class="text-slate-500 font-medium">실제 이용 고객 {{ activity.review_count?.toLocaleString() }}개의 검증된 후기</span>
      </div>
    </div>

    <!-- 2. 모자이크 사진 갤러리 (Trip-style 1+2 레이아웃) -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-3 h-80 md:h-96 rounded-3xl overflow-hidden shadow-sm">
      <img
        :src="activity.thumbnail_url"
        :alt="activity.title"
        class="md:col-span-2 w-full h-full object-cover"
      />
      <div class="hidden md:grid grid-rows-2 gap-3 h-full">
        <img
          src="https://images.unsplash.com/photo-1546707012-c46675f12716?w=800"
          class="w-full h-full object-cover"
        />
        <img
          src="https://images.unsplash.com/photo-1508248467877-aec1b08de376?w=800"
          class="w-full h-full object-cover"
        />
      </div>
    </div>

    <!-- 3. 메인 콘텐츠 그리드: 좌측 상세 정보 + 우측 플로팅 예약 카드 -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
      <div class="lg:col-span-2 space-y-8">
        <!-- 핵심 특장점 카드 (Highlights) -->
        <div class="bg-blue-50/70 p-6 rounded-2xl border border-blue-100 space-y-3">
          <h3 class="font-black text-sm text-blue-950 flex items-center gap-2">
            <span>✨</span> 이 상품을 선택해야 하는 핵심 이유
          </h3>
          <ul class="space-y-2">
            <li
              v-for="(h, idx) in activity.highlights"
              :key="idx"
              class="flex items-start gap-2.5 text-xs text-blue-900 leading-relaxed font-medium"
            >
              <span class="text-blue-600 font-bold mt-0.5">✔</span>
              <span>{{ h }}</span>
            </li>
          </ul>
        </div>

        <!-- 상품 설명 -->
        <div class="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-3">
          <h3 class="font-black text-base text-slate-900">상세 안내</h3>
          <p class="text-xs text-slate-600 leading-relaxed whitespace-pre-line">{{ activity.description }}</p>
        </div>

        <!-- 코스 일정 타임라인 (Itinerary) -->
        <div v-if="activity.itinerary?.length" class="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-6">
          <h3 class="font-black text-base text-slate-900">코스 타임라인 & 일정 안내</h3>
          <div class="relative border-l-2 border-blue-200 ml-3 space-y-6 pl-6">
            <div
              v-for="step in activity.itinerary"
              :key="step.step"
              class="relative"
            >
              <div class="absolute -left-[31px] top-0 w-4 h-4 rounded-full bg-blue-600 border-2 border-white shadow"></div>
              <div class="font-bold text-xs text-blue-600">{{ step.time }}</div>
              <div class="font-black text-sm text-slate-900 mt-0.5">{{ step.title }}</div>
              <div class="text-xs text-slate-500 mt-1">{{ step.desc }}</div>
            </div>
          </div>
        </div>

        <!-- 포함 & 불포함 내역 (Inclusions & Exclusions) -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="bg-emerald-50/60 p-5 rounded-2xl border border-emerald-100 space-y-2">
            <h4 class="font-bold text-xs text-emerald-900 flex items-center gap-1.5">
              <span>✓</span> 포함 사항
            </h4>
            <ul class="space-y-1 text-xs text-emerald-800">
              <li v-for="inc in activity.inclusions" :key="inc">• {{ inc }}</li>
            </ul>
          </div>

          <div class="bg-rose-50/60 p-5 rounded-2xl border border-rose-100 space-y-2">
            <h4 class="font-bold text-xs text-rose-900 flex items-center gap-1.5">
              <span>✕</span> 불포함 사항
            </h4>
            <ul class="space-y-1 text-xs text-rose-800">
              <li v-for="exc in activity.exclusions" :key="exc">• {{ exc }}</li>
            </ul>
          </div>
        </div>

        <!-- 이용 방법 (How to use) -->
        <div class="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-3">
          <h3 class="font-black text-base text-slate-900">바우처 이용 방법 및 수령 안내</h3>
          <div class="p-4 bg-slate-50 rounded-xl text-xs text-slate-700 leading-relaxed">
            {{ activity.how_to_use }}
          </div>
        </div>
      </div>

      <!-- 우측 플로팅 예약 카드 (Package Options Matrix & Price Calculator) -->
      <div class="sticky top-24 bg-white p-6 rounded-3xl border border-slate-200 shadow-xl space-y-5">
        <div class="flex items-baseline justify-between border-b border-slate-100 pb-4">
          <div>
            <span class="text-[11px] text-slate-400">1인 최저가</span>
            <div class="text-2xl font-black text-blue-600 font-mono">
              {{ currencyStore.formatKRW(activity.price_krw) }}
            </div>
          </div>
          <span class="text-xs text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded">
            ⚡ 즉시 발권 가능
          </span>
        </div>

        <!-- 날짜 선택 -->
        <div>
          <label class="text-xs font-bold text-slate-700 block mb-1.5">이용 날짜 선택</label>
          <input
            v-model="selectedDate"
            type="date"
            class="w-full px-4 py-2.5 text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>

        <!-- 패키지 옵션 라디오 선택 -->
        <div v-if="activity.packages?.length" class="space-y-2">
          <label class="text-xs font-bold text-slate-700 block">패키지 옵션 선택</label>
          <div
            v-for="pkg in activity.packages"
            :key="pkg.id"
            @click="selectedPackageId = pkg.id"
            :class="[
              'p-3.5 rounded-xl border text-xs cursor-pointer transition flex items-start justify-between gap-3',
              selectedPackageId === pkg.id
                ? 'border-blue-600 bg-blue-50/50 text-blue-900 ring-2 ring-blue-500/20'
                : 'border-slate-200 hover:border-slate-300 text-slate-700'
            ]"
          >
            <div>
              <div class="font-bold">{{ pkg.name }}</div>
              <div class="text-[10px] text-slate-500 mt-0.5">{{ pkg.desc }}</div>
            </div>
            <div class="text-right font-mono font-bold text-blue-600 whitespace-nowrap">
              {{ currencyStore.formatKRW(pkg.price_krw) }}
            </div>
          </div>
        </div>

        <!-- 수량 카운터 (성인 / 아동) -->
        <div class="space-y-3 pt-2 border-t border-slate-100">
          <div class="flex items-center justify-between text-xs">
            <div>
              <span class="font-bold text-slate-800">성인 (만 12세 이상)</span>
              <div class="text-[10px] text-slate-400">기본 요금 적용</div>
            </div>
            <div class="flex items-center gap-3">
              <button
                @click="decreaseAdult"
                class="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 font-bold text-slate-700 flex items-center justify-center"
              >
                -
              </button>
              <span class="font-mono font-bold w-4 text-center">{{ adultCount }}</span>
              <button
                @click="increaseAdult"
                class="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 font-bold text-slate-700 flex items-center justify-center"
              >
                +
              </button>
            </div>
          </div>

          <div class="flex items-center justify-between text-xs">
            <div>
              <span class="font-bold text-slate-800">어린이 (만 4~11세)</span>
              <div class="text-[10px] text-slate-400">30% 할인 적용</div>
            </div>
            <div class="flex items-center gap-3">
              <button
                @click="decreaseChild"
                class="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 font-bold text-slate-700 flex items-center justify-center"
              >
                -
              </button>
              <span class="font-mono font-bold w-4 text-center">{{ childCount }}</span>
              <button
                @click="increaseChild"
                class="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 font-bold text-slate-700 flex items-center justify-center"
              >
                +
              </button>
            </div>
          </div>
        </div>

        <!-- 총 결제 예정 금액 & 예약 버튼 -->
        <div class="pt-4 border-t border-slate-100 space-y-3">
          <div class="flex items-baseline justify-between">
            <span class="text-xs font-bold text-slate-600">총 결제 예정 금액</span>
            <span class="text-2xl font-black text-blue-600 font-mono">
              {{ currencyStore.formatKRW(calculateTotal) }}
            </span>
          </div>

          <button
            @click="goToBooking"
            class="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-black text-sm rounded-2xl shadow-lg shadow-blue-500/25 transition"
          >
            지금 예약하기 (Book Now)
          </button>

          <p class="text-[10px] text-center text-slate-400">
            예약 후 즉시 이메일과 카카오톡으로 모바일 바우처가 발송됩니다.
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
