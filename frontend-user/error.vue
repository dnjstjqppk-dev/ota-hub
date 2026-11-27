<script setup lang="ts">
/** Branded error page (404/500/...). Replaces the layout, so it carries its own minimal chrome. */
const props = defineProps<{ error: { statusCode?: number; message?: string } }>()
const { t } = useI18n()

const code = Number(props.error?.statusCode || 500)
const is404 = code === 404

useHead({ title: is404 ? t('errorPage.notFoundTitle') : t('errorPage.genericTitle') })

function goHome() {
  clearError({ redirect: '/' })
}
function goBack() {
  if (window.history.length > 1) window.history.back()
  else goHome()
}
</script>

<template>
  <div class="flex min-h-screen flex-col bg-canvas font-sans text-ink antialiased">
    <header class="border-b border-line bg-surface">
      <div class="mx-auto flex max-w-6xl items-center gap-2 px-4 py-3">
        <img src="/logo.svg" alt="getfortrip" class="h-7 w-auto dark:hidden" />
        <img src="/logo-white.svg" alt="getfortrip" class="hidden h-7 w-auto dark:block" />
      </div>
    </header>
    <main class="flex flex-1 items-center justify-center px-4 py-16">
      <div class="w-full max-w-md rounded-[28px] border border-line bg-surface p-8 text-center shadow-pop">
        <div class="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-soft text-primary">
          <AppIcon :name="is404 ? 'search' : 'shield'" :size="30" />
        </div>
        <p class="tabular mt-5 text-sm font-bold text-ink-subtle">{{ code }}</p>
        <h1 class="mt-1 text-2xl font-black tracking-tight">
          {{ is404 ? $t('errorPage.notFoundTitle') : $t('errorPage.genericTitle') }}
        </h1>
        <p class="mt-2 text-sm leading-relaxed text-ink-muted">
          {{ is404 ? $t('errorPage.notFoundDesc') : $t('errorPage.genericDesc') }}
        </p>
        <div class="mt-6 flex flex-col gap-2">
          <button type="button" class="w-full rounded-xl bg-primary py-3 text-sm font-bold text-primary-ink hover:bg-primary-hover" @click="goHome">
            {{ $t('errorPage.goHome') }}
          </button>
          <div class="flex gap-2">
            <button type="button" class="flex-1 rounded-xl border border-line py-3 text-sm font-semibold text-ink-muted hover:border-line-strong hover:text-ink" @click="goBack">
              {{ $t('errorPage.goBack') }}
            </button>
            <NuxtLink :to="$localePath('/help')" class="flex-1 rounded-xl border border-line py-3 text-center text-sm font-semibold text-ink-muted hover:border-line-strong hover:text-ink">
              {{ $t('errorPage.help') }}
            </NuxtLink>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>
