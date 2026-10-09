/** Build an element: h('button', { class: 'x', onclick }, 'text', child). */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue
    if (k === 'class') el.className = v
    else if (k === 'dataset') Object.assign(el.dataset, v)
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v)
    else if (k in el && k !== 'list' && k !== 'form') el[k] = v
    else el.setAttribute(k, v === true ? '' : v)
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue
    el.append(child.nodeType ? child : document.createTextNode(String(child)))
  }
  return el
}

export const $ = (selector, root = document) => root.querySelector(selector)
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)]

/** Run fn at most once per animation frame. */
export function frameThrottle(fn) {
  let queued = false
  return () => {
    if (queued) return
    queued = true
    requestAnimationFrame(() => {
      queued = false
      fn()
    })
  }
}

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
