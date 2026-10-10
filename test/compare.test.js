import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createCompare, MAX_COMPARE, COMPARE_KEY } from '../src/app/compare.js'

const memory = (start = {}) => {
  const data = { ...start }
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = String(v) }, removeItem: (k) => { delete data[k] } }
}
const flat = (n, extra = {}) => ({
  label: `Flat ${n}`, address: `台北市大安區復興南路二段151巷${n}號`, floor: 5, lat: 25.0284704 + n * 0.001, lon: 121.5439379,
  chosen: ['W'],
  sides: [{ id: 'W', afternoon: 267.4, winter: 4.6, year: Array(12).fill(5) }, { id: 'N', afternoon: 63, winter: 0, year: Array(12).fill(1) }],
  ...extra,
})

test('a flat is kept with its label, address, floor, chosen sides and results, and is there next time', () => {
  const store = memory()
  const a = createCompare(store)
  assert.equal(a.add(flat(1)), 'added')
  const list = createCompare(store).list()
  assert.equal(list.length, 1)
  assert.equal(list[0].label, 'Flat 1')
  assert.equal(list[0].floor, 5)
  assert.deepEqual(list[0].chosen, ['W'])
  assert.equal(list[0].sides[0].afternoon, 267.4)
  assert.equal(typeof list[0].id, 'string')
  assert.ok(COMPARE_KEY in store.data)
})

test('at most four flats are kept, and the fifth is turned away without losing the four', () => {
  const store = memory()
  const c = createCompare(store)
  for (let n = 1; n <= MAX_COMPARE; n++) assert.equal(c.add(flat(n)), 'added')
  assert.equal(c.add(flat(9)), 'full')
  assert.deepEqual(c.list().map((f) => f.label), ['Flat 1', 'Flat 2', 'Flat 3', 'Flat 4'])
  assert.equal(MAX_COMPARE, 4)
})

test('the same place on the same floor replaces its flat, and another floor is another flat', () => {
  const c = createCompare(memory())
  c.add(flat(1))
  assert.equal(c.add(flat(1, { label: 'Again', chosen: ['N'] })), 'replaced')
  assert.equal(c.list().length, 1)
  assert.deepEqual([c.list()[0].label, c.list()[0].chosen], ['Again', ['N']])
  assert.equal(c.add(flat(1, { floor: 6 })), 'added')
  assert.equal(c.list().length, 2)
  // replacing is allowed when the list is full
  const full = createCompare(memory())
  for (let n = 1; n <= 4; n++) full.add(flat(n))
  assert.equal(full.add(flat(2, { label: 'Two' })), 'replaced')
})

test('a flat is removed by its id', () => {
  const c = createCompare(memory())
  c.add(flat(1))
  c.add(flat(2))
  const [first, second] = c.list()
  assert.equal(c.remove(first.id), true)
  assert.deepEqual(c.list().map((f) => f.id), [second.id])
  assert.equal(c.remove('nope'), false)
})

test('what is read back is cleaned: bad entries go, long text is cut, numbers are kept in range', () => {
  const bad = [
    flat(1, { label: 'x'.repeat(500), floor: 400, chosen: ['W', 'Q', 7] }),
    { label: 'no place', floor: 3 },
    flat(2, { lat: 'north' }),
    flat(3, { sides: [{ id: 'W', afternoon: 'a lot', winter: 1, year: [1] }, { id: 'S', afternoon: 12, winter: 3, year: Array(12).fill(2) }] }),
    'text',
    null,
  ].map((f, i) => (f && typeof f === 'object' ? { id: `id${i}`, at: 1, ...f } : f))
  const store = memory({ [COMPARE_KEY]: JSON.stringify(bad) })
  const list = createCompare(store).list()
  assert.deepEqual(list.map((f) => f.id), ['id0', 'id3'])
  assert.equal(list[0].label.length, 80)
  assert.equal(list[0].floor, 99)
  assert.deepEqual(list[0].chosen, ['W'])
  assert.deepEqual(list[1].sides.map((s) => s.id), ['S'])
  assert.equal(createCompare(memory({ [COMPARE_KEY]: 'not json' })).list().length, 0)
  assert.equal(createCompare(memory({ [COMPARE_KEY]: '{"a":1}' })).list().length, 0)
})

test('a browser that will not keep it says so and leaves the list as it was', () => {
  const store = memory()
  store.setItem = () => { throw new Error('quota') }
  const c = createCompare(store)
  assert.equal(c.add(flat(1)), 'failed')
  assert.equal(c.list().length, 0)
  assert.equal(createCompare({ getItem: () => { throw new Error('denied') }, setItem: () => {} }).list().length, 0)
})
