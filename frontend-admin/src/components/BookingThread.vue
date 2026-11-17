<script setup lang="ts">
// CR-03: operator view of the customer<->partner conversation; operators may step in as CS.
import { ref, watch } from 'vue'
import { api, toast } from '../composables/session'
import { dateTime } from '../composables/format'

const props = defineProps<{ bookingId: string }>()
const thread = ref<any>(null)
const loading = ref(false)
const error = ref('')
const draft = ref('')
const sending = ref(false)
const LABEL: Record<string, string> = { USER: '고객', PARTNER: '파트너', ADMIN: '운영(CS)' }
const TONE: Record<string, string> = { USER: 'bg-surface-sunken', PARTNER: 'bg-primary-soft', ADMIN: 'bg-warning-soft' }

async function load() {
  loading.value = true
  error.value = ''
  try { thread.value = (await api(`/admin/bookings/${encodeURIComponent(props.bookingId)}/messages`)).thread }
  catch (e) { error.value = (e as Error).message }
  finally { loading.value = false }
}
async function send() {
  const body = draft.value.trim()
  if (!body) return
  sending.value = true
  try {
    await api(`/admin/bookings/${encodeURIComponent(props.bookingId)}/messages`, { method: 'POST', json: { body } })
    draft.value = ''
    toast('고객센터 이름으로 메시지를 보냈어요.')
    await load()
  } catch (e) { toast((e as Error).message, 'danger') } finally { sending.value = false }
}
watch(() => props.bookingId, (v) => { if (v) load() }, { immediate: true })
</script>

<template>
  <section>
    <h3 class="mb-2 font-bold">고객·파트너 메시지 <span v-if="thread" class="text-xs font-normal text-ink-subtle">{{ thread.hasPartner ? '' : '(파트너 없음 — 고객센터 직접 응대)' }}</span></h3>
    <p v-if="loading" class="text-xs text-ink-subtle">불러오는 중…</p>
    <p v-else-if="error" class="text-xs text-danger">{{ error }} <button type="button" class="underline" @click="load">다시 시도</button></p>
    <template v-else-if="thread">
      <ol v-if="thread.messages.length" class="max-h-72 space-y-2 overflow-y-auto">
        <li v-for="m in thread.messages" :key="m.id" :class="['rounded-field px-3 py-2 text-sm', TONE[m.senderType]]">
          <p class="text-2xs text-ink-subtle">{{ LABEL[m.senderType] }} · {{ m.senderLabel }} · {{ dateTime(m.createdAt) }}</p>
          <p class="whitespace-pre-line break-words">{{ m.body }}</p>
        </li>
      </ol>
      <p v-else class="text-xs text-ink-subtle">주고받은 메시지가 없어요.</p>
      <form class="mt-2 flex flex-col gap-2 sm:flex-row" @submit.prevent="send">
        <label for="bt-draft" class="sr-only">고객센터 메시지</label>
        <textarea id="bt-draft" v-model="draft" rows="2" maxlength="2000" class="input min-h-[60px] flex-1 py-2" placeholder="고객센터 이름으로 보낼 메시지 (고객에게 메일 알림)" />
        <button type="submit" class="btn-primary btn-sm self-end" :disabled="sending || !draft.trim()">{{ sending ? '보내는 중…' : '보내기' }}</button>
      </form>
    </template>
  </section>
</template>
