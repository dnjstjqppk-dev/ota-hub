import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import { transformSync } from 'esbuild'
import { ref, computed } from 'vue'

const ko = JSON.parse(readFileSync(new URL('../i18n/locales/ko.json', import.meta.url), 'utf8'))
const tx = (key, params) => {
  const s = String(key).split('.').reduce((o, k) => (o == null ? o : o[k]), ko)
  if (typeof s !== 'string') return key
  if (!params || typeof params !== 'object') return s
  return Object.entries(params).reduce((acc, [k, v]) => acc.replaceAll(`{${k}}`, String(v)), s)
}

const filename = 'pages/help.vue'
const source = readFileSync(new URL('../pages/help.vue', import.meta.url), 'utf8')
const { descriptor, errors } = parse(source, { filename })
assert.deepEqual(errors, [])
const script = compileScript(descriptor, { id: 'help-test' })
const template = compileTemplate({ source: descriptor.template.content, filename, id: 'help-test', compilerOptions: { bindingMetadata: script.bindings } })
assert.deepEqual(template.errors, [])
const code = transformSync(descriptor.scriptSetup.content.replace(/^import .*$/gm, '') + '\n;globalThis.page = { inquiries, listState, category, subject, body, bookingId, myBookings, submitting, submitError, submitted, fetchMine, submitInquiry, STATUS_LABEL };', { loader: 'ts', format: 'cjs' }).code

function setup({ loggedIn = true } = {}) {
  const calls = []
  const context = {
    ref, computed,
    onMounted: () => {},
    useHead: () => {},
    useSeoPage: () => {},
    useRuntimeConfig: () => ({ public: {} }),
    useLocalePath: () => (to) => (typeof to === 'string' ? to : to.path),
    useI18n: () => ({ t: tx, locale: ref('ko') }),
    navigateTo: () => {},
    useAuthStore: () => ({ isLoggedIn: loggedIn }),
    apiFetch: async (path, opts) => {
      calls.push({ path, opts })
      return context.reply(path, opts)
    },
    reply: async () => ({ ok: true, status: 200, data: { inquiries: [], bookings: [] } }),
  }
  runInNewContext(code, context)
  return { ...context.page, calls, context }
}

test('#154: the form loads my bookings and links the chosen one', async () => {
  const p = setup()
  p.context.reply = async (path) => {
    if (path === '/bookings') return { ok: true, status: 200, data: { bookings: [{ id: 'b1', bookingNumber: 'GFT-1', title: '서울 호텔' }] } }
    return { ok: true, status: 200, data: { inquiries: [] } }
  }
  await p.fetchMine()
  assert.equal(p.myBookings.value.length, 1)
  p.subject.value = 's'
  p.body.value = 'b'
  p.bookingId.value = 'b1'
  await p.submitInquiry()
  const post = p.calls.find((c) => c.opts?.method === 'POST')
  assert.equal(post.opts.body.bookingId, 'b1')
  assert.equal(p.bookingId.value, '')
  assert.equal(p.submitted.value, true)
})

test('#154: no selection sends no booking link', async () => {
  const p = setup()
  p.subject.value = 's'
  p.body.value = 'b'
  await p.submitInquiry()
  const post = p.calls.find((c) => c.opts?.method === 'POST')
  assert.ok(!('bookingId' in post.opts.body))
})

test('TG-21: handoff status renders its label', () => {
  const p = setup()
  assert.equal(p.STATUS_LABEL.value.NEEDS_HUMAN, '상담원 연결됨')
})
