// https://nuxt.com/docs/api/configuration/nuxt-config
declare const process: {
  env: Record<string, string | undefined>
}

// TG-15: the user portal renders on demand (Nitro cloudflare-module preset + ISR).
// Only product-independent marketing pages prerender — catalog routes render
// at first request and revalidate hourly (isr: 3600). The build-time D1
// snapshot (gen-seo-snapshot.mjs / prerender-routes.json, C7-era) is gone:
// new products are reachable without a rebuild, and /sitemap.xml already
// reads D1 live (worker/src/routes/seo.ts).
export default defineNuxtConfig({
  ssr: true,
  // Private, query-driven pages render client-side only. A prerendered copy would hydrate with the
  // build-time route (no query string), so e.g. /checkout?domain=... or the PG return URL lost its params.
  routeRules: {
    '/checkout': { ssr: false },
    '/checkout/**': { ssr: false },
    '/booking/**': { ssr: false },
    '/my': { ssr: false },
    '/my/**': { ssr: false },
    '/reset-password': { ssr: false },
    '/login': { ssr: false },
    '/register': { ssr: false },
    '/status': { ssr: false },
    // TG-15: catalog renders on demand, cached at the edge for 1h (SWR).
    '/hotels': { isr: 3600 },
    '/hotels/**': { isr: 3600 },
    '/flights': { isr: 3600 },
    '/flights/**': { isr: 3600 },
    '/trains': { isr: 3600 },
    '/trains/**': { isr: 3600 },
    '/cars': { isr: 3600 },
    '/cars/**': { isr: 3600 },
    '/transfers': { isr: 3600 },
    '/transfers/**': { isr: 3600 },
    '/things-to-do': { isr: 3600 },
    '/things-to-do/**': { isr: 3600 },
    '/packages': { isr: 3600 },
    '/packages/**': { isr: 3600 },
    '/deals': { isr: 3600 },
    '/trip-best': { isr: 3600 },
    // P5: affiliate landings + help content are public and cacheable (hourly SWR).
    '/esim': { isr: 3600 },
    '/insurance': { isr: 3600 },
    '/faq': { isr: 3600 },
    '/help': { isr: 3600 }
  },
  nitro: {
    // cloudflare-module (ES modules + nodejs_compat). The plain 'cloudflare'
    // preset emits service-worker syntax, which wrangler 4 rejects for builds
    // with node: imports (observed 2026-11-16).
    preset: 'cloudflare-module',
    prerender: {
      crawlLinks: false,
      routes: ['/', '/help', '/moments', '/rewards']
    }
  },
  modules: ['@nuxtjs/i18n'],
  i18n: {
    locales: [
      { code: 'ko', iso: 'ko-KR', name: '한국어', file: 'ko.json' },
      { code: 'en', iso: 'en-US', name: 'English', file: 'en.json' },
      { code: 'ja', iso: 'ja-JP', name: '日本語', file: 'ja.json' },
      { code: 'zh', iso: 'zh-CN', name: '中文', file: 'zh.json' }
    ],
    defaultLocale: 'ko',
    lazy: true,
    langDir: 'locales',
    strategy: 'prefix_except_default',
    detectBrowserLanguage: {
      useCookie: true,
      cookieKey: 'getfortrip_locale',
      redirectOn: 'root'
    }
  },

  compatibilityDate: '2025-07-15',
  devtools: { enabled: false },
  css: ['assets/css/tailwind.css'],
  vite: {
    build: {
      cssMinify: 'esbuild'
    }
  },
  postcss: {
    plugins: {
      tailwindcss: {},
      autoprefixer: {},
    },
  },
  runtimeConfig: {
    // TG-15: absolute API base for SSR fetches (server-only, never shipped to
    // browsers). Overridden at runtime by NUXT_API_BASE_SERVER (wrangler vars);
    // the baked default points at the hub dev server.
    apiBaseServer: 'http://127.0.0.1:8799/api/v1',
    public: {
      apiBase: process.env.NUXT_PUBLIC_API_BASE || '/api/v1',
      sentryDsn: process.env.NUXT_PUBLIC_SENTRY_DSN || '',
      sentryEnv: process.env.NUXT_PUBLIC_SENTRY_ENV || 'production',
      sentryRelease: process.env.NUXT_PUBLIC_SENTRY_RELEASE || '',
      brandName: 'getfortrip',
      brandDomain: process.env.PUBLIC_SITE_URL ? new URL(process.env.PUBLIC_SITE_URL).hostname : 'getfortrip.com',
      // A5/A6: company + CPO facts are build-time env, never hardcoded. Empty = "preparing"
      // in the UI and a failure in the pre-deploy commercialization check (Phase 7).
      company: {
        name: process.env.NUXT_PUBLIC_COMPANY_NAME || '',
        ceo: process.env.NUXT_PUBLIC_COMPANY_CEO || '',
        address: process.env.NUXT_PUBLIC_COMPANY_ADDRESS || '',
        bizNo: process.env.NUXT_PUBLIC_COMPANY_BIZ_NO || '',
        mailOrderNo: process.env.NUXT_PUBLIC_COMPANY_MAILORDER_NO || '',
        csPhone: process.env.NUXT_PUBLIC_COMPANY_CS_PHONE || '',
        csHours: process.env.NUXT_PUBLIC_COMPANY_CS_HOURS || '',
        cpoName: process.env.NUXT_PUBLIC_COMPANY_CPO_NAME || '',
        cpoDept: process.env.NUXT_PUBLIC_COMPANY_CPO_DEPT || '',
        cpoPhone: process.env.NUXT_PUBLIC_COMPANY_CPO_PHONE || '',
        cpoEmail: process.env.NUXT_PUBLIC_COMPANY_CPO_EMAIL || '',
        hosting: process.env.NUXT_PUBLIC_COMPANY_HOSTING || 'Cloudflare'
      }
    }
  },
  app: {
    head: {
      title: 'getfortrip - 전 세계 항공권, 호텔, 기차표, 렌터카 예약',
      htmlAttrs: {
        lang: 'ko'
      },
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'description', content: 'getfortrip에서 전 세계 호텔, 항공권, 기차표, 렌터카, 투어 티켓 및 eSIM을 비교하고 간편하게 예약하세요.' },
        { property: 'og:site_name', content: 'getfortrip' },
        { property: 'og:title', content: 'getfortrip - 전 세계 스마트 여행 예약 플랫폼' },
        { property: 'og:description', content: '전 세계 항공권, 특가 호텔, 고속열차, 렌터카를 한 번에 예약하세요.' },
        { property: 'og:type', content: 'website' },
        { property: 'og:image', content: '/symbol.svg' },
        { name: 'twitter:card', content: 'summary' },
        { name: 'twitter:title', content: 'getfortrip - 전 세계 스마트 여행 예약 플랫폼' },
        { name: 'twitter:description', content: '전 세계 항공권, 호텔, 기차표, 렌터카 예약' },
        { name: 'theme-color', content: '#1A6BFF' }
      ],
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'apple-touch-icon', href: '/symbol.svg' },
        // Pretendard (brand typeface, BRANDING.md) — dynamic subset, loaded only for glyphs in use.
        { rel: 'preconnect', href: 'https://cdn.jsdelivr.net', crossorigin: '' },
        { rel: 'stylesheet', href: 'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css' }
      ],
      script: [
        // Apply the saved theme before first paint (no flash for returning dark-mode users).
        { innerHTML: "try{if(localStorage.getItem('getfortrip_theme')==='dark')document.documentElement.classList.add('dark')}catch(e){}" }
      ]
    }
  }
})
