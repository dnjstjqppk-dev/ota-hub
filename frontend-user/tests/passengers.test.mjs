import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import { transformSync } from 'esbuild'
import { reactive, ref, watch } from 'vue'

const filename = 'pages/my/passengers.vue'
const { descriptor, errors } = parse(readFileSync(new URL('../pages/my/passengers.vue', import.meta.url), 'utf8'), { filename })
assert.deepEqual(errors, [])
const script = compileScript(descriptor, { id: 'passengers-test' })
const template = compileTemplate({ source: descriptor.template.content, filename, id: 'passengers-test', compilerOptions: { bindingMetadata: script.bindings } })
assert.deepEqual(template.errors, [])
const code = transformSync(descriptor.scriptSetup.content.replace(/^import .*$/gm, '') + '\n;globalThis.page = { passengers, newP, loadPassengers, addPassenger, deletePassenger, isSaving, loadError, isAddModalOpen };', { loader: 'ts', format: 'cjs' }).code

function setup({ demo = false, loggedIn = true } = {}) {
  const auth = reactive({ isLoggedIn: loggedIn, token: demo ? 'demo_jwt_token_sample_2026' : 'real-token', user: loggedIn ? { id: demo ? 'usr-demo-vip' : 'user-a' } : null })
  const requests = [], alerts = [], storage = new Map(), mounted = [], unmounted = []
  const context = {
    ref, watch, onMounted: fn => mounted.push(fn), onBeforeUnmount: fn => unmounted.push(fn),
    useAuthStore: () => auth, useApiUrl: path => path, crypto: globalThis.crypto,
    alert: message => alerts.push(message), confirm: () => true,
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    fetch: async (url, options) => { requests.push({ url, options }); return context.reply(url, options) },
    reply: () => ({ ok: true, json: async () => ({ passengers: [] }) })
  }
  runInNewContext(code, context)
  return { ...context.page, auth, requests, alerts, storage, context, mount: () => mounted.forEach(fn => fn()), unmount: () => unmounted.forEach(fn => fn()) }
}
const response = data => ({ ok: true, json: async () => data })
const tick = () => new Promise(resolve => setImmediate(resolve))
const fill = p => Object.assign(p.newP.value, { nameKo: ' 홍길동 ', nameEn: ' hong   gildong ', passportNumber: ' m1234 ' })

test('empty server list wins over old local data; read failures are visible', async () => {
  const p = setup()
  p.storage.set('passengers_user-a', '[{"id":"stale"}]')
  await p.loadPassengers()
  assert.equal(p.passengers.value.length, 0)
  p.context.reply = () => ({ ok: false })
  await p.loadPassengers()
  assert.ok(p.loadError.value)
  assert.equal(p.passengers.value.length, 0)
})

test('failed save keeps form, successful save uses server ID and does not cache real PII', async () => {
  const p = setup()
  fill(p)
  p.isAddModalOpen.value = true
  p.context.reply = () => ({ ok: false })
  await p.addPassenger()
  assert.equal(p.passengers.value.length, 0)
  assert.equal(p.isAddModalOpen.value, true)
  assert.ok(p.newP.value.nameKo)
  p.context.reply = () => response({ success: true, id: 'psg_server' })
  await p.addPassenger()
  assert.equal(p.passengers.value[0].id, 'psg_server')
  assert.equal(p.passengers.value[0].nameEn, 'HONG GILDONG')
  assert.equal(p.passengers.value[0].isPrimary, false)
  assert.equal(p.newP.value.nameKo, '')
  assert.equal(p.storage.size, 0)
  const body = JSON.parse(p.requests[1].options.body)
  assert.equal(body.firstNameEn, 'GILDONG')
  assert.equal(body.passportNumber, 'M1234')
})

test('failed delete preserves row, successful delete uses its server ID', async () => {
  const p = setup()
  p.passengers.value = [{ id: 'psg_server' }]
  p.context.reply = () => ({ ok: false })
  await p.deletePassenger('psg_server')
  assert.equal(p.passengers.value.length, 1)
  p.context.reply = () => response({ success: true })
  await p.deletePassenger('psg_server')
  assert.equal(p.passengers.value.length, 0)
  assert.equal(p.requests[1].url, '/user/passengers/psg_server')
})

test('duplicate save is blocked; late save after logout is discarded', async () => {
  const p = setup()
  fill(p)
  let resolve
  p.context.reply = () => new Promise(done => { resolve = done })
  const pending = p.addPassenger()
  await p.addPassenger()
  assert.equal(p.requests.length, 1)
  p.auth.isLoggedIn = false
  await p.loadPassengers()
  resolve(response({ success: true, id: 'late' }))
  await pending
  assert.equal(p.passengers.value.length, 0)
  assert.equal(p.alerts.length, 0)
})

test('auth restoration triggers loading and logout clears data, including pending reads', async () => {
  const p = setup({ loggedIn: false })
  p.mount()
  p.auth.user = { id: 'user-a' }
  p.auth.isLoggedIn = true
  await tick()
  assert.equal(p.requests.length, 1)
  let resolve
  p.context.reply = () => new Promise(done => { resolve = done })
  const pending = p.loadPassengers()
  p.auth.isLoggedIn = false
  resolve(response({ passengers: [{ id: 'private', name_ko: 'private' }] }))
  await pending
  assert.equal(p.passengers.value.length, 0)
  p.unmount()
})

test('demo edits persist locally without API calls', async () => {
  const p = setup({ demo: true })
  await p.loadPassengers()
  assert.equal(p.passengers.value.length, 2)
  await p.deletePassenger('p-02')
  await p.loadPassengers()
  assert.equal(p.passengers.value.length, 1)
  fill(p)
  await p.addPassenger()
  await p.loadPassengers()
  assert.equal(p.passengers.value.length, 2)
  assert.equal(p.requests.length, 0)
})
