import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { transformSync } from 'esbuild'

// TG-05: the user-portal plugin reports with the release tag when a DSN is
// set and installs nothing without one. Nuxt auto-imports are stubbed and
// the error is built inside the vm realm for instanceof checks.
const source = readFileSync(new URL('../plugins/sentry.client.ts', import.meta.url), 'utf8')
const code = transformSync(source, { loader: 'ts', format: 'cjs' }).code

function load(publicEnv) {
  const sent = []
  const listeners = {}
  let plugin = null
  const nuxtApp = { vueApp: { config: {} } }
  const sandbox = {
    console,
    URL,
    defineNuxtPlugin: (fn) => { plugin = fn },
    useRuntimeConfig: () => ({ public: publicEnv }),
    window: { location: { href: 'https://shop.test/hotels' }, addEventListener: (t, fn) => { listeners[t] = fn } },
    fetch: async (url, init) => void sent.push({ url, init }),
    module: { exports: {} },
    exports: {},
  }
  runInNewContext(code, sandbox)
  assert.ok(plugin)
  plugin(nuxtApp)
  return { sent, nuxtApp, listeners, sandbox }
}

test('sentry: user portal reports with release when a DSN is set', () => {
  const { sent, nuxtApp, sandbox } = load({ sentryDsn: 'https://key@example.com/9', sentryEnv: 'test', sentryRelease: 'rel-9' })
  assert.equal(typeof nuxtApp.vueApp.config.errorHandler, 'function')
  nuxtApp.vueApp.config.errorHandler(runInNewContext('new Error("shop blew up")', sandbox))
  assert.equal(sent.length, 1)
  const payload = JSON.parse(String(sent[0].init.body).split('\n')[2])
  assert.equal(payload.release, 'rel-9')
  assert.equal(payload.environment, 'test')
  assert.equal(payload.exception.values[0].value, 'shop blew up')
})

test('sentry: user portal installs nothing without a DSN', () => {
  const { nuxtApp, listeners } = load({ sentryDsn: '', sentryEnv: 'test', sentryRelease: 'rel-9' })
  assert.equal(nuxtApp.vueApp.config.errorHandler, undefined)
  assert.deepEqual(Object.keys(listeners), [])
})
