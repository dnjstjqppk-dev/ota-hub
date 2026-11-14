import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { transformSync } from 'esbuild'

// TG-05: the release tag rides the envelope; the installer stays a no-op
// without a DSN and never throws. Errors are built inside the vm realm so
// the reporter's instanceof checks see them.
const source = readFileSync(new URL('../src/sentry.ts', import.meta.url), 'utf8')
const code = transformSync(source + '\n;globalThis.mod = { buildEnvelope, initSentry };', { loader: 'ts', format: 'cjs' }).code

function load(extra = {}) {
  const sandbox = { console, URL, module: { exports: {} }, exports: {}, ...extra }
  runInNewContext(code, sandbox)
  return sandbox
}

const makeError = (sandbox, message) => runInNewContext(`new Error(${JSON.stringify(message)})`, sandbox)

test('sentry: envelope carries the release tag when provided, omits it otherwise', () => {
  const sandbox = load()
  const tagged = sandbox.mod.buildEnvelope('https://key@example.com/9', makeError(sandbox, 'x'), { release: 'abc1234' })
  assert.ok(tagged)
  assert.equal(JSON.parse(tagged.body.split('\n')[2]).release, 'abc1234')
  const bare = sandbox.mod.buildEnvelope('https://key@example.com/9', makeError(sandbox, 'x'), {})
  assert.ok(bare)
  assert.equal('release' in JSON.parse(bare.body.split('\n')[2]), false)
})

test('sentry: init is a silent no-op without a DSN', () => {
  const { mod } = load()
  assert.equal(mod.initSentry({ config: {} }, { dsn: '' }), false)
  assert.equal(mod.initSentry({ config: {} }, { dsn: 'junk' }), false)
})

test('sentry: installed handler reports with release through the transport', () => {
  const transports = []
  const sandbox = load({
    window: { location: { href: 'https://portal.test/partner' }, addEventListener: () => {} },
  })
  const app = { config: {} }
  assert.equal(
    sandbox.mod.initSentry(app, {
      dsn: 'https://key@example.com/9',
      environment: 'test',
      release: 'rel-1',
      transport: async (url, init) => void transports.push({ url, init }),
    }),
    true,
  )
  app.config.errorHandler(makeError(sandbox, 'portal blew up'))
  assert.equal(transports.length, 1)
  const payload = JSON.parse(String(transports[0].init.body).split('\n')[2])
  assert.equal(payload.release, 'rel-1')
  assert.equal(payload.environment, 'test')
  assert.equal(payload.exception.values[0].value, 'portal blew up')
})
