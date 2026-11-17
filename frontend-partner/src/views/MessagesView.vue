<script setup lang="ts">
// CR-03 customer message inbox: one row per order with a conversation, unread first in mind.
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { dt, pfetch } from '../config/http'

const router = useRouter()
const threads = ref<any[]>([])
const loading = ref(true)
const error = ref('')
const onlyUnread = ref(false)
const shown = computed(() => (onlyUnread.value ? threads.value.filter((t) => t.unread > 0) : threads.value))
const unreadTotal = computed(() => threads.value.reduce((s, t) => s + t.unread, 0))

async function load() {
  loading.value = true
  error.value = ''
  const r = await pfetch('/partner/messages')
  loading.value = false
  if (!r.ok) { error.value = r.data.error || '메시지를 불러오지 못했습니다.'; return }
  threads.value = r.data.threads || []
}
const open = (t: any) => router.push({ path: `/orders/${t.bookingId}`, hash: '#messages' })
onMounted(load)
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="text-xl font-black tracking-tight text-ink">고객 메시지</h1>
        <p class="mt-1 text-sm text-ink-subtle">예약 고객이 남긴 문의예요. 답장하면 고객에게 메일 알림이 갑니다.</p>
      </div>
      <div class="flex items-center gap-2">
        <label class="flex min-h-[40px] items-center gap-2 text-sm text-ink-muted"><input v-model="onlyUnread" type="checkbox" class="h-4 w-4 accent-primary" />안 읽은 대화만 ({{ unreadTotal }})</label>
        <button type="button" class="btn-secondary btn-sm" @click="load">새로고침</button>
      </div>
    </div>

    <div v-if="loading" class="space-y-2"><div v-for="i in 4" :key="i" class="card h-16 animate-pulse" /></div>
    <div v-else-if="error" class="rounded-2xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm font-semibold text-danger">{{ error }} <button type="button" class="ml-2 underline" @click="load">다시 시도</button></div>
    <div v-else-if="!shown.length" class="card p-10 text-center">
      <p class="text-sm font-bold text-ink">{{ onlyUnread ? '안 읽은 메시지가 없어요.' : '아직 고객 메시지가 없어요.' }}</p>
    </div>
    <div v-else class="table-wrap">
      <table class="table">
        <thead><tr><th>예약번호</th><th>상품</th><th>고객</th><th>이용일</th><th>마지막 메시지</th><th class="text-right">안 읽음</th></tr></thead>
        <tbody>
          <tr v-for="t in shown" :key="t.bookingId" class="cursor-pointer hover:bg-surface-sunken" tabindex="0" @click="open(t)" @keydown.enter="open(t)">
            <td class="font-mono text-xs font-bold">{{ t.bookingNumber }}</td>
            <td class="max-w-[240px] truncate">{{ t.title }}</td>
            <td>{{ t.customer }}</td>
            <td class="tabular">{{ t.serviceStart || '-' }}</td>
            <td class="font-mono text-xs text-ink-subtle">{{ dt(t.lastAt) }}</td>
            <td class="text-right"><span v-if="t.unread" class="rounded-full bg-danger px-2 py-0.5 text-xs font-bold text-white">{{ t.unread }}</span><span v-else class="text-xs text-ink-subtle">-</span></td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
