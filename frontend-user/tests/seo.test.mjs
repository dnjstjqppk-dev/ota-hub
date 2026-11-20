import { readFileSync } from 'node:fs'
import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import { attractionLd, breadcrumbLd, faqLd, itemListLd, jsonLdScript, lodgingLd, orgWebsiteLd, productLd } from '../composables/useJsonLd.ts'
import { seoHead, seoH1, seoTitle } from '../composables/useSeoPage.ts'

const SITE = 'https://getfortrip.com'

// (a) city/country-first titles: list title, H1, and meta description agree.
test('seo titles prefix city/country ahead of the base phrase', () => {
  assert.equal(seoTitle('호텔·숙소', '도쿄'), '도쿄 호텔·숙소')
  assert.equal(seoH1('호텔·숙소', '도쿄'), '도쿄 호텔·숙소')
  assert.equal(seoTitle('호텔·숙소'), '호텔·숙소')
})

test('seo head carries canonical, hreflang set, and OG/Twitter', () => {
  const h = seoHead({ site: SITE, path: '/hotels/list', title: '호텔·숙소', description: '비교하고 예약하세요.', city: '도쿄' })
  assert.equal(h.title, '도쿄 호텔·숙소')
  assert.ok(h.link.some((l) => l.rel === 'canonical' && l.href === `${SITE}/hotels/list`))
  for (const lang of ['ko', 'en', 'ja', 'zh', 'x-default']) assert.ok(h.link.some((l) => l.rel === 'alternate' && l.hreflang === lang), lang)
  assert.ok(h.meta.some((m) => m.property === 'og:url' && m.content === `${SITE}/hotels/list`))
  assert.ok(h.meta.some((m) => m.name === 'twitter:card'))
})

// (b) JSON-LD builders: every required schema.org type.
test('json-ld builders emit valid typed graphs', () => {
  const org = orgWebsiteLd(SITE)
  assert.deepEqual(org['@graph'].map((n) => n['@type']), ['Organization', 'WebSite'])
  assert.equal(org['@graph'][1].potentialAction['@type'], 'SearchAction')
  assert.equal(breadcrumbLd(SITE, [{ name: '홈', path: '/' }]).itemListElement[0].item, `${SITE}/`)
  assert.equal(faqLd([{ q: 'Q?', a: 'A.' }]).mainEntity[0]['@type'], 'Question')
  assert.equal(productLd({ site: SITE, path: '/p', name: 'N', priceKrw: 1000 }).offers.priceCurrency, 'KRW')
  assert.equal(lodgingLd({ site: SITE, path: '/h', name: 'H', starRating: 5 }).starRating.ratingValue, 5)
  assert.equal(attractionLd({ site: SITE, path: '/t', name: 'T', city: '도쿄' })['@type'], 'TouristAttraction')
  assert.equal(itemListLd(SITE, 'Best', [{ name: 'A', path: '/a' }]).numberOfItems, 1)
  assert.ok(!jsonLdScript({ x: '<script>' }).innerHTML.includes('<'))
})

// (c) semantic components compile (SFC) and carry their landmarks.
test('seo components compile and keep semantic landmarks', () => {
  for (const f of ['SeoFaq', 'SeoCompareTable', 'SeoImage']) {
    const source = readFileSync(new URL(`../components/${f}.vue`, import.meta.url), 'utf8')
    const { descriptor, errors } = parse(source, { filename: `${f}.vue` })
    assert.deepEqual(errors, [])
    compileScript(descriptor, { id: `seo-${f}` })
    const tpl = compileTemplate({ source: descriptor.template.content, filename: `${f}.vue`, id: `seo-${f}` })
    assert.deepEqual(tpl.errors, [])
  }
  const faq = readFileSync(new URL('../components/SeoFaq.vue', import.meta.url), 'utf8')
  assert.match(faq, /<section[\s\S]*<h2[\s\S]*<h3[\s\S]*<p/)
  const tbl = readFileSync(new URL('../components/SeoCompareTable.vue', import.meta.url), 'utf8')
  assert.match(tbl, /<caption[\s\S]*<thead[\s\S]*<tbody/)
  const img = readFileSync(new URL('../components/SeoImage.vue', import.meta.url), 'utf8')
  assert.match(img, /image\/avif/); assert.match(img, /fetchpriority/)
})

// (d) robots: named crawlers allowed, private paths blocked, index referenced.
test('robots allows crawlers, blocks private paths, names the index', () => {
  const robots = readFileSync(new URL('../public/robots.txt', import.meta.url), 'utf8')
  for (const bot of ['Googlebot', 'Yeti', 'Bingbot', 'GPTBot', 'OAI-SearchBot', 'PerplexityBot', 'ClaudeBot', 'Google-Extended']) {
    assert.match(robots, new RegExp(`User-Agent: ${bot}`))
  }
  for (const p of ['/my/', '/login', '/checkout']) assert.match(robots, new RegExp(`Disallow: ${p.replace('/', '\\/')}`))
  assert.match(robots, /Sitemap: https:\/\/getfortrip\.com\/sitemap-index\.xml/)
})

// (c) ISR covers the public affiliate landings.
test('nuxt route rules ISR the public landings', () => {
  const cfg = readFileSync(new URL('../nuxt.config.ts', import.meta.url), 'utf8')
  for (const p of ['/esim', '/insurance', '/faq']) assert.match(cfg, new RegExp(`'${p}': \\{ isr: 3600 \\}`))
})
