import { BODY_STYLES } from '@car/core'
import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { buildCar, carMaterials, disposeGroup } from './buildCar'
import { BODIES } from './shape'
import type { CarPartColors } from '../theme'

// Any colour will do for checking the shape.
const gray = new Proxy({}, { get: () => '#888888' }) as CarPartColors

describe.each(BODY_STYLES.map((b) => b.id))('building the %s', (style) => {
  it('makes a car of the body’s size, standing on the ground, with no broken geometry', () => {
    const st = BODIES[style]
    const car = buildCar(st, carMaterials(gray))
    car.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        const pos = (o.geometry as THREE.BufferGeometry).getAttribute('position')
        for (let i = 0; i < pos.array.length; i++) expect(Number.isFinite(pos.array[i])).toBe(true)
      }
    })
    car.updateMatrixWorld(true)
    const box = new THREE.Box3()
    car.traverse((o) => {
      if (o instanceof THREE.Mesh && !(o.material instanceof THREE.MeshBasicMaterial))
        box.expandByObject(o)
    })
    const size = box.getSize(new THREE.Vector3())
    expect(size.x).toBeGreaterThan(st.L * 0.98)
    expect(size.x).toBeLessThan(st.L * 1.05)
    expect(size.z).toBeLessThan(2 * st.W + 0.4)
    expect(box.min.y).toBeGreaterThanOrEqual(-0.01)
    disposeGroup(car)
  })
})
