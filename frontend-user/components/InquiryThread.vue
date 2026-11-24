<script setup lang="ts">
/**
 * CR-02 threaded 1:1 inquiry. Loads the conversation on demand; a follow-up
 * returns the ticket to the operator queue. Closed tickets are read-only.
 */
import { computed, ref } from 'vue'
import { apiFetch } from '~/composables/useApi'
import { useToastStore } from '~/stores/toast'

const { t, locale } = useI18n()
const props = defineProps<{ ticketId: string; status: string; hasReply: boolean }>()
const emit = defineEmits<{ changed: [] }>()
const toast = useToastStore()

const open = ref(false)
const loading = ref(false)
const failed = ref(false)
const ticket = ref<any>(null)
const draft = ref('')
const sending = ref(false)
const handing = ref(false)
const len = computed(() => draft.value.trim().length)
const closed = computed(() => (ticket.value?.status || props.status) === 'CLOSED')
const handed = computed(() => (ticket.value?.status || props.status) === 'NEEDS_HUMAN')
const isBot = (m: any) => typeof m?.authorId === 'string' && m.authorId.startsWith('bot:')

async function load() {
  loading.value = true
  failed.value = false
  const r = await apiFetch(`/inquiries/${props.ticketId}`)
  loading.value = false
  if (!r.ok) { failed.value = true; return }
  ticket.value = r.data.ticket
}
async function toggle() {
  open.value = !open.value
  if (open.value && !ticket.value) await load()
}
async function send() {
  if (!len.value || sending.value) return
  sending.value = true
  const r = await apiFetch(`/inquiries/${props.ticketId}/messages`, { method: 'POST', body: { body: draft.value.trim() } })
  sending.value = false
  if (!r.ok) { toast.error(r.data.error || t('inquiry.sendFail')); return }
  ticket.value = r.data.ticket
  draft.value = ''
  toast.success(t('inquiry.sent'))
  emit('changed')
}
const LOCALE_TAG: Record<string, string> = { ko: 'ko-KR', en: 'en-US', ja: 'ja-JP', zh: 'zh-CN' }
const fmt = (s: string) => new Date(s).toLocaleString(LOCALE_TAG[locale.value] || 'ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
async function handoff() {
  if (handing.value) return
  handing.value = true
  const r = await apiFetch(`/inquiries/${props.ticketId}/handoff`, { method: 'POST' })
  handing.value = false
  if (!r.ok) { toast.error(r.data.error || t('inquiry.handoffFail')); return }
  toast.success(t('inquiry.handoffDone'))
  await load()
  emit('changed')
}
</script>

<template>
  <div>
    <button type="button" class="inline-flex min-h-[44px] items-center gap-1 text-xs font-bold text-primary" :aria-expanded="open" @click="toggle">
      {{ open ? t('inquiry.collapse') : hasReply ? t('inquiry.checkReply') : t('inquiry.view') }}
      <AppIcon name="chevron-down" :size="14" class="transition-transform" :class="open && 'rotate-180'" />
    </button>
    <div v-if="open" class="mt-2 space-y-3" data-testid="inquiry-thread">
      <p v-if="loading" class="text-xs text-ink-subtle">{{ $t('common.loading') }}</p>
      <p v-else-if="failed" class="text-xs text-ink-muted">{{ $t('inquiry.loadFail') }} <button type="button" class="font-semibold text-primary underline" @click="load">{{ $t('common.retry') }}</button></p>
      <template v-else-if="ticket">
        <ol v-if="ticket.messages.length" class="space-y-2">
          <li v-for="m in ticket.messages" :key="m.id" class="rounded-xl px-3.5 py-2.5 text-xs leading-relaxed" :class="m.authorType === 'ADMIN' ? 'border border-primary/20 bg-primary-soft/60 text-ink' : 'ml-6 bg-surface-sunken text-ink'">
            <p class="mb-0.5 text-2xs font-bold" :class="m.authorType === 'ADMIN' ? 'text-primary' : 'text-ink-subtle'">{{ m.authorType === 'ADMIN' ? $t('inquiry.agent') : $t('inquiry.me') }}<span v-if="isBot(m)"> · {{ $t('inquiry.autoReply') }}</span> · {{ fmt(m.createdAt) }}</p>
            <p class="whitespace-pre-line break-words">{{ m.body }}</p>
          </li>
        </ol>
        <div v-if="!closed && !handed" class="flex justify-end">
          <button type="button" class="inline-flex min-h-[44px] items-center rounded-xl border border-line-strong px-4 text-xs font-bold text-ink" :disabled="handing" @click="handoff">{{ handing ? $t('inquiry.handing') : $t('inquiry.handoff') }}</button>
        </div>
        <p v-else-if="handed" class="text-xs text-ink-subtle">{{ $t('inquiry.handed') }}</p>
        <p v-else class="text-xs text-ink-subtle">{{ $t('inquiry.noReplyYet') }}</p>
        <form v-if="!closed" class="space-y-2" @submit.prevent="send">
          <label :for="`tq-${ticketId}`" class="sr-only">{{ $t('inquiry.followup') }}</label>
          <textarea :id="`tq-${ticketId}`" v-model="draft" rows="2" maxlength="2000" :placeholder="$t('inquiry.placeholder')" class="w-full rounded-xl border border-line-strong bg-surface px-3 py-2 text-sm" />
          <div class="flex justify-end"><button type="submit" class="btn-primary min-h-[44px]" :disabled="!len || sending">{{ sending ? $t('common.sending') : $t('inquiry.send') }}</button></div>
        </form>
        <p v-else class="text-xs text-ink-subtle">{{ $t('inquiry.closedMsg') }}</p>
      </template>
    </div>
  </div>
</template>
