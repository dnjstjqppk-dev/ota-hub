import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { hubBindingTarget } from '../utils/hubBinding.ts'

// P0-1 (2026-11-22 audit): SSR fetches to the hub origin must ride the
// ota-hub service binding; everything else keeps the global fetch.
const BASE = 'https://ota-hub.dnjstjq0824.workers.dev/api/v1'

test('hub URLs are forwarded through the binding', () => {
  assert.equal(hubBindingTarget(`${BASE}/hotels?limit=100`, BASE), `${BASE}/hotels?limit=100`)
  assert.equal(hubBindingTarget(`${BASE}/hotels/htl_seoul_01`, BASE), `${BASE}/hotels/htl_seoul_01`)
  assert.equal(hubBindingTarget(BASE, BASE), BASE)
  assert.equal(hubBindingTarget(`${BASE}?x=1`, BASE), `${BASE}?x=1`)
})

test('non-hub requests keep the global fetch', () => {
  assert.equal(hubBindingTarget('/api/v1/hotels', BASE), null)
  assert.equal(hubBindingTarget('https://ota-hub.dnjstjq0824.workers.dev/status', BASE), null)
  assert.equal(hubBindingTarget('https://getfortrip.com/api/v1/hotels', BASE), null)
  // Same host, longer last segment — not the API base.
  assert.equal(hubBindingTarget('https://ota-hub.dnjstjq0824.workers.dev/api/v10/x', BASE), null)
  assert.equal(hubBindingTarget(undefined, BASE), null)
  assert.equal(hubBindingTarget(null, BASE), null)
  assert.equal(hubBindingTarget(42, BASE), null)
  assert.equal(hubBindingTarget(`${BASE}/hotels`, ''), null)
  assert.equal(hubBindingTarget(`${BASE}/hotels`, '/api/v1'), null)
})
