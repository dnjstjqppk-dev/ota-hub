import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import { createSSRApp, h } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { attractionLd, breadcrumbLd, faqLd, itemListLd, jsonLdScript, lodgingLd, orgWebsiteLd, productLd, speakableLd } from '../composables/useJsonLd.ts'
import { seoHead, seoH1, seoTitle } from '../composables/useSeoPage.ts'

const SITE = 'https://getfortrip.com'

// (a) city/country-first titles: list title, H1, and meta description agree.
test('seo titles prefix city/country ahead of the base phrase', () => {
  assert.equal(seoTitle('호텔·숙소', '도쿄'), '도쿄 호텔·숙소')
  assert.equal(seoH1('호텔·숙소', '도쿄'), '도쿄 호텔·숙소')
  assert.equal(seoTitle('호텔·숙소'), '호텔·숙소')
})

test('seo head canonical follows the rendering locale prefix', () => {
  const h = seoHead({ site: SITE, path: '/hotels/list', title: 't', description: 'd', localePrefix: '/en' })
  assert.equal(h.link.find((l) => l.rel === 'canonical').href, `${SITE}/en/hotels/list`)
  assert.equal(h.link.find((l) => l.hreflang === 'x-default').href, `${SITE}/hotels/list`)
})

test('seo head carries canonical, hreflang set, and OG/Twitter', () => {
  const h = seoHead({ site: SITE, path: '/hotels/list', title: '호텔·숙소', description: '비교하고 예약하세요.', city: '도쿄' })
  assert.equal(h.title, '도쿄 호텔·숙소')
  assert.ok(h.link.some((l) => l.rel === 'canonical' && l.href === `${SITE}/hotels/list`))
  // GAP-01 full: every locale alternates, x-default points at the ko URL.
  for (const lang of ['ko', 'en', 'ja', 'zh', 'x-default']) assert.ok(h.link.some((l) => l.rel === 'alternate' && l.hreflang === lang), lang)
  assert.equal(h.link.find((l) => l.hreflang === 'en').href, `${SITE}/en/hotels/list`)
  assert.equal(h.link.find((l) => l.hreflang === 'x-default').href, `${SITE}/hotels/list`)
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
  const speak = speakableLd(SITE, '/hotels/detail/H1')
  assert.equal(speak['@type'], 'WebPage')
  assert.equal(speak.url, `${SITE}/hotels/detail/H1`)
  assert.deepEqual(speak.speakable.cssSelector, ['#answer-summary'])
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
  for (const bot of ['Googlebot', 'Yeti', 'Bingbot', 'GPTBot', 'OAI-SearchBot', 'PerplexityBot', 'ClaudeBot', 'Google-Extended',
    'ChatGPT-User', 'Claude-User', 'Claude-SearchBot', 'Perplexity-User', 'Applebot', 'Applebot-Extended', 'Amazonbot', 'DuckAssistBot', 'meta-externalagent', 'Daumoa']) {
    assert.match(robots, new RegExp(`User-Agent: ${bot}`))
  }
  // S1: named groups do NOT inherit `*` (RFC 9309), so every group must carry
  // the `*` group's full Disallow set — parse groups and compare each of them.
  const groups = robots.split(/^User-Agent: /m).slice(1).map((g) => {
    const [agent, ...rules] = g.split('\n').map((l) => l.trim()).filter(Boolean)
    return { agent, rules }
  })
  assert.ok(groups.length >= 2)
  const star = groups.find((g) => g.agent === '*')
  assert.ok(star)
  const want = star.rules.filter((r) => r.startsWith('Disallow:'))
  assert.ok(want.length > 0)
  for (const g of groups) {
    for (const w of want) assert.ok(g.rules.includes(w), `${g.agent} misses ${w}`)
    assert.ok(g.rules.includes('Allow: /'), `${g.agent} misses Allow: /`)
  }
  assert.match(robots, /Sitemap: https:\/\/getfortrip\.com\/sitemap-index\.xml/)
})

// (c) ISR covers the public affiliate landings.
test('nuxt route rules ISR the public landings', () => {
  const cfg = readFileSync(new URL('../nuxt.config.ts', import.meta.url), 'utf8')
  for (const p of ['/esim', '/insurance', '/faq']) assert.match(cfg, new RegExp(`'${p}': \\{ isr: 3600 \\}`))
})

