import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import { transformSync } from 'esbuild'
import { ref } from 'vue'

const ko = JSON.parse(readFileSync(new URL('../i18n/locales/ko.json', import.meta.url), 'utf8'))
const tx = (key, params) => {
  const s = String(key).split('.').reduce((o, k) => (o == null ? o : o[k]), ko)
  if (typeof s !== 'string') return key
  if (!params || typeof params !== 'object') return s
  return Object.entries(params).reduce((acc, [k, v]) => acc.replaceAll(`{${k}}`, String(v)), s)
}

const filename = 'pages/deals.vue'
const source = readFileSync(new URL('../pages/deals.vue', import.meta.url), 'utf8')
const { descriptor, errors } = parse(source, { filename })
assert.deepEqual(errors, [])
const script = compileScript(descriptor, { id: 'deals-test' })
const template = compileTemplate({ source: descriptor.template.content, filename, id: 'deals-test', compilerOptions: { bindingMetadata: script.bindings } })
assert.deepEqual(template.errors, [])
// TG-15: the page SSR-loads via top-level await (unsupported by this cjs harness).
// This test pins the pure formatting fns only, so the SSR lines are stripped;
// SSR itself is covered by the build + ISR smoke.
const setupBody = descriptor.scriptSetup.content
  .replace(/^import .*$/gm, '')
  .replace(/^await useAsyncData.*$/gm, '')
  .replace(/^if \(state\.value.*$/gm, '')
const code = transformSync(setupBody + '\n;globalThis.page = { benefitText, boundText, discountTypeLabel };', { loader: 'ts', format: 'cjs' }).code

function setup() {
  const context = { ref, onMounted: () => {}, useHead: () => {}, useSeoPage: () => {}, useRuntimeConfig: () => ({ public: { brandDomain: 'portal.test' } }), apiFetch: async () => ({ ok: true, data: { promotions: [] } }), useI18n: () => ({ t: tx, locale: ref('ko') }) }
  runInNewContext(code, context)
  return context.page
}

// #90: the card shows the actual benefit, and zero bounds stay hidden.
test('deals benefit text renders percent and fixed values', () => {
  const { benefitText } = setup()
  assert.equal(benefitText({ discount_type: 'PERCENTAGE', discount_value: 10 }), '10% 할인')
  assert.equal(benefitText({ discount_type: 'FIXED_AMOUNT', discount_value: 5000 }), '5,000원 할인')
})

test('deals hides zero min/max bounds', () => {
  const { boundText } = setup()
  assert.equal(boundText({ min_order_amount_krw: 50000, max_discount_krw: 30000 }), '최소 주문금액 ₩50,000 · 최대 ₩30,000 할인')
  assert.equal(boundText({ min_order_amount_krw: 0, max_discount_krw: 30000 }), '최대 ₩30,000 할인')
  assert.equal(boundText({ min_order_amount_krw: 0, max_discount_krw: 0 }), '')
  assert.equal(boundText({}), '')
})
