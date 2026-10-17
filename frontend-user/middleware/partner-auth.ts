export default defineNuxtRouteMiddleware((to) => {
  // During SSG prerendering on server, do not redirect to prevent 500 error; let the safe v-else card render
  if (import.meta.server) return

  if (to.path.startsWith('/partner') && to.path !== '/partner/login') {
    const partnerStore = usePartnerStore()
    if (!partnerStore.isLoggedIn || !partnerStore.partner) {
      return navigateTo('/partner/login', { replace: true })
    }
  }
})
