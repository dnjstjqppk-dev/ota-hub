<script setup lang="ts">
/**
 * SeoImage — LCP/CLS-safe image: AVIF → WebP → fallback chain, explicit size,
 * async decoding. `eager` only for the above-the-fold hero (preloaded by the page).
 */
import { computed } from 'vue'

const props = withDefaults(defineProps<{ src: string; alt: string; width?: number; height?: number; webp?: string; avif?: string; eager?: boolean; cls?: string }>(), {
  eager: false,
  cls: '',
})

const ratio = computed(() => (props.width && props.height ? `aspect-ratio:${props.width}/${props.height}` : ''))
</script>

<template>
  <picture class="block overflow-hidden" :style="ratio">
    <source v-if="avif" :srcset="avif" type="image/avif" />
    <source v-if="webp" :srcset="webp" type="image/webp" />
    <img
      :src="src" :alt="alt" :width="width" :height="height"
      :loading="eager ? 'eager' : 'lazy'" :fetchpriority="eager ? 'high' : 'auto'"
      decoding="async" :class="['h-full w-full object-cover', cls]"
    />
  </picture>
</template>
