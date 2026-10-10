// The "nearby past deals" part of the quick check's sheet: what the deals round the building say, the deals of the
// building itself, and the nearest ones. It says in so many words that these are past deals and not listings, and
// where the data comes from. It draws what it is given and fetches nothing.

import { h } from './dom.js'
import { tq, locale } from './i18n.js'
import { ageAt } from '../core/deals.js'

const MORE = 6

/** Numbers as the page speaks: thousands marked, and at most `digits` decimals. */
const num = (v, digits = 0) => new Intl.NumberFormat(locale() === 'zh-TW' ? 'zh-TW' : 'en-US', { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(v)

function floorText(d) {
  if (d.type === 'house') return d.floors ? tq('quick.deals.house', { floors: d.floors }) : tq('quick.deals.houseBare')
  if (d.floor === null) return d.floors ? tq('quick.deals.floorsOnly', { floors: d.floors }) : tq('quick.deals.floorUnknown')
  const floor = d.floor < 0 ? `B${-d.floor}` : d.floor
  return d.floors ? tq('quick.deals.floor', { floor, floors: d.floors }) : tq('quick.deals.floorBare', { floor })
}

/** One deal as two lines: when, what kind and the price, then where in the building, how old, how big and the unit price. */
function row(d, age, near) {
  const sale = d.kind === 'sale'
  const price = sale ? tq('quick.deals.price', { n: num(d.price, d.price < 100 ? 1 : 0) }) : tq('quick.deals.rent', { n: num(d.price) })
  const unit = sale ? tq('quick.deals.unitSale', { n: num(d.unit, 1) }) : tq('quick.deals.unitRent', { n: num(d.unit) })
  const second = [floorText(d), age === null ? null : tq('quick.deals.age', { n: age }), tq('quick.deals.ping', { n: num(d.ping, 1) }), unit, near ? tq('quick.deals.metres', { n: num(Math.round(d.metres / 10) * 10) }) : null].filter(Boolean)
  return h('li', { class: `deal-row ${d.kind}` },
    h('b', {}, `${d.date} · ${tq(`quick.deals.kind.${d.kind}`)} · ${price}`),
    h('span', {}, second.join(' · ')))
}

/**
 * @param {{status:string, summary?:object, asof?:string}} deals the state of the loading, and when it is `ok` the numbers
 * @param {() => void} retry what the retry button does when the files would not come
 * @returns {HTMLElement}
 */
export function dealsSection(deals, retry) {
  const head = h('div', { class: 'deals-head' }, h('h3', { id: 'deals-title' }, tq('quick.deals.title')), h('span', { class: 'deals-flag' }, tq('quick.deals.flag')))
  const box = h('section', { class: 'quick-deals', id: 'quick-deals', 'aria-labelledby': 'deals-title', dataset: { status: deals.status } }, head)
  if (deals.status === 'loading' || deals.status === 'idle') {
    box.append(h('p', { class: 'note', role: 'status' }, tq('quick.deals.loading')))
    return box
  }
  if (deals.status === 'none') {
    box.append(h('p', { class: 'note', id: 'deals-none' }, tq('quick.deals.none')))
    return box
  }
  if (deals.status === 'missing') {
    box.append(h('p', { class: 'note', id: 'deals-missing' }, tq('quick.deals.missing')))
    return box
  }
  if (deals.status === 'failed') {
    box.append(h('p', { class: 'note warn', id: 'deals-failed' }, tq('quick.deals.failed')), h('button', { class: 'btn block', type: 'button', id: 'deals-retry', onclick: retry }, tq('quick.retry')))
    return box
  }
  const { sales, rents, same, nearest } = deals.summary
  const lines = h('div', { class: 'deals-lines' })
  if (sales.count) {
    const floors = sales.floorMin === null ? null : sales.floorMin === sales.floorMax ? tq('quick.deals.floorOne', { a: sales.floorMin }) : tq('quick.deals.floorRange', { a: sales.floorMin, b: sales.floorMax })
    lines.append(
      h('p', { class: 'deals-sales' }, h('b', {}, tq('quick.deals.salesCount', { n: sales.count })), h('span', {}, [tq('quick.deals.salesUnit', { n: num(sales.unit, 1) }), floors, sales.age === null ? null : tq('quick.deals.salesAge', { n: Math.round(sales.age) })].filter(Boolean).join(' · '))))
  } else lines.append(h('p', { class: 'deals-sales' }, tq('quick.deals.salesNone')))
  if (rents.count) lines.append(h('p', { class: 'deals-rents' }, h('b', {}, tq('quick.deals.rentsCount', { n: rents.count })), h('span', {}, tq('quick.deals.rentsMiddle', { rent: num(rents.rent), perPing: num(rents.perPing) }))))
  else lines.append(h('p', { class: 'deals-rents' }, tq('quick.deals.rentsNone')))
  box.append(lines)
  if (same.length) {
    const shown = same.slice(0, MORE)
    box.append(h('h4', { id: 'deals-same-title' }, tq('quick.deals.same', { n: same.length })),
      h('ul', { class: 'deal-list', id: 'deals-same' }, ...shown.map((d) => row(d, ageAt(d), false))),
      same.length > MORE ? h('p', { class: 'note' }, tq('quick.deals.sameMore', { n: same.length - MORE })) : null)
  }
  if (nearest.length) {
    box.append(h('h4', { id: 'deals-near-title' }, tq('quick.deals.nearest', { n: nearest.length })), h('ul', { class: 'deal-list', id: 'deals-near' }, ...nearest.map((d) => row(d, ageAt(d), true))))
  }
  box.append(h('p', { class: 'note deals-units' }, tq('quick.deals.units')),
    h('p', { class: 'note deals-source', id: 'deals-source' }, tq('quick.deals.source')),
    h('p', { class: 'note deals-source' }, tq('quick.deals.sourcePoints')),
    deals.asof ? h('p', { class: 'note deals-source' }, tq('quick.deals.asof', { month: deals.asof })) : null)
  return box
}
