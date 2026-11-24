import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { buildLegQuoteBody } from '../composables/useCartLeg.ts'

test('cart: leg quote body carries dates, party, unit, and plan when set', () => {
  assert.deepEqual(
    buildLegQuoteBody({ domain: 'HOTEL', itemId: 'h1', unitId: 'r1', ratePlanId: 'p1', startDate: '2026-12-01', endDate: '2026-12-03', rooms: 1, adults: 2, children: 1, title: 'H' }),
    { domain: 'HOTEL', itemId: 'h1', unitId: 'r1', ratePlanId: 'p1', startDate: '2026-12-01', endDate: '2026-12-03', rooms: 1, travelers: { adults: 2, children: 1 } },
  )
})

test('cart: minimal leg omits every optional field', () => {
  assert.deepEqual(
    buildLegQuoteBody({ domain: 'ACTIVITY', itemId: 'a1', startDate: '2026-12-01', adults: 1, title: 'A' }),
    { domain: 'ACTIVITY', itemId: 'a1', startDate: '2026-12-01', travelers: { adults: 1 } },
  )
})

test('cart: slot legs keep their slot request (server rejects them in carts)', () => {
  const b = buildLegQuoteBody({ domain: 'ACTIVITY', itemId: 'a1', startDate: '2026-12-01', adults: 1, slotStart: '10:00', title: 'A' })
  assert.equal(b.slotStart, '10:00')
})
