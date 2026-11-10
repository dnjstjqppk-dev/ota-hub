// https://nuxt.com/docs/api/configuration/nuxt-config
declare const process: {
  env: Record<string, string | undefined>
}

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
    '/register': { ssr: false }
  },
  nitro: {
    preset: 'static',
    prerender: {
      crawlLinks: true,
      routes: [
        '/',
        '/hotels',
        '/hotels/list',
        '/hotels/detail',
        '/hotels/detail/htl_seoul_01',
        '/hotels/detail/htl_tokyo_01',
        '/hotels/detail/htl_osaka_01',
        '/flights',
        '/flights/search',
        '/flights/detail',
        '/flights/detail/flt_ke703',
        '/flights/detail/flt_oz102',
        '/trains',
        '/trains/search',
        '/trains/detail',
        '/trains/detail/trn_ktx_021',
        '/trains/detail/trn_shinkansen_nozomi23',
        '/cars',
        '/cars/list',
        '/cars/detail',
        '/cars/detail/car_avante_01',
        '/cars/detail/car_yaris_01',
        '/transfers',
        '/transfers/list',
        '/transfers/detail',
        '/things-to-do',
        '/things-to-do/list',
        '/things-to-do/detail',
        '/things-to-do/detail/act_disney_tokyo',
        '/things-to-do/detail/act_fuji_tour',
        '/packages',
        '/packages/list',
        '/packages/detail',
        '/packages/detail/pkg_tokyo_4d3n',
        '/packages/detail/pkg_osaka_3d2n',
        '/deals',
        '/rewards',
        '/login',
        '/help',
        '/moments',
        '/trip-best',
        '/booking/success',
        '/booking/complete',
        '/hotels/booking',
        '/flights/booking',
        '/trains/booking',
        '/cars/booking',
        '/transfers/booking',
        '/things-to-do/booking',
        '/packages/booking',
        '/my/bookings',
        '/transfers/detail/tf_icn_van_01'
      ]
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
    public: {
      apiBase: process.env.NUXT_PUBLIC_API_BASE || '/api/v1',
      sentryDsn: process.env.NUXT_PUBLIC_SENTRY_DSN || '',
      sentryEnv: process.env.NUXT_PUBLIC_SENTRY_ENV || 'production',
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
        travelNo: process.env.NUXT_PUBLIC_COMPANY_TRAVEL_NO || '',
        insurance: process.env.NUXT_PUBLIC_COMPANY_INSURANCE || '',
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
