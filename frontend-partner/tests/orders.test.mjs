import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import { transformSync } from 'esbuild'
import { ref, onMounted, watch } from 'vue'

const filename = 'views/OrdersView.vue'
const source = readFileSync(new URL('../src/views/OrdersView.vue', import.meta.url), 'utf8')
const { descriptor, errors } = parse(source, { filename })
assert.deepEqual(errors, [])
const script = compileScript(descriptor, { id: 'orders-test' })
const template = compileTemplate({ source: descriptor.template.content, filename, id: 'orders-test', compilerOptions: { bindingMetadata: script.bindings } })
assert.deepEqual(template.errors, [])
const code = transformSync(descriptor.scriptSetup.content.replace(/^import .*$/gm, '') + '\n;globalThis.page = { STATUS_GROUPS, TERMINAL, CONFIRMABLE, actionable, confirmable, rejectable, badge, setFilter, filterStatus, orders };', { loader: 'ts', format: 'cjs' }).code

function setup() {
  const calls = []
  const context = {
    ref, onMounted: () => {}, watch: () => {}, URLSearchParams,
    apiUrl: (p) => `https://test.local${p}`, partnerToken: () => 't',
    fetch: async (url) => { calls.push(String(url)); return { ok: true, json: async () => ({ orders: [], total: 0, totalPages: 1 }) } },
  }
  runInNewContext(code, context)
  return { ...context.page, calls }
}

const row = (status) => ({ id: 'b1', status })

// #121 core flow: action buttons mirror the server state machine exactly.
test('orders: confirm runs only from booking-pending, reject skips unpaid', () => {
  const p = setup()
  assert.equal(p.confirmable(row('SUPPLIER_BOOKING_PENDING')), true)
  assert.equal(p.confirmable(row('AWAITING_PAYMENT')), false)
  assert.equal(p.confirmable(row('PAYMENT_AUTHORIZED')), false)
  assert.equal(p.confirmable(row('MANUAL_REVIEW_REQUIRED')), false)
  assert.equal(p.rejectable(row('AWAITING_PAYMENT')), false)
  assert.equal(p.rejectable(row('SUPPLIER_BOOKING_PENDING')), true)
  assert.equal(p.rejectable(row('PAYMENT_AUTHORIZED')), true)
  assert.equal(p.actionable(row('VOUCHER_ISSUED')), false)
})

test('orders: every live status has a filter group, manual review included', async () => {
  const p = setup()
  const grouped = new Set(p.STATUS_GROUPS.flatMap((g) => g.statuses))
  for (const s of ['AWAITING_PAYMENT', 'SUPPLIER_BOOKING_PENDING', 'PAYMENT_AUTHORIZED', 'MANUAL_REVIEW_REQUIRED', 'SUPPLIER_CONFIRMED', 'VOUCHER_ISSUED', 'TICKETED', 'CANCELLED', 'REFUNDED', 'FAILED', 'EXPIRED', 'REFUND_PENDING', 'CANCELLATION_REQUESTED']) {
    assert.ok(grouped.has(s), `${s} grouped`)
  }
  p.setFilter('MANUAL')
  await new Promise((r) => setTimeout(r, 0))
  assert.ok(p.calls.some((u) => u.includes('status=MANUAL_REVIEW_REQUIRED')), JSON.stringify(p.calls))
})
