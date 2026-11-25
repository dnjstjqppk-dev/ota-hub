import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { strict as assert } from 'node:assert'
import { test } from 'node:test'

// 2026-11-25 production incident: 11 catalog pages rendered the error page.
//  (1) detail pages called useRuntimeConfig() inside a useHead(() => …) getter —
//      getters run in renderSSRHead, outside the Nuxt app context (NUXT_E1001);
//  (2) list pages referenced a `const xSeoSite` in a head getter on the line
//      before its declaration (TDZ when the getter is evaluated eagerly).
// Guard both shapes across every page/component.

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const walk = (d) => readdirSync(d).flatMap((n) => {
  const p = join(d, n)
  if (['node_modules', '.nuxt', '.output', 'tests'].includes(n)) return []
  return statSync(p).isDirectory() ? walk(p) : (/\.vue$/.test(n) ? [p] : [])
})
const files = [...walk(join(ROOT, 'pages')), ...walk(join(ROOT, 'components')), join(ROOT, 'app.vue')]
const setupOf = (src) => (src.match(/<script setup[^>]*>([\s\S]*?)<\/script>/) || [])[1] || ''

function headGetterBodies(code) {
  const out = []
  const re = /use(?:Head|SeoMeta|ServerHead|ServerSeoMeta)\(\s*\(\)\s*=>/g
  let m
  while ((m = re.exec(code))) {
    const open = code.indexOf('(', m.index)
    let depth = 0, j = open
    for (; j < code.length; j++) { if (code[j] === '(') depth++; else if (code[j] === ')' && --depth === 0) break }
    out.push({ at: m.index, body: code.slice(open, j) })
  }
  return out
}

test('head getters never call Nuxt composables lazily (NUXT_E1001)', () => {
  const bad = []
  for (const f of files) {
    for (const g of headGetterBodies(setupOf(readFileSync(f, 'utf8')))) {
      const hit = g.body.match(/\b(useRuntimeConfig|useNuxtApp|useRoute|useI18n|useLocalePath|useCompany|useApiUrl|useRequestURL|useCookie|useState)\(/)
      if (hit) bad.push(`${f.slice(ROOT.length)}: ${hit[1]}() inside a head getter`)
    }
  }
  assert.deepEqual(bad, [])
})

test('consts used by head getters are declared before the getter (no TDZ)', () => {
  const bad = []
  for (const f of files) {
    const code = setupOf(readFileSync(f, 'utf8'))
    const decls = [...code.matchAll(/^const (\w+) = /gm)].map((d) => ({ name: d[1], at: d.index }))
    for (const g of headGetterBodies(code)) {
      for (const d of decls) {
        if (d.at > g.at && new RegExp(`\\b${d.name}\\b`).test(g.body)) bad.push(`${f.slice(ROOT.length)}: ${d.name} used before declaration`)
      }
    }
  }
  assert.deepEqual(bad, [])
})
