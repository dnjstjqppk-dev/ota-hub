<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { apiUrl } from '../config/api'

const DEFAULT_NOTICES = [
  {
    id: 'notice-01',
    title: '동남아 및 일본 태풍 예보에 따른 항공편 결항 시 전액 무료 취소 안내',
    content: '기상 악화로 인한 항공사 결항/지연 통보 시 getfortrip 앱 및 마이페이지에서 수수료 없이 100% 즉시 환불 접수됩니다.'
  },
  {
    id: 'notice-02',
    title: '유럽 유로스타(Eurostar) 노선 선로 개보수로 인한 일부 편수 스케줄 변경',
    content: '런던-파리 구간 일부 고속열차의 출발 시각이 15분 앞당겨졌으니 탑승 전 모바일 티켓 QR 및 출발 안내를 재확인해 주시기 바랍니다.'
  }
]

const notices = ref<any[]>(DEFAULT_NOTICES)
const loading = ref(false)

const fetchNotices = async () => {
  loading.value = true
  try {
    const res = await fetch(apiUrl('/admin/notices'))
    if (res.ok) {
      const json = await res.json()
      if (json.data && json.data.length > 0) {
        notices.value = json.data
      }
    }
  } catch (e) {
    // Keep DEFAULT_NOTICES
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
