import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import { transformSync } from 'esbuild'
import { ref } from 'vue'

const filename = 'components/RecoRail.vue'
const source = readFileSync(new URL('../components/RecoRail.vue', import.meta.url), 'utf8')
const { descriptor, errors } = parse(source, { filename })
assert.deepEqual(errors, [])
const script = compileScript(descriptor, { id: 'recorail-test' })
const template = compileTemplate({ source: descriptor.template.content, filename, id: 'recorail-test', compilerOptions: { bindingMetadata: script.bindings } })
assert.deepEqual(template.errors, [])
// This test pins the pure formatting fns only; fetch/state lines are stripped.
const setupBody = descriptor.scriptSetup.content
  .replace(/^import .*$/gm, '')
  .replace(/^const props = defineProps.*$/gm, '')
const code = transformSync(setupBody + '\n;globalThis.page = { slotTitle, priceText };', { loader: 'ts', format: 'cjs' }).code

function setup() {
  const context = { ref, onMounted: () => {}, defineProps: () => ({}) }
  runInNewContext(code, context)
  return context.page
}

test('recorail slot titles are Korean', () => {
  const { slotTitle } = setup()
  assert.equal(slotTitle('together'), '함께 본 상품')
  assert.equal(slotTitle('popular'), '인기 상품')
  assert.equal(slotTitle('recent'), '최근 본 상품')
})

test('recorail price text formats major KRW or hides', () => {
  const { priceText } = setup()
  assert.equal(priceText(12000), '12,000원 참고가')
  assert.equal(priceText(null), '가격 확인 중')
})

test('recorail touch targets meet 44px', () => {
  assert.ok(descriptor.template.content.includes('min-h-[44px]'), '44px touch target')
})
