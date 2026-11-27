// 2026-11-27 CPU incident + country-subdomain routing edge guard tests.
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import {
  CACHE_PAGES,
  CACHE_SECTIONS,
  LOCALES,
  SHELL_PAGES,
  cacheKeyFor,
  createEdgeFetch,
  edgeCacheClass,
  isScannerPath,
  legacyPrefixRedirectUrl,
  subdomainFromAcceptLanguage,
} from '../edge/edge-guard.mjs'
import {
  SUBDOMAIN_LIST,
  buildCanonicalUrl,
  buildHreflangAlternates,
  buildLocalizedUrl,
  resolveLocaleContext,
} from '../edge/locale-map.mjs'
import * as tsLocale from '../config/locale.config.ts'

test('locale.config.ts and edge/locale-map.mjs stay strictly identical', () => {
  assert.deepEqual(tsLocale.SUBDOMAINS, SUBDOMAIN_LIST)
  assert.equal(tsLocale.buildLocalizedUrl('/hotels', { sub: 'jp', curr: 'USD' }), buildLocalizedUrl('/hotels', { sub: 'jp', curr: 'USD' }))
  assert.equal(tsLocale.buildCanonical('/hotels', { sub: 'uk' }), buildCanonicalUrl('/hotels', { sub: 'uk' }))
  assert.deepEqual(tsLocale.buildHreflang('/hotels'), buildHreflangAlternates('/hotels'))
})

test('scanner probes are recognised, real pages are not', () => {
  for (const p of ['/.env', '/.env.production', '/.git/config', '/wp-includes/wlwmanifest.xml', '/wp-login.php', '/xmlrpc.php', '/phpmyadmin/', '/config.yml', '/backup.sql', '/cgi-bin/x', '/vendor/phpunit/a', '/index.php']) {
    assert.ok(isScannerPath(p), p)
  }
  for (const p of ['/', '/hotels/seoul', '/robots.txt', '/favicon.svg', '/.well-known/security.txt', '/_nuxt/app.js', '/my/env', '/login', '/hotels/_payload.json']) {
    assert.ok(!isScannerPath(p), p)
  }
})

test('cache classes: public pages, shells, root, private pages', () => {
  assert.equal(edgeCacheClass('/'), 'root')
  assert.equal(edgeCacheClass('/_payload.json'), 'root')
  for (const p of ['/hotels', '/hotels/tokyo', '/insurance', '/deals', '/faq', '/hotels/_payload.json', '/flights/_payload.json']) {
    assert.equal(edgeCacheClass(p), 'page', p)
  }
  for (const p of ['/login', '/register/', '/register']) assert.equal(edgeCacheClass(p), 'shell', p)
  for (const p of ['/my', '/my/bookings', '/checkout', '/checkout/pay', '/booking/x', '/status', '/reset-password', '/cart', '/hotelsx', '/moments']) {
    assert.equal(edgeCacheClass(p), null, p)
  }
})

test('buildLocalizedUrl, canonical (without curr), and hreflang per subdomain', () => {
  assert.equal(
    buildLocalizedUrl('/hotels/list', { sub: 'kr', curr: 'USD', query: { city: 'seoul', curr: 'KRW' } }),
    'https://kr.getfortrip.com/hotels/list?city=seoul&locale=ko-kr&curr=USD'
  )
  assert.equal(
    buildCanonicalUrl('/hotels/list', { sub: 'kr', curr: 'USD' }),
    'https://kr.getfortrip.com/hotels/list?locale=ko-kr'
  )
  const alts = buildHreflangAlternates('/hotels/list')
  assert.equal(alts.length, SUBDOMAIN_LIST.length + 1)
  assert.equal(alts.find((a) => a.hreflang === 'ko-KR').href, 'https://kr.getfortrip.com/hotels/list?locale=ko-kr')
  assert.equal(alts.find((a) => a.hreflang === 'ja-JP').href, 'https://jp.getfortrip.com/hotels/list?locale=ja-jp')
  assert.equal(alts.find((a) => a.hreflang === 'en-GB').href, 'https://uk.getfortrip.com/hotels/list?locale=en-gb')
  assert.equal(alts.find((a) => a.hreflang === 'zh-HK').href, 'https://hk.getfortrip.com/hotels/list?locale=zh-hk')
  assert.equal(alts.find((a) => a.hreflang === 'zh-TW').href, 'https://tw.getfortrip.com/hotels/list?locale=zh-tw')
  assert.equal(alts.find((a) => a.hreflang === 'en-US').href, 'https://www.getfortrip.com/hotels/list?locale=en-us')
  assert.equal(alts.find((a) => a.hreflang === 'x-default').href, 'https://www.getfortrip.com/hotels/list?locale=en-us')
  for (const a of alts) assert.ok(!a.href.includes('curr='), `hreflang must not carry curr: ${a.href}`)
})

