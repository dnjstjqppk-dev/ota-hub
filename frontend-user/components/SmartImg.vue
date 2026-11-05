<script setup lang="ts">
/** Image that degrades to a neutral placeholder (never a broken-image icon) when the source fails. */
import { ref, watch } from 'vue'

const props = withDefaults(defineProps<{ src?: string | null; alt?: string; icon?: string; imgClass?: string }>(), { alt: '', icon: 'map-pin', imgClass: '' })
const failed = ref(!props.src)
watch(() => props.src, (s) => { failed.value = !s })
</script>

<template>
  <img v-if="!failed" :src="src!" :alt="alt" loading="lazy" decoding="async" :class="imgClass" @error="failed = true" />
  <div v-else :class="[imgClass, 'flex items-center justify-center bg-gradient-to-br from-sapphire-100 to-horizon-300/40 text-sapphire-400']" role="img" :aria-label="alt || undefined">
    <AppIcon :name="icon" :size="28" />
  </div>
</template>
