import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import { transformSync } from 'esbuild'
import { ref } from 'vue'

const filename = 'pages/moments/index.vue'
const source = readFileSync(new URL('../pages/moments/index.vue', import.meta.url), 'utf8')
const { descriptor, errors } = parse(source, { filename })
assert.deepEqual(errors, [])
const script = compileScript(descriptor, { id: 'moments-test' })
const template = compileTemplate({ source: descriptor.template.content, filename, id: 'moments-test', compilerOptions: { bindingMetadata: script.bindings } })
assert.deepEqual(template.errors, [])
const code = transformSync(descriptor.scriptSetup.content.replace(/^import .*$/gm, '') + '\n;globalThis.page = { moments, likedIds, liking, draftPhotos, uploading, uploadError, toggleLike, attachFiles, submitMoment, newTitle, newContent, newCity, submitError };', { loader: 'ts', format: 'cjs' }).code

function setup({ loggedIn = true } = {}) {
  const calls = []
  const navs = []
  const context = {
    ref,
    onMounted: () => {},
    useHead: () => {},
    navigateTo: (to) => navs.push(to),
    useAuthStore: () => ({ isLoggedIn: loggedIn, user: { fullName: 'QA' } }),
    useApiUrl: (p = '') => `https://api.test${p.startsWith('/') ? p : `/${p}`}`,
    fetch: async (url, opts) => {
      calls.push({ path: String(url), opts })
      return context.uploadReply(String(url), opts)
    },
    uploadReply: async () => ({ ok: true, json: async () => ({ url: '/api/v1/uploads/upl_x/file' }) }),
    URL,
    FormData,
    window: { location: { origin: 'https://portal.test' } },
    apiFetch: async (path, opts) => {
      calls.push({ path, opts })
      return context.reply(path, opts)
    },
    reply: async () => ({ ok: true, status: 200, data: {} }),
  }
  runInNewContext(code, context)
  return { ...context.page, calls, navs, context }
}

test('#153: like toggles through POST/DELETE and renders the server count', async () => {
  const p = setup()
  const m = { id: 'm1', likes_count: 4 }
  p.context.reply = async (path, opts) => ({ ok: true, status: 200, data: opts.method === 'POST' ? { likesCount: 5 } : { likesCount: 4 } })
  await p.toggleLike(m)
  assert.equal(p.calls[0].path, '/moments/m1/like')
  assert.equal(p.calls[0].opts.method, 'POST')
  assert.ok(p.likedIds.value.has('m1'))
  assert.equal(m.likes_count, 5)
  await p.toggleLike(m)
  assert.equal(p.calls[1].opts.method, 'DELETE')
  assert.ok(!p.likedIds.value.has('m1'))
  assert.equal(m.likes_count, 4)
})

test('#153: anonymous likes detour to login without calling', async () => {
  const p = setup({ loggedIn: false })
  await p.toggleLike({ id: 'm1', likes_count: 4 })
  assert.equal(p.calls.length, 0)
  assert.equal(p.navs[0].path, '/login')
})

test('#153: attached photos upload first and ride on the post', async () => {
  const p = setup()
  const file = new Blob(['bytes'], { type: 'image/jpeg' })
  await p.attachFiles({ target: { files: [file], value: '' } })
  assert.equal(p.draftPhotos.value.length, 1)
  assert.ok(p.draftPhotos.value[0].startsWith('https://api.test/api/v1/uploads/'), p.draftPhotos.value[0])
  p.newTitle.value = 't'
  p.newContent.value = 'c'
  p.context.reply = async () => ({ ok: true, status: 201, data: { id: 'm9' } })
  await p.submitMoment()
  const post = p.calls.find((c) => c.path === '/moments' && c.opts?.method === 'POST')
  assert.deepEqual(post.opts.body.photos, p.moments.value[0].photos)
  assert.equal(p.draftPhotos.value.length, 0)
})

test('#153: failed uploads stay out of the draft and show the reason', async () => {
  const p = setup()
  p.context.uploadReply = async () => ({ ok: false, json: async () => ({ error: '용량 초과' }) })
  const file = new Blob(['bytes'], { type: 'image/jpeg' })
  await p.attachFiles({ target: { files: [file], value: '' } })
  assert.equal(p.draftPhotos.value.length, 0)
  assert.equal(p.uploadError.value, '용량 초과')
  assert.equal(p.uploading.value, false)
})
