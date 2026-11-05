<script setup lang="ts">
/**
 * getfortrip icon set (design system "Horizon"): 24px grid, 1.8 stroke, round caps.
 * Replaces emoji icons, which render differently on every OS and cannot follow theme colour.
 */
import { computed } from 'vue'

const PATHS: Record<string, string> = {
  hotel: 'M3 21V8l9-5 9 5v13M9 21v-6h6v6M8 10h.01M12 10h.01M16 10h.01',
  flight: 'M2.5 19h19M3.3 13.6l4 1.6 3.4-1.4-4.6-5.3 2-.8 6.4 4.1 4.3-1.8a1.9 1.9 0 0 1 1.5 3.5L6.4 19.6 2 15.1z',
  train: 'M7 3h10a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3zm-3 8h16M8 21l2-4m6 4-2-4M8 14h.01M16 14h.01',
  car: 'M5 16H4a1 1 0 0 1-1-1v-3l2-5h14l2 5v3a1 1 0 0 1-1 1h-1M7 16a2 2 0 1 0 4 0 2 2 0 0 0-4 0m6 0a2 2 0 1 0 4 0 2 2 0 0 0-4 0M3 12h18',
  transfer: 'M3 7h11l3 4h3a1 1 0 0 1 1 1v4h-2M3 7v9h2m4 0h6M3 11h14M7 18a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm10 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  ticket: 'M4 8a2 2 0 0 0 2-2h12a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H6a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4zm10-2v12',
  package: 'M4 8h16v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zm5 0V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3M4 13h16',
  esim: 'M8 3h6l4 4v13a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm1 9h6v5H9z',
  shield: 'M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6zm-3 9 2 2 4-4',
  gift: 'M4 11h16v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zm-1-4h18v4H3zm9 0v14M12 7S10.5 3 8 3.5 7 7 12 7zm0 0s1.5-4 4-3.5S17 7 12 7z',
  trophy: 'M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4m8-4h3a3 3 0 0 1-3 4m-4 3v4m-4 4h8m-6-4h4',
  camera: 'M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1zm8 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  heart: 'M12 20s-7.5-4.6-9.2-9.3C1.6 7.4 3.8 4 7.2 4c2 0 3.6 1.1 4.8 2.8C13.2 5.1 14.8 4 16.8 4c3.4 0 5.6 3.4 4.4 6.7C19.5 15.4 12 20 12 20z',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-8 9a8 8 0 0 1 16 0',
  bookings: 'M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm7 0v5h5M9 13h6M9 17h4',
  home: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zm9 3-4.3-4.3',
  menu: 'M4 7h16M4 12h16M4 17h16',
  close: 'M6 6l12 12M18 6 6 18',
  'chevron-down': 'M6 9l6 6 6-6',
  'chevron-right': 'M9 6l6 6-6 6',
  'arrow-right': 'M5 12h14m-5-5 5 5-5 5',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z',
  support: 'M4 13v-1a8 8 0 0 1 16 0v1M4 13a2 2 0 0 1 2-2h1v6H6a2 2 0 0 1-2-2zm16 0a2 2 0 0 0-2-2h-1v6h1a2 2 0 0 0 2-2zm-3 4c0 2-2 3-5 3',
  calendar: 'M4 6a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zm0 4h16M8 3v4m8-4v4',
  users: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zm-7 9a7 7 0 0 1 14 0m1-9a3 3 0 1 0-1-5.8M18 14a6 6 0 0 1 4 6',
  swap: 'M7 4 3 8l4 4M3 8h14m0 12 4-4-4-4m4 4H7',
  star: 'M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z',
  'map-pin': 'M12 21s-7-6.2-7-11.5a7 7 0 1 1 14 0C19 14.8 12 21 12 21zm0-9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  check: 'M5 12.5 10 17l9-10',
  lock: 'M6 11h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1zm2 0V8a4 4 0 0 1 8 0v3',
  refund: 'M4 12a8 8 0 1 0 2.3-5.6M4 4v4h4m4 0v8m-2.5-2.2c.4.8 1.3 1.2 2.5 1.2 1.6 0 2.5-.7 2.5-1.8 0-2.5-5-1.4-5-3.9 0-1 .9-1.8 2.5-1.8 1.1 0 2 .4 2.4 1.1',
  bolt: 'M13 3 5 14h6l-1 7 8-11h-6z',
  briefcase: 'M4 8h16v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zm5 0V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  mail: 'M4 6h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1zm0 1 8 6 8-6',
  external: 'M14 4h6v6m0-6-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  logout: 'M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 8l-4 4 4 4M6 12h10',
  coins: 'M12 8c4.4 0 8-1.3 8-3s-3.6-3-8-3-8 1.3-8 3 3.6 3 8 3zM4 5v5c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 10v5c0 1.7 3.6 3 8 3s8-1.3 8-3v-5'
}

const props = withDefaults(defineProps<{ name: string; size?: number | string; stroke?: number | string; label?: string }>(), { size: 20, stroke: 1.8 })
const d = computed(() => PATHS[props.name] || PATHS.search)
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    :stroke-width="stroke"
    stroke-linecap="round"
    stroke-linejoin="round"
    :role="label ? 'img' : undefined"
    :aria-label="label"
    :aria-hidden="label ? undefined : 'true'"
    class="shrink-0"
  ><path :d="d" /></svg>
</template>
