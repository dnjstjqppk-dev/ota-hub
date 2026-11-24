import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { MASTER_HOTEL_CATALOG } from '../data/hotelCatalog.ts'

// #60: ratings come only from verified reviews (API recompute on review
// insert). The static catalogue must never ship scores or review copy of
// its own — first paint shows "new until travelers review it.
test('hotel catalogue carries no fixture scores or reviews', () => {
  assert.ok(MASTER_HOTEL_CATALOG.length > 0, 'catalogue non-empty sanity')
  for (const h of MASTER_HOTEL_CATALOG) {
    assert.equal(h.review_score, null, `${h.id}: no fixture score`)
    assert.equal(h.review_count, 0, `${h.id}: no fixture count`)
    assert.deepEqual(h.reviews, [], `${h.id}: no fixture review copy`)
  }
})

// P1-2 (2026-11-22 audit): the seed fallback stamped every hotel with one
// Roppongi point. Each property keeps real, distinct coordinates.
test('hotel catalogue carries real distinct coordinates', () => {
  const seen = new Set()
  for (const h of MASTER_HOTEL_CATALOG) {
    assert.equal(typeof h.latitude, 'number', `${h.id}: latitude present`)
    assert.equal(typeof h.longitude, 'number', `${h.id}: longitude present`)
    assert.ok(h.latitude >= -90 && h.latitude <= 90, `${h.id}: latitude in range`)
    assert.ok(h.longitude >= -180 && h.longitude <= 180, `${h.id}: longitude in range`)
    const key = `${h.latitude},${h.longitude}`
    assert.ok(!seen.has(key), `${h.id}: coordinates distinct`)
    seen.add(key)
  }
})
