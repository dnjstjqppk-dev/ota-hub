<script setup lang="ts">
/**
 * SeoCompareTable — semantic plan/fare comparison (table > caption + thead + tbody).
 * First column is a row header (scope="row") so screen readers and crawlers align cells.
 */
withDefaults(defineProps<{ caption: string; columns: string[]; rows: string[][]; firstColHeader?: boolean }>(), {
  firstColHeader: true,
})
</script>

<template>
  <div class="overflow-x-auto overscroll-x-contain [touch-action:pan-x_pan-y]">
    <table class="w-full border-collapse text-sm">
      <caption class="py-2 text-left text-base font-extrabold text-ink">{{ caption }}</caption>
      <thead>
        <tr class="border-y border-line bg-surface-sunken">
          <th v-for="(c, i) in columns" :key="i" scope="col" class="px-3 py-2 text-left font-bold text-ink">{{ c }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(r, i) in rows" :key="i" class="border-b border-line">
          <th v-if="firstColHeader" scope="row" class="px-3 py-2 text-left font-semibold text-ink">{{ r[0] }}</th>
          <td v-for="(c, j) in (firstColHeader ? r.slice(1) : r)" :key="j" class="px-3 py-2 text-ink-muted">{{ c }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
