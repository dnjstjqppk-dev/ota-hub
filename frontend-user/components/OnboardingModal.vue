<script setup lang="ts">
/** First-visit welcome sheet. Shown once (see app.vue), dismissed forever on any action. */
import { onBeforeUnmount, watch } from 'vue'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ (e: 'close'): void }>()

watch(() => props.open, (v) => { document.documentElement.style.overflow = v ? 'hidden' : '' })
onBeforeUnmount(() => { document.documentElement.style.overflow = '' })
</script>

<template>
  <Teleport to="body">
    <Transition enter-from-class="opacity-0" enter-active-class="transition-opacity duration-150" leave-to-class="opacity-0" leave-active-class="transition-opacity duration-100">
      <div v-if="open" class="fixed inset-0 z-[70] bg-midnight-950/50" @click="emit('close')" />
    </Transition>
    <Transition enter-from-class="translate-y-6 opacity-0" enter-active-class="transition duration-200" leave-to-class="translate-y-6 opacity-0" leave-active-class="transition duration-150">
      <div v-if="open" role="dialog" aria-modal="true" aria-label="getfortrip 시작하기" class="fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-[71] mx-auto max-w-md animate-pop-in rounded-[28px] bg-surface-raised p-6 shadow-pop sm:inset-x-0 sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2">
        <div class="flex items-start justify-between">
          <img src="/logo.svg" alt="getfortrip" class="h-8 w-auto dark:hidden" />
          <img src="/logo-white.svg" alt="getfortrip" class="hidden h-8 w-auto dark:block" />
          <button type="button" class="flex h-9 w-9 items-center justify-center rounded-full text-ink-muted hover:bg-surface-sunken" aria-label="닫기" @click="emit('close')">
            <AppIcon name="close" />
          </button>
        </div>
        <h2 class="mt-4 text-xl font-black tracking-tight">스마트한 전 세계 여행의 시작</h2>
        <p class="mt-1 text-sm text-ink-muted">항공·호텔·기차·렌터카부터 투어·eSIM까지, 한 번의 검색으로 비교하고 바로 예약하세요.</p>
        <ul class="mt-4 space-y-3">
          <li class="flex items-center gap-3 rounded-2xl bg-surface-sunken px-4 py-3">
            <span class="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-soft text-primary"><AppIcon name="search" :size="18" /></span>
            <span class="text-sm font-semibold">실시간 최저가 검색 <span class="font-normal text-ink-muted">— 7개 도메인 통합 비교</span></span>
          </li>
          <li class="flex items-center gap-3 rounded-2xl bg-surface-sunken px-4 py-3">
            <span class="flex h-9 w-9 items-center justify-center rounded-xl bg-success-soft text-success"><AppIcon name="ticket" :size="18" /></span>
            <span class="text-sm font-semibold">즉시 발권·바우처 <span class="font-normal text-ink-muted">— 결제 후 바로 확인</span></span>
          </li>
          <li class="flex items-center gap-3 rounded-2xl bg-surface-sunken px-4 py-3">
            <span class="flex h-9 w-9 items-center justify-center rounded-xl bg-warning-soft text-warning"><AppIcon name="gift" :size="18" /></span>
            <span class="text-sm font-semibold">신규 쿠폰팩 <span class="font-normal text-ink-muted">— 가입하고 매달 할인받기</span></span>
          </li>
        </ul>
        <div class="mt-5 flex gap-2">
          <NuxtLink to="/deals" class="flex-1 rounded-xl bg-primary py-3 text-center text-sm font-bold text-primary-ink hover:bg-primary-hover" @click="emit('close')">
            쿠폰 받으러 가기
          </NuxtLink>
          <button type="button" class="flex-1 rounded-xl border border-line py-3 text-sm font-semibold text-ink-muted hover:border-line-strong hover:text-ink" @click="emit('close')">
            둘러보기
          </button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
