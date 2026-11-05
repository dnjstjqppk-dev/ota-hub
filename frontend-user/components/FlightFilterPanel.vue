<script setup lang="ts">
/** Flight result filters. Stateless: reads the parsed URL query and emits changes. */
defineProps<{
  q: { stops: number | null; slots: string[]; airlines: string[]; bag: boolean }
  slots: readonly { id: string; label: string; range: string }[]
  airlines: string[]
}>()
const emit = defineEmits<{ (e: 'patch', v: Record<string, string>): void; (e: 'toggle', key: 'slots' | 'airlines', v: string): void }>()
</script>

<template>
  <div class="space-y-6">
    <fieldset>
      <legend class="mb-2.5 text-sm font-bold text-ink">경유</legend>
      <div class="grid grid-cols-2 gap-1.5">
        <button type="button" class="seg" :aria-pressed="q.stops === null" @click="emit('patch', { stops: '' })">전체</button>
        <button type="button" class="seg" :aria-pressed="q.stops === 0" @click="emit('patch', { stops: '0' })">직항만</button>
      </div>
    </fieldset>
    <fieldset>
      <legend class="mb-2.5 text-sm font-bold text-ink">출발 시간</legend>
      <div class="grid grid-cols-2 gap-1.5">
        <button v-for="s in slots" :key="s.id" type="button" class="seg flex flex-col py-2" :aria-pressed="q.slots.includes(s.id)" @click="emit('toggle', 'slots', s.id)">
          {{ s.label }}<span class="text-2xs font-normal opacity-80">{{ s.range }}</span>
        </button>
      </div>
    </fieldset>
    <fieldset v-if="airlines.length">
      <legend class="mb-1.5 text-sm font-bold text-ink">항공사</legend>
      <label v-for="a in airlines" :key="a" class="flex cursor-pointer items-center justify-between gap-3 py-2 text-sm text-ink">
        <span>{{ a }}</span>
        <input type="checkbox" class="h-5 w-5 accent-primary" :checked="q.airlines.includes(a)" @change="emit('toggle', 'airlines', a)" />
      </label>
    </fieldset>
    <fieldset>
      <legend class="mb-1.5 text-sm font-bold text-ink">수하물</legend>
      <label class="flex cursor-pointer items-center justify-between gap-3 py-2 text-sm text-ink">
        <span>무료 위탁 수하물 포함</span>
        <input type="checkbox" class="h-5 w-5 accent-primary" :checked="q.bag" @change="emit('patch', { bag: ($event.target as HTMLInputElement).checked ? '1' : '' })" />
      </label>
    </fieldset>
  </div>
</template>
