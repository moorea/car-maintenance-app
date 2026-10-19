import { BODY_STYLES, CAR_SPOTS } from '@car/core'
import { describe, expect, it } from 'vitest'
import { anchorsOf, BODIES, curve, halfRing, HALF, shapeOf } from './shape'

describe('curve', () => {
  it('passes through its keys, in any order, and holds its ends', () => {
    const f = curve([
      [1, 2],
      [0, 0],
      [2, 3],
    ])
    expect(f(0)).toBe(0)
    expect(f(1)).toBeCloseTo(2)
    expect(f(-5)).toBe(0)
    expect(f(9)).toBe(3)
  })

  it('never overshoots between rising keys', () => {
    const f = curve([
      [0, 0],
      [1, 1],
      [2, 1],
      [3, 4],
    ])
    for (let x = 1; x <= 2; x += 0.05) expect(f(x)).toBeLessThanOrEqual(1 + 1e-9)
  })
})

describe('halfRing', () => {
  it('runs from the bottom centre to the top centre in a fixed number of points', () => {
    const pts = halfRing(0.3, 1.0, 0.9, 0.08, 0.05, 0)
    expect(pts).toHaveLength(HALF)
    expect(pts[0]).toEqual([0, 0.3])
    expect(pts[HALF - 1]?.[0]).toBeCloseTo(0)
    expect(pts[HALF - 1]?.[1]).toBeCloseTo(1.0)
  })
})

describe.each(BODY_STYLES.map((b) => b.id))('the %s body', (style) => {
  const st = BODIES[style]
  const sh = shapeOf(st)

  it('stands on its wheels with the roof above the beltline', () => {
    expect(sh.ybF(0)).toBeGreaterThan(0.1)
    expect(sh.roof(0)).toBeGreaterThan(sh.top(0))
    expect(sh.planW(0)).toBeCloseTo(st.W, 2)
  })

  it('places a pin for every spot on or just outside the body, facing out', () => {
    const anchors = anchorsOf(st)
    for (const { id } of CAR_SPOTS) {
      const { pos, normal } = anchors[id]
      expect(Math.abs(pos[0]), id).toBeLessThanOrEqual(sh.half)
      expect(pos[1], id).toBeGreaterThan(0)
      expect(pos[1], id).toBeLessThan(2.1)
      expect(Math.abs(pos[2]), id).toBeLessThanOrEqual(st.W + 0.05)
      expect(Math.hypot(...normal), id).toBeGreaterThan(0)
    }
  })
})
