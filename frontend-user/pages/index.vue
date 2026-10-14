<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useCurrencyStore } from '~/stores/currency'
import { useApiUrl } from '~/composables/useApi'

const currencyStore = useCurrencyStore()
const hotels = ref<any[]>([])
const moments = ref<any[]>([])

onMounted(async () => {
  try {
    const [hotelRes, momentRes] = await Promise.all([
      fetch(useApiUrl('/hotels')),
      fetch(useApiUrl('/moments'))
    ])
    const hotelJson = await hotelRes.json()
    const momentJson = await momentRes.json()
    hotels.value = hotelJson.data || []
    moments.value = momentJson.data || []
  } catch (e) {
    console.error(e)
  }
})
</script>

<template>
  <div>
    <!-- 히어로 배너 섹션 -->
    <div class="relative bg-gradient-to-r from-blue-900 via-trip-navy to-blue-800 text-white pt-20 pb-32 px-4 overflow-hidden">
      <div class="absolute -top-40 -right-40 w-96 h-96 bg-trip-blue/30 rounded-full blur-3xl pointer-events-none"></div>
      
      <div class="max-w-6xl mx-auto text-center space-y-3 relative z-10">
        <span class="inline-block px-3 py-1 bg-white/10 backdrop-blur-md rounded-full text-xs font-bold tracking-wider text-blue-200 border border-white/20 uppercase">
          ✈️ 2026 Global Mega Travel Season
        </span>
        <h1 class="text-4xl md:text-5xl font-black tracking-tight">
          전 세계 어디든, 트립닷컴과 함께
        </h1>
        <p class="text-base text-blue-100 font-medium">
          최저가 항공권, 특가 호텔, 기차표부터 현지 eSIM까지 한 번에 예약하세요.
        </p>
      </div>
    </div>

    <!-- 7대 도메인 통합 검색 위젯 -->
    <HomeSearchWidget />

    <!-- 프로모션 타임딜 배너 -->
    <div class="max-w-6xl mx-auto px-4 mt-16">
      <div class="bg-gradient-to-r from-orange-500 to-amber-500 rounded-3xl p-6 md:p-8 text-white flex flex-col md:flex-row items-center justify-between shadow-xl gap-4">
        <div class="space-y-1">
          <span class="px-2.5 py-0.5 bg-black/20 rounded-full text-[11px] font-black uppercase tracking-wider">
            ⚡ 타임딜 메가세일
          </span>
          <h3 class="text-2xl font-black">신규 회원 첫 예약 10% 웰컴 쿠폰 즉시 지급!</h3>
          <p class="text-xs text-orange-100 font-medium">코드 <code>WELCOME2026</code> 입력 시 전 세계 호텔 & 항공권 최대 30,000원 추가 할인</p>
        </div>
        <NuxtLink to="/deals" class="px-6 py-3 bg-white text-orange-600 font-black rounded-2xl hover:bg-orange-50 transition shadow-lg text-sm whitespace-nowrap">
          쿠폰 다운로드
        </NuxtLink>
      </div>
    </div>

    <!-- 인기 도시 카드 섹션 -->
    <div class="max-w-6xl mx-auto px-4 mt-16 space-y-6">
      <div class="flex items-end justify-between">
        <div>
          <h2 class="text-2xl font-black text-trip-navy tracking-tight">인기 여행지 추천</h2>
          <p class="text-xs text-slate-500 mt-1">지금 가장 많은 여행자가 떠나는 추천 도시</p>
        </div>
      </div>

      <div class="grid grid-cols-2 md:grid-cols-6 gap-4">
        <NuxtLink
          v-for="city in [
            { name: '서울', en: 'Seoul', img: 'https://images.unsplash.com/photo-1534274988757-a28bf1a57c17?w=400' },
            { name: '도쿄', en: 'Tokyo', img: 'https://images.unsplash.com/photo-1503899036084-c55cdd92da26?w=400' },
            { name: '오사카', en: 'Osaka', img: 'https://images.unsplash.com/photo-1590559899731-a372a146979d?w=400' },
            { name: '방콕', en: 'Bangkok', img: 'https://images.unsplash.com/photo-1508009603885-50cf7c579365?w=400' },
            { name: '파리', en: 'Paris', img: 'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=400' },
            { name: '다낭', en: 'Danang', img: 'https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=400' }
          ]"
          :key="city.name"
          :to="`/hotels/list?city=${city.name}`"
          class="group relative h-48 rounded-2xl overflow-hidden shadow-md"
        >
          <img :src="city.img" class="w-full h-full object-cover group-hover:scale-110 transition duration-500" />
          <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent flex flex-col justify-end p-3 text-white">
            <span class="text-base font-black">{{ city.name }}</span>
            <span class="text-[10px] text-slate-300 font-mono">{{ city.en }}</span>
          </div>
        </NuxtLink>
      </div>
    </div>

    <!-- 특가 호텔 리스트 (Trip.Best) -->
    <div class="max-w-6xl mx-auto px-4 mt-16 space-y-6">
      <div class="flex items-end justify-between">
        <div>
          <div class="flex items-center gap-2">
            <span class="text-amber-500 font-black text-sm">Trip.Best 2026</span>
            <span class="px-2 py-0.5 bg-amber-50 text-amber-700 rounded text-[10px] font-bold">인기 호텔 TOP</span>
          </div>
          <h2 class="text-2xl font-black text-trip-navy tracking-tight mt-0.5">최고 평점 럭셔리 호텔 특가</h2>
        </div>
        <NuxtLink to="/hotels/list" class="text-xs font-bold text-trip-blue hover:underline">
          전체 호텔 보기 →
        </NuxtLink>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-4 gap-6">
        <NuxtLink
          v-for="h in hotels.slice(0, 4)"
          :key="h.id"
          :to="`/hotels/${h.id}`"
          class="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-sm hover:shadow-xl transition group"
        >
          <div class="h-44 relative overflow-hidden">
            <img :src="h.thumbnail_url" class="w-full h-full object-cover group-hover:scale-105 transition duration-500" />
            <div class="absolute top-3 left-3 bg-trip-navy/80 backdrop-blur-md text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
              ★ {{ h.star_rating }}성급
            </div>
            <div class="absolute bottom-3 right-3 bg-trip-blue text-white text-[11px] font-black px-2 py-0.5 rounded-lg">
              {{ h.review_score }} / 5.0
            </div>
          </div>

          <div class="p-4 space-y-2">
            <div class="text-[11px] text-slate-400 font-semibold">{{ h.city }}, {{ h.country }}</div>
            <h4 class="font-black text-slate-900 text-sm line-clamp-1 group-hover:text-trip-blue transition">
              {{ h.name_ko }}
            </h4>
            <div class="flex items-center justify-between pt-2 border-t border-slate-100">
              <span class="text-[11px] text-slate-400 font-medium">1박 기준</span>
              <span class="text-base font-black text-trip-blue">
                {{ currencyStore.formatKRW(h.rooms?.[0]?.base_price_krw || 300000) }}
              </span>
            </div>
          </div>
        </NuxtLink>
      </div>
    </div>

    <!-- 트립 모먼트 커뮤니티 피드 프리뷰 -->
    <div class="max-w-6xl mx-auto px-4 mt-16 space-y-6">
      <div class="flex items-end justify-between">
        <div>
          <h2 class="text-2xl font-black text-trip-navy tracking-tight">여행자들의 생생한 트립 모먼트</h2>
          <p class="text-xs text-slate-500 mt-1">실제 여행자들이 공유하는 여행 사진과 필수 팁</p>
        </div>
        <NuxtLink to="/moments" class="text-xs font-bold text-trip-blue hover:underline">
          더 많은 모먼트 보기 →
        </NuxtLink>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div v-for="m in moments" :key="m.id" class="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm space-y-3">
          <div class="flex items-center gap-3">
            <img :src="m.user_avatar" class="w-9 h-9 rounded-full object-cover" />
            <div>
              <div class="text-xs font-bold text-slate-900">{{ m.user_name }}</div>
              <div class="text-[11px] text-slate-400">{{ m.city }} 여행기</div>
            </div>
          </div>
          <h4 class="font-bold text-slate-900 text-sm">{{ m.title }}</h4>
          <p class="text-xs text-slate-600 line-clamp-2 leading-relaxed">{{ m.content }}</p>
          <div class="flex gap-2">
            <img v-for="p in m.photos" :key="p" :src="p" class="w-24 h-16 rounded-xl object-cover" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
