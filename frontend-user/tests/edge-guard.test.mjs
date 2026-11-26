// 2026-11-27 CPU incident: the edge guard in front of the Nuxt worker.
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { cacheKeyFor, createEdgeFetch, edgeCacheClass, isScannerPath, rootLocale } from '../edge/edge-guard.mjs'

test('scanner probes are recognised, real pages are not', () => {
  for (const p of ['/.env', '/.env.production', '/.git/config', '/wp-includes/wlwmanifest.xml', '/wp-login.php', '/xmlrpc.php', '/phpmyadmin/', '/config.yml', '/backup.sql', '/cgi-bin/x', '/vendor/phpunit/a', '/index.php']) {
    assert.ok(isScannerPath(p), p)
  }
  for (const p of ['/', '/en', '/hotels/seoul', '/robots.txt', '/favicon.svg', '/.well-known/security.txt', '/_nuxt/app.js', '/my/env', '/en/login', '/hotels/_payload.json']) {
    assert.ok(!isScannerPath(p), p)
  }
})

test('cache classes: public pages, shells, ko root, private pages', () => {
  assert.equal(edgeCacheClass('/'), 'root')
  assert.equal(edgeCacheClass('/_payload.json'), 'root')
  for (const p of ['/en', '/zh/', '/ja', '/hotels', '/en/hotels/tokyo', '/zh/insurance', '/deals', '/ja/faq', '/hotels/_payload.json', '/en/flights/_payload.json']) {
    assert.equal(edgeCacheClass(p), 'page', p)
  }
  for (const p of ['/login', '/en/login', '/zh/register/', '/register']) assert.equal(edgeCacheClass(p), 'shell', p)
  for (const p of ['/my', '/en/my/bookings', '/checkout', '/zh/checkout/pay', '/booking/x', '/status', '/reset-password', '/cart', '/fr/hotels', '/hotelsx', '/en/hotelsx', '/moments']) {
    assert.equal(edgeCacheClass(p), null, p)
  }
})

test('root locale follows cookie, then Accept-Language q order, else ko', () => {
  const h = (o) => new Headers(o)
  assert.equal(rootLocale(h({})), 'ko')
  assert.equal(rootLocale(h({ 'accept-language': 'en-US,en;q=0.9' })), 'en')
  assert.equal(rootLocale(h({ 'accept-language': 'ko-KR,ko;q=0.9,en;q=0.8' })), 'ko')
  assert.equal(rootLocale(h({ 'accept-language': 'fr-FR,ja;q=0.5,en;q=0.7' })), 'en')
  assert.equal(rootLocale(h({ 'accept-language': 'fr-FR' })), 'ko')
  assert.equal(rootLocale(h({ cookie: 'a=1; getfortrip_locale=zh', 'accept-language': 'ko' })), 'zh')
  assert.equal(rootLocale(h({ cookie: 'getfortrip_locale=xx', 'accept-language': 'ja' })), 'ja')
})

