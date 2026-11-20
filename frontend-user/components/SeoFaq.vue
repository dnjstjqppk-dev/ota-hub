<script setup lang="ts">
/**
 * SeoFaq — visible semantic FAQ (section > h2 + h3/p pairs) with matching FAQPage JSON-LD.
 * Visible text and structured data always come from the same `items` prop.
 */
import { computed } from 'vue'
import { faqLd, jsonLdScript } from '~/composables/useJsonLd'

const props = withDefaults(defineProps<{ items: { q: string; a: string }[]; heading?: string; id?: string }>(), {
  heading: '자주 묻는 질문',
  id: 'faq',
})

const shown = computed(() => props.items.filter((f) => f.q && f.a).slice(0, 20))

useHead({ script: [jsonLdScript(faqLd(shown.value))] })
</script>

<template>
  <section v-if="shown.length" :aria-labelledby="`${id}-h`">
    <h2 :id="`${id}-h`" class="text-xl font-extrabold tracking-tight text-ink">{{ heading }}</h2>
    <div class="mt-4 space-y-4">
      <div v-for="(f, i) in shown" :key="i" class="rounded-card border border-line bg-surface p-4">
        <h3 class="text-base font-bold text-ink">{{ f.q }}</h3>
        <p class="mt-1 text-sm leading-relaxed text-ink-muted">{{ f.a }}</p>
      </div>
    </div>
  </section>
</template>
