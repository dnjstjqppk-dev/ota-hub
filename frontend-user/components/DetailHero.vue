<script setup lang="ts">
/**
 * Top block of a product detail page (design system "Horizon"): breadcrumb, image, title and a fact list.
 * Facts with empty values must be filtered out by the caller — nothing here supplies defaults.
 */
defineProps<{
  crumbs: { label: string; to?: string }[]
  eyebrow?: string
  title: string
  subtitle?: string
  image?: string | null
  imageIcon?: string
  facts: [string, string][]
  testid?: string
}>()
</script>

<template>
  <nav class="mb-3 flex flex-wrap items-center gap-1 text-xs text-ink-subtle" aria-label="이동 경로">
    <template v-for="(c, i) in crumbs" :key="i">
      <AppIcon v-if="i" name="chevron-right" :size="12" />
      <NuxtLink v-if="c.to" :to="c.to" class="hover:text-ink">{{ c.label }}</NuxtLink>
      <span v-else class="max-w-[16rem] truncate text-ink-muted">{{ c.label }}</span>
    </template>
  </nav>
  <section class="card overflow-hidden" :data-testid="testid">
    <SmartImg v-if="image !== undefined" :src="image" :alt="title" :icon="imageIcon || 'map-pin'" img-class="h-56 w-full object-cover sm:h-72 md:h-80" />
    <div class="p-5 sm:p-7">
      <p v-if="eyebrow" class="text-sm font-semibold text-ink-muted">{{ eyebrow }}</p>
      <h1 class="mt-1 text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">{{ title }}</h1>
      <p v-if="subtitle" class="mt-1 text-sm text-ink-muted">{{ subtitle }}</p>
      <slot name="badges" />
      <dl v-if="facts.length" class="mt-6 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2">
        <div v-for="[k, v] in facts" :key="k" class="bg-surface px-4 py-3">
          <dt class="text-xs text-ink-subtle">{{ k }}</dt>
          <dd class="mt-0.5 text-sm font-semibold text-ink">{{ v }}</dd>
        </div>
      </dl>
      <slot />
    </div>
  </section>
</template>
