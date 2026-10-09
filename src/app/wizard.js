// The guided setup: seven steps from "where is the room" to "does the sun
// match what you saw". Each step is a card under (or beside) the view it works
// on: a map for the place, the facing and the surroundings, the room drawing
// for everything else.

import { h } from './dom.js'
import { t } from './i18n.js'
import { placeStep } from './step-place.js'
import { roomStep, windowsStep } from './step-room.js'
import { facingStep, surroundStep } from './step-map.js'
import { thingsStep, checkStep } from './step-check.js'

export const STEPS = [
  { id: 'place', view: 'pin', build: placeStep },
  { id: 'room', view: '3d', build: roomStep },
  { id: 'windows', view: 'plan', build: windowsStep },
  { id: 'facing', view: 'facing', build: facingStep },
  { id: 'surround', view: 'surround', build: surroundStep },
  { id: 'things', view: 'plan', build: thingsStep },
  { id: 'check', view: 'plan', build: checkStep },
]

export function createWizard(ctx) {
  const { store, root } = ctx
  let index = 0
  let current = null
  let active = false

  const head = h('header', { class: 'wiz-head' })
  const body = h('div', { class: 'wiz-body' })
  const nav = h('footer', { class: 'wiz-nav' })
  root.append(head, body, nav)

  function leave(rebuilding = false) {
    current?.leave?.({ rebuilding })
    current = null
  }

  function renderHead() {
    const step = STEPS[index]
    const dots = h('ol', { class: 'wiz-dots' }, ...STEPS.map((s, i) => h('li', {}, h('button', {
      type: 'button', class: i === index ? 'on' : i < index ? 'done' : '', 'aria-label': `${i + 1}. ${t(`wiz.title.${s.id}`)}`, 'aria-current': i === index ? 'step' : null, onclick: () => go(i),
    }))))
    const undo = h('button', { class: 'mini', type: 'button', disabled: !store.canUndo(), onclick: () => store.undo() }, t('top.undo'))
    undo.id = 'wiz-undo'
    head.replaceChildren(
      h('div', { class: 'wiz-top' }, h('button', { class: 'mini', type: 'button', id: 'wiz-exit', onclick: () => close(false) }, t('wiz.exit')), dots, undo),
      h('div', { class: 'wiz-meta' },
        h('p', { class: 'wiz-count' }, t('wiz.count', { n: index + 1, total: STEPS.length })),
        h('button', { class: 'linkbtn', type: 'button', id: 'wiz-online', onclick: () => ctx.consent.settings() }, t('net.footer', { n: ctx.consent.count() }))),
      h('h2', { class: 'wiz-title', tabIndex: -1, id: 'wiz-title' }, t(`wiz.title.${step.id}`)),
    )
    const last = index === STEPS.length - 1
    nav.replaceChildren(
      index > 0 ? h('button', { class: 'btn', type: 'button', id: 'wiz-back', onclick: () => go(index - 1) }, t('wiz.back')) : h('span'),
      h('button', { class: 'btn primary', type: 'button', id: 'wiz-next', onclick: () => (last ? close(true) : go(index + 1)) }, last ? t('wiz.done') : t('wiz.next')),
    )
  }

  function go(i, { focus = true, rebuilding = false } = {}) {
    leave(rebuilding)
    index = Math.max(0, Math.min(STEPS.length - 1, i))
    const step = STEPS[index]
    ctx.setView(step.view)
    current = step.build(ctx)
    renderHead()
    body.replaceChildren(current.el)
    body.scrollTop = 0
    current.sync?.()
    current.enter?.()
    if (focus) head.querySelector('.wiz-title').focus({ preventScroll: true })
  }

  function open(i = 0) {
    active = true
    document.documentElement.dataset.wizard = '1'
    root.hidden = false
    go(i)
  }

  function close(finished) {
    leave()
    // marks and a photo that were never saved do not wait for the next time
    ctx.draft = null
    ctx.overlay.marks = null
    ctx.overlay.underlay = null
    active = false
    delete document.documentElement.dataset.wizard
    root.hidden = true
    ctx.setView(null)
    ctx.onClose?.(finished)
  }

  return {
    open,
    close,
    go,
    get active() { return active },
    get index() { return index },
    /** The scene or the settings changed. */
    sync() {
      if (!active) return
      const undo = head.querySelector('#wiz-undo')
      if (undo) undo.disabled = !store.canUndo()
      const online = head.querySelector('#wiz-online')
      if (online) online.textContent = t('net.footer', { n: ctx.consent.count() })
      current?.sync?.()
    },
    /** The language or the units changed: build the step again. */
    rebuild() {
      if (active) go(index, { focus: false, rebuilding: true })
    },
  }
}
