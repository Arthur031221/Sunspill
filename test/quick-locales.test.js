import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { LOCALES, setLocale, tq } from '../src/app/i18n.js'

// The quick check is written in English and Traditional Chinese only. Every other language shows the English,
// the way t() falls back, so these two files are checked here as locales.test.js checks the nine.
const read = (name) => JSON.parse(readFileSync(new URL(`../src/locales/${name}.json`, import.meta.url), 'utf8'))
const en = read('quick.en')
const zh = read('quick.zh-TW')
const placeholders = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',')

test('the two quick check files have the same keys and the same placeholders, and nothing is empty', () => {
  assert.deepEqual(Object.keys(zh).sort(), Object.keys(en).sort())
  for (const [key, text] of Object.entries(zh)) {
    assert.ok(text.trim().length > 0 && en[key].trim().length > 0, key)
    assert.equal(placeholders(text), placeholders(en[key]), key)
  }
  // a Traditional Chinese file with English left in it is not a translation
  const same = Object.keys(en).filter((k) => zh[k] === en[k])
  assert.ok(same.length <= 2, same.join(', '))
})

test('no message has a dash, a semicolon or a key of the nine locales', () => {
  for (const [name, file] of [['en', en], ['zh-TW', zh]]) {
    for (const [key, text] of Object.entries(file)) {
      assert.ok(!/[;；—–]/.test(text), `${name} ${key} has a dash or a semicolon`)
      assert.ok(!(key in LOCALES.en.messages), `${key} is in the nine locales as well`)
    }
  }
})

test('every quick message used in the code exists, and every one is used', () => {
  const dir = new URL('../src/app/', import.meta.url)
  const source = readdirSync(dir).filter((f) => f.endsWith('.js')).map((f) => readFileSync(new URL(f, dir), 'utf8')).join('\n')
  const used = new Set()
  for (const m of source.matchAll(/\btq\(\s*['`]([\w.]+)['`]/g)) used.add(m[1])
  for (const m of source.matchAll(/\btq\(`([\w.]+)\.\$\{/g)) for (const key of Object.keys(en)) if (key.startsWith(`${m[1]}.`)) used.add(key)
  for (const key of used) assert.ok(key in en, `missing key ${key}`)
  assert.deepEqual(Object.keys(en).filter((k) => !used.has(k)), [])
})

test('tq speaks Traditional Chinese on the zh-TW page and English everywhere else', () => {
  globalThis.document ??= { documentElement: {} }
  setLocale('zh-TW')
  assert.equal(tq('quick.verdict.strong'), '西曬強')
  assert.equal(tq('quick.floor.value', { n: 5 }), '5 樓')
  for (const code of Object.keys(LOCALES).filter((c) => c !== 'zh-TW')) {
    setLocale(code)
    assert.equal(tq('quick.verdict.strong'), 'Strong afternoon sun', code)
    assert.equal(tq('quick.floor.value', { n: 5 }), '5F', code)
  }
  assert.equal(tq('quick.no.such.key'), 'quick.no.such.key')
  setLocale('en')
})