test('cache keys are build-versioned; shells drop the query', () => {
  assert.equal(cacheKeyFor('https://getfortrip.com/hotels?city=tokyo', 'v1'), 'https://getfortrip.com/hotels?city=tokyo&__ecv=v1')
  assert.equal(cacheKeyFor('https://getfortrip.com/en/login?redirect=%2Fhotels', 'v1', true), 'https://getfortrip.com/en/login?__ecv=v1')
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
  const run = (url, init) => fetch(new Request(url, init), {}, { waitUntil: (p) => waits.push(p) }).then(async (r) => { await Promise.all(waits); return r })
  return { calls, cache, run }
}

const html = (extra = {}) => new Response('<html>ok</html>', { status: 200, headers: { 'content-type': 'text/html;charset=utf-8', ...extra } })

test('public page: MISS renders once, HIT replays body + locale cookie without rendering', async () => {
  const { calls, run } = harness(() => html({ 'set-cookie': 'getfortrip_locale=en; Path=/; SameSite=Lax' }))
  const a = await run('https://getfortrip.com/en/hotels')
  assert.equal(a.headers.get('x-edge-cache'), 'MISS')
  assert.equal(await a.text(), '<html>ok</html>')
  const b = await run('https://getfortrip.com/en/hotels')
  assert.equal(b.headers.get('x-edge-cache'), 'HIT')
  assert.equal(await b.text(), '<html>ok</html>')
  assert.equal(b.headers.get('set-cookie'), 'getfortrip_locale=en; Path=/; SameSite=Lax')
  assert.equal(b.headers.get('x-edge-set-cookie'), null)
  assert.deepEqual(calls, ['/en/hotels'])
})

test('never cached: errors, private pages, foreign cookies, auth, POST, redirecting root', async () => {
  const cases = [
    ['https://getfortrip.com/hotels', {}, () => new Response('x', { status: 500, headers: { 'content-type': 'text/html' } })],
    ['https://getfortrip.com/my/bookings', {}, () => html()],
    ['https://getfortrip.com/hotels', {}, () => html({ 'set-cookie': 'session=abc' })],
    ['https://getfortrip.com/hotels', { headers: { authorization: 'Bearer x' } }, () => html()],
    ['https://getfortrip.com/hotels', { method: 'POST', body: 'x' }, () => html()],
    ['https://getfortrip.com/hotels', {}, () => html({ 'cache-control': 'private' })],
    ['https://getfortrip.com/', { headers: { 'accept-language': 'en-US' } }, () => html()]
  ]
  for (const [url, init, respond] of cases) {
    const { calls, cache, run } = harness(respond)
    await run(url, init)
    await run(url, init)
    assert.equal(calls.length, 2, url)
    assert.equal(cache.store.size, 0, url)
  }
})

test('ko root is cached for ko visitors only; shells share one entry across ?redirect', async () => {
  const { calls, run } = harness(() => html())
  await run('https://getfortrip.com/', { headers: { 'accept-language': 'ko-KR' } })
  const hit = await run('https://getfortrip.com/')
  assert.equal(hit.headers.get('x-edge-cache'), 'HIT')
  await run('https://getfortrip.com/en/login?redirect=%2Fhotels')
  const shell = await run('https://getfortrip.com/en/login?redirect=%2Fdeals')
  assert.equal(shell.headers.get('x-edge-cache'), 'HIT')
  assert.deepEqual(calls, ['/', '/en/login'])
})

test('scanners and www are answered before Nuxt runs', async () => {
  const { calls, run } = harness(() => html())
  const s = await run('https://getfortrip.com/.env')
  assert.equal(s.status, 404)
  const w = await run('https://www.getfortrip.com/hotels?x=1')
  assert.equal(w.status, 301)
  assert.equal(w.headers.get('location'), 'https://getfortrip.com/hotels?x=1')
  assert.deepEqual(calls, [])
})

test('robots.txt blocks the locale copies of private paths in every group', () => {
  const robots = readFileSync(new URL('../public/robots.txt', import.meta.url), 'utf8')
  const groups = robots.split(/^User-Agent: /m).slice(1)
  for (const g of groups) {
    for (const loc of ['en', 'ja', 'zh']) {
      for (const p of ['/login', '/register', '/my', '/checkout']) assert.match(g, new RegExp(`^Disallow: /${loc}${p}$`, 'm'), `${g.split('\n')[0]} ${loc}${p}`)
    }
  }
})

test('nuxt route rules are repeated for every locale prefix', () => {
  const cfg = readFileSync(new URL('../nuxt.config.ts', import.meta.url), 'utf8')
  assert.match(cfg, /\.\.\.localizeRules\(PAGE_RULES\)/)
  assert.match(cfg, /const LOCALE_PREFIXES = \['en', 'ja', 'zh'\]/)
})
