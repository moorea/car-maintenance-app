import { useEffect, useState } from 'react'
import type { StoreApi } from 'zustand'

interface Lifecycle {
  start: () => void
  dispose: () => void
}

/**
 * Creates a core screen model for the mounted screen, starts it on mount and disposes it on
 * unmount. `key` identifies what the model is for (usually the vehicle id): when it changes, a
 * fresh model replaces the old one, so a reused screen never shows another car's data.
 * Read the model's state with zustand's `useStore(model)`.
 */
export function useScreenModel<S extends Lifecycle>(
  key: string,
  create: () => StoreApi<S>,
): StoreApi<S> {
  const [entry, setEntry] = useState(() => ({ key, model: create() }))
  let current = entry
  if (entry.key !== key) {
    // Derived-state update during render: React re-renders immediately with the new model.
    current = { key, model: create() }
    setEntry(current)
  }
  const { model } = current

  useEffect(() => {
    model.getState().start()
    return () => model.getState().dispose()
  }, [model])

  return model
}
