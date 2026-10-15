<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useApiUrl } from '~/composables/useApi'

const moments = ref<any[]>([])
const loading = ref(false)

const showWriteModal = ref(false)
const newTitle = ref('')
const newCity = ref('도쿄')
const newContent = ref('')

const fetchMoments = async () => {
  loading.value = true
  try {
    const res = await fetch(useApiUrl('/moments'))
    const json = await res.json()
    moments.value = json.data || []
  } catch (e) {
    console.error(e)
  } finally {
    loading.value = false
  }
}

const submitMoment = async () => {
  if (!newTitle.value || !newContent.value) return
  await fetch(useApiUrl('/moments'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_id: 'a0000000-0000-0000-0000-000000000001',
      user_name: '김여행',
      user_avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200',
      city: newCity.value,
      title: newTitle.value,
      content: newContent.value,
      photos: ['https://images.unsplash.com/photo-1503899036084-c55cdd92da26?w=800']
    })
  })
  showWriteModal.value = false
  newTitle.value = ''
  newContent.value = ''
  await fetchMoments()
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
