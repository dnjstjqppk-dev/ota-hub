<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useApiUrl } from '~/composables/useApi'

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
  },
  {
    id: 'mm_04',
    user_name: '강태석 (배낭여행가)',
    user_avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200',
    city: '방콕',
    title: '방콕 왓아룬 선셋 뷰 카페와 카오산 로드 나이트 라이프',
    content: '수완나품 공항에서 getfortrip 공항 픽업 차량으로 호텔까지 30분 만에 쾌적하게 이동했습니다. 무더운 날씨에 에어컨 빵빵한 전용차량이 신의 한 수!',
    likes_count: 172,
    created_at: '2026-10-15T05:40:00Z',
    photos: [
      'https://images.unsplash.com/photo-1508009603885-50cf7c579365?w=600',
      'https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=600'
    ]
  }
]

const moments = ref<any[]>(DEFAULT_MOMENTS)
const loading = ref(false)

const showWriteModal = ref(false)
const newTitle = ref('')
const newCity = ref('도쿄')
const newContent = ref('')

const fetchMoments = async () => {
  loading.value = true
  try {
    const res = await fetch(useApiUrl('/moments'))
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

const submitMoment = async () => {
  if (!newTitle.value || !newContent.value) return
  const newMoment = {
    id: 'mm_' + Date.now(),
    user_name: '김여행 (나)',
    user_avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200',
    city: newCity.value,
    title: newTitle.value,
    content: newContent.value,
    photos: ['https://images.unsplash.com/photo-1503899036084-c55cdd92da26?w=800'],
    likes_count: 1,
    created_at: new Date().toISOString()
  }
  try {
    await fetch(useApiUrl('/moments'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newMoment)
    })
  } catch (e) {}
  moments.value.unshift(newMoment)
  showWriteModal.value = false
  newTitle.value = ''
  newContent.value = ''
}

onMounted(() => {
  fetchMoments()
})
</script>

<template>
  <div class="max-w-6xl mx-auto px-4 py-8 space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-3xl font-black text-slate-900 tracking-tight">여행 모먼트 (getfortrip Moments)</h1>
        <p class="text-sm text-slate-500 mt-1">전 세계 여행자들의 생생한 여행 기록, 꿀팁 및 포토 커뮤니티</p>
      </div>

      <button
        @click="showWriteModal = true"
        class="px-5 py-2.5 bg-trip-blue hover:bg-trip-hover text-white text-xs font-bold rounded-xl shadow-md flex items-center gap-2"
      >
        <span>✍️</span> 모먼트 작성하기
      </button>
    </div>

    <!-- 피드 그리드 -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div v-for="m in moments" :key="m.id" class="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-sm space-y-4">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <img :src="m.user_avatar" class="w-10 h-10 rounded-full object-cover border border-slate-200" />
            <div>
              <div class="font-bold text-slate-900 text-sm">{{ m.user_name }}</div>
              <div class="text-xs text-slate-400">{{ m.city }} 여행기 · {{ new Date(m.created_at).toLocaleDateString() }}</div>
            </div>
          </div>
          <span class="px-3 py-1 bg-rose-50 text-rose-600 rounded-full text-xs font-bold">
            ❤️ {{ m.likes_count }}
          </span>
        </div>

        <div>
          <h3 class="font-black text-slate-900 text-base mb-1">{{ m.title }}</h3>
          <p class="text-xs text-slate-600 leading-relaxed">{{ m.content }}</p>
        </div>

        <div class="flex gap-2">
          <img v-for="p in m.photos" :key="p" :src="p" class="w-32 h-24 rounded-2xl object-cover" />
        </div>
      </div>
    </div>

    <!-- 작성 모달 -->
    <div v-if="showWriteModal" class="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div class="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-4">
        <h3 class="text-lg font-black text-slate-900">새 여행 모먼트 작성</h3>
        
        <div class="space-y-3">
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">여행 도시</label>
            <input v-model="newCity" type="text" class="w-full p-2.5 border border-slate-300 rounded-xl text-xs font-bold" />
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">제목</label>
            <input v-model="newTitle" type="text" class="w-full p-2.5 border border-slate-300 rounded-xl text-xs font-bold" placeholder="여행지의 인상적인 순간을 요약해주세요" />
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">내용</label>
            <textarea v-model="newContent" rows="4" class="w-full p-2.5 border border-slate-300 rounded-xl text-xs" placeholder="여행 꿀팁, 맛집, 호텔 후기를 적어주세요."></textarea>
          </div>
        </div>

        <div class="flex gap-2 pt-2">
          <button @click="submitMoment" class="flex-1 py-3 bg-trip-blue text-white font-bold rounded-xl text-xs shadow-md">
            작성 완료 및 500 코인 적립
          </button>
          <button @click="showWriteModal = false" class="py-3 px-5 bg-slate-100 text-slate-700 font-bold rounded-xl text-xs">
            취소
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
