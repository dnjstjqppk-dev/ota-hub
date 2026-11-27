import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// GAP-01 full: every locale ships the exact key set of ko (no silent fallback
// gaps, no stale keys). Add keys to ko first, then mirror them everywhere.
const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'i18n', 'locales')
const load = (l) => JSON.parse(readFileSync(join(dir, `${l}.json`), 'utf8'))
const keys = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? keys(v, `${p}${k}.`) : [`${p}${k}`]))

test('i18n: en/ja/zh/zh-hant carry the exact key set of ko', () => {
  const ko = keys(load('ko')).sort()
  assert.ok(ko.length > 20, 'ko baseline exists')
  for (const l of ['en', 'ja', 'zh', 'zh-hant']) {
    const mine = keys(load(l)).sort()
    assert.deepEqual(mine, ko, `${l} key drift: missing=${ko.filter((k) => !mine.includes(k)).join(',')} extra=${mine.filter((k) => !ko.includes(k)).join(',')}`)
  }
})

test('i18n: nav + common essentials resolve in every locale', () => {
  for (const l of ['ko', 'en', 'ja', 'zh', 'zh-hant']) {
    const m = load(l)
    for (const k of ['hotels', 'flights', 'trains', 'cars', 'transfers', 'activities', 'things-to-do', 'packages', 'esim', 'insurance', 'login']) {
      assert.ok(m.nav[k] && m.nav[k] !== k, `${l}.nav.${k} resolves`)
    }
    for (const k of ['search', 'bookNow', 'loading', 'retry', 'close']) assert.ok(m.common[k], `${l}.common.${k}`)
  }
})
