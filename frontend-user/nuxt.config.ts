// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  ssr: true,
  nitro: {
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
        '/hotels/detail/hotel-001',
        '/hotels/detail/hotel-002',
        '/flights',
        '/flights/search',
        '/flights/detail',
        '/flights/detail/flt_ke703',
        '/flights/detail/flt_oz102',
        '/flights/detail/fl-001',
        '/flights/detail/fl-002',
        '/trains',
        '/trains/search',
        '/trains/detail',
        '/trains/detail/trn_ktx_021',
        '/trains/detail/trn_shinkansen_nozomi23',
        '/trains/detail/tr-001',
        '/trains/detail/tr-002',
        '/cars',
        '/cars/list',
        '/cars/detail',
        '/cars/detail/car_avante_01',
        '/cars/detail/car_yaris_01',
        '/cars/detail/car-001',
        '/cars/detail/car-002',
        '/transfers',
        '/transfers/list',
        '/transfers/detail',
        '/transfers/detail/tf-001',
        '/transfers/detail/tf-002',
        '/things-to-do',
        '/things-to-do/list',
        '/things-to-do/detail',
        '/things-to-do/detail/act_disney_tokyo',
        '/things-to-do/detail/act_fuji_tour',
        '/things-to-do/detail/act-001',
        '/things-to-do/detail/act-002',
        '/packages',
        '/packages/list',
        '/packages/builder',
        '/packages/detail',
        '/packages/detail/pkg_tokyo_4d3n',
        '/packages/detail/pkg_osaka_3d2n',
        '/packages/detail/pkg-001',
        '/packages/detail/pkg-002',
        '/deals',
        '/rewards',
        '/login',
        '/help',
        '/moments',
        '/trip-best',
        '/partner/api-docs',
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
        '/my/bookings/GF-HT-98214'
      ]
    }
  },
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
      apiBase: process.env.NUXT_PUBLIC_API_BASE || '/api/v1',
      brandName: 'getfortrip',
      brandDomain: process.env.PUBLIC_SITE_URL ? new URL(process.env.PUBLIC_SITE_URL).hostname : 'getfortrip.com'
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
