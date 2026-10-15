// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  ssr: false,
  srcDir: '.',
  compatibilityDate: '2025-07-15',
  devtools: { enabled: false },
  css: ['assets/css/tailwind.css'],
  postcss: {
    plugins: {
      tailwindcss: {},
      autoprefixer: {},
    },
  },
  runtimeConfig: {
    public: {
      apiBase: 'http://localhost:8080/api/v1',
      brandName: 'getfortrip',
      brandDomain: 'getfortrip.com'
    }
  },
  app: {
    head: {
      title: 'getfortrip - 전 세계 항공권, 호텔, 기차표, 렌터카 최저가 예약',
      htmlAttrs: {
        lang: 'ko'
      },
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'description', content: 'getfortrip에서 전 세계 호텔, 항공권, 기차표, 렌터카, 투어 티켓 및 eSIM을 실시간 최저가로 비교하고 간편하게 예약하세요.' },
        { property: 'og:site_name', content: 'getfortrip' },
        { property: 'og:title', content: 'getfortrip - 전 세계 스마트 여행 예약 플랫폼' },
        { property: 'og:description', content: '전 세계 최저가 항공권, 특가 호텔, 고속열차, 렌터카를 한 번에 예약하세요.' },
        { property: 'og:type', content: 'website' },
        { property: 'og:image', content: '/symbol.svg' },
        { name: 'twitter:card', content: 'summary' },
        { name: 'twitter:title', content: 'getfortrip - 전 세계 스마트 여행 예약 플랫폼' },
        { name: 'twitter:description', content: '전 세계 최저가 항공권, 호텔, 기차표, 렌터카 실시간 예약' },
        { name: 'theme-color', content: '#1A6BFF' }
      ],
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' },
        { rel: 'apple-touch-icon', href: '/symbol.svg' }
      ]
    }
  }
})
