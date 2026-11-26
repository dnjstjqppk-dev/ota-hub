<script setup lang="ts">
/**
 * CR-05 home marketing: hero banners (carousel), strip banners and curated
 * picks — all operator-managed from the admin console. Sections hide when empty.
 */
import { onBeforeUnmount, onMounted, ref, resolveComponent, watch } from 'vue'
import { assetUrl, isExternal, useMarketingSlots } from '~/composables/useMarketing'

// Resolved once in setup: the template picks <a>, NuxtLink or <div> per slot link.
const NuxtLinkCmp = resolveComponent('NuxtLink')
import { useCurrencyStore } from '~/stores/currency'

const { load, hero, strip, picks } = useMarketingSlots()
const currency = useCurrencyStore()
const active = ref(0)
let timer: ReturnType<typeof setInterval> | null = null

function go(i: number) {
  const n = hero.value.length
  active.value = n ? (i + n) % n : 0
}
// Phone swipe: horizontal drag flips the banner, vertical scroll stays native
// (touch-action: pan-y on the viewport lets the browser keep vertical panning).
let touchX: number | null = null
function onTouchStart(e: TouchEvent) {
  stopAuto()
  touchX = e.touches[0]?.clientX ?? null
}
function onTouchEnd(e: TouchEvent) {
  const x = e.changedTouches[0]?.clientX ?? null
  if (touchX !== null && x !== null) {
    const dx = x - touchX
    if (Math.abs(dx) > 40) go(active.value + (dx < 0 ? 1 : -1))
  }
  touchX = null
  startAuto()
}
function startAuto() {
  stopAuto()
  if (hero.value.length > 1 && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) timer = setInterval(() => go(active.value + 1), 6000)
}
function stopAuto() { if (timer) { clearInterval(timer); timer = null } }

onMounted(async () => { await load(); startAuto() })
watch(() => hero.value.length, startAuto)
onBeforeUnmount(stopAuto)

const DOMAIN_ICON: Record<string, string> = { HOTEL: 'hotel', ACTIVITY: 'ticket', CAR: 'car', TRANSFER: 'transfer', PACKAGE: 'package' }
const localePath = useLocalePath()
const linkAttrs = (u: string | null) => (isExternal(u) ? { href: u, target: '_blank', rel: 'noopener' } : { to: localePath(u || '/') })
</script>

