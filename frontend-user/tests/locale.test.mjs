import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { createPinia, setActivePinia } from 'pinia'
import { useLocaleStore } from '../stores/locale.ts'
import { CATEGORIES } from '../config/navigation.ts'

// #89: the locale switcher drives the nav through locale.t(). Every nav
// category key must resolve in every locale (no raw keys on screen).
test('every nav category key resolves in all four locales', () => {
  setActivePinia(createPinia())
  const locale = useLocaleStore()
  for (const loc of ['ko-kr', 'en-us', 'ja-jp', 'zh-cn']) {
    locale.setLocale(loc)
    for (const c of CATEGORIES) {
      const s = locale.t(c.key)
      assert.ok(s && s !== c.key, `${loc}.${c.key} resolves, got ${JSON.stringify(s)}`)
    }
    assert.ok(locale.t('login') && locale.t('login') !== 'login', `${loc}.login resolves`)
  }
})

test('unknown keys fall back to Korean, then the key itself', () => {
  setActivePinia(createPinia())
  const locale = useLocaleStore()
  locale.setLocale('en-us')
  assert.equal(locale.t('hotels'), 'Hotels')
  assert.equal(locale.t('things-to-do'), 'Attractions')
  assert.equal(locale.t('no-such-key'), 'no-such-key')
})
