import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { appendOutlinkContext } from '../composables/useOutlinkQuery.ts'

// Phase 3: picked dates/party and results-page context ride into the /out/
// click URL. The worker allowlists again; this only merges non-empty values.
test('outlink context merges into the emitted click query', () => {
  assert.equal(
    appendOutlinkContext('/out/agoda/h1?domain=HOTEL', { startDate: '2026-12-01', endDate: '2026-12-03', adults: 2 }),
    '/out/agoda/h1?domain=HOTEL&startDate=2026-12-01&endDate=2026-12-03&adults=2',
  )
})

test('outlink context skips empties and encodes values', () => {
  assert.equal(appendOutlinkContext('/out/klook/a1?domain=ACTIVITY', { dest: '', adults: 2, children: null }), '/out/klook/a1?domain=ACTIVITY&adults=2')
  assert.equal(appendOutlinkContext('/out/trip/x', { dest: '도쿄' }), '/out/trip/x?dest=%EB%8F%84%EC%BF%84')
  assert.equal(appendOutlinkContext('/out/agoda/h1?domain=HOTEL', {}), '/out/agoda/h1?domain=HOTEL')
})
