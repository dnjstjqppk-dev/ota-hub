import { defineNuxtRouteMiddleware, useCookie } from '#app'
import { useLocaleStore, type SupportedLocale } from '~/stores/locale'

export default defineNuxtRouteMiddleware((to) => {
  if (import.meta.server) {
    return
  }

  const SUPPORTED_LOCALES: SupportedLocale[] = ['ko-kr', 'en-us', 'ja-jp', 'zh-cn']
  const localeStore = useLocaleStore()
  localeStore.initLocale()

  const localeCookie = useCookie<string>('getfortrip_locale', {
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
    path: '/'
  })

  const currentLocaleQuery = to.query.locale as string | undefined

  if (currentLocaleQuery) {
    const normalized = currentLocaleQuery.toLowerCase() as SupportedLocale
    if (SUPPORTED_LOCALES.includes(normalized)) {
      localeStore.setLocale(normalized)
    }
  } else if (localeCookie.value && SUPPORTED_LOCALES.includes(localeCookie.value as SupportedLocale)) {
    localeStore.setLocale(localeCookie.value as SupportedLocale)
  }
})
