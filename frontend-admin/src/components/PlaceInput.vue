<script setup lang="ts">
/**
 * Country / city picker backed by the places table (GET /search/suggest). Free text is still allowed
 * (the field is the product's display value), but picking a suggestion stores the canonical Korean name
 * and exposes the ISO country code so a city search can be narrowed to the chosen country.
 */
import { apiUrl } from '../config/api'
import EntitySearch from './EntitySearch.vue'

const props = defineProps<{ modelValue: string; kind: 'country' | 'city'; label: string; inputId: string; countryCode?: string }>()
const emit = defineEmits<{ 'update:modelValue': [string]; pick: [{ name: string; code: string | null; countryCode: string | null }] }>()

async function fetcher(q: string, signal: AbortSignal) {
  // insurance → countries only; hotels → cities/regions/landmarks/countries (we keep cities).
  const domain = props.kind === 'country' ? 'insurance' : 'hotels'
  const res = await fetch(apiUrl(`/search/suggest?q=${encodeURIComponent(q)}&domain=${domain}&limit=10`), { signal })
  if (!res.ok) throw new Error(String(res.status))
  const rows: any[] = (await res.json()).data || []
  const want = props.kind === 'country' ? 'COUNTRY' : 'CITY'
  let out = rows.filter((r) => r.kind === 'place' && r.place_type === want)
  if (props.kind === 'city' && props.countryCode) {
    const same = out.filter((r) => r.country_code === props.countryCode)
    out = [...same, ...out.filter((r) => r.country_code !== props.countryCode)]
  }
  return out
}
function pick(r: any) {
  emit('update:modelValue', r.value)
  emit('pick', { name: r.value, code: r.code || null, countryCode: r.country_code || null })
}
</script>

<template>
  <EntitySearch
    :model-value="modelValue"
    :label="label"
    :input-id="inputId"
    :placeholder="kind === 'country' ? '예: 일본, 프랑스' : '예: 도쿄, 파리'"
    :fetcher="fetcher"
    :item-key="(r: any) => r.id"
    @update:model-value="(v: string) => emit('update:modelValue', v)"
    @select="pick"
  >
    <template #item="{ item }">
      <div class="flex items-center justify-between gap-2">
        <div class="min-w-0">
          <p class="truncate text-sm font-medium text-ink">{{ item.title }}</p>
          <p class="truncate text-2xs text-ink-subtle">{{ item.subtitle }}</p>
        </div>
        <span class="shrink-0 font-mono text-2xs text-ink-subtle">{{ item.code || item.country_code }}</span>
      </div>
    </template>
  </EntitySearch>
</template>
