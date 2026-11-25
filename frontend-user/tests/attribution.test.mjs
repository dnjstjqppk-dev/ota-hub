import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { parseLandingAttribution, shouldTagRequest, withAttributionHeaders } from '../utils/attribution.ts'

test('attribution parses landing signals from search and referrer', () => {
  assert.deepEqual(parseLandingAttribution('?utm_source=chatgpt&utm_medium=referral&x=1', 'https://chatgpt.com/share/a'), {
    ref: 'https://chatgpt.com/share/a',
    utm: 'utm_source=chatgpt&utm_medium=referral',
  })
  assert.deepEqual(parseLandingAttribution('', ''), { ref: '', utm: '' })
  assert.deepEqual(parseLandingAttribution('?utm_campaign=summer', ''), { ref: '', utm: 'utm_campaign=summer' })
})

test('attribution tags same-origin api calls only', () => {
  assert.equal(shouldTagRequest('/api/v1/hotels', 'https://getfortrip.com'), true)
  assert.equal(shouldTagRequest('https://getfortrip.com/api/v1/hotels', 'https://getfortrip.com'), true)
  assert.equal(shouldTagRequest('https://getfortrip.com/hotels', 'https://getfortrip.com'), false)
  assert.equal(shouldTagRequest('https://evil.test/api/v1/hotels', 'https://getfortrip.com'), false)
  assert.equal(shouldTagRequest({ url: '/api/v1/x' }, 'https://getfortrip.com'), false)
})

test('attribution headers merge without disturbing existing ones', () => {
  const attr = { sid: 's1', ref: 'r', utm: 'u' }
  assert.deepEqual(withAttributionHeaders(undefined, attr)['X-Session-Id'], 's1')
  const merged = withAttributionHeaders({ headers: { 'Content-Type': 'application/json' } }, attr)
  assert.equal(merged['Content-Type'], 'application/json')
  assert.equal(merged['X-Landing-Ref'], 'r')
  const fromHeaders = withAttributionHeaders({ headers: new Headers({ Authorization: 'Bearer x' }) }, attr)
  assert.equal(fromHeaders.authorization, 'Bearer x')
  assert.equal(fromHeaders['X-Landing-Utm'], 'u')
})
