import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { LOCALES, pickLocale, setLocale, t } from '../src/app/i18n.js'

const en = LOCALES.en.messages
const placeholders = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',')
const others = Object.keys(LOCALES).filter((c) => c !== 'en')

// Words that are the same in several languages on purpose (units, short labels, the product name).
const SAME_OK = new Set(['view.3d', 'compass.N', 'compass.E', 'compass.S', 'compass.NE', 'compass.SE', 'compass.NW', 'compass.W', 'compass.SW', 'top.theme.auto', 'date.month', 'date.day', 'kind.plant', 'view.plan', 'dock.pause', 'place.lat', 'place.lon', 'kind.table', 'share.animation', 'fmt.hm', 'fmt.hour', 'fmt.min', 'tab.share'])

test('there are nine locales and each has every key and no extras', () => {
  assert.deepEqual(Object.keys(LOCALES).sort(), ['de', 'en', 'es', 'fr', 'ja', 'ko', 'pt-BR', 'zh-CN', 'zh-TW'])
  for (const code of others) {
    assert.deepEqual(Object.keys(LOCALES[code].messages).sort(), Object.keys(en).sort(), code)
  }
})

test('placeholders match the English ones and nothing is empty', () => {
  for (const code of others) {
    for (const [key, text] of Object.entries(LOCALES[code].messages)) {
      assert.ok(text.trim().length > 0, `${code} ${key} is empty`)
      assert.equal(placeholders(text), placeholders(en[key]), `${code} ${key}`)
    }
  }
})

test('translations are real: nearly every string differs from English', () => {
  for (const code of others) {
    const same = Object.keys(en).filter((k) => LOCALES[code].messages[k] === en[k] && !SAME_OK.has(k))
    assert.ok(same.length <= 6, `${code} keeps English for: ${same.join(', ')}`)
  }
})

test('every message used in the code exists, and every message is used', () => {
  const dir = new URL('../src/app/', import.meta.url)
  const source = readdirSync(dir).filter((f) => f.endsWith('.js')).map((f) => readFileSync(new URL(f, dir), 'utf8')).join('\n')
  const used = new Set()
  for (const m of source.matchAll(/\bt\(\s*['`]([\w.]+)['`]/g)) used.add(m[1])
  for (const m of source.matchAll(/\bt\(`([\w.]+)\.\$\{/g)) for (const key of Object.keys(en)) if (key.startsWith(`${m[1]}.`)) used.add(key)
  for (const m of source.matchAll(/key: '(date\.\w+)'/g)) used.add(m[1])
  for (const key of used) assert.ok(key in en, `missing key ${key}`)
  const unused = Object.keys(en).filter((k) => !used.has(k))
  assert.deepEqual(unused, [])
})

test('the browser language picks a locale', () => {
  assert.equal(pickLocale(['zh-TW']), 'zh-TW')
  assert.equal(pickLocale(['zh-Hant-HK']), 'zh-TW')
  assert.equal(pickLocale(['zh-CN', 'en']), 'zh-CN')
  assert.equal(pickLocale(['zh']), 'zh-CN')
  assert.equal(pickLocale(['pt-PT']), 'pt-BR')
  assert.equal(pickLocale(['ja-JP']), 'ja')
  assert.equal(pickLocale(['fr-CA', 'en']), 'fr')
  assert.equal(pickLocale(['sv', 'de-AT']), 'de')
  assert.equal(pickLocale(['sv']), 'en')
  assert.equal(pickLocale([]), 'en')
})

test('t fills placeholders, falls back to English and then to the key', () => {
  globalThis.document ??= { documentElement: {} }
  setLocale('de')
  assert.equal(t('fmt.hour', { h: 3 }), '3 Std.')
  assert.equal(t('no.such.key'), 'no.such.key')
  assert.equal(t('fmt.hm', { h: 1 }), '1 Std. {m} Min.')
  setLocale('en')
})
