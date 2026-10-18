import { useEffect } from 'react'
import { BackHandler } from 'react-native'

/**
 * Hands Android's back gesture to `handle`, which returns whether it moved somewhere. When it
 * returns false the system closes the app as usual. Other platforms never fire it.
 */
export function useSystemBack(handle: () => boolean) {
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', handle)
    return () => sub.remove()
  }, [handle])
}
