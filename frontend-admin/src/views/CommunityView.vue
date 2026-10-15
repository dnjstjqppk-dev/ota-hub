<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { apiUrl } from '../config/api'

const moments = ref<any[]>([])
const loading = ref(false)

const fetchMoments = async () => {
  loading.value = true
  try {
    const res = await fetch(apiUrl('/moments'))
    const json = await res.json()
    moments.value = json.data || []
  } catch (e) {
    console.error(e)
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
