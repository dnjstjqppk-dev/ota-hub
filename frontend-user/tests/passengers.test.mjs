import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import { transformSync } from 'esbuild'
import { reactive, ref } from 'vue'

const filename = 'pages/my/passengers.vue'
const source = readFileSync(new URL('../pages/my/passengers.vue', import.meta.url), 'utf8')
const { descriptor, errors } = parse(source, { filename })
assert.deepEqual(errors, [])
const script = compileScript(descriptor, { id: 'passengers-test' })
const template = compileTemplate({ source: descriptor.template.content, filename, id: 'passengers-test', compilerOptions: { bindingMetadata: script.bindings } })
assert.deepEqual(template.errors, [])
const code = transformSync(descriptor.scriptSetup.content.replace(/^import .*$/gm, '') + '\n;globalThis.page = { list, state, f, formOpen, saving, removing, msg, load, save, remove };', { loader: 'ts', format: 'cjs' }).code

function setup() {
  const calls = []
  const context = {
    ref, reactive, useHead: () => {},
    confirm: () => true,
    apiFetch: async (path, opts) => { calls.push({ path, opts }); return context.reply(path, opts) },
    reply: async () => ({ ok: true, status: 200, data: { passengers: [] } })
  }
  runInNewContext(code, context)
  return { ...context.page, calls, context }
}
const fill = (f) => Object.assign(f, { nameKo: '홍길동', lastNameEn: ' hong ', firstNameEn: ' gildong ', passportNumber: ' m1234 ' })

test('empty server list renders empty; read failures are visible and retry recovers', async () => {
  const p = setup()
  await p.load()
  assert.equal(p.state.value, 'ready')
  assert.deepEqual(p.list.value, [])
  p.context.reply = async () => ({ ok: false, status: 500, data: { error: 'boom' } })
  await p.load()
  assert.equal(p.state.value, 'error')
  p.context.reply = async () => ({ ok: true, status: 200, data: { passengers: [{ id: 'p1' }] } })
  await p.load()
  assert.equal(p.state.value, 'ready')
  assert.equal(p.list.value.length, 1)
})

test('save validates names, uppercases english fields, resets the form and reloads', async () => {
  const p = setup()
  await p.save()
  assert.equal(p.msg.value.ok, false)
  assert.equal(p.calls.length, 0)
  fill(p.f)
  p.context.reply = async (path, opts) => {
    if (opts?.method === 'POST') return { ok: true, status: 201, data: {} }
    return { ok: true, status: 200, data: { passengers: [{ id: 'p9' }] } }
  }
  p.formOpen.value = true
  await p.save()
  const post = p.calls.find((c) => c.opts?.method === 'POST')
  assert.equal(post.path, '/user/passengers')
  assert.equal(post.opts.body.lastNameEn, 'HONG')
  assert.equal(post.opts.body.firstNameEn, 'GILDONG')
  assert.equal(post.opts.body.passportNumber, 'M1234')
  assert.equal(p.f.nameKo, '')
  assert.equal(p.formOpen.value, false)
  assert.equal(p.msg.value.ok, true)
  assert.equal(p.list.value.length, 1)
})

test('failed save keeps the form and shows the server reason', async () => {
  const p = setup()
  fill(p.f)
  p.context.reply = async () => ({ ok: false, status: 400, data: { error: '여권 만료일이 지났습니다.' } })
  await p.save()
  assert.equal(p.msg.value.text, '여권 만료일이 지났습니다.')
  assert.equal(p.f.nameKo, '홍길동')
  assert.equal(p.saving.value, false)
})

test('remove asks for confirmation; success filters, failure is visible', async () => {
  const p = setup()
  p.list.value = [{ id: 'p1' }, { id: 'p2' }]
  p.context.confirm = () => false
  await p.remove('p1')
  assert.equal(p.calls.length, 0)
  assert.equal(p.list.value.length, 2)
  p.context.confirm = () => true
  p.context.reply = async () => ({ ok: true, status: 200, data: {} })
  await p.remove('p1')
  assert.equal(p.calls[0].path, '/user/passengers/p1')
  assert.deepEqual(p.list.value.map((x) => x.id), ['p2'])
  p.context.reply = async () => ({ ok: false, status: 500, data: {} })
  await p.remove('p2')
  assert.equal(p.msg.value.ok, false)
  assert.equal(p.list.value.length, 1)
})

test('travelers are server-stored; the page never caches PII locally', async () => {
  assert.ok(!source.includes('localStorage'), 'no local caching of traveler PII')
  const p = setup()
  await p.load()
  assert.equal(p.calls[0].path, '/user/passengers')
})
