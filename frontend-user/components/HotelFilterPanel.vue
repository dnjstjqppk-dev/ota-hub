<script setup lang="ts">
/** Hotel result filters. Stateless: reads the parsed URL query and emits partial changes. */
import { useCurrencyStore } from '~/stores/currency'

defineProps<{
  q: { star: number; score: number; type: string; maxPrice: number; freeCancel: boolean; breakfast: boolean }
  types: { id: string; label: string }[]
  priceSteps: number[]
}>()
const emit = defineEmits<{ (e: 'set', patch: Record<string, unknown>): void }>()
const currency = useCurrencyStore()

const STARS = [{ v: 0, label: '전체' }, { v: 3, label: '3성+' }, { v: 4, label: '4성+' }, { v: 5, label: '5성급' }]
const SCORES = [{ v: 0, label: '전체' }, { v: 4, label: '4.0+' }, { v: 4.5, label: '4.5+' }, { v: 4.8, label: '4.8+' }]

const seg = (on: boolean) => ['rounded-xl border px-2 py-2 text-sm font-semibold transition-colors', on ? 'border-primary bg-primary-soft text-primary' : 'border-line text-ink-muted hover:border-line-strong hover:text-ink']
</script>

<template>
  <div class="space-y-6">
    <fieldset>
      <legend class="mb-2.5 text-sm font-bold text-ink">숙소 등급</legend>
      <div class="grid grid-cols-4 gap-1.5">
        <button v-for="s in STARS" :key="s.v" type="button" :class="seg(q.star === s.v)" :aria-pressed="q.star === s.v" @click="emit('set', { star: s.v })">{{ s.label }}</button>
      </div>
    </fieldset>

    <fieldset>
      <legend class="mb-2.5 text-sm font-bold text-ink">투숙객 평점 <span class="font-normal text-ink-subtle">(5점 만점)</span></legend>
      <div class="grid grid-cols-4 gap-1.5">
        <button v-for="s in SCORES" :key="s.v" type="button" :class="seg(q.score === s.v)" :aria-pressed="q.score === s.v" @click="emit('set', { score: s.v })">{{ s.label }}</button>
      </div>
    </fieldset>

    <fieldset>
      <legend class="mb-2.5 text-sm font-bold text-ink">1박 요금</legend>
      <select
        :value="q.maxPrice"
        class="w-full rounded-xl border border-line bg-surface py-2.5 pl-3 pr-8 text-sm font-semibold text-ink focus:border-primary focus:outline-none focus:ring-0"
        aria-label="1박 최대 요금"
        @change="emit('set', { maxPrice: Number(($event.target as HTMLSelectElement).value) })"
      >
        <option :value="0">제한 없음</option>
        <option v-for="p in priceSteps" :key="p" :value="p">{{ currency.formatKRW(p) }} 이하</option>
      </select>
    </fieldset>

    <fieldset>
      <legend class="mb-2.5 text-sm font-bold text-ink">숙소 유형</legend>
      <div class="flex flex-wrap gap-1.5">
        <button v-for="t in types" :key="t.id" type="button" :class="[...seg(q.type === t.id), 'px-3.5']" :aria-pressed="q.type === t.id" @click="emit('set', { type: t.id })">{{ t.label }}</button>
      </div>
    </fieldset>

    <fieldset class="space-y-1">
      <legend class="mb-1.5 text-sm font-bold text-ink">혜택</legend>
      <label class="flex cursor-pointer items-center justify-between gap-3 rounded-xl py-2 text-sm text-ink">
        <span>무료 취소 가능</span>
        <input type="checkbox" :checked="q.freeCancel" class="h-5 w-5 accent-primary" @change="emit('set', { freeCancel: ($event.target as HTMLInputElement).checked })" />
      </label>
      <label class="flex cursor-pointer items-center justify-between gap-3 rounded-xl py-2 text-sm text-ink">
        <span>조식 포함</span>
        <input type="checkbox" :checked="q.breakfast" class="h-5 w-5 accent-primary" @change="emit('set', { breakfast: ($event.target as HTMLInputElement).checked })" />
      </label>
    </fieldset>
  </div>
</template>
