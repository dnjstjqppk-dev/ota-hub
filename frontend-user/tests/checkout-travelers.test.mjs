import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import { transformSync } from 'esbuild'
import { ref, computed, watch } from 'vue'

const filename = 'pages/checkout/index.vue'
const source = readFileSync(new URL('../pages/checkout/index.vue', import.meta.url), 'utf8')
const { descriptor, errors } = parse(source, { filename })
assert.deepEqual(errors, [])
const script = compileScript(descriptor, { id: 'checkout-test' })
const template = compileTemplate({ source: descriptor.template.content, filename, id: 'checkout-test', compilerOptions: { bindingMetadata: script.bindings } })
assert.deepEqual(template.errors, [])
const code = transformSync(descriptor.scriptSetup.content.replace(/^import .*$/gm, '') + '\n;globalThis.page = { travelers, slotStart, savedTravelers, specialRequests, applySaved, loadSavedTravelers, buildTravelers };', { loader: 'ts', format: 'cjs' }).code

function setup(routeQuery = {}, passengers = []) {
  const context = {
    ref, computed, watch,
    onMounted: () => {}, onBeforeUnmount: () => {},
    useRoute: () => ({ query: routeQuery, fullPath: '/checkout', path: '/checkout' }),
    useRouter: () => ({ push: () => {} }),
    useAuthStore: () => ({ user: null }),
    useCurrencyStore: () => ({ activeCurrency: 'KRW' }),
    apiFetch: async (path) => path === '/user/passengers'
      ? { ok: true, status: 200, data: { passengers } }
      : { ok: true, status: 200, data: {} },
    formatKrw: (n) => `${n}원`,
    formatMinor: (n) => `${n}원`,
    fmtDay: (d) => d,
    qDate: (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : ''),
    qInt: (v, dflt, lo, hi) => { const n = parseInt(v, 10); return Number.isInteger(n) ? Math.min(hi, Math.max(lo, n)) : dflt },
    todayIso: () => '2026-01-01',
  }
  runInNewContext(code, context)
  return context.page
}

// #88: the requested slot arrives via ?slotStart=HH:MM on ACTIVITY only.
test('checkout accepts a valid slot start and rejects junk', () => {
  assert.equal(setup({ domain: 'ACTIVITY', slotStart: '14:00' }).slotStart.value, '14:00')
  assert.equal(setup({ domain: 'ACTIVITY', slotStart: '25:00' }).slotStart.value, '')
  assert.equal(setup({ domain: 'ACTIVITY' }).slotStart.value, '')
  assert.equal(setup({ domain: 'HOTEL', slotStart: '14:00' }).slotStart.value, '')
})

test('checkout prefaces unconfirmed slot requests into special requests', () => {
  const p = setup({ domain: 'ACTIVITY', slotStart: '09:30' })
  assert.ok(p.specialRequests.value.includes('09:30'), p.specialRequests.value)
  assert.ok(p.specialRequests.value.includes('확정 아님'), p.specialRequests.value)
})

// #92: a saved traveler fills the row; the passport number stays manual.
test('checkout fills a traveler from the saved list except the passport', async () => {
  const p = setup({ domain: 'FLIGHT' }, [
    { id: 't1', name_ko: '홍길동', last_name_en: 'HONG', first_name_en: 'GILDONG', birth_date: '1990-01-02', gender: 'MALE', nationality: 'KOR', passport_expiry: '2030-05-06' },
  ])
  await p.loadSavedTravelers()
  assert.equal(p.savedTravelers.value.length, 1)
  p.buildTravelers()
  assert.ok(p.travelers.value.length >= 1)
  p.applySaved(0, 't1')
  const t = p.travelers.value[0]
  assert.equal(t.lastNameEn, 'HONG')
  assert.equal(t.firstNameEn, 'GILDONG')
  assert.equal(t.birthDate, '1990-01-02')
  assert.equal(t.nationality, 'KOR')
  assert.equal(t.passportExpiry, '2030-05-06')
  assert.equal(t.passportNumber, '', 'passport retyped by hand')
  p.applySaved(0, 'missing-id')
  assert.equal(t.lastNameEn, 'HONG', 'unknown id leaves the row alone')
})
