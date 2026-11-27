<script setup lang="ts">
import { computed, ref } from 'vue'
import { BRAND } from '~/config/brand'

const { t } = useI18n()
useSeoPage({ site: `https://${useRuntimeConfig().public.brandDomain}`, path: '/faq', title: t('seo.faq.title'), description: t('seo.faq.description') })

const CAT_KEYS = ['ALL', 'HOTEL', 'FLIGHT', 'PAYMENT', 'REWARD', 'ETC'] as const
const selectedCat = ref<string>('ALL')
const catLabel = (key: string) => t(`faq.cat.${key}`)

const FAQ_META = [
  { key: 'q1', cat: 'HOTEL', to: '/help' },
  { key: 'q2', cat: 'HOTEL', to: '/help' },
  { key: 'q3', cat: 'FLIGHT', to: '/help' },
  { key: 'q4', cat: 'FLIGHT', to: '/help' },
  { key: 'q5', cat: 'PAYMENT', to: '/terms' },
  { key: 'q6', cat: 'PAYMENT', to: '/refund-policy' },
  { key: 'q7', cat: 'REWARD', to: '/rewards' },
] as const

const filteredFaqs = computed(() => {
  const list = selectedCat.value === 'ALL' ? FAQ_META : FAQ_META.filter((f) => f.cat === selectedCat.value)
  return list.map((f) => ({ q: t(`faqItems.${f.key}.q`), a: t(`faqItems.${f.key}.a`), to: f.to }))
})

// S2: the same list drives the shared SeoFaq accordion, so the visible Q&A and
// the FAQPage JSON-LD can never drift apart (all answers stay in the SSR DOM).
const seoFaqItems = computed(() => filteredFaqs.value)
</script>

<template>
  <div class="mx-auto max-w-4xl space-y-8 px-4 pb-24 pt-8 lg:px-6 lg:pb-16">
    <div class="space-y-3 text-center">
      <span class="inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-3.5 py-1 text-2xs font-bold uppercase tracking-wider text-primary">
        FAQ
      </span>
      <h1 class="font-display text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
        {{ $t('faq.title') }}
      </h1>
      <p class="mx-auto max-w-xl text-sm text-ink-muted">
        {{ $t('faq.sub', { brand: BRAND.name }) }}
      </p>
    </div>

    <div class="flex flex-wrap items-center justify-center gap-2">
      <button
        v-for="cat in CAT_KEYS"
        :key="cat"
        type="button"
        class="chip"
        :aria-pressed="selectedCat === cat"
        @click="selectedCat = cat"
      >
        {{ catLabel(cat) }}
      </button>
    </div>

    <SeoFaq :items="seoFaqItems" />
  </div>
</template>
