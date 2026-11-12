import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import { transformSync } from 'esbuild'
import { computed, onMounted, ref } from 'vue'

const filename = 'views/PricingView.vue'
const source = readFileSync(new URL('../src/views/PricingView.vue', import.meta.url), 'utf8')
const { descriptor, errors } = parse(source, { filename })
assert.deepEqual(errors, [])
const script = compileScript(descriptor, { id: 'pricing-test' })
const template = compileTemplate({ source: descriptor.template.content, filename, id: 'pricing-test', compilerOptions: { bindingMetadata: script.bindings } })
assert.deepEqual(template.errors, [])
const code = transformSync(descriptor.scriptSetup.content.replace(/^import .*$/gm, '') + '\n;globalThis.page = { edits, changedRates, saveRates, saving, list };', { loader: 'ts', format: 'cjs' }).code

function setup(rates = [{ currency: 'USD', symbol: '$', rate_to_krw: 1350, updated_at: '2026-01-01' }]) {
  const calls = []
  const toasts = []
  const store = { data: ref(rates), reloads: 0 }
  const context = {
    computed, onMounted: () => {}, ref,
    api: async (path, init = {}) => {
      calls.push({ path, init })
      if (path === '/fx-rates') return { rates: store.data.value }
      if (path === '/admin/fx-rates') return { updated: (init.json?.rates || []).length }
      throw new Error('unexpected ' + path)
    },
    toast: (text, tone) => { toasts.push({ text, tone }) },
    useResource: (fn) => ({ data: store.data, loading: ref(false), error: ref(''), reload: async () => { store.reloads++; store.data.value = await fn() } }),
    dateTime: (s) => s, krw: (n) => `${n}원`,
  }
  runInNewContext(code, context)
  return { ...context.page, calls, toasts, store }
}

// #121 core flow: FX edits send only changed rows, validated, then reload.
test('pricing: save sends only changed rows and reloads', async () => {
  const p = setup()
  p.edits.value = { USD: '1400', XXX: '' }
  assert.equal(p.changedRates.value.length, 1)
  await p.saveRates()
  const put = p.calls.find((c) => c.path === '/admin/fx-rates')
  assert.deepEqual(JSON.parse(JSON.stringify(put.init.json)), { rates: [{ currency: 'USD', symbol: '$', rate_to_krw: 1400 }] })
  assert.equal(put.init.method, 'PUT')
  assert.equal(p.store.reloads, 1)
  assert.equal(Object.keys(p.edits.value).length, 0)
  assert.ok(p.toasts.some((t) => t.text.includes('1개 통화')))
})

test('pricing: invalid and empty edits never reach the API', async () => {
  const p = setup()
  p.edits.value = { USD: '-5' }
  await p.saveRates()
  assert.ok(!p.calls.some((c) => c.path === '/admin/fx-rates'))
  assert.ok(p.toasts.some((t) => t.tone === 'danger'))
  p.edits.value = {}
  await p.saveRates()
  assert.ok(p.toasts.some((t) => t.text.includes('바뀐 환율이 없어요')))
})
