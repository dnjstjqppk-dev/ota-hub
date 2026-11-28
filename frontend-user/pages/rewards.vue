<script setup lang="ts">
import { useAuthStore } from '~/stores/auth'

const { t } = useI18n()
useSeoPage({ site: `https://${useRuntimeConfig().public.brandDomain}`, path: '/rewards', title: t('seo.rewards.title'), description: t('seo.rewards.description') })

const authStore = useAuthStore()
</script>

<template>
  <div class="mx-auto max-w-6xl space-y-8 px-4 pb-24 pt-6 lg:px-6 lg:pb-16">
    <!-- Logged-in Member Card -->
    <section v-if="authStore.isLoggedIn && authStore.user" class="relative overflow-hidden rounded-card border border-line bg-gradient-to-br from-primary-soft/80 via-surface to-accent-soft/45 p-6 shadow-card sm:p-10">
      <div class="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-primary/15 blur-3xl" aria-hidden="true" />
      <div class="relative flex flex-col items-start justify-between gap-5 md:flex-row md:items-center">
        <div class="flex items-center gap-4">
          <img v-if="authStore.user.avatarUrl" :src="authStore.user.avatarUrl" alt="" class="h-16 w-16 rounded-2xl border-2 border-primary object-cover" />
          <span v-else class="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary font-display text-xl font-extrabold text-primary-ink" aria-hidden="true">{{ (authStore.user.fullName || authStore.user.email || '?').trim().charAt(0).toUpperCase() }}</span>
          <div>
            <div class="flex flex-wrap items-center gap-2">
              <h1 class="font-display text-2xl font-extrabold text-ink">{{ $t('rewards.greeting', { name: authStore.user.fullName }) }}</h1>
              <span class="inline-flex items-center gap-1 rounded-full bg-accent px-3 py-0.5 text-xs font-bold text-white">
                <AppIcon name="star" :size="12" /> {{ $t('rewards.tier', { tier: authStore.user.tier || 'SILVER' }) }}
              </span>
            </div>
            <p class="mt-1 text-xs text-ink-muted">{{ $t('rewards.member') }}</p>
          </div>
        </div>

        <div class="w-full rounded-field border border-line bg-surface px-6 py-4 shadow-sm md:w-auto md:text-right">
          <div class="text-xs font-bold text-primary">{{ $t('rewards.coinsTitle') }}</div>
          <div class="mt-1 font-mono text-3xl font-extrabold tabular text-ink">
            {{ $n(authStore.user.tripCoins || 0) }} <span class="text-base text-primary">G</span>
          </div>
          <div class="mt-0.5 text-2xs text-ink-subtle">{{ $t('rewards.coinsHint') }}</div>
        </div>
      </div>
    </section>

    <!-- Guest Membership Hero -->
    <section v-else class="relative mx-auto max-w-3xl overflow-hidden rounded-card border border-line bg-gradient-to-br from-primary-soft/80 via-surface to-accent-soft/45 p-8 text-center shadow-card sm:p-12">
      <div class="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-primary/15 blur-3xl" aria-hidden="true" />
      <div class="relative space-y-5">
        <div class="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-primary/20 bg-surface text-primary shadow-sm">
          <AppIcon name="star" :size="28" />
        </div>
        <div class="space-y-2">
          <h1 class="font-display text-2xl font-extrabold text-ink sm:text-3xl">{{ $t('rewards.guestTitle') }}</h1>
          <p class="mx-auto max-w-md text-sm text-ink-muted">
            {{ $t('rewards.guestSub') }}
          </p>
        </div>
        <div class="pt-1">
          <NuxtLink :to="$localePath('/login')" class="btn-primary px-7 py-3">
            {{ $t('rewards.loginCta') }}
          </NuxtLink>
        </div>
      </div>
    </section>

    <!-- Member Features -->
    <div class="grid grid-cols-1 gap-5 md:grid-cols-3">
      <NuxtLink :to="$localePath('/my/coupons')" class="card group block space-y-2.5 p-6 transition hover:border-primary/40 hover:shadow-pop">
        <div class="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary-soft text-primary"><AppIcon name="gift" :size="22" /></div>
        <h2 class="text-base font-extrabold text-ink group-hover:text-primary">{{ $t('rewards.coupons') }}</h2>
        <p class="text-xs leading-relaxed text-ink-muted">{{ $t('rewards.couponsSub') }}</p>
      </NuxtLink>

      <NuxtLink :to="$localePath('/my/wishlist')" class="card group block space-y-2.5 p-6 transition hover:border-primary/40 hover:shadow-pop">
        <div class="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent-soft text-accent"><AppIcon name="heart" :size="22" /></div>
        <h2 class="text-base font-extrabold text-ink group-hover:text-primary">{{ $t('rewards.wishlist') }}</h2>
        <p class="text-xs leading-relaxed text-ink-muted">{{ $t('rewards.wishlistSub') }}</p>
      </NuxtLink>

      <NuxtLink :to="$localePath('/my/bookings')" class="card group block space-y-2.5 p-6 transition hover:border-primary/40 hover:shadow-pop">
        <div class="flex h-11 w-11 items-center justify-center rounded-2xl bg-success-soft text-success"><AppIcon name="bookings" :size="22" /></div>
        <h2 class="text-base font-extrabold text-ink group-hover:text-primary">{{ $t('rewards.bookings') }}</h2>
        <p class="text-xs leading-relaxed text-ink-muted">{{ $t('rewards.bookingsSub') }}</p>
      </NuxtLink>
    </div>
  </div>
</template>
