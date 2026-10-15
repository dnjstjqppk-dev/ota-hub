import { defineNuxtRouteMiddleware, navigateTo, useCookie } from '#app'

export default defineNuxtRouteMiddleware((to) => {
  const SUPPORTED_LOCALES = ['ko-kr', 'en-us', 'ja-jp', 'zh-cn', 'zh-tw']
  const DEFAULT_LOCALE = 'ko-kr'

  const localeCookie = useCookie<string>('getfortrip_locale', {
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
    path: '/'
  })

  const currentLocaleQuery = to.query.locale as string | undefined

  // URL에 locale 쿼리가 없으면 기본 ko-kr 주입하여 리디렉션 (?locale=ko-kr)
  if (!currentLocaleQuery) {
    const targetLocale = localeCookie.value && SUPPORTED_LOCALES.includes(localeCookie.value)
      ? localeCookie.value
      : DEFAULT_LOCALE

    localeCookie.value = targetLocale

    return navigateTo({
      path: to.path,
      query: {
        ...to.query,
        locale: targetLocale
      }
    }, { replace: true })
  }

  // 쿼리가 있으면 쿠키와 동기화
  const normalized = currentLocaleQuery.toLowerCase()
  if (SUPPORTED_LOCALES.includes(normalized)) {
    if (localeCookie.value !== normalized) {
      localeCookie.value = normalized
    }
  }
})

