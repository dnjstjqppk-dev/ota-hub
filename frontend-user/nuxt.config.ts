// https://nuxt.com/docs/api/configuration/nuxt-config
import { readFileSync } from 'node:fs'
declare const process: {
  env: Record<string, string | undefined>
}

// TG-15: the user portal renders on demand (Nitro cloudflare-module preset + ISR).
// Only product-independent marketing pages prerender — catalog routes render
// at first request and revalidate hourly (isr: 3600). The build-time D1
// snapshot (gen-seo-snapshot.mjs / prerender-routes.json, C7-era) is gone:
// new products are reachable without a rebuild, and /sitemap.xml already
// reads D1 live (worker/src/routes/seo.ts).

// ssr:false shells cannot carry a noindex <meta> in their HTML (useHead runs
// client-side only), so crawlers that do fetch them get it as a header.
const NOINDEX = { 'X-Robots-Tag': 'noindex' }

// Per-page render rules (ko paths). Locale-prefixed copies are generated below
// (strategy prefix_except_default), so a rule here applies to /en|/ja|/zh too.
const PAGE_RULES: Record<string, Record<string, unknown>> = {
  // Private, query-driven pages render client-side only. A prerendered copy would hydrate with the
  // build-time route (no query string), so e.g. /checkout?domain=... or the PG return URL lost its params.
  '/checkout': { ssr: false },
  '/checkout/**': { ssr: false },
  '/booking/**': { ssr: false },
  '/my': { ssr: false },
  '/my/**': { ssr: false },
  '/reset-password': { ssr: false, headers: NOINDEX },
  '/login': { ssr: false, headers: NOINDEX },
  '/register': { ssr: false, headers: NOINDEX },
  '/status': { ssr: false },
  // TG-15: catalog renders on demand. NOTE (2026-11-27): on the cloudflare-module
  // preset `isr` caches nothing by itself — it only switches on _payload.json
  // extraction. The edge cache lives in edge/edge-guard.mjs (Cache API).
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
  // P5: affiliate landings + help content are public and cacheable.
  '/esim': { isr: 3600 },
  '/insurance': { isr: 3600 },
  '/faq': { isr: 3600 },
  '/help': { isr: 3600 }
}

