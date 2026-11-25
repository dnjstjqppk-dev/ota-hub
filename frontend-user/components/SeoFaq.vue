<script setup lang="ts">
/**
 * SeoFaq — visible semantic FAQ accordion (section > h2 + details/summary).
 * Native <details> keeps every answer in the SSR DOM (crawlable for AI
 * briefings) with zero client state; the first item starts open. A matching
 * FAQPage JSON-LD graph is emitted from the same `items` prop so visible
 * text and structured data can never drift apart.
 */
import { computed } from 'vue'
import { faqLd, jsonLdScript } from '~/composables/useJsonLd'
import type { SeoFaqItem } from '~/composables/useSeoFaq'

const props = withDefaults(defineProps<{ items: SeoFaqItem[]; heading?: string; id?: string }>(), {
  heading: '',
  id: 'faq',
})

const localePath = useLocalePath()

// Blank entries are dropped (never rendered half-empty); 20 caps the LD graph.
const shown = computed(() => props.items.filter((f) => f.q && f.a).slice(0, 20))

useHead({ script: [jsonLdScript(faqLd(shown.value))] })
</script>

<template>
  <section v-if="shown.length" :aria-labelledby="`${id}-h`">
    <h2 :id="`${id}-h`" class="text-xl font-extrabold tracking-tight text-ink">{{ heading || $t('support.faq') }}</h2>
    <div class="mt-4 space-y-3">
      <details
        v-for="(f, i) in shown"
        :key="i"
        :open="i === 0"
        class="group rounded-card border border-line bg-surface"
      >
        <summary
          class="flex cursor-pointer list-none items-center justify-between gap-3 p-4 [&::-webkit-details-marker]:hidden"
        >
          <h3 class="text-base font-bold text-ink">{{ f.q }}</h3>
          <AppIcon
            name="chevron-down"
            :size="18"
            class="shrink-0 text-ink-subtle transition-transform group-open:rotate-180"
          />
        </summary>
        <p class="px-4 pb-4 text-sm leading-relaxed text-ink-muted">{{ f.a }}</p>
        <NuxtLink
          v-if="f.to"
          :to="localePath(f.to)"
          class="-mt-2 mb-4 ml-4 inline-block text-xs font-semibold text-primary hover:underline"
        >
          {{ $t('seoFaq.more') }}
        </NuxtLink>
      </details>
    </div>
  </section>
</template>
