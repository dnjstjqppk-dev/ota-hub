import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import { transformSync } from 'esbuild'
import { ref } from 'vue'

const filename = 'views/LoginView.vue'
const source = readFileSync(new URL('../src/views/LoginView.vue', import.meta.url), 'utf8')
const { descriptor, errors } = parse(source, { filename })
assert.deepEqual(errors, [])
const script = compileScript(descriptor, { id: 'login-mfa-test' })
const template = compileTemplate({ source: descriptor.template.content, filename, id: 'login-mfa-test', compilerOptions: { bindingMetadata: script.bindings } })
assert.deepEqual(template.errors, [])
const code = transformSync(descriptor.scriptSetup.content.replace(/^import .*$/gm, '') + '\n;globalThis.page = { email, password, needCode, totpCode, error, submit };', { loader: 'ts', format: 'cjs' }).code

function setup(responses) {
  const bodies = []
  const navs = []
  const saved = []
  const queue = [...responses]
  const context = {
    ref,
    useRoute: () => ({ query: {} }),
    useRouter: () => ({ replace: (to) => navs.push(to) }),
    apiUrl: (p) => `https://test.local${p}`,
    saveSession: (token, user) => saved.push({ token, user }),
    fetch: async (url, opts) => {
      bodies.push(JSON.parse(opts.body))
      const next = queue.shift() || {}
      return { ok: next.ok !== false, json: async () => next.json || {} }
    },
  }
  runInNewContext(code, context)
  return { ...context.page, bodies, navs, saved }
}

test('mfa login: MFA_REQUIRED opens the code step and resubmits with the code', async () => {
  const p = setup([
    { ok: false, json: { code: 'MFA_REQUIRED', error: '코드가 필요해요' } },
    { ok: true, json: { token: 't', user: { id: 'a', role: 'ADMIN', fullName: 'A', email: 'a@t' } } },
  ])
  p.email.value = 'a@t'
  p.password.value = 'pw'
  await p.submit()
  assert.equal(p.needCode.value, true)
  assert.equal(p.saved.length, 0)
  p.totpCode.value = '123456'
  await p.submit()
  assert.equal(p.bodies[1].totpCode, '123456')
  assert.equal(p.saved.length, 1)
  assert.deepEqual(p.navs, ['/dashboard'])
})

test('mfa login: plain logins skip the code step', async () => {
  const p = setup([{ ok: true, json: { token: 't', user: { id: 'a', role: 'ADMIN' } } }])
  p.email.value = 'a@t'
  p.password.value = 'pw'
  await p.submit()
  assert.equal(p.needCode.value, false)
  assert.ok(!('totpCode' in p.bodies[0]))
  assert.equal(p.saved.length, 1)
})
