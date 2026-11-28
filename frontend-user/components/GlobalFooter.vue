<script setup lang="ts">
import { BRAND } from '~/config/brand'
import { CATEGORIES, SUPPORT_LINKS } from '~/config/navigation'
import { useCompany } from '~/composables/useCompany'

const year = new Date().getFullYear()
const co = useCompany()
</script>

<template>
  <footer class="mt-20 border-t border-line bg-surface-sunken/75 pb-24 pt-14 text-ink dark:bg-surface md:pb-12 print:hidden">
    <div class="mx-auto max-w-7xl px-4 lg:px-6">
      <!-- Top Architectural Support & Partner Bar -->
      <div class="mb-12 flex flex-col justify-between gap-4 rounded-card border border-line bg-surface p-5 shadow-card sm:flex-row sm:items-center sm:px-7">
        <div class="space-y-1">
          <NuxtLink :to="$localePath('/')" class="inline-flex items-center" :title="BRAND.name">
            <img src="/logo.svg" alt="getfortrip" class="h-7 w-auto dark:hidden" width="128" height="28" />
            <img src="/logo-white.svg" alt="getfortrip" class="hidden h-7 w-auto dark:block" width="128" height="28" />
          </NuxtLink>
          <p class="text-sm text-ink-muted">{{ $t('footer.tagline') }}</p>
        </div>
        <div class="flex flex-wrap items-center gap-2.5">
          <a :href="`mailto:${BRAND.supportEmail}`" class="btn-secondary !min-h-[40px] !px-4 !py-2 !text-xs">
            <AppIcon name="mail" :size="15" class="text-primary" />{{ BRAND.supportEmail }}
          </a>
          <a :href="BRAND.partnerConsoleUrl" class="btn-primary !min-h-[40px] !px-4 !py-2 !text-xs">
            <AppIcon name="briefcase" :size="15" />{{ $t('footer.partnerConsole') }}
          </a>
        </div>
      </div>

      <!-- Directory Columns -->
      <div class="grid grid-cols-2 gap-8 sm:grid-cols-3">
        <nav :aria-label="$t('footer.products')" class="col-span-2 sm:col-span-1">
          <h2 class="mb-3 text-2xs font-bold uppercase tracking-[0.18em] text-primary">{{ $t('footer.products') }}</h2>
          <ul class="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm text-ink-muted sm:grid-cols-1">
            <li v-for="c in CATEGORIES" :key="c.key">
              <NuxtLink :to="$localePath(c.to)" class="inline-flex min-h-[38px] items-center transition-colors hover:text-primary sm:min-h-[30px]">{{ $t('nav.' + c.key) }}</NuxtLink>
            </li>
          </ul>
        </nav>

        <nav :aria-label="$t('footer.support')">
          <h2 class="mb-3 text-2xs font-bold uppercase tracking-[0.18em] text-primary">{{ $t('footer.support') }}</h2>
          <ul class="space-y-1.5 text-sm text-ink-muted">
            <li v-for="l in SUPPORT_LINKS" :key="l.to"><NuxtLink :to="$localePath(l.to)" class="inline-flex min-h-[38px] items-center transition-colors hover:text-primary sm:min-h-[30px]">{{ $t('support.' + l.key) }}</NuxtLink></li>
            <li><NuxtLink :to="$localePath('/my/bookings')" class="inline-flex min-h-[38px] items-center transition-colors hover:text-primary sm:min-h-[30px]">{{ $t('footer.lookup') }}</NuxtLink></li>
            <li><NuxtLink :to="$localePath('/safety')" class="inline-flex min-h-[38px] items-center transition-colors hover:text-primary sm:min-h-[30px]">{{ $t('footer.safety') }}</NuxtLink></li>
          </ul>
        </nav>

        <nav :aria-label="$t('footer.company')">
          <h2 class="mb-3 text-2xs font-bold uppercase tracking-[0.18em] text-primary">getfortrip</h2>
          <ul class="space-y-1.5 text-sm text-ink-muted">
            <li><NuxtLink :to="$localePath('/about')" class="inline-flex min-h-[38px] items-center transition-colors hover:text-primary sm:min-h-[30px]">{{ $t('footer.about') }}</NuxtLink></li>
            <li><NuxtLink :to="$localePath('/news')" class="inline-flex min-h-[38px] items-center transition-colors hover:text-primary sm:min-h-[30px]">{{ $t('footer.news') }}</NuxtLink></li>
            <li><NuxtLink :to="$localePath('/careers')" class="inline-flex min-h-[38px] items-center transition-colors hover:text-primary sm:min-h-[30px]">{{ $t('footer.careers') }}</NuxtLink></li>
            <li><NuxtLink :to="$localePath('/sustainability')" class="inline-flex min-h-[38px] items-center transition-colors hover:text-primary sm:min-h-[30px]">Sustainability</NuxtLink></li>
          </ul>
        </nav>
      </div>

      <!-- Legal & Business Colophon -->
      <div class="mt-10 flex flex-col gap-5 border-t border-line pt-6 text-xs leading-relaxed text-ink-subtle lg:flex-row lg:items-start lg:justify-between">
        <div class="space-y-1">
          <p>{{ co.orPending(co.name || BRAND.companyName) }} · {{ $t('footer.ceo') }} {{ co.orPending(co.ceo) }} · {{ co.orPending(co.address) }}</p>
          <p>{{ $t('footer.bizNo') }} {{ co.orPending(co.bizNo) }} · {{ $t('footer.mailOrderNo') }} {{ co.orPending(co.mailOrderNo) }} · {{ $t('footer.hosting') }} {{ co.hosting }}</p>
          <p>{{ $t('footer.csCenter') }} {{ co.orPending(co.csPhone) }} ({{ co.orPending(co.csHours) }}) · {{ BRAND.supportEmail }}</p>
          <p>{{ $t('footer.pgNote') }} {{ $t('footer.sellerNote') }}</p>
          <p class="pt-1 font-medium text-ink-muted">© {{ year }} {{ co.orPending(co.name || BRAND.companyName) }}</p>
        </div>
        <div class="flex flex-wrap gap-x-5 gap-y-2 font-semibold text-ink-muted">
          <NuxtLink :to="$localePath('/terms')" class="inline-flex min-h-[36px] items-center transition-colors hover:text-primary">{{ $t('footer.terms') }}</NuxtLink>
          <NuxtLink :to="$localePath('/privacy')" class="inline-flex min-h-[36px] items-center font-bold text-ink transition-colors hover:text-primary">{{ $t('footer.privacy') }}</NuxtLink>
          <NuxtLink :to="$localePath('/refund-policy')" class="inline-flex min-h-[36px] items-center transition-colors hover:text-primary">{{ $t('checkout.refundLink') }}</NuxtLink>
          <NuxtLink :to="$localePath('/cookies')" class="inline-flex min-h-[36px] items-center transition-colors hover:text-primary">{{ $t('footer.cookies') }}</NuxtLink>
          <NuxtLink :to="$localePath('/status')" class="inline-flex min-h-[36px] items-center transition-colors hover:text-primary">{{ $t('footer.status') }}</NuxtLink>
        </div>
      </div>
    </div>
  </footer>
</template>