export default defineNuxtConfig({
  ssr: true,
  routeRules: {
    // P1-1 (2026-11-22 audit): ota-user sent zero security headers. Mirrors
    // worker SECURITY_HEADERS, plus the GAP-02 page CSP below (SSR-compatible:
    // inline scripts allowed, remote code is Toss SDK only).
    '/**': {
      headers: {
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'SAMEORIGIN',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        // GAP-02 (2026-11-24 audit): page CSP. Inline scripts stay allowed
        // (Nuxt SSR payload + theme boot); remote code is Toss/Stripe SDKs.
        // Subdomain routing (2026-11-27): allow https://*.getfortrip.com for API calls.
        'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' https://js.tosspayments.com https://js.stripe.com; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; img-src 'self' https: data: blob:; font-src 'self' https://cdn.jsdelivr.net data:; connect-src 'self' https://ota-hub.dnjstjq0824.workers.dev https://getfortrip.com https://*.getfortrip.com https://api.tosspayments.com https://log.tosspayments.com https://api.stripe.com https://*.sentry.io https://*.ingest.sentry.io; frame-src https://pay.tosspayments.com https://js.stripe.com; form-action 'self'; frame-ancestors 'self'; base-uri 'self'; object-src 'none'"
      }
    },
    // Subdomain + ?locale= routing (strategy: no_prefix): no duplicate /en|/ja|/zh
    // Vue routes exist; legacy prefixes 301 at the edge before Nitro runs.
    ...PAGE_RULES
  },
  nitro: {
    // cloudflare-module (ES modules + nodejs_compat). The plain 'cloudflare'
    // preset emits service-worker syntax, which wrangler 4 rejects for builds
    // with node: imports (observed 2026-11-16).
    preset: 'cloudflare-module',
    prerender: {
      crawlLinks: false,
      routes: ['/', '/help', '/moments', '/rewards']
    },
    // M5: www → apex 301 in FRONT of the generated entry. That entry serves
    // public/ via ASSETS before server middleware runs, so canonical-host.ts
    // never sees www asset requests (www/robots.txt → 200, a duplicate signal
    // for crawlers). This renames the built entry to entry.orig.mjs and emits
    // a wrapper index.mjs (wrangler "main" is unchanged) that 301s www.* hosts
    // and runs the edge guard (edge/edge-guard.mjs) before delegating to Nuxt.
    rollupConfig: {
      plugins: [
        {
          name: 'www-canonical-entry',
          generateBundle(this: any, outputOptions: any, bundle: any) {
            // Only the final server bundle: the prerender runner imports its
            // own index.mjs directly and must keep the raw entry.
            if (String(outputOptions?.dir || '').includes('prerender')) return
            const entry = bundle['index.mjs']
            if (!entry || entry.type !== 'chunk') return
            // The nuxt dev server bundle has no default entry export — wrapping
            // it breaks dev with a 500 (observed S3), so only wrap real worker
            // entries (production cloudflare-module output).
            if (!Array.isArray(entry.exports) || !entry.exports.includes('default')) return
            delete bundle['index.mjs']
            entry.fileName = 'entry.orig.mjs'
            bundle['entry.orig.mjs'] = entry
            // 2026-11-27: the wrapper also runs edge/edge-guard.mjs (scanner 404s +
            // Cache API edge cache) in front of Nuxt. The build tag versions the
            // cache keys so a deploy never serves HTML pointing at old assets.
            const buildTag = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
            this.emitFile({
              type: 'asset',
              fileName: 'locale-map.mjs',
              source: readFileSync(new URL('./edge/locale-map.mjs', import.meta.url), 'utf8')
            })
            this.emitFile({
              type: 'asset',
              fileName: 'edge-guard.mjs',
              source: readFileSync(new URL('./edge/edge-guard.mjs', import.meta.url), 'utf8')
            })
            this.emitFile({
              type: 'asset',
              fileName: 'index.mjs',
              source: [
                "import orig from './entry.orig.mjs';",
                "import { createEdgeFetch } from './edge-guard.mjs';",
                'const target = orig && orig.default ? orig.default : orig;',
                'const wrapped = { ...target };',
                'for (const k of Object.keys(wrapped)) {',
                "  if (k !== 'fetch' && typeof wrapped[k] === 'function') wrapped[k] = wrapped[k].bind(target);",
                '}',
                `wrapped.fetch = createEdgeFetch(target, ${JSON.stringify(buildTag)});`,
                'export default wrapped;',
                ''
              ].join('\n')
            })
          }
        }
      ]
    }
  },
  modules: ['@nuxtjs/i18n'],
  i18n: {
    locales: [
      { code: 'ko', iso: 'ko-KR', name: '한국어', file: 'ko.json' },
      { code: 'en', iso: 'en-US', name: 'English', file: 'en.json' },
      { code: 'ja', iso: 'ja-JP', name: '日本語', file: 'ja.json' },
      { code: 'zh', iso: 'zh-CN', name: '简体中文', file: 'zh.json' },
      { code: 'zh-hant', iso: 'zh-Hant', name: '繁體中文', file: 'zh-hant.json' }
    ],
    defaultLocale: 'ko',
    // v10: `lazy` was removed — locale `file`s are always lazy-loaded.
    langDir: 'locales',
    strategy: 'no_prefix',
    // Country subdomains + ?locale=xx-yy&curr=XXX + pref_* cookies are resolved
    // by edge/edge-guard.mjs and plugins/02.locale-routing.ts (single mapping:
    // config/locale.config.ts).
    detectBrowserLanguage: false
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
    apiBaseServer: process.env.NUXT_API_BASE_SERVER || 'http://127.0.0.1:8799/api/v1',
    public: {
      apiBase: process.env.NUXT_PUBLIC_API_BASE || '/api/v1',
      sentryDsn: process.env.NUXT_PUBLIC_SENTRY_DSN || '',
      sentryEnv: process.env.NUXT_PUBLIC_SENTRY_ENV || 'production',
      sentryRelease: process.env.NUXT_PUBLIC_SENTRY_RELEASE || '',
      // S6: official social profiles for the Organization sameAs graph
      // (comma-separated https URLs; empty = omitted from JSON-LD).
      sameAs: process.env.NUXT_PUBLIC_SAME_AS || '',
      // S9: search-console ownership tokens (empty = meta tag omitted).
      naverVerification: process.env.NUXT_PUBLIC_NAVER_SITE_VERIFICATION || '',
      googleVerification: process.env.NUXT_PUBLIC_GOOGLE_SITE_VERIFICATION || '',
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
      title: 'getfortrip — Global Travel & OTA Booking',
      htmlAttrs: {
        lang: 'ko'
      },
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        { name: 'description', content: 'Compare and book hotels, flights, trains, rental cars, airport transfers, tours, and travel packages globally on getfortrip.' },
        { property: 'og:site_name', content: 'getfortrip' },
        { property: 'og:title', content: 'getfortrip — Global Smart Travel Platform' },
        { property: 'og:description', content: 'Book global hotels, flights, high-speed trains, rental cars, and curated experiences in one place.' },
        { property: 'og:type', content: 'website' },
        { property: 'og:image', content: '/symbol.svg' },
        { name: 'twitter:card', content: 'summary' },
        { name: 'twitter:title', content: 'getfortrip — Global Smart Travel Platform' },
        { name: 'twitter:description', content: 'Hotels, flights, trains, rental cars, and curated travel bookings worldwide.' },
        { name: 'theme-color', content: '#0F6A53' }
      ],
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'apple-touch-icon', href: '/symbol.svg' },
        { rel: 'preconnect', href: 'https://cdn.jsdelivr.net', crossorigin: '' },
        { rel: 'stylesheet', href: 'https://cdn.jsdelivr.net/npm/@fontsource/outfit@5.0.13/latin-600.css' },
        { rel: 'stylesheet', href: 'https://cdn.jsdelivr.net/npm/@fontsource/outfit@5.0.13/latin-700.css' },
        { rel: 'stylesheet', href: 'https://cdn.jsdelivr.net/npm/@fontsource/outfit@5.0.13/latin-800.css' },
        { rel: 'stylesheet', href: 'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css' }
      ],
      script: [
        // Apply the saved theme before first paint (no flash for returning dark-mode users).
        { innerHTML: "try{if(localStorage.getItem('getfortrip_theme')==='dark')document.documentElement.classList.add('dark')}catch(e){}" }
      ]
    }
  }
})
