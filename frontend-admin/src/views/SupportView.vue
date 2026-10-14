<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { apiUrl } from '../config/api'

const notices = ref<any[]>([])
const loading = ref(false)

const fetchNotices = async () => {
  loading.value = true
  try {
    const res = await fetch(apiUrl('/admin/notices'))
    const json = await res.json()
    notices.value = json.data || []
  } catch (e) {
    console.error(e)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  fetchNotices()
})
</script>

<template>
  <div class="p-8 space-y-6">
    <div>
      <h1 class="text-2xl font-black text-slate-900 tracking-tight">고객센터 & 긴급 공지 관리</h1>
      <p class="text-sm text-slate-500 mt-1">1:1 고객 상담 티켓 할당 및 천재지변/결항 긴급 안내 배너 발송</p>
    </div>

    <!-- 긴급 공지 배너 관리 -->
    <div class="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm space-y-4">
      <h3 class="text-base font-bold text-slate-900">글로벌 실시간 긴급 공지 배너</h3>
      <div class="space-y-3">
        <div v-for="n in notices" :key="n.id" class="p-4 rounded-xl border border-rose-200 bg-rose-50/50 flex items-start justify-between">
          <div class="space-y-1">
            <div class="flex items-center gap-2">
              <span class="px-2 py-0.5 bg-rose-600 text-white text-[11px] font-bold rounded-full">긴급 공지</span>
              <h4 class="font-bold text-rose-950 text-sm">{{ n.title }}</h4>
            </div>
            <p class="text-xs text-rose-800 leading-relaxed">{{ n.content }}</p>
          </div>
          <span class="px-2 py-1 bg-white border border-rose-200 text-rose-700 text-xs font-bold rounded-lg shadow-sm">
            노출중
          </span>
        </div>
      </div>
    </div>
  </div>
</template>
