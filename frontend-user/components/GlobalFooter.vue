<script setup lang="ts">
import { BRAND } from '~/config/brand'
import { CATEGORIES, SUPPORT_LINKS } from '~/config/navigation'
import { useCompany } from '~/composables/useCompany'

const year = new Date().getFullYear()
const co = useCompany()
</script>

<template>
  <footer class="mt-24 border-t border-line bg-surface pb-28 pt-14 md:pb-12">
    <div class="mx-auto max-w-7xl px-4 lg:px-6">
      <div class="grid gap-10 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div class="max-w-sm space-y-4">
          <NuxtLink :to="$localePath('/')" class="inline-block" :title="BRAND.name">
            <img src="/logo.svg" alt="getfortrip" class="h-8 w-auto dark:hidden" width="132" height="32" />
            <img src="/logo-white.svg" alt="getfortrip" class="hidden h-8 w-auto dark:block" width="132" height="32" />
          </NuxtLink>
          <p class="text-sm leading-relaxed text-ink-muted">{{ $t('footer.tagline') }}</p>
          <a :href="`mailto:${BRAND.supportEmail}`" class="inline-flex min-h-[44px] items-center gap-2 text-sm font-semibold text-ink hover:text-primary">
            <AppIcon name="mail" :size="18" />{{ BRAND.supportEmail }}
          </a>
        </div>

        <nav :aria-label="$t('footer.products')">
          <h2 class="mb-4 text-sm font-bold text-ink">{{ $t('footer.products') }}</h2>
          <ul class="grid grid-cols-2 gap-x-4 gap-y-0 text-sm md:gap-y-2.5 text-ink-muted md:grid-cols-1">
            <li v-for="c in CATEGORIES" :key="c.key"><NuxtLink :to="$localePath(c.to)" class="inline-flex min-h-[44px] items-center md:min-h-0 hover:text-primary">{{ $t('nav.' + c.key) }}</NuxtLink></li>
          </ul>
        </nav>

        <nav :aria-label="$t('footer.support')">
          <h2 class="mb-4 text-sm font-bold text-ink">{{ $t('footer.support') }}</h2>
          <ul class="space-y-2.5 text-sm text-ink-muted">
            <li v-for="l in SUPPORT_LINKS" :key="l.to"><NuxtLink :to="$localePath(l.to)" class="inline-flex min-h-[44px] items-center md:min-h-0 hover:text-primary">{{ $t('support.' + l.key) }}</NuxtLink></li>
            <li><NuxtLink :to="$localePath('/my/bookings')" class="inline-flex min-h-[44px] items-center md:min-h-0 hover:text-primary">{{ $t('footer.lookup') }}</NuxtLink></li>
            <li><NuxtLink :to="$localePath('/safety')" class="inline-flex min-h-[44px] items-center md:min-h-0 hover:text-primary">{{ $t('footer.safety') }}</NuxtLink></li>
          </ul>
        </nav>

        <nav :aria-label="$t('footer.company')">
          <h2 class="mb-4 text-sm font-bold text-ink">getfortrip</h2>
          <ul class="space-y-2.5 text-sm text-ink-muted">
            <li><NuxtLink :to="$localePath('/about')" class="inline-flex min-h-[44px] items-center md:min-h-0 hover:text-primary">{{ $t('footer.about') }}</NuxtLink></li>
            <li><NuxtLink :to="$localePath('/news')" class="inline-flex min-h-[44px] items-center md:min-h-0 hover:text-primary">{{ $t('footer.news') }}</NuxtLink></li>
            <li><NuxtLink :to="$localePath('/careers')" class="inline-flex min-h-[44px] items-center md:min-h-0 hover:text-primary">{{ $t('footer.careers') }}</NuxtLink></li>
            <li><a :href="BRAND.partnerConsoleUrl" class="inline-flex min-h-[44px] items-center gap-1 hover:text-primary md:min-h-0">{{ $t('footer.partnerConsole') }} <AppIcon name="external" :size="14" /></a></li>
          </ul>
        </nav>
      </div>

      <div class="mt-12 flex flex-col gap-4 border-t border-line pt-6 text-xs leading-relaxed text-ink-subtle md:flex-row md:items-start md:justify-between">
        <div class="space-y-1">
          <p>{{ co.orPending(co.name || BRAND.companyName) }} · {{ $t('footer.ceo') }} {{ co.orPending(co.ceo) }} · {{ co.orPending(co.address) }}</p>
          <p>{{ $t('footer.bizNo') }} {{ co.orPending(co.bizNo) }} · {{ $t('footer.mailOrderNo') }} {{ co.orPending(co.mailOrderNo) }}</p>
          <p>{{ $t('footer.hosting') }} {{ co.hosting }}</p>
          <p>{{ $t('footer.csCenter') }} {{ co.orPending(co.csPhone) }} ({{ co.orPending(co.csHours) }}) · {{ BRAND.supportEmail }}</p>
          <p>{{ $t('footer.pgNote') }}</p>
          <p>{{ $t('footer.sellerNote') }}</p>
          <p>© {{ year }} {{ co.orPending(co.name || BRAND.companyName) }}</p>
        </div>
        <div class="flex shrink-0 gap-5 font-medium text-ink-muted">
          <NuxtLink :to="$localePath('/terms')" class="inline-flex min-h-[44px] items-center md:min-h-0 hover:text-ink">{{ $t('footer.terms') }}</NuxtLink>
          <NuxtLink :to="$localePath('/privacy')" class="inline-flex min-h-[44px] items-center md:min-h-0 font-bold text-ink hover:text-primary">{{ $t('footer.privacy') }}</NuxtLink>
          <NuxtLink :to="$localePath('/cookies')" class="inline-flex min-h-[44px] items-center md:min-h-0 hover:text-ink">{{ $t('footer.cookies') }}</NuxtLink>
          <NuxtLink :to="$localePath('/status')" class="inline-flex min-h-[44px] items-center md:min-h-0 hover:text-ink">{{ $t('footer.status') }}</NuxtLink>
        </div>
      </div>
    </div>
  </footer>
</template>