test('legacy /en, /ja, /zh paths map to 301 subdomain URLs', () => {
  assert.equal(legacyPrefixRedirectUrl(new URL('https://getfortrip.com/en/hotels?city=seoul')), 'https://www.getfortrip.com/hotels?city=seoul&locale=en-us&curr=USD')
  assert.equal(legacyPrefixRedirectUrl(new URL('https://kr.getfortrip.com/ja')), 'https://jp.getfortrip.com/?locale=ja-jp&curr=JPY')
  assert.equal(legacyPrefixRedirectUrl(new URL('https://getfortrip.com/zh/deals')), 'https://hk.getfortrip.com/deals?locale=zh-hk&curr=HKD')
  // On workers.dev / localhost, keep origin and strip prefix.
  assert.equal(legacyPrefixRedirectUrl(new URL('https://ota-user.dnjstjq0824.workers.dev/ja/hotels')), 'https://ota-user.dnjstjq0824.workers.dev/hotels?locale=ja-jp&curr=JPY')
  assert.equal(legacyPrefixRedirectUrl(new URL('https://kr.getfortrip.com/hotels')), null)
})

test('cache keys include build version, subdomain host, locale, and curr; shells drop arbitrary queries', () => {
  const ctxKrw = resolveLocaleContext({ hostname: 'kr.getfortrip.com', searchParams: new URLSearchParams('locale=ko-kr&curr=KRW') })
  const ctxUsd = resolveLocaleContext({ hostname: 'kr.getfortrip.com', searchParams: new URLSearchParams('locale=ko-kr&curr=USD') })
  assert.notEqual(
    cacheKeyFor('https://kr.getfortrip.com/hotels?city=tokyo', 'v1', false, ctxKrw),
    cacheKeyFor('https://kr.getfortrip.com/hotels?city=tokyo', 'v1', false, ctxUsd),
    'currency must partition the cache key'
  )
  const shellA = cacheKeyFor('https://jp.getfortrip.com/login?redirect=%2Fhotels', 'v1', true, resolveLocaleContext({ hostname: 'jp.getfortrip.com' }))
  const shellB = cacheKeyFor('https://jp.getfortrip.com/login?redirect=%2Fdeals', 'v1', true, resolveLocaleContext({ hostname: 'jp.getfortrip.com' }))
  assert.equal(shellA, shellB)
  assert.equal(edgeCacheClass('/__edge/v1/hotels'), null)
})

function memoryCache() {
  const store = new Map()
  return {
    store,
    async match(k) { const r = store.get(k); return r ? r.clone() : undefined },
    async put(k, r) { store.set(k, new Response(await r.text(), { status: r.status, headers: r.headers })) }
  }
}

function harness(respond) {
  const calls = []
  const target = { async fetch(req) { calls.push(new URL(req.url).pathname); return respond(req) } }
  const cache = memoryCache()
  const waits = []
  const fetch = createEdgeFetch(target, 'v1', () => cache)
  const run = (url, init = {}, cf = null) => {
    const req = new Request(url, init)
    if (cf) Object.defineProperty(req, 'cf', { value: cf })
    return fetch(req, {}, { waitUntil: (p) => waits.push(p) }).then(async (r) => { await Promise.all(waits); return r })
  }
  return { calls, cache, run }
}

