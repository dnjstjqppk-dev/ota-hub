/**
 * Synchronizes Nuxt i18n, currency store, and <html lang> with the single
 * country-subdomain + ?locale=xx-yy&curr=XXX + pref_* cookie mapping
 * (config/locale.config.ts) on both SSR and client navigation.
 */
import { ref, watch } from 'vue'
import { useCurrencyStore } from '~/stores/currency'
import { PREF_COOKIES, resolveLocale } from '~/config/locale.config'

function readClientCookies(): Record<string, string> {
  if (typeof document === 'undefined') return {}
  const out: Record<string, string> = {}
  for (const part of String(document.cookie || '').split(';')) {
    const i = part.indexOf('=')
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim())
  }
  return out
}

export default defineNuxtPlugin(async (nuxtApp) => {
  const i18n = nuxtApp.$i18n as any
  const currency = useCurrencyStore()
  const route = useRoute()

  // Capture SSR request host & preference cookies synchronously before any await
  // so Nuxt 4 composables never run outside the active plugin context.
  let ssrHostname = ''
  let ssrCookies: Record<string, string> = {}
  if (import.meta.server) {
    try {
      ssrHostname = useRequestURL().hostname
    } catch {
      ssrHostname = ''
    }
    try {
      const sub = useCookie(PREF_COOKIES.sub).value || ''
      const locale = useCookie(PREF_COOKIES.locale).value || ''
      const curr = useCookie(PREF_COOKIES.curr).value || ''
      ssrCookies = {
        ...(sub ? { [PREF_COOKIES.sub]: sub } : {}),
        ...(locale ? { [PREF_COOKIES.locale]: locale } : {}),
        ...(curr ? { [PREF_COOKIES.curr]: curr } : {}),
      }
    } catch {
      ssrCookies = {}
    }
  }

  const getHostname = () =>
    import.meta.server
      ? ssrHostname
      : typeof window !== 'undefined'
        ? window.location.hostname
        : ''

  const getCookies = (): Record<string, string> =>
    import.meta.server ? ssrCookies : readClientCookies()

  const initialCtx = resolveLocale({
    hostname: getHostname(),
    searchParams: route.query as Record<string, unknown>,
    cookies: getCookies(),
  })
  const currentLang = ref(initialCtx.hreflang)

  // Register reactive <html lang> before any await so unhead binds cleanly on SSR/prerender.
  useHead({
    htmlAttrs: {
      lang: currentLang,
    },
  })

  const applyFromRoute = async (query: Record<string, unknown>) => {
    const ctx = resolveLocale({
      hostname: getHostname(),
      searchParams: query,
      cookies: getCookies(),
    })
    currentLang.value = ctx.hreflang
    if (i18n && i18n.locale?.value !== ctx.i18n) {
      if (typeof i18n.setLocale === 'function') {
        await i18n.setLocale(ctx.i18n)
      } else if (i18n.locale) {
        i18n.locale.value = ctx.i18n
      }
    }
    if (currency.activeCurrency !== ctx.curr) {
      currency.setCurrency(ctx.curr)
    }
    if (import.meta.client && typeof document !== 'undefined') {
      document.documentElement.lang = ctx.hreflang
    }
    return ctx
  }

  await applyFromRoute(route.query as Record<string, unknown>)

  if (import.meta.client) {
    watch(
      () => [route.query.locale, route.query.curr],
      () => {
        void applyFromRoute(route.query as Record<string, unknown>)
      }
    )
  }
})
