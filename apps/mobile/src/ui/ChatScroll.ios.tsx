import { ScrollView } from '@expo/ui'
import { defaultScrollAnchor } from '@expo/ui/swift-ui/modifiers'
import type { ReactNode } from 'react'

/** A scrolling conversation that starts at, and stays pinned to, its newest message. */
export function ChatScroll({ children }: { children: ReactNode }) {
  return <ScrollView modifiers={[defaultScrollAnchor('bottom')]}>{children}</ScrollView>
}
