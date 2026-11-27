<script setup lang="ts">
import { BRAND } from '~/config/brand'
import { useCompany } from '~/composables/useCompany'
import { jsonLdScript } from '~/composables/useJsonLd'
const VERSION = '2.1'
const EFFECTIVE = '2026-11-10'
const REVISED = '2026-11-10'
const co = useCompany()
const { t } = useI18n()
useSeoPage({ site: `https://${useRuntimeConfig().public.brandDomain}`, path: '/privacy', title: t('seo.privacy.title'), description: t('seo.privacy.description') })
// S6: document revision as WebPage dateModified.
useHead({ script: [jsonLdScript({ '@context': 'https://schema.org', '@type': 'WebPage', url: `https://${useRuntimeConfig().public.brandDomain}/privacy`, dateModified: REVISED })] })
</script>

<template>
  <div class="mx-auto max-w-4xl space-y-8 px-4 pb-24 pt-10 lg:px-6 lg:pb-16">
    <div class="space-y-2 border-b border-line pb-6">
      <span class="text-xs font-bold text-primary">Privacy Policy · v{{ VERSION }}</span>
      <h1 class="font-display text-3xl font-extrabold tracking-tight text-ink">{{ $t('legal.privacy.title', { brand: BRAND.name }) }}</h1>
      <p class="text-xs text-ink-subtle">{{ $t('legal.effective', { d: EFFECTIVE }) }} · {{ $t('common.updatedAt', { d: REVISED }) }}</p>
    </div>

    <div class="card space-y-6 p-6 text-sm leading-relaxed text-ink-muted sm:p-8">
      <section v-for="n in 3" :key="n" class="space-y-2">
        <h2 class="text-base font-extrabold text-ink">{{ $t(`legal.privacy.s${n}Title`) }}</h2>
        <p class="whitespace-pre-line">{{ $t(`legal.privacy.s${n}Body`, { brand: BRAND.name }) }}</p>
      </section>

      <section class="space-y-3">
        <h2 class="text-base font-extrabold text-ink">{{ $t('legal.privacy.s4Title') }}</h2>
        <p>{{ $t('legal.privacy.s4Intro') }}</p>
        <div class="overflow-x-auto rounded-2xl border border-line">
          <table class="w-full min-w-[540px] border-collapse text-left text-xs">
            <thead>
              <tr class="border-b border-line bg-surface-sunken text-ink">
                <th class="px-3 py-2.5 font-bold">{{ $t('legal.privacy.colProcessor') }}</th>
                <th class="px-3 py-2.5 font-bold">{{ $t('legal.privacy.colPurpose') }}</th>
                <th class="px-3 py-2.5 font-bold">{{ $t('legal.privacy.colData') }}</th>
                <th class="px-3 py-2.5 font-bold">{{ $t('legal.privacy.colRetention') }}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-line">
              <tr v-for="k in ['cf', 'toss', 'resend', 'sentry']" :key="k">
                <td class="px-3 py-2.5 font-semibold text-ink">{{ $t(`legal.privacy.proc_${k}_name`) }}</td>
                <td class="px-3 py-2.5">{{ $t(`legal.privacy.proc_${k}_task`) }}</td>
                <td class="px-3 py-2.5">{{ $t(`legal.privacy.proc_${k}_data`) }}</td>
                <td class="px-3 py-2.5">{{ $t(`legal.privacy.proc_${k}_ret`) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>{{ $t('legal.privacy.s4Outro') }}</p>
      </section>

      <section v-for="n in [5, 6, 7, 8]" :key="n" class="space-y-2">
        <h2 class="text-base font-extrabold text-ink">{{ $t(`legal.privacy.s${n}Title`) }}</h2>
        <p class="whitespace-pre-line">{{ $t(`legal.privacy.s${n}Body`, { email: BRAND.supportEmail }) }}</p>
      </section>

      <section class="space-y-2 border-t border-line pt-5">
        <h2 class="text-base font-extrabold text-ink">{{ $t('legal.privacy.s9Title') }}</h2>
        <p>
          {{ $t('legal.privacy.s9Body', { name: co.orPending(co.cpoName), dept: co.orPending(co.cpoDept), phone: co.orPending(co.cpoPhone), email: co.orPending(co.cpoEmail) }) }}
        </p>
      </section>
    </div>
  </div>
</template>