// (e) S2: SeoFaq SSR HTML and its FAQPage JSON-LD describe the same Q&A 1:1.
test('seo faq ssr html matches its faqpage json-ld one to one', async () => {
  const source = readFileSync(new URL('../components/SeoFaq.vue', import.meta.url), 'utf8')
  const { descriptor } = parse(source, { filename: 'SeoFaq.vue' })
  const script = compileScript(descriptor, { id: 'seo-faq-ssr' })
  const tpl = compileTemplate({
    source: descriptor.template.content, filename: 'SeoFaq.vue', id: 'seo-faq-ssr',
    compilerOptions: { mode: 'module', bindingMetadata: script.bindings },
  })
  assert.deepEqual(tpl.errors, [])
  const dir = new URL('./.tmp-ssr/', import.meta.url)
  mkdirSync(dir, { recursive: true })
  const scriptUrl = new URL('./.tmp-ssr/SeoFaq.script.mts', import.meta.url)
  const tplUrl = new URL('./.tmp-ssr/SeoFaq.tpl.mts', import.meta.url)
  // Rewrite the ~/ alias (plain node has no Nuxt resolver); .mts + the .ts
  // import rely on node type-stripping like the other imports in this file.
  writeFileSync(scriptUrl, script.content.replace(/['"]~\/composables\/useJsonLd['"]/g, "'../../composables/useJsonLd.ts'"))
  writeFileSync(tplUrl, tpl.code)
  const heads = []
  globalThis.useHead = (entry) => heads.push(entry)
  globalThis.useLocalePath = () => ((p) => p)
  try {
    const { default: setup } = await import(scriptUrl.href)
    const { render } = await import(tplUrl.href)
    const items = [
      { q: 'Q1 & Q?', a: 'A1.', to: '/refund-policy' },
      { q: 'Q2?', a: '' },
      { q: '', a: 'Ax' },
      { q: 'Q3?', a: 'A3 <b>' },
    ]
    const app = createSSRApp({ ...setup, render }, { items })
    app.config.globalProperties.$t = (k) => k
    app.component('AppIcon', { props: ['name', 'size'], render() { return h('i') } })
    app.component('NuxtLink', { props: ['to'], render() { return h('a', { href: this.to }, this.$slots.default?.()) } })
    const html = await renderToString(app)
    const unesc = (s) => s.replaceAll('&amp;', '&').replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"').replaceAll('&#39;', "'")
    const h3s = [...html.matchAll(/<h3[^>]*>(.*?)<\/h3>/gs)].map((m) => unesc(m[1]))
    const ps = [...html.matchAll(/<p[^>]*>(.*?)<\/p>/gs)].map((m) => unesc(m[1]))
    assert.deepEqual(h3s, ['Q1 & Q?', 'Q3?'])
    assert.deepEqual(ps, ['A1.', 'A3 <b>'])
    assert.match(html, /<a[^>]*href="\/refund-policy"[^>]*>seoFaq\.more<\/a>/)
    assert.equal(heads.length, 1)
    const ld = JSON.parse(heads[0].script[0].innerHTML)
    assert.equal(ld['@type'], 'FAQPage')
    assert.deepEqual(ld.mainEntity.map((e) => [e.name, e.acceptedAnswer.text]), [['Q1 & Q?', 'A1.'], ['Q3?', 'A3 <b>']])
  } finally {
    delete globalThis.useHead
    delete globalThis.useLocalePath
    rmSync(dir, { recursive: true, force: true })
  }
})

// (f) S2: all 11 pages wire SeoFaq; every topic ships localized, policy-linked Q&A.
test('s2 every listed page wires seofaq with localized items', () => {
  const page = (p) => readFileSync(new URL(`../pages/${p}.vue`, import.meta.url), 'utf8')
  const frame = readFileSync(new URL('../components/ProductLanding.vue', import.meta.url), 'utf8')
  assert.match(frame, /<SeoFaq[^>]*:items="faq"/)
  for (const topic of ['hotels', 'flights', 'trains', 'cars', 'transfers', 'packages']) {
    const src = page(`${topic}/index`)
    assert.match(src, new RegExp(`useSeoFaq\\('${topic}'\\)`), `${topic} topic`)
    assert.match(src, /:faq="FAQ"/, `${topic} binding`)
  }
  for (const [file, topic] of [['things-to-do/index', 'todos'], ['esim', 'esim'], ['insurance', 'insurance']]) {
    const src = page(file)
    assert.match(src, new RegExp(`useSeoFaq\\('${topic}'\\)`), `${file} topic`)
    assert.match(src, /<SeoFaq[^>]*:items="FAQ"/, `${file} binding`)
  }
  for (const f of ['faq', 'help']) assert.match(page(f), /<SeoFaq[^>]*:items="seoFaqItems"/, `${f} binding`)
  // Every `to` must resolve to a real page (bare path; locale prefix added at render).
  const routeFile = (to) => existsSync(new URL(`../pages/${to.replace(/^\//, '')}.vue`, import.meta.url))
    || existsSync(new URL(`../pages/${to.replace(/^\//, '')}/index.vue`, import.meta.url))
  const locales = ['ko', 'en', 'ja', 'zh'].map((l) => JSON.parse(readFileSync(new URL(`../i18n/locales/${l}.json`, import.meta.url), 'utf8')))
  for (const [li, m] of locales.entries()) {
    assert.ok(m.seoFaq.more, `seoFaq.more#${li}`)
    for (const topic of ['hotels', 'flights', 'trains', 'cars', 'transfers', 'todos', 'packages', 'esim', 'insurance']) {
      const items = m.seoFaq[topic]
      assert.ok(Array.isArray(items) && items.length >= 1, `${topic}#${li} non-empty`)
      for (const it of items) {
        assert.ok(it.q && it.a, `${topic}#${li} q/a present`)
        assert.match(it.q, /[?？?]$/, `${topic}#${li} question ends asking`)
        assert.match(it.a, /[.!?。！？]$/, `${topic}#${li} answer ends complete`)
        if (it.to !== undefined) assert.ok(routeFile(it.to), `${topic}#${li} link target ${it.to}`)
      }
    }
  }
  for (const f of ['faq', 'help']) {
    for (const m of page(f).matchAll(/to: '([^']+)'/g)) assert.ok(routeFile(m[1]), `${f} link target ${m[1]}`)
  }
})

// (g) S3: answer summary keeps 2-3 sentences from real fields; speakable LD matches.
async function compileSeoAnswer() {
  const source = readFileSync(new URL('../components/SeoAnswer.vue', import.meta.url), 'utf8')
  const { descriptor } = parse(source, { filename: 'SeoAnswer.vue' })
  const script = compileScript(descriptor, { id: 'seo-answer-ssr' })
  const tpl = compileTemplate({
    source: descriptor.template.content, filename: 'SeoAnswer.vue', id: 'seo-answer-ssr',
    compilerOptions: { mode: 'module', bindingMetadata: script.bindings },
  })
  assert.deepEqual(tpl.errors, [])
  const dir = new URL('./.tmp-ssr-answer/', import.meta.url)
  mkdirSync(dir, { recursive: true })
  const scriptUrl = new URL('./.tmp-ssr-answer/SeoAnswer.script.mts', import.meta.url)
  const tplUrl = new URL('./.tmp-ssr-answer/SeoAnswer.tpl.mts', import.meta.url)
  writeFileSync(scriptUrl, script.content.replace(/['"]~\/composables\/useJsonLd['"]/g, "'../../composables/useJsonLd.ts'"))
  writeFileSync(tplUrl, tpl.code)
  return { dir, scriptUrl, tplUrl }
}

const koMessages = JSON.parse(readFileSync(new URL('../i18n/locales/ko.json', import.meta.url), 'utf8'))
function koT(key, params = {}) {
  const v = String(key).split('.').reduce((o, k) => o?.[k], koMessages)
  assert.equal(typeof v, 'string', `i18n resolves ${key}`)
  return v.replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? ''))
}

async function renderSeoAnswer(urls, props) {
  const heads = []
  globalThis.useHead = (entry) => heads.push(entry)
  globalThis.useI18n = () => ({ t: koT })
  globalThis.useRuntimeConfig = () => ({ public: { brandDomain: 'getfortrip.com' } })
  try {
    const { default: setup } = await import(urls.scriptUrl.href)
    const { render } = await import(urls.tplUrl.href)
    const app = createSSRApp({ ...setup, render }, props)
    app.config.globalProperties.$t = (k, p) => koT(k, p)
    app.component('SeoFaq', {
      props: ['items', 'id'],
      render() { return h('div', { class: 'faq-stub' }, (this.items || []).map((f) => h('div', [h('h3', { class: 'faq-q' }, f.q), h('p', { class: 'faq-a' }, f.a)]))) },
    })
    return { html: await renderToString(app), heads }
  } finally {
    delete globalThis.useHead
    delete globalThis.useI18n
    delete globalThis.useRuntimeConfig
  }
}

test('seo answer renders 2-3 sentences, per-field faqs, and speakable ld', async () => {
  const urls = await compileSeoAnswer()
  try {
    const { html, heads } = await renderSeoAnswer(urls, {
      name: '테스트 호텔', location: '서울 중구', checkin: '15:00', checkout: '11:00',
      freeCancel: true, freeCancelUntil: '체크인 전날', inclusions: ['조식', '와이파이'],
      priceLabel: '₩85,000 (1박)', path: '/hotels/detail/H1',
    })
    const sum = html.match(/<p[^>]*id="answer-summary"[^>]*>(.*?)<\/p>/s)[1]
    assert.equal(sum, '서울 중구에 있는 테스트 호텔입니다. 최저 ₩85,000 (1박)부터 예약할 수 있습니다. 무료 취소는 체크인 전날까지 가능합니다.')
    assert.doesNotMatch(sum, /체크인은 15:00부터/)
    assert.doesNotMatch(sum, /포함 사항은 다음과 같습니다/)
    const qs = [...html.matchAll(/<h3 class="faq-q">(.*?)<\/h3>/gs)].map((m) => m[1])
    assert.deepEqual(qs, ['체크인 시간은 언제인가요?', '취소가 가능한가요?', '가격에 무엇이 포함되나요?'])
    const as = [...html.matchAll(/<p class="faq-a">(.*?)<\/p>/gs)].map((m) => m[1])
    assert.deepEqual(as, [
      '체크인은 15:00부터 가능합니다. 체크아웃은 11:00입니다.',
      '무료 취소는 체크인 전날까지 가능합니다.',
      '포함 사항은 다음과 같습니다: 조식, 와이파이.',
    ])
    assert.equal(heads.length, 1)
    const ld = JSON.parse(heads[0].script[0].innerHTML)
    assert.equal(ld['@type'], 'WebPage')
    assert.equal(ld.url, 'https://getfortrip.com/hotels/detail/H1')
    assert.deepEqual(ld.speakable.cssSelector, ['#answer-summary'])
  } finally {
    rmSync(urls.dir, { recursive: true, force: true })
  }
})

test('seo answer omits sentences, faqs, and ld for empty fields', async () => {
  const urls = await compileSeoAnswer()
  try {
    const empty = await renderSeoAnswer(urls, { name: 'X', path: '/x' })
    assert.doesNotMatch(empty.html, /answer-summary/)
    assert.equal(empty.heads.length, 0)
    const partial = await renderSeoAnswer(urls, { name: 'Y', location: '도쿄', priceLabel: '¥9,000', path: '/y' })
    const sum = partial.html.match(/<p[^>]*id="answer-summary"[^>]*>(.*?)<\/p>/s)[1]
    assert.equal(sum, '도쿄에 있는 Y입니다. 최저 ¥9,000부터 예약할 수 있습니다.')
    assert.doesNotMatch(partial.html, /faq-stub/)
    assert.equal(partial.heads.length, 1)
    const weird = await renderSeoAnswer(urls, { name: 'Z', location: '서울', inclusions: 'oops', freeCancel: 'yes', path: '/z' })
    const wsum = weird.html.match(/<p[^>]*id="answer-summary"[^>]*>(.*?)<\/p>/s)[1]
    assert.equal(wsum, '서울에 있는 Z입니다.')
    assert.doesNotMatch(weird.html, /faq-stub/)
  } finally {
    rmSync(urls.dir, { recursive: true, force: true })
  }
})

// (h) S3: the five detail pages wire SeoAnswer with their own real fields.
test('s3 detail pages wire seoanswer with real fields', () => {
  const det = (d) => readFileSync(new URL(`../pages/${d}/detail/[id].vue`, import.meta.url), 'utf8')
  const needs = {
    hotels: ['<SeoAnswer', 'hotel.name_ko || hotel.name', "location.join(', ')", 'hotel.free_cancellation ? true : null', 'hotel.amenities', 'minRoomPrice', ':path="route.path"'],
    'things-to-do': ['<SeoAnswer', 'a.title', 'a.city', 'a.free_cancellation', 'a.included', 'a.price_krw', ':path="route.path"'],
    cars: ['<SeoAnswer', 'c.vehicle_model', 'c.pickup_location', 'c.insurance_included', 'c.daily_price_krw', ':path="route.path"'],
    transfers: ['<SeoAnswer', 't.service_title', 't.destination_area', 't.price_krw', ':path="route.path"'],
    packages: ['<SeoAnswer', 'p.title', 'p.destination_city', 'features', 'formatKrw(price)', ':path="route.path"'],
  }
  for (const [d, keys] of Object.entries(needs)) {
    const src = det(d)
    for (const k of keys) assert.ok(src.includes(k), `${d} wires ${k}`)
  }
  const keys = ['title', 's1', 's_checkin', 's_checkout', 's_stay', 's_free_until', 's_free', 's_nonrefund', 's_incl', 's_price', 'q_checkin', 'q_cancel', 'q_incl', 'listSep', 'join']
  for (const l of ['ko', 'en', 'ja', 'zh']) {
    const m = JSON.parse(readFileSync(new URL(`../i18n/locales/${l}.json`, import.meta.url), 'utf8')).seoAnswer
    for (const k of keys) assert.ok(typeof m[k] === 'string' && (k === 'join' || m[k].length > 0), `${l}.seoAnswer.${k}`)
    for (const k of keys.filter((k) => k.startsWith('s_'))) assert.match(m[k], /[.!?。！？]$/, `${l}.${k} ends complete`)
    for (const k of keys.filter((k) => k.startsWith('q_'))) assert.match(m[k], /[?？?]$/, `${l}.${k} ends asking`)
  }
})
