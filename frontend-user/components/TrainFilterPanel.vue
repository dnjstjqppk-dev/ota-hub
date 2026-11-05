<script setup lang="ts">
/** Train result filters built from the values present in the current results (no invented options). */
defineProps<{ q: { type: string; seat: string }; types: string[]; seats: string[] }>()
const emit = defineEmits<{ (e: 'patch', v: Record<string, string>): void }>()
</script>

<template>
  <div class="space-y-6">
    <fieldset v-if="types.length">
      <legend class="mb-2.5 text-sm font-bold text-ink">열차 종류</legend>
      <div class="flex flex-wrap gap-1.5">
        <button type="button" class="seg px-3.5" :aria-pressed="!q.type" @click="emit('patch', { type: '' })">전체</button>
        <button v-for="t in types" :key="t" type="button" class="seg px-3.5" :aria-pressed="q.type === t" @click="emit('patch', { type: t })">{{ t }}</button>
      </div>
    </fieldset>
    <fieldset v-if="seats.length">
      <legend class="mb-2.5 text-sm font-bold text-ink">좌석 등급</legend>
      <div class="flex flex-wrap gap-1.5">
        <button type="button" class="seg px-3.5" :aria-pressed="!q.seat" @click="emit('patch', { seat: '' })">전체</button>
        <button v-for="s in seats" :key="s" type="button" class="seg px-3.5 text-left" :aria-pressed="q.seat === s" @click="emit('patch', { seat: s })">{{ s }}</button>
      </div>
    </fieldset>
  </div>
</template>
