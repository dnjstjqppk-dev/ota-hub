<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { apiUrl } from '../config/api'

const DEFAULT_MOMENTS = [
  {
    id: 'mm_01',
    user_name: '이지민 (여행 크리에이터)',
    user_avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200',
    city: '도쿄',
    title: '롯폰기 힐스에서 바라본 도쿄 타워 야경 & getfortrip 특가 호텔 솔직 후기',
    content: '도쿄 여행 때 그랜드 하얏트에 묵었는데 역과 바로 연결되어 쇼핑과 이동이 너무 편했어요! getfortrip 타임딜로 30% 할인받고 예약했습니다.',
    likes_count: 128,
    created_at: '2026-10-14T09:30:00Z',
    photos: [
      'https://images.unsplash.com/photo-1503899036084-c55cdd92da26?w=600',
      'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=600'
    ]
  },
  {
    id: 'mm_02',
    user_name: '박준형 (자유여행 매니아)',
    user_avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200',
    city: '오사카',
    title: '오사카 도톤보리와 난바역 직결 스위소텔 호캉스 브이로그',
    content: '간사이 공항에서 라피트로 환승 없이 난바역에 내려서 바로 체크인! 밤에는 도톤보리 글리코상 앞 산책까지 완벽한 동선이었습니다.',
    likes_count: 94,
    created_at: '2026-10-14T14:15:00Z',
    photos: [
      'https://images.unsplash.com/photo-1590559899731-a372a146979d?w=600',
      'https://images.unsplash.com/photo-1508009603885-50cf7c579365?w=600'
    ]
  },
  {
    id: 'mm_03',
    user_name: '최윤아 (포토그래퍼)',
    user_avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=200',
    city: '파리',
    title: '에펠탑 피크닉과 샹젤리제 거리 산책 코스 총정리',
    content: '파리 북역에서 유로스타 타고 도착하자마자 에펠탑으로 향했습니다. getfortrip eSIM 덕분에 파리 전역에서 5G 끊김 없이 구글맵을 이용했네요!',
    likes_count: 245,
    created_at: '2026-10-15T01:20:00Z',
    photos: [
      'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=600',
      'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=600'
    ]
  }
]

const moments = ref<any[]>(DEFAULT_MOMENTS)
const loading = ref(false)

const fetchMoments = async () => {
  loading.value = true
  try {
    const res = await fetch(apiUrl('/moments'))
    if (res.ok) {
      const json = await res.json()
      if (json.data && json.data.length > 0) {
        moments.value = json.data
      }
    }
  } catch (e) {
    // Keep DEFAULT_MOMENTS
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  fetchMoments()
})
</script>

<template>
  <div class="p-8 space-y-6">
    <div>
      <h1 class="text-2xl font-black text-slate-900 tracking-tight">커뮤니티 & getfortrip 모먼트 CMS</h1>
      <p class="text-sm text-slate-500 mt-1">사용자 작성 포토 리뷰, 숏폼 모먼트 피드 검수 및 피처드(Featured) 큐레이션</p>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div v-for="m in moments" :key="m.id" class="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm space-y-4">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <img :src="m.user_avatar" class="w-10 h-10 rounded-full object-cover border border-slate-200" />
            <div>
              <div class="text-sm font-bold text-slate-900">{{ m.user_name }}</div>
              <div class="text-xs text-slate-400 font-medium">{{ m.city }} 여행기 · {{ new Date(m.created_at).toLocaleDateString() }}</div>
            </div>
          </div>
          <span class="px-2.5 py-1 bg-amber-50 text-amber-600 rounded-full text-xs font-bold">
            ❤️ {{ m.likes_count }} 좋아요
          </span>
        </div>

        <div>
          <h4 class="font-bold text-slate-900 text-base mb-1">{{ m.title }}</h4>
          <p class="text-sm text-slate-600 leading-relaxed">{{ m.content }}</p>
        </div>

        <!-- 사진 목록 -->
        <div class="flex gap-2 overflow-x-auto">
          <img v-for="p in m.photos" :key="p" :src="p" class="w-28 h-20 rounded-xl object-cover border border-slate-100 flex-shrink-0" />
        </div>

        <div class="flex justify-end gap-2 pt-2 border-t border-slate-100">
          <button class="px-3 py-1.5 bg-emerald-50 text-emerald-700 text-xs font-bold rounded-lg hover:bg-emerald-100 transition">
            메인 피처드 승인
          </button>
          <button class="px-3 py-1.5 bg-rose-50 text-rose-700 text-xs font-bold rounded-lg hover:bg-rose-100 transition">
            스팸 블라인드
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
