<script setup lang="ts">
// CR-03: the order's customer conversation. Customer identity stays masked.
import { computed, nextTick, onMounted, ref } from 'vue'
import { pfetch } from '../config/http'

const props = defineProps<{ orderId: string }>()
const MAX = 2000
const thread = ref<any>(null)
const loading = ref(true)
const error = ref('')
const draft = ref('')
const sending = ref(false)
const sendError = ref('')
const list = ref<HTMLElement | null>(null)
const len = computed(() => draft.value.trim().length)

async function load() {
  loading.value = true
  error.value = ''
  const r = await pfetch(`/partner/orders/${encodeURIComponent(props.orderId)}/messages`)
  loading.value = false
  if (!r.ok) { error.value = r.data.error || '메시지를 불러오지 못했습니다.'; return }
  thread.value = r.data.thread
  await nextTick()
  list.value?.scrollTo({ top: list.value.scrollHeight })
}
async function send() {
  if (!len.value || sending.value) return
  sending.value = true
  sendError.value = ''
  const r = await pfetch(`/partner/orders/${encodeURIComponent(props.orderId)}/messages`, { method: 'POST', body: { body: draft.value.trim() } })
  sending.value = false
  if (!r.ok) { sendError.value = r.data.error || '메시지를 보내지 못했습니다.'; return }
  draft.value = ''
  await load()
}
const fmt = (s: string) => s.slice(5, 16).replace('T', ' ')
onMounted(load)
</script>

<template>
  <div id="messages" class="card scroll-mt-20 p-5">
    <div class="mb-3 flex items-center justify-between gap-2">
      <h2 class="text-sm font-black text-ink">고객 메시지</h2>
      <span v-if="thread" class="text-xs text-ink-subtle">고객: {{ thread.counterpart }}</span>
    </div>
    <p v-if="loading" class="text-xs text-ink-subtle">불러오는 중…</p>
    <p v-else-if="error" class="text-xs text-danger">{{ error }} <button type="button" class="ml-1 underline" @click="load">다시 시도</button></p>
    <template v-else>
      <ol v-if="thread.messages.length" ref="list" class="max-h-96 space-y-3 overflow-y-auto pr-1">
        <li v-for="m in thread.messages" :key="m.id" class="flex" :class="m.mine ? 'justify-end' : 'justify-start'">
          <div class="max-w-[85%]">
            <p class="mb-0.5 text-[11px] text-ink-subtle" :class="m.mine && 'text-right'">{{ m.mine ? '우리 회사' : m.senderLabel }} · {{ fmt(m.createdAt) }}</p>
            <p class="whitespace-pre-line break-words rounded-2xl px-3.5 py-2.5 text-sm" :class="m.mine ? 'rounded-br-md bg-primary text-primary-ink' : m.senderType === 'ADMIN' ? 'rounded-bl-md border border-warning/40 bg-warning-soft text-ink' : 'rounded-bl-md bg-surface-sunken text-ink'">{{ m.body }}</p>
          </div>
        </li>
      </ol>
      <p v-else class="rounded-xl bg-surface-sunken px-4 py-3 text-xs text-ink-muted">아직 고객과 주고받은 메시지가 없어요. 먼저 안내 메시지를 보낼 수 있어요.</p>
      <form v-if="thread.canPost" class="mt-4 space-y-2" @submit.prevent="send">
        <label for="om-draft" class="sr-only">답장</label>
        <textarea id="om-draft" v-model="draft" rows="3" :maxlength="MAX" class="input w-full" placeholder="고객에게 보낼 메시지 (고객에게 메일 알림이 갑니다)" />
        <p v-if="sendError" class="text-xs font-semibold text-danger">{{ sendError }}</p>
        <div class="flex items-center justify-between">
          <span class="text-xs tabular text-ink-subtle">{{ len }}/{{ MAX }}</span>
          <button type="submit" class="btn-primary" :disabled="!len || sending">{{ sending ? '보내는 중…' : '보내기' }}</button>
        </div>
      </form>
    </template>
  </div>
</template>
