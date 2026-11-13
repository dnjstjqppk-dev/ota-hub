import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import { transformSync } from 'esbuild'
import { ref } from 'vue'

const filename = 'views/SecurityView.vue'
const source = readFileSync(new URL('../src/views/SecurityView.vue', import.meta.url), 'utf8')
const { descriptor, errors } = parse(source, { filename })
assert.deepEqual(errors, [])
const script = compileScript(descriptor, { id: 'security-test' })
const template = compileTemplate({ source: descriptor.template.content, filename, id: 'security-test', compilerOptions: { bindingMetadata: script.bindings } })
assert.deepEqual(template.errors, [])
const code = transformSync(descriptor.scriptSetup.content.replace(/^import .*$/gm, '') + '\n;globalThis.page = { status, loading, busy, secret, otpauthUrl, code, refresh, enroll, confirm, disable, copy };', { loader: 'ts', format: 'cjs' }).code

function setup() {
  const calls = []
  const toasts = []
  let enrolled = false
  let pending = false
  const context = {
    ref,
    api: async (path, init = {}) => {
      calls.push({ path, init })
      if (path === '/admin/mfa/status') return { enrolled, pending }
      if (path === '/admin/mfa/enroll') {
        pending = true
        return { secret: 'ABCDEF', otpauthUrl: 'otpauth://totp/x?secret=ABCDEF' }
      }
      if (path === '/admin/mfa/confirm') {
        if (init.json?.code !== '123456') throw new Error('코드가 올바르지 않아요.')
        enrolled = true
        pending = false
        return { confirmed: true }
      }
      if (path === '/admin/mfa') {
        enrolled = false
        pending = false
        return { enrolled: false }
      }
      throw new Error('unexpected ' + path)
    },
    toast: (text, tone) => { toasts.push({ text, tone }) },
    navigator: { clipboard: { writeText: async () => {} } },
  }
  runInNewContext(code, context)
  return { ...context.page, calls, toasts }
}

const flush = () => new Promise((r) => setTimeout(r, 0))

test('mfa console: enroll shows the secret, confirm enables', async () => {
  const p = setup()
  await flush()
  assert.deepEqual(JSON.parse(JSON.stringify(p.status.value)), { enrolled: false, pending: false })
  await p.enroll()
  assert.equal(p.secret.value, 'ABCDEF')
  assert.ok(p.otpauthUrl.value.startsWith('otpauth://'))
  p.code.value = '000000'
  await p.confirm()
  assert.equal(p.status.value.enrolled, false)
  p.code.value = '123456'
  await p.confirm()
  assert.equal(p.status.value.enrolled, true)
  assert.equal(p.secret.value, '')
})

test('mfa console: disable turns it off', async () => {
  const p = setup()
  await flush()
  await p.enroll()
  p.code.value = '123456'
  await p.confirm()
  await p.disable()
  assert.equal(p.status.value.enrolled, false)
  assert.ok(p.calls.some((c) => c.path === '/admin/mfa' && c.init.method === 'DELETE'))
})