const html = (extra = {}) => new Response('<html lang="ko"><body>ok</body></html>', { status: 200, headers: { 'content-type': 'text/html;charset=utf-8', ...extra } })

test('Geo-IP 302 from apex & unpinned www sets pref_* cookies on Domain=.getfortrip.com', async () => {
  const { calls, run } = harness(() => html())
  // Apex with cf.country=KR -> 302 to kr.getfortrip.com
  const kr = await run('https://getfortrip.com/hotels?city=busan', {}, { country: 'KR' })
  assert.equal(kr.status, 302)
  assert.equal(kr.headers.get('location'), 'https://kr.getfortrip.com/hotels?city=busan&locale=ko-kr&curr=KRW')
  const setCookies = kr.headers.getSetCookie()
  assert.ok(setCookies.some((c) => c.startsWith('pref_sub=kr;') && c.includes('Domain=.getfortrip.com')))
  assert.ok(setCookies.some((c) => c.startsWith('pref_locale=ko-kr;') && c.includes('Domain=.getfortrip.com')))
  assert.ok(setCookies.some((c) => c.startsWith('pref_curr=KRW;') && c.includes('Domain=.getfortrip.com')))

  // Unpinned www with cf.country=JP -> 302 to jp.getfortrip.com
  const jp = await run('https://www.getfortrip.com/', {}, { country: 'JP' })
  assert.equal(jp.status, 302)
  assert.equal(jp.headers.get('location'), 'https://jp.getfortrip.com/?locale=ja-jp&curr=JPY')

  // Pinned www (pref_sub=www or explicit ?locale=en-us) -> NO redirect (200)
  const pinned = await run('https://www.getfortrip.com/', { headers: { cookie: 'pref_sub=www; pref_locale=en-us; pref_curr=USD' } }, { country: 'KR' })
  assert.equal(pinned.status, 200)
  assert.match(await pinned.text(), /<html lang="en-US">/)

  // Bot on www -> NO Geo-IP redirect (200)
  const botWww = await run('https://www.getfortrip.com/hotels', { headers: { 'user-agent': 'Googlebot/2.1' } }, { country: 'KR' })
  assert.equal(botWww.status, 200)

  // Bot on apex -> 302 to www (x-default) with no cookies
  const botApex = await run('https://getfortrip.com/hotels', { headers: { 'user-agent': 'Googlebot/2.1' } }, { country: 'KR' })
  assert.equal(botApex.status, 302)
  assert.equal(botApex.headers.get('location'), 'https://www.getfortrip.com/hotels?locale=en-us&curr=USD')
  assert.equal(botApex.headers.getSetCookie().length, 0)

  assert.deepEqual(calls, ['/', '/hotels'])
})

test('public page on regional subdomain caches per currency and rewrites <html lang> on first paint', async () => {
  const { calls, run } = harness(() => html())
  const a = await run('https://jp.getfortrip.com/hotels')
  assert.equal(a.headers.get('x-edge-cache'), 'MISS')
  assert.match(await a.text(), /<html lang="ja-JP">/)

  const b = await run('https://jp.getfortrip.com/hotels')
  assert.equal(b.headers.get('x-edge-cache'), 'HIT')

  // Switching currency via cookie or query misses cache and caches separately
  const c = await run('https://jp.getfortrip.com/hotels?locale=ja-jp&curr=USD')
  assert.equal(c.headers.get('x-edge-cache'), 'MISS')
  assert.ok(c.headers.getSetCookie().some((x) => x.startsWith('pref_curr=USD;') && x.includes('Domain=.getfortrip.com')))

  // ssr:false shell shares one entry across ?redirect and rewrites lang
  const s1 = await run('https://uk.getfortrip.com/login?redirect=%2Fhotels')
  assert.match(await s1.text(), /<html lang="en-GB">/)
  const s2 = await run('https://uk.getfortrip.com/login?redirect=%2Fdeals')
  assert.equal(s2.headers.get('x-edge-cache'), 'HIT')
  assert.deepEqual(calls, ['/hotels', '/hotels', '/login'])
})

