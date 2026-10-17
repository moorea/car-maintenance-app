import { useRef, type ComponentRef, type ReactNode } from 'react'
import { ScrollView } from 'react-native'

/** A scrolling conversation that starts at, and stays pinned to, its newest message. */
export function ChatScroll({ children }: { children: ReactNode }) {
  // SwiftUI anchors to the bottom natively; elsewhere, follow the content as it grows.
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null)
  return (
    <ScrollView
      ref={scroll}
      onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  )
}
