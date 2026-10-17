import { describe, expect, it } from 'vitest'
import { cancellation } from './cancel'

describe('cancellation', () => {
  it('is not aborted until cancelled', () => {
    const { signal, cancel } = cancellation()
    expect(signal.aborted).toBe(false)
    cancel()
    expect(signal.aborted).toBe(true)
  })

  it('tells each listener once, however often it is cancelled', () => {
    const { signal, cancel } = cancellation()
    let calls = 0
    signal.addEventListener('abort', () => calls++)
    cancel()
    cancel()
    expect(calls).toBe(1)
  })

  it('does not tell a listener that was removed', () => {
    const { signal, cancel } = cancellation()
    let called = false
    const listener = () => {
      called = true
    }
    signal.addEventListener('abort', listener)
    signal.removeEventListener('abort', listener)
    cancel()
    expect(called).toBe(false)
  })
})
