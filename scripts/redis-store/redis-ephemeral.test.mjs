import { strict as assert } from 'node:assert'
import { test, before, after } from 'node:test'
import { redisEphemeral } from './redis-ephemeral.mjs'

// TG-10: Redis implementation against a live server (docker locally, CI
// service in the fast job). Skips honestly when no server answers.
const URL = process.env.TEST_REDIS_URL || 'redis://127.0.0.1:16381'
let store = null

before(async () => {
  try {
    store = await redisEphemeral(URL, 15)
    await store.client.flushDb()
  } catch {
    store = null
  }
})

after(async () => {
  if (store) {
    await store.client.flushDb().catch(() => undefined)
    await store.client.disconnect().catch(() => undefined)
  }
})

const live = (name, fn) => test(name, async (t) => {
  if (!store) {
    t.skip('no redis (TEST_REDIS_URL)')
    return
  }
  await store.client.flushDb()
  await fn()
})

live('redis: sliding window counts edges exactly', async () => {
  await store.recordHit('q:1', 'q', 1000, 60)
  await store.recordHit('q:1', 'q', 1000, 60)
  assert.ok((await store.client.ttl('gft:rl:q:1')) > 60)
  assert.equal(await store.count('q:1', 1059, 60), 2)
  assert.equal(await store.count('q:1', 1060, 60), 0)
})

live('redis: clear drops the counter', async () => {
  await store.recordHit('q:2', 'q', 1000, 60)
  await store.clear('q:2')
  assert.equal(await store.count('q:2', 1001, 60), 0)
})

live('redis: revocation round-trips, expired is a no-op', async () => {
  const exp = Math.floor(Date.now() / 1000) + 600
  assert.equal(await store.isRevoked('j1'), false)
  await store.revokeJti('j1', exp)
  assert.equal(await store.isRevoked('j1'), true)
  await store.revokeJti('j-old', 1000)
  assert.equal(await store.isRevoked('j-old'), false)
})

live('redis: session resets persist without expiry', async () => {
  assert.equal(await store.getReset('u1'), null)
  await store.setReset('u1', 4242)
  assert.equal(await store.getReset('u1'), 4242)
  assert.equal(await store.client.ttl('gft:reset:u1'), -1)
})

live('redis: idempotency first fingerprint wins, store reads back', async () => {
  assert.deepEqual(await store.claimIdem('s', 'k', 'fp1'), { hash: 'fp1', status: null, body: null })
  assert.deepEqual(await store.claimIdem('s', 'k', 'fp2'), { hash: 'fp1', status: null, body: null })
  await store.storeIdem('s', 'k', 201, '{"a":1}')
  assert.deepEqual(await store.claimIdem('s', 'k', 'fp1'), { hash: 'fp1', status: 201, body: '{"a":1}' })
  assert.ok((await store.client.ttl('gft:idem:s:k')) > 29 * 86400)
})
