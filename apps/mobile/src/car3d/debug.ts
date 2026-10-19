// TEMPORARY: shows the stage's state as text on the Car page so CI screenshots can read it.
let line: Record<string, string | number> = {}
const subs = new Set<() => void>()
let text = ''
export const note = (k: string, v: string | number) => {
  line = { ...line, [k]: v }
  text = Object.entries(line)
    .map(([a, b]) => `${a}=${b}`)
    .join(' ')
  console.log('[car3d]', text)
  subs.forEach((s) => s())
}
export const subscribe = (s: () => void) => {
  subs.add(s)
  return () => {
    subs.delete(s)
  }
}
export const snapshot = () => text