<template>
  <div>
    <!-- Hero banners -->
    <section v-if="hero.length" class="mx-auto mt-10 max-w-7xl px-4 lg:px-6" aria-roledescription="carousel" :aria-label="$t('home.mkt.carousel')" data-testid="mkt-hero" @mouseenter="stopAuto" @mouseleave="startAuto" @focusin="stopAuto">
      <div class="relative select-none overflow-hidden rounded-card bg-midnight-900 [touch-action:pan-y]" @touchstart.passive="onTouchStart" @touchend.passive="onTouchEnd">
        <div class="flex transition-transform duration-500 ease-out will-change-transform" :style="{ transform: `translateX(-${active * 100}%)` }">
          <component :is="isExternal(s.linkUrl) ? 'a' : (s.linkUrl ? NuxtLinkCmp : 'div')"
            v-for="(s, i) in hero" :key="s.id" v-bind="s.linkUrl ? linkAttrs(s.linkUrl) : {}"
            class="relative block w-full shrink-0" :aria-hidden="i !== active" :tabindex="i === active ? 0 : -1"
            role="group" :aria-label="`${i + 1} / ${hero.length}: ${s.title}`">
            <SmartImg :src="assetUrl(s.imageUrl)" :alt="s.title" icon="gift" img-class="h-44 w-full object-cover sm:h-56 lg:h-64" />
            <div class="absolute inset-0 bg-gradient-to-r from-midnight-950/80 via-midnight-950/40 to-transparent" aria-hidden="true" />
            <div class="absolute inset-y-0 left-0 flex max-w-[85%] flex-col justify-center gap-1.5 px-6 sm:max-w-lg sm:px-10">
              <p class="line-clamp-2 text-xl font-extrabold leading-tight text-white sm:text-3xl">{{ s.title }}</p>
              <p v-if="s.subtitle" class="line-clamp-2 text-sm text-white/80 sm:text-base">{{ s.subtitle }}</p>
              <p v-if="s.endsAt" class="text-xs text-white/60">{{ $t('home.mkt.endsAt', { d: s.endsAt.slice(0, 10) }) }}</p>
            </div>
          </component>
        </div>
        <template v-if="hero.length > 1">
          <button type="button" class="absolute left-2 top-1/2 hidden h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-ink shadow-card sm:grid" :aria-label="$t('home.mkt.prevBanner')" @click="go(active - 1)"><AppIcon name="chevron-right" :size="20" class="rotate-180" /></button>
          <button type="button" class="absolute right-2 top-1/2 hidden h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-ink shadow-card sm:grid" :aria-label="$t('home.mkt.nextBanner')" @click="go(active + 1)"><AppIcon name="chevron-right" :size="20" /></button>
          <div class="absolute bottom-3 right-4 flex items-center gap-1">
            <button v-for="(s, i) in hero" :key="s.id" type="button" class="grid h-6 w-6 place-items-center" :aria-label="$t('home.mkt.viewBanner', { n: i + 1 })" :aria-current="i === active" @click="go(i)">
              <span class="h-1.5 rounded-full transition-[width,background-color]" :class="i === active ? 'w-5 bg-white' : 'w-1.5 bg-white/50'" />
            </button>
          </div>
        </template>
      </div>
    </section>

    <!-- Strip banners -->
    <section v-if="strip.length" class="mx-auto mt-6 grid max-w-7xl gap-3 px-4 sm:grid-cols-2 lg:px-6" :aria-label="$t('home.mkt.events')" data-testid="mkt-strip">
      <component :is="isExternal(s.linkUrl) ? 'a' : (s.linkUrl ? NuxtLinkCmp : 'div')" v-for="s in strip" :key="s.id" v-bind="s.linkUrl ? linkAttrs(s.linkUrl) : {}"
        class="flex min-h-[64px] items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 transition-colors hover:border-line-strong">
        <SmartImg v-if="s.imageUrl" :src="assetUrl(s.imageUrl)" alt="" icon="gift" img-class="h-10 w-10 shrink-0 rounded-xl object-cover" />
        <span v-else class="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary"><AppIcon name="gift" :size="20" /></span>
        <span class="min-w-0 flex-1">
          <span class="block truncate text-sm font-bold text-ink">{{ s.title }}</span>
          <span v-if="s.subtitle" class="block truncate text-xs text-ink-muted">{{ s.subtitle }}</span>
        </span>
        <AppIcon v-if="s.linkUrl" name="chevron-right" :size="18" class="shrink-0 text-ink-subtle" />
      </component>
    </section>

    <!-- Curated picks -->
    <section v-if="picks.length" class="mx-auto mt-16 max-w-7xl px-4 lg:px-6" aria-labelledby="h-picks" data-testid="mkt-picks">
      <h2 id="h-picks" class="text-xl font-bold tracking-tight text-ink sm:text-2xl">{{ $t('home.mkt.picks') }}</h2>
      <p class="mt-1 text-sm text-ink-muted">{{ $t('home.mkt.picksSub') }}</p>
      <ul class="rail -mx-4 mt-5 flex gap-4 px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-4">
        <li v-for="s in picks" :key="s.id" class="w-[72%] shrink-0 snap-start sm:w-auto">
          <NuxtLink :to="isExternal(s.linkUrl) ? (s.linkUrl || '/') : $localePath(s.linkUrl || '/')" class="group block overflow-hidden rounded-card border border-line bg-surface transition-shadow hover:shadow-card">
            <SmartImg :src="assetUrl(s.imageUrl)" :alt="s.product?.title || s.title" :icon="DOMAIN_ICON[s.product?.domainType || ''] || 'map-pin'" img-class="aspect-[4/3] w-full object-cover" />
            <div class="space-y-1 p-4">
              <p class="text-2xs font-semibold uppercase tracking-wide text-primary">{{ s.title }}</p>
              <p class="line-clamp-2 text-sm font-bold text-ink group-hover:text-primary">{{ s.product?.title }}</p>
              <p v-if="s.product?.eyebrow" class="truncate text-xs text-ink-subtle">{{ s.product.eyebrow }}</p>
              <p v-if="s.product?.priceKrw" class="pt-1 text-sm font-extrabold tabular text-ink">{{ currency.formatKRW(s.product.priceKrw) }}<span class="ml-1 text-xs font-medium text-ink-subtle">{{ $t('home.mkt.fromRef') }}</span></p>
            </div>
          </NuxtLink>
        </li>
      </ul>
    </section>
  </div>
</template>
