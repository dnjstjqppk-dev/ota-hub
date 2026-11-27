<script setup lang="ts">
import { BRAND } from '~/config/brand'
import { CATEGORIES, SUPPORT_LINKS } from '~/config/navigation'
import { useCompany } from '~/composables/useCompany'

const year = new Date().getFullYear()
const co = useCompany()
</script>

<template>
  <footer class="mt-24 border-t border-midnight-700 bg-midnight-900 pb-28 pt-16 text-white/80 md:pb-14 print:hidden">
    <div class="mx-auto max-w-7xl px-4 lg:px-6">
      <div class="grid gap-10 md:grid-cols-[1.5fr_repeat(3,1fr)]">
        <div class="max-w-sm space-y-4">
          <NuxtLink :to="$localePath('/')" class="inline-block" :title="BRAND.name">
            <img src="/logo-white.svg" alt="getfortrip" class="h-8 w-auto" width="132" height="32" />
          </NuxtLink>
          <p class="text-sm leading-relaxed text-white/65">{{ $t('footer.tagline') }}</p>
          <a :href="`mailto:${BRAND.supportEmail}`" class="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs font-bold text-white transition-colors hover:border-horizon-300/50 hover:text-horizon-300">
            <AppIcon name="mail" :size="16" />{{ BRAND.supportEmail }}
          </a>
        </div>

        <nav :aria-label="$t('footer.products')">
          <h2 class="mb-4 text-xs font-bold uppercase tracking-widest text-horizon-300">{{ $t('footer.products') }}</h2>
          <ul class="grid grid-cols-2 gap-x-4 gap-y-0 text-sm text-white/70 md:grid-cols-1 md:gap-y-2.5">
            <li v-for="c in CATEGORIES" :key="c.key"><NuxtLink :to="$localePath(c.to)" class="inline-flex min-h-[44px] items-center transition-colors hover:text-white lg:min-h-0">{{ $t('nav.' + c.key) }}</NuxtLink></li>
          </ul>
        </nav>

        <nav :aria-label="$t('footer.support')">
          <h2 class="mb-4 text-xs font-bold uppercase tracking-widest text-horizon-300">{{ $t('footer.support') }}</h2>
          <ul class="space-y-2.5 text-sm text-white/70">
            <li v-for="l in SUPPORT_LINKS" :key="l.to"><NuxtLink :to="$localePath(l.to)" class="inline-flex min-h-[44px] items-center transition-colors hover:text-white lg:min-h-0">{{ $t('support.' + l.key) }}</NuxtLink></li>
            <li><NuxtLink :to="$localePath('/my/bookings')" class="inline-flex min-h-[44px] items-center transition-colors hover:text-white lg:min-h-0">{{ $t('footer.lookup') }}</NuxtLink></li>
            <li><NuxtLink :to="$localePath('/safety')" class="inline-flex min-h-[44px] items-center transition-colors hover:text-white lg:min-h-0">{{ $t('footer.safety') }}</NuxtLink></li>
          </ul>
        </nav>

        <nav :aria-label="$t('footer.company')">
          <h2 class="mb-4 text-xs font-bold uppercase tracking-widest text-horizon-300">getfortrip</h2>
          <ul class="space-y-2.5 text-sm text-white/70">
            <li><NuxtLink :to="$localePath('/about')" class="inline-flex min-h-[44px] items-center transition-colors hover:text-white lg:min-h-0">{{ $t('footer.about') }}</NuxtLink></li>
            <li><NuxtLink :to="$localePath('/news')" class="inline-flex min-h-[44px] items-center transition-colors hover:text-white lg:min-h-0">{{ $t('footer.news') }}</NuxtLink></li>
            <li><NuxtLink :to="$localePath('/careers')" class="inline-flex min-h-[44px] items-center transition-colors hover:text-white lg:min-h-0">{{ $t('footer.careers') }}</NuxtLink></li>
            <li><a :href="BRAND.partnerConsoleUrl" class="inline-flex min-h-[44px] items-center gap-1 transition-colors hover:text-horizon-300 lg:min-h-0">{{ $t('footer.partnerConsole') }} <AppIcon name="external" :size="14" /></a></li>
          </ul>
        </nav>
      </div>

      <div class="mt-12 flex flex-col gap-4 border-t border-white/10 pt-6 text-xs leading-relaxed text-white/50 md:flex-row md:items-start md:justify-between">
        <div class="space-y-1">
          <p>{{ co.orPending(co.name || BRAND.companyName) }} · {{ $t('footer.ceo') }} {{ co.orPending(co.ceo) }} · {{ co.orPending(co.address) }}</p>
          <p>{{ $t('footer.bizNo') }} {{ co.orPending(co.bizNo) }} · {{ $t('footer.mailOrderNo') }} {{ co.orPending(co.mailOrderNo) }}</p>
          <p>{{ $t('footer.hosting') }} {{ co.hosting }}</p>
          <p>{{ $t('footer.csCenter') }} {{ co.orPending(co.csPhone) }} ({{ co.orPending(co.csHours) }}) · {{ BRAND.supportEmail }}</p>
          <p>{{ $t('footer.pgNote') }}</p>
          <p>{{ $t('footer.sellerNote') }}</p>
          <p class="pt-1 text-white/60">© {{ year }} {{ co.orPending(co.name || BRAND.companyName) }}</p>
        </div>
        <div class="flex shrink-0 gap-5 font-semibold text-white/70">
          <NuxtLink :to="$localePath('/terms')" class="inline-flex min-h-[44px] items-center transition-colors hover:text-white lg:min-h-0">{{ $t('footer.terms') }}</NuxtLink>
          <NuxtLink :to="$localePath('/privacy')" class="inline-flex min-h-[44px] items-center font-bold text-white transition-colors hover:text-horizon-300 lg:min-h-0">{{ $t('footer.privacy') }}</NuxtLink>
          <NuxtLink :to="$localePath('/cookies')" class="inline-flex min-h-[44px] items-center transition-colors hover:text-white lg:min-h-0">{{ $t('footer.cookies') }}</NuxtLink>
          <NuxtLink :to="$localePath('/status')" class="inline-flex min-h-[44px] items-center transition-colors hover:text-white lg:min-h-0">{{ $t('footer.status') }}</NuxtLink>
        </div>
      </div>
    </div>
  </footer>
</template>
