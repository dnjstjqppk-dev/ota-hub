<script setup lang="ts">
/**
 * SeoAnswer — product detail "at a glance" answer block (S3 AEO).
 * The summary is 2-3 sentences built ONLY from the product fields the page
 * passes (location, check-in/out, cancellation, inclusions, lowest KRW price);
 * a missing field drops its sentence AND its FAQ — nothing is ever invented.
 * Priority when everything is present: identity, price, cancellation.
 * A speakable WebPage graph points at the summary paragraph for voice/AI.
 */
import { computed } from 'vue'
import { jsonLdScript, speakableLd } from '~/composables/useJsonLd'
import { seoUrlFor, useActiveLocaleContext } from '~/composables/useSeoPage'
import type { SeoFaqItem } from '~/composables/useSeoFaq'

const props = withDefaults(defineProps<{
  name: string
  location?: string | null
  checkin?: string | null
  checkout?: string | null
  /** null/undefined = unknown: no cancellation sentence or FAQ at all. */
  freeCancel?: boolean | null
  freeCancelUntil?: string | null
  inclusions?: string[]
  priceLabel?: string | null
  path: string
  heading?: string
  id?: string
}>(), {
  location: null,
  checkin: null,
  checkout: null,
  freeCancel: null,
  freeCancelUntil: null,
  inclusions: () => [],
  priceLabel: null,
  heading: '',
  id: 'answer-summary',
})

const { t } = useI18n()
const answerLocaleCtx = useActiveLocaleContext()

const clean = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const has = (v: unknown) => clean(v).length > 0

const staySentence = computed(() => {
  if (has(props.checkin) && has(props.checkout)) return t('seoAnswer.s_stay', { checkin: clean(props.checkin), checkout: clean(props.checkout) })
  if (has(props.checkin)) return t('seoAnswer.s_checkin', { checkin: clean(props.checkin) })
  if (has(props.checkout)) return t('seoAnswer.s_checkout', { checkout: clean(props.checkout) })
  return ''
})

const cancelSentence = computed(() => {
  if (has(props.freeCancelUntil)) return t('seoAnswer.s_free_until', { deadline: clean(props.freeCancelUntil) })
  if (props.freeCancel === true) return t('seoAnswer.s_free')
  if (props.freeCancel === false) return t('seoAnswer.s_nonrefund')
  return ''
})

const inclSentence = computed(() => {
  const list = (Array.isArray(props.inclusions) ? props.inclusions : []).map(clean).filter(Boolean)
  if (!list.length) return ''
  return t('seoAnswer.s_incl', { list: list.join(t('seoAnswer.listSep')) })
})

const sentences = computed(() => [
  has(props.name) && has(props.location) ? t('seoAnswer.s1', { name: clean(props.name), location: clean(props.location) }) : '',
  has(props.priceLabel) ? t('seoAnswer.s_price', { price: clean(props.priceLabel) }) : '',
  cancelSentence.value,
  staySentence.value,
  inclSentence.value,
].filter(Boolean).slice(0, 3))

const faqs = computed<SeoFaqItem[]>(() => {
  const out: SeoFaqItem[] = []
  if (staySentence.value) {
    const parts = [
      has(props.checkin) ? t('seoAnswer.s_checkin', { checkin: clean(props.checkin) }) : '',
      has(props.checkout) ? t('seoAnswer.s_checkout', { checkout: clean(props.checkout) }) : '',
    ].filter(Boolean)
    out.push({ q: t('seoAnswer.q_checkin'), a: parts.join(t('seoAnswer.join')) })
  }
  if (cancelSentence.value) out.push({ q: t('seoAnswer.q_cancel'), a: cancelSentence.value })
  if (inclSentence.value) out.push({ q: t('seoAnswer.q_incl'), a: inclSentence.value })
  return out
})

if (sentences.value.length) {
  useHead({ script: [jsonLdScript(speakableLd(seoUrlFor(answerLocaleCtx.value), props.path, [`#${props.id}`]))] })
}
</script>

<template>
  <section v-if="sentences.length" :aria-labelledby="`${id}-h`">
    <h2 :id="`${id}-h`" class="text-xl font-extrabold tracking-tight text-ink">{{ heading || $t('seoAnswer.title') }}</h2>
    <p :id="id" class="mt-3 rounded-2xl bg-surface-sunken p-4 text-sm leading-relaxed text-ink">{{ sentences.join($t('seoAnswer.join')) }}</p>
    <SeoFaq v-if="faqs.length" :items="faqs" :id="`${id}-faq`" class="mt-6" />
  </section>
</template>
