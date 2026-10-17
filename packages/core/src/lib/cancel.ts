import type { CancelSignal } from '../ports'

/** A signal and the function that fires it, like AbortController but without the DOM. */
export const cancellation = (): { signal: CancelSignal; cancel: () => void } => {
  let aborted = false
  const listeners = new Set<() => void>()
  return {
    signal: {
      get aborted() {
        return aborted
      },
      addEventListener: (_type, listener) => void listeners.add(listener),
      removeEventListener: (_type, listener) => void listeners.delete(listener),
    },
    cancel: () => {
      if (aborted) return
      aborted = true
      for (const listener of listeners) listener()
      listeners.clear()
    },
  }
}
