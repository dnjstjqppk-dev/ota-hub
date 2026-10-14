// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
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
      apiBase: 'http://localhost:8080/api/v1'
    }
  },
  app: {
    head: {
      title: 'Trip.com - 전 세계 항공권, 호텔, 기차표, 렌터카 최저가 예약',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'description', content: '트립닷컴에서 전 세계 호텔, 항공권, 기차표, 렌터카, 투어 티켓 및 eSIM을 최저가로 예약하세요.' }
      ],
      link: [
        { rel: 'icon', type: 'image/png', href: 'https://ak-d.tripcdn.com/images/0101s120008b8b8098B6D.png' }
      ]
    }
  }
})
