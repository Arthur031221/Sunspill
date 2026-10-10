// Asking before anything leaves the page. Each online service has its own
// switch; a switch that is off sends nothing. The sheet says in plain words
// what is sent and to whom, and the same switches can be changed again later.

import { h } from './dom.js'
import { t, tq } from './i18n.js'
import { SERVICES } from './net.js'

const ORDER = ['search', 'tiles', 'buildings']

export function createConsent({ store, modal }) {
  const allowed = (service) => Boolean(store.ui.net?.[service])
  const set = (service, value) => store.setUi({ net: { ...store.ui.net, [service]: value } })

  return {
    allowed,
    set,
    /** Resolves true when the service is on, asking first when it is not. */
    async ask(service) {
      if (allowed(service)) return true
      const yes = await modal.show(
        t(`net.title.${service}`),
        [h('p', {}, t(`net.body.${service}`)), h('p', { class: 'note' }, t('net.note'))],
        [h('button', { class: 'btn', type: 'button', onclick: () => modal.close(false) }, t('net.deny')), h('button', { class: 'btn primary', type: 'button', onclick: () => modal.close(true) }, t('net.allow'))],
      )
      if (yes) set(service, true)
      return yes
    },
    /**
     * The one question of the quick check: the map, the address search and the building outlines are asked
     * about together, and one yes switches all three on. Each can still be turned off again in the settings.
     * Resolves true when all three are on.
     */
    async askQuick() {
      if (ORDER.every(allowed)) return true
      const yes = await modal.show(
        tq('quick.consent.title'),
        [h('p', {}, tq('quick.consent.body')), h('p', {}, tq('quick.consent.sends')), h('p', { class: 'note host' }, tq('quick.consent.hosts')), h('p', { class: 'note' }, t('net.note'))],
        [h('button', { class: 'btn', type: 'button', id: 'quick-deny', onclick: () => modal.close(false) }, tq('quick.consent.deny')), h('button', { class: 'btn primary', type: 'button', id: 'quick-allow', onclick: () => modal.close(true) }, tq('quick.consent.allow'))],
      )
      if (yes) store.setUi({ net: { ...store.ui.net, search: true, tiles: true, buildings: true } })
      return yes
    },
    /** The sheet with all three switches. */
    settings() {
      const boxes = ORDER.map((service) => {
        const box = h('input', { type: 'checkbox', id: `net-${service}`, checked: allowed(service) })
        box.addEventListener('change', () => set(service, box.checked))
        return h('div', { class: 'net-row' },
          h('label', { class: 'check', htmlFor: `net-${service}` }, box, h('b', {}, t(`net.name.${service}`))),
          h('p', { class: 'note' }, t(`net.body.${service}`)),
          h('p', { class: 'note host' }, SERVICES[service].hosts.map((x) => new URL(x).host).join(', ')))
      })
      return modal.show(t('net.settings'), [...boxes, h('p', { class: 'note' }, t('net.note'))], [h('button', { class: 'btn primary', type: 'button', onclick: () => modal.close(true) }, t('net.done'))])
    },
    count: () => ORDER.filter(allowed).length,
  }
}
