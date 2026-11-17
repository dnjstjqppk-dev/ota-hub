<script setup lang="ts">
/**
 * CR-03 booking conversation. The customer writes to the selling partner (or
 * getfortrip CS when the booking has no partner); operators can read every thread.
 * Messages are plain text, rendered escaped.
 */
import { computed, nextTick, onMounted, ref } from 'vue'
import { apiFetch } from '~/composables/useApi'
import { useToastStore } from '~/stores/toast'

const props = defineProps<{ bookingId: string }>()
const toast = useToastStore()
const MAX = 2000

const thread = ref<any>(null)
const loading = ref(true)
const failed = ref(false)
const draft = ref('')
const sending = ref(false)
const open = ref(false)
const list = ref<HTMLElement | null>(null)
const len = computed(() => draft.value.trim().length)

async function load() {
  loading.value = true
  failed.value = false
  const r = await apiFetch(`/bookings/${props.bookingId}/messages`)
  loading.value = false
  if (!r.ok) { failed.value = true; return }
  thread.value = r.data.thread
  if (thread.value.messages.length) open.value = true
  await nextTick()
  list.value?.scrollTo({ top: list.value.scrollHeight })
}

async function send() {
  if (!len.value || len.value > MAX || sending.value) return
  sending.value = true
  const r = await apiFetch(`/bookings/${props.bookingId}/messages`, { method: 'POST', body: { body: draft.value.trim() } })
  sending.value = false
  if (!r.ok) { toast.error(r.data.error || '메시지를 보내지 못했어요.'); return }
  draft.value = ''
  toast.success('메시지를 보냈어요. 답변이 오면 메일로 알려드려요.')
  await load()
}

const fmt = (s: string) => new Date(s).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
onMounted(load)
</script>

<template>
  <section class="rounded-2xl border border-line bg-surface text-sm" data-testid="booking-messages">
    <button type="button" class="flex min-h-[56px] w-full items-center justify-between gap-3 px-5 text-left" :aria-expanded="open" @click="open = !open">
      <span>
        <span class="font-semibold text-ink">{{ thread?.counterpart || '판매처' }}에 문의하기</span>
        <span v-if="thread?.unreadBeforeOpen" class="ml-2 rounded-full bg-danger px-2 py-0.5 text-2xs font-bold text-white">새 답변 {{ thread.unreadBeforeOpen }}</span>
        <span class="mt-0.5 block text-xs text-ink-subtle">체크인 시간, 요청사항 등 예약 관련 문의를 남겨주세요.</span>
      </span>
      <AppIcon name="chevron-down" :size="18" class="shrink-0 text-ink-subtle transition-transform" :class="open && 'rotate-180'" />
    </button>
    <div v-if="open" class="border-t border-line px-5 pb-5 pt-4">
      <p v-if="loading" class="text-ink-subtle">불러오는 중…</p>
      <p v-else-if="failed" class="text-ink-muted">메시지를 불러오지 못했어요. <button type="button" class="font-semibold text-primary underline" @click="load">다시 시도</button></p>
      <template v-else>
        <ol v-if="thread.messages.length" ref="list" class="max-h-80 space-y-3 overflow-y-auto pr-1" aria-label="메시지 목록">
          <li v-for="m in thread.messages" :key="m.id" class="flex" :class="m.mine ? 'justify-end' : 'justify-start'">
            <div class="max-w-[85%]">
              <p class="mb-0.5 text-2xs text-ink-subtle" :class="m.mine && 'text-right'">{{ m.mine ? '나' : m.senderLabel }} · {{ fmt(m.createdAt) }}</p>
              <p class="whitespace-pre-line break-words rounded-2xl px-3.5 py-2.5" :class="m.mine ? 'rounded-br-md bg-primary text-primary-ink' : 'rounded-bl-md bg-surface-sunken text-ink'">{{ m.body }}</p>
            </div>
          </li>
        </ol>
        <p v-else class="rounded-xl bg-surface-sunken px-4 py-3 text-ink-muted">아직 주고받은 메시지가 없어요.</p>
        <form v-if="thread.canPost" class="mt-4 space-y-2" @submit.prevent="send">
          <label for="bm-draft" class="sr-only">메시지</label>
          <textarea id="bm-draft" v-model="draft" rows="3" :maxlength="MAX" placeholder="여권번호·카드번호 같은 민감한 정보는 적지 마세요." class="w-full rounded-xl border border-line-strong bg-surface px-3 py-2" />
          <div class="flex items-center justify-between gap-3">
            <span class="text-xs tabular" :class="len > MAX ? 'text-danger' : 'text-ink-subtle'">{{ len }}/{{ MAX }}</span>
            <button type="submit" class="btn-primary min-h-[44px]" :disabled="!len || sending" data-testid="send-message">{{ sending ? '보내는 중…' : '보내기' }}</button>
          </div>
        </form>
        <p v-else class="mt-3 text-xs text-ink-subtle">만료된 예약에는 메시지를 보낼 수 없어요.</p>
      </template>
    </div>
  </section>
</template>
