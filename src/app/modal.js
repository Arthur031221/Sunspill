// A small modal sheet with a focus trap, Escape to close and the focus handed
// back to what opened it.

import { h } from './dom.js'

export function createModal(root) {
  let open = null

  function close(result) {
    if (!open) return
    const { resolve, opener, onKey, onClose } = open
    open = null
    document.removeEventListener('keydown', onKey, true)
    root.hidden = true
    root.replaceChildren()
    onClose?.()
    opener?.focus?.()
    resolve(result)
  }

  /**
   * Show a sheet. `body` is a list of nodes; `buttons` a list of buttons for the bottom row.
   * Resolves with whatever close() is given, false when the sheet is dismissed.
   */
  function show(title, body, buttons = [], { onClose } = {}) {
    close(false)
    return new Promise((resolve) => {
      const opener = document.activeElement
      const dialog = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'modal-title', tabIndex: -1 }, h('h2', { id: 'modal-title' }, title), ...body, buttons.length ? h('div', { class: 'modal-actions' }, ...buttons) : null)
      const onKey = (e) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          close(false)
        } else if (e.key === 'Tab') {
          const items = [...dialog.querySelectorAll('button, input, select, a[href]')].filter((el) => !el.disabled && !el.hidden)
          if (!items.length) {
            e.preventDefault()
            dialog.focus()
            return
          }
          const first = items[0]
          const last = items[items.length - 1]
          if (!dialog.contains(document.activeElement) || document.activeElement === dialog) { e.preventDefault(); (e.shiftKey ? last : first).focus() }
          else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
          else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
        }
      }
      open = { resolve, opener, onKey, onClose }
      document.addEventListener('keydown', onKey, true)
      root.replaceChildren(h('div', { class: 'modal-backdrop', onclick: () => close(false) }), dialog)
      root.hidden = false
      ;(dialog.querySelector('button, input') ?? dialog).focus()
    })
  }

  /** Put the focus on the first control again, for a sheet whose content arrived after it was shown. */
  function refocus() {
    const dialog = root.querySelector('.modal')
    ;(dialog?.querySelector('button, input') ?? dialog)?.focus()
  }

  return { show, close, refocus, get isOpen() { return Boolean(open) } }
}
