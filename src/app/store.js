import { normalizeScene } from '../core/room.js'

const LIMIT = 80

/**
 * Holds the scene and the interface settings. Scene edits go through update(),
 * which clamps the result and keeps an undo trail. Edits that share a key and
 * land within a moment of each other (dragging a slider) become one undo step.
 */
export function createStore(scene, ui) {
  let state = { scene: normalizeScene(scene), ui }
  const listeners = new Set()
  const past = []
  const future = []
  let last = { key: null, at: 0 }
  let onEdit = null
  const emit = (what) => listeners.forEach((fn) => fn(state, what))

  return {
    get scene() {
      return state.scene
    },
    get ui() {
      return state.ui
    },
    subscribe(fn) {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    update(mutator, { key = null, history = true } = {}) {
      const draft = structuredClone(state.scene)
      mutator(draft)
      const next = normalizeScene(draft)
      if (JSON.stringify(next) === JSON.stringify(state.scene)) return false
      if (history) {
        onEdit?.()
        const now = performance.now()
        if (!(key && key === last.key && now - last.at < 700)) {
          past.push(state.scene)
          if (past.length > LIMIT) past.shift()
        }
        last = { key, at: now }
        future.length = 0
      }
      state = { ...state, scene: next }
      emit('scene')
      return true
    },
    setUi(patch) {
      state = { ...state, ui: { ...state.ui, ...patch } }
      emit('ui')
    },
    replace(scene) {
      past.push(state.scene)
      future.length = 0
      state = { ...state, scene: normalizeScene(scene) }
      last = { key: null, at: 0 }
      emit('scene')
    },
    undo() {
      if (!past.length) return false
      future.push(state.scene)
      state = { ...state, scene: past.pop() }
      last = { key: null, at: 0 }
      emit('scene')
      return true
    },
    redo() {
      if (!future.length) return false
      past.push(state.scene)
      state = { ...state, scene: future.pop() }
      last = { key: null, at: 0 }
      emit('scene')
      return true
    },
    /** Called before a user edit is recorded; time and date moves do not count. */
    set onEdit(fn) {
      onEdit = fn
    },
    canUndo: () => past.length > 0,
    canRedo: () => future.length > 0,
  }
}