test('scanners and legacy prefixes are answered before Nuxt runs', async () => {
  const { calls, run } = harness(() => html())
  const s = await run('https://kr.getfortrip.com/.env')
  assert.equal(s.status, 404)
  const leg = await run('https://kr.getfortrip.com/en/hotels?x=1')
  assert.equal(leg.status, 301)
  assert.equal(leg.headers.get('location'), 'https://www.getfortrip.com/hotels?x=1&locale=en-us&curr=USD')
  assert.deepEqual(calls, [])
})

test('never cached: errors, private pages, foreign cookies, auth, POST', async () => {
  const cases = [
    ['https://kr.getfortrip.com/hotels', {}, () => new Response('x', { status: 500, headers: { 'content-type': 'text/html' } })],
    ['https://kr.getfortrip.com/my/bookings', {}, () => html()],
    ['https://kr.getfortrip.com/hotels', {}, () => html({ 'set-cookie': 'session=abc' })],
    ['https://kr.getfortrip.com/hotels', { headers: { authorization: 'Bearer x' } }, () => html()],
    ['https://kr.getfortrip.com/hotels', { method: 'POST', body: 'x' }, () => html()],
    ['https://kr.getfortrip.com/hotels', {}, () => html({ 'cache-control': 'private' })],
  ]
  for (const [url, init, respond] of cases) {
    const { calls, cache, run } = harness(respond)
    await run(url, init)
    await run(url, init)
    assert.equal(calls.length, 2, url)
    assert.equal(cache.store.size, 0, url)
  }
})

test('Accept-Language fallback maps cleanly to country subdomains', () => {
  assert.equal(subdomainFromAcceptLanguage('ko-KR,ko;q=0.9'), 'kr')
  assert.equal(subdomainFromAcceptLanguage('ja-JP,ja;q=0.9'), 'jp')
  assert.equal(subdomainFromAcceptLanguage('en-GB,en;q=0.8'), 'uk')
  assert.equal(subdomainFromAcceptLanguage('zh-HK,zh;q=0.8'), 'hk')
  assert.equal(subdomainFromAcceptLanguage('zh-TW,zh;q=0.8'), 'tw')
  assert.equal(subdomainFromAcceptLanguage('fr-FR'), 'www')
})

test('robots.txt blocks private paths in every group', () => {
  const robots = readFileSync(new URL('../public/robots.txt', import.meta.url), 'utf8')
  const groups = robots.split(/^User-Agent: /m).slice(1)
  for (const g of groups) {
    for (const p of ['/login', '/register', '/my', '/checkout', '/oauth/']) {
      assert.match(g, new RegExp(`^Disallow: ${p}$`, 'm'), `${g.split('\n')[0]} ${p}`)
    }
  }
})

test('edge guard lists stay in sync with nuxt.config (locales, isr pages, ssr:false shells, no_prefix)', () => {
  const cfg = readFileSync(new URL('../nuxt.config.ts', import.meta.url), 'utf8')
  const i18nCodes = [...cfg.matchAll(/\{ code: '([a-z-]+)'/g)].map((m) => m[1]).sort()
  assert.deepEqual([...LOCALES].sort(), i18nCodes)
  assert.match(cfg, /strategy:\s*'no_prefix'/)
  const rules = cfg.slice(cfg.indexOf('const PAGE_RULES'), cfg.indexOf('export default defineNuxtConfig'))
  const isr = [...rules.matchAll(/'\/([a-z-]+)(?:\/\*\*)?': \{ isr:/g)].map((m) => m[1])
  assert.deepEqual([...new Set(isr)].sort(), [...CACHE_SECTIONS, ...CACHE_PAGES].sort())
  for (const sp of SHELL_PAGES) assert.match(rules, new RegExp(`'/${sp}': \\{ ssr: false`))
})
