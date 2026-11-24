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
const { t, locale } = useI18n()
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
  if (!r.ok) { toast.error(r.data.error || t('messages.sendFail')); return }
  draft.value = ''
  toast.success(t('messages.sent'))
  await load()
}

const LOCALE_TAG: Record<string, string> = { ko: 'ko-KR', en: 'en-US', ja: 'ja-JP', zh: 'zh-CN' }
const fmt = (s: string) => new Date(s).toLocaleString(LOCALE_TAG[locale.value] || 'ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
onMounted(load)
</script>

<template>
  <section class="rounded-2xl border border-line bg-surface text-sm" data-testid="booking-messages">
    <button type="button" class="flex min-h-[56px] w-full items-center justify-between gap-3 px-5 text-left" :aria-expanded="open" @click="open = !open">
      <span>
        <span class="font-semibold text-ink">{{ $t('messages.askTo', { to: thread?.counterpart || $t('messages.seller') }) }}</span>
        <span v-if="thread?.unreadBeforeOpen" class="ml-2 rounded-full bg-danger px-2 py-0.5 text-2xs font-bold text-white">{{ $t('messages.newReplies', { n: thread.unreadBeforeOpen }) }}</span>
        <span class="mt-0.5 block text-xs text-ink-subtle">{{ $t('messages.hint') }}</span>
      </span>
      <AppIcon name="chevron-down" :size="18" class="shrink-0 text-ink-subtle transition-transform" :class="open && 'rotate-180'" />
    </button>
    <div v-if="open" class="border-t border-line px-5 pb-5 pt-4">
      <p v-if="loading" class="text-ink-subtle">{{ $t('common.loading') }}</p>
      <p v-else-if="failed" class="text-ink-muted">{{ $t('messages.loadFail') }} <button type="button" class="font-semibold text-primary underline" @click="load">{{ $t('common.retry') }}</button></p>
      <template v-else>
        <ol v-if="thread.messages.length" ref="list" class="max-h-80 space-y-3 overflow-y-auto pr-1" :aria-label="$t('messages.list')">
          <li v-for="m in thread.messages" :key="m.id" class="flex" :class="m.mine ? 'justify-end' : 'justify-start'">
            <div class="max-w-[85%]">
              <p class="mb-0.5 text-2xs text-ink-subtle" :class="m.mine && 'text-right'">{{ m.mine ? $t('inquiry.me') : m.senderLabel }} · {{ fmt(m.createdAt) }}</p>
              <p class="whitespace-pre-line break-words rounded-2xl px-3.5 py-2.5" :class="m.mine ? 'rounded-br-md bg-primary text-primary-ink' : 'rounded-bl-md bg-surface-sunken text-ink'">{{ m.body }}</p>
            </div>
          </li>
        </ol>
        <p v-else class="rounded-xl bg-surface-sunken px-4 py-3 text-ink-muted">{{ $t('messages.empty') }}</p>
        <form v-if="thread.canPost" class="mt-4 space-y-2" @submit.prevent="send">
          <label for="bm-draft" class="sr-only">{{ $t('messages.label') }}</label>
          <textarea id="bm-draft" v-model="draft" rows="3" :maxlength="MAX" :placeholder="$t('messages.placeholder')" class="w-full rounded-xl border border-line-strong bg-surface px-3 py-2" />
          <div class="flex items-center justify-between gap-3">
            <span class="text-xs tabular" :class="len > MAX ? 'text-danger' : 'text-ink-subtle'">{{ len }}/{{ MAX }}</span>
            <button type="submit" class="btn-primary min-h-[44px]" :disabled="!len || sending" data-testid="send-message">{{ sending ? $t('common.sending') : $t('messages.send') }}</button>
          </div>
        </form>
        <p v-else class="mt-3 text-xs text-ink-subtle">{{ $t('messages.expired') }}</p>
      </template>
    </div>
  </section>
</template>
