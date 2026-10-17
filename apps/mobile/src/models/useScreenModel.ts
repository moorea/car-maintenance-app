import { useEffect, useState } from 'react'
import type { StoreApi } from 'zustand'

interface Lifecycle {
  start: () => void
  dispose: () => void
}

/**
 * Creates a core screen model once per mounted screen, starts it on mount and disposes it on
 * unmount. Read its state with zustand's `useStore(model)`.
 */
export function useScreenModel<S extends Lifecycle>(create: () => StoreApi<S>): StoreApi<S> {
  // Lazy initial state: the factory runs once for the life of the screen.
  const [model] = useState(create)

  useEffect(() => {
    model.getState().start()
    return () => model.getState().dispose()
  }, [model])

  return model
}
