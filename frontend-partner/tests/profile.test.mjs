import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import { transformSync } from 'esbuild'
import { computed, ref, onMounted } from 'vue'

const filename = 'views/ProfileView.vue'
const source = readFileSync(new URL('../src/views/ProfileView.vue', import.meta.url), 'utf8')
const { descriptor, errors } = parse(source, { filename })
assert.deepEqual(errors, [])
const script = compileScript(descriptor, { id: 'profile-test' })
const template = compileTemplate({ source: descriptor.template.content, filename, id: 'profile-test', compilerOptions: { bindingMetadata: script.bindings } })
assert.deepEqual(template.errors, [])
const code = transformSync(descriptor.scriptSetup.content.replace(/^import .*$/gm, '') + '\n;globalThis.page = { initial, contactPhone, bankName, bankAccountNumber, bankAccountHolder, taxInvoiceEmail, handleSaveProfile, saveInfo, saveError, fetchProfile };', { loader: 'ts', format: 'cjs' }).code

function setup() {
  const calls = []
  const profile = {
    partner: {
      contact_phone: '02-1111-2222',
      profile: { bank_name: 'QABank', bank_account_number: '********4321', bank_account_holder: 'QA', tax_invoice_email: 't@t.t' },
    },
  }
  const context = {
    computed, ref, onMounted: () => {},
    useRoute: () => ({ query: {} }),
    apiUrl: (p) => `https://test.local${p}`, partnerToken: () => 't',
    fetch: async (url, opts = {}) => {
      calls.push({ url: String(url), method: opts.method || 'GET', body: opts.body ? JSON.parse(opts.body) : null })
      return { ok: true, json: async () => profile }
    },
  }
  runInNewContext(code, context)
  return { ...context.page, calls }
}

// #121 core flow: the form sends only what changed, never a masked value back.
test('profile: save sends only changed fields', async () => {
  const p = setup()
  await p.fetchProfile()
  assert.equal(p.initial.value.contactPhone, '02-1111-2222')
  assert.equal(p.initial.value.bankAccountNumber, '********4321')
  p.contactPhone.value = '02-9999-0000'
  await p.handleSaveProfile()
  const patch = p.calls.find((c) => c.method === 'PATCH')
  assert.deepEqual(patch.body, { contactPhone: '02-9999-0000' })
})

test('profile: untouched save sends nothing; masked numbers never round-trip', async () => {
  const p = setup()
  await p.fetchProfile()
  await p.handleSaveProfile()
  assert.ok(!p.calls.some((c) => c.method === 'PATCH'), 'no request when nothing changed')
  assert.equal(p.saveInfo.value, '바뀐 내용이 없어요.')
  // Even if the masked account "differs" (it cannot — snapshot equals input),
  // a starred value is never written back: simulate by editing around it.
  p.bankName.value = 'OtherBank'
  await p.handleSaveProfile()
  const patch = p.calls.find((c) => c.method === 'PATCH')
  assert.deepEqual(patch.body, { bankName: 'OtherBank' })
})
