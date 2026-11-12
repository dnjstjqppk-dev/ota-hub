import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import { transformSync } from 'esbuild'
import { ref } from 'vue'

const filename = 'pages/deals.vue'
const source = readFileSync(new URL('../pages/deals.vue', import.meta.url), 'utf8')
const { descriptor, errors } = parse(source, { filename })
assert.deepEqual(errors, [])
const script = compileScript(descriptor, { id: 'deals-test' })
const template = compileTemplate({ source: descriptor.template.content, filename, id: 'deals-test', compilerOptions: { bindingMetadata: script.bindings } })
assert.deepEqual(template.errors, [])
const code = transformSync(descriptor.scriptSetup.content.replace(/^import .*$/gm, '') + '\n;globalThis.page = { benefitText, boundText, discountTypeLabel };', { loader: 'ts', format: 'cjs' }).code

function setup() {
  const context = { ref, onMounted: () => {}, useHead: () => {}, apiFetch: async () => ({ ok: true, data: { promotions: [] } }) }
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
