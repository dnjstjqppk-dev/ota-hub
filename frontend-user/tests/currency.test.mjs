import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { transformSync } from 'esbuild'

// #157: the hardcoded fallback table must never silently price anything.
const source = readFileSync(new URL('../stores/currency.ts', import.meta.url), 'utf8')
const code = transformSync(
  source.replace(/^import .*$/gm, '') +
    '\n;globalThis.mod = { convertKrw, __store: defineStore.calls[0] };',
  { loader: 'ts', format: 'cjs' },
).code

function load() {
  const context = { module: { exports: {} } }
  context.exports = context.module.exports
  context.defineStore = (...args) => {
    context.defineStore.calls.push(args[1])
    return { args }
  }
  context.defineStore.calls = []
  runInNewContext(code, context)
  return context.mod
}

const { convertKrw, __store } = load()
const rates = { KRW: 1.0, USD: 1350.0, JPY: 9.1, EUR: 1470.0, CNY: 188.0, GBP: 1720.0 }
// The core runs in a vm realm: re-home objects before deep comparison.
const plain = (v) => JSON.parse(JSON.stringify(v))

test('#157: unloaded conversions fail safe to KRW truth', () => {
  assert.deepEqual(plain(convertKrw(135000, 'USD', rates, false)), { amount: 135000, currency: 'KRW', symbol: '₩' })
  assert.equal(convertKrw(135000, 'JPY', rates, false).currency, 'KRW')
})

test('#157: loaded conversions divide by the live rate', () => {
  assert.deepEqual(plain(convertKrw(135000, 'USD', rates, true)), { amount: 100, currency: 'USD', symbol: '$' })
  assert.deepEqual(plain(convertKrw(9100, 'JPY', rates, true)), { amount: 1000, currency: 'JPY', symbol: '¥' })
  assert.equal(convertKrw(1000, 'XXX', rates, true).amount, 1000)
})

test('#157: the store exposes staleness and formats through the core', () => {
  assert.equal(typeof __store.getters.ratesStale, 'function')
  assert.equal(__store.getters.ratesStale({ ratesLoaded: false }), true)
  assert.equal(__store.getters.ratesStale({ ratesLoaded: true }), false)
  const fmt = __store.actions.formatKRW
  assert.equal(fmt.call({ activeCurrency: 'USD', rates, ratesLoaded: false }, 135000), '₩135,000')
  assert.equal(fmt.call({ activeCurrency: 'USD', rates, ratesLoaded: true }, 135000), '$100.00')
})
