import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import type { CarPartColors } from '../theme'
import { at, HALF, RING, regionOf, halfRing, shapeOf, type BodySpec, type Region } from './shape'

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

/** A shade per vertex: 1 is paint, lower darkens it into glass or trim; the second is opacity. */
type Shade = number | [number, number]

/** Lofts section rings along x into one smooth mesh, shaded per vertex. */
function loft(
  xs: number[],
  ringAt: (x: number) => [number, number][],
  shadeAt: (x: number, y: number, z: number, region: Region) => Shade,
): THREE.BufferGeometry {
  const pos: number[] = []
  const col: number[] = []
  const idx: number[] = []
  for (const x of xs) {
    const half = ringAt(x)
    for (let j = 0; j < RING; j++) {
      const i = j < HALF ? j : RING - j
      const [z0, y] = at(half, i)
      const z = j < HALF ? z0 : -z0
      pos.push(x, y, z)
      const v = shadeAt(x, y, z, regionOf(i))
      const [c, a] = Array.isArray(v) ? v : [v, 1]
      col.push(c, c, c, a)
    }
  }
  for (let s = 0; s < xs.length - 1; s++)
    for (let j = 0; j < RING; j++) {
      const a = s * RING + j
      const b = s * RING + ((j + 1) % RING)
      idx.push(a, a + RING, b, b, a + RING, b + RING)
    }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

/** Evenly spaced stations, closer together around arches, seams and the ends. */
function stationsFor(x0: number, x1: number, dense: [number, number, number][]): number[] {
  const s: number[] = []
  for (let i = 0; i <= 160; i++) s.push(x0 + ((x1 - x0) * i) / 160)
  for (const [x, r, step] of dense) for (let d = -r; d <= r + 1e-9; d += step) s.push(x + d)
  return [...new Set(s.filter((x) => x >= x0 && x <= x1).map((x) => +x.toFixed(4)))].sort(
    (a, b) => a - b,
  )
}

/** A soft round shadow, dark in the middle and clear at the edge. */
function shadowTexture(): THREE.DataTexture {
  const n = 64
  const data = new Uint8Array(n * n * 4)
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const r = Math.min(1, Math.hypot(x - n / 2 + 0.5, y - n / 2 + 0.5) / (n / 2))
      const a = r < 0.5 ? 0.7 - 0.76 * r : 0.32 * (1 - (r - 0.5) / 0.5)
      data.set([0, 0, 0, Math.round(Math.max(0, a) * 255)], (y * n + x) * 4)
    }
  const t = new THREE.DataTexture(data, n, n)
  t.needsUpdate = true
  return t
}

/** The materials one car is drawn with. Its paint can change without rebuilding the car. */
export function carMaterials(C: CarPartColors) {
  const coat = { metalness: 0.35, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.05 }
  const paint = new THREE.MeshPhysicalMaterial({ ...coat, vertexColors: true })
  const paintPlain = new THREE.MeshPhysicalMaterial(coat)
  const glass = new THREE.MeshPhysicalMaterial({
    ...coat,
    vertexColors: true,
    transparent: true,
    side: THREE.DoubleSide,
  })
  const all: THREE.Material[] = [paint, paintPlain, glass]
  const m = (mat: THREE.Material) => {
    all.push(mat)
    return mat
  }
  return {
    paint,
    paintPlain,
    glass,
    trim: m(new THREE.MeshStandardMaterial({ color: C.trim, roughness: 0.55 })),
    well: m(
      new THREE.MeshStandardMaterial({ color: C.well, roughness: 0.9, side: THREE.DoubleSide }),
    ),
    rubber: m(new THREE.MeshStandardMaterial({ color: C.rubber, roughness: 0.88 })),
    alloy: m(
      new THREE.MeshPhysicalMaterial({
        color: C.alloy,
        metalness: 1,
        roughness: 0.22,
        clearcoat: 0.6,
      }),
    ),
    alloyDark: m(
      new THREE.MeshStandardMaterial({ color: C.alloyDark, metalness: 0.8, roughness: 0.4 }),
    ),
    rotor: m(new THREE.MeshStandardMaterial({ color: C.rotor, metalness: 0.9, roughness: 0.45 })),
    caliper: m(
      new THREE.MeshStandardMaterial({ color: C.caliper, metalness: 0.4, roughness: 0.45 }),
    ),
    interior: m(new THREE.MeshStandardMaterial({ color: C.interior, roughness: 0.85 })),
    head: m(
      new THREE.MeshStandardMaterial({
        color: C.light,
        emissive: C.headlight,
        emissiveIntensity: 2.2,
      }),
    ),
    tail: m(
      new THREE.MeshStandardMaterial({
        color: C.tailLens,
        emissive: C.taillight,
        emissiveIntensity: 1.3,
      }),
    ),
    plate: m(new THREE.MeshStandardMaterial({ color: C.plate, roughness: 0.55 })),
    dispose: () => all.forEach((mat) => mat.dispose()),
  }
}

export type CarMaterials = ReturnType<typeof carMaterials>

function makeWheel(st: BodySpec, side: number, mats: CarMaterials): THREE.Group {
  const w = new THREE.Group()
  const R = st.rw
  const hw = st.tireW / 2
  const rimR = st.rimR
  const c = 0.07
  // The tire: a rounded-rectangle profile spun around the axle.
  const prof = [new THREE.Vector2(rimR - 0.005, -hw * 0.82)]
  for (let k = 0; k <= 6; k++) {
    const a = -Math.PI / 2 + ((Math.PI / 2) * k) / 6
    prof.push(new THREE.Vector2(R - c + c * Math.cos(a), -hw + c + c * Math.sin(a)))
  }
  for (let k = 0; k <= 6; k++) {
    const a = ((Math.PI / 2) * k) / 6
    prof.push(new THREE.Vector2(R - c + c * Math.cos(a), hw - c + c * Math.sin(a)))
  }
  prof.push(new THREE.Vector2(rimR - 0.005, hw * 0.82))
  const tire = new THREE.Mesh(new THREE.LatheGeometry(prof, 48), mats.rubber)
  tire.rotation.x = Math.PI / 2
  w.add(tire)
  const barrel = new THREE.Mesh(
    new THREE.CylinderGeometry(rimR, rimR, hw * 1.6, 36, 1, true),
    mats.alloyDark,
  )
  barrel.rotation.x = Math.PI / 2
  w.add(barrel)
  const back = new THREE.Mesh(new THREE.CircleGeometry(rimR, 32), mats.well)
  back.position.z = -hw * 0.5
  w.add(back)
  const rotor = new THREE.Mesh(
    new THREE.CylinderGeometry(rimR * 0.78, rimR * 0.78, 0.028, 32),
    mats.rotor,
  )
  rotor.rotation.x = Math.PI / 2
  rotor.position.z = hw * 0.2
  w.add(rotor)
  const cal = new THREE.Mesh(new RoundedBoxGeometry(0.07, rimR * 0.62, 0.07, 2, 0.02), mats.caliper)
  cal.position.set(-rimR * 0.55, rimR * 0.3, hw * 0.28)
  cal.rotation.z = 0.5
  w.add(cal)
  const face = new THREE.Group()
  face.position.z = hw * 0.62
  w.add(face)
  face.add(new THREE.Mesh(new THREE.TorusGeometry(rimR - 0.006, 0.011, 8, 48), mats.alloy))
  const spoke = new THREE.Shape()
  const r0 = 0.055
  const r1 = rimR - 0.012
  spoke.moveTo(r0, -0.016)
  spoke.lineTo(r1, -0.026)
  spoke.lineTo(r1, 0.026)
  spoke.lineTo(r0, 0.016)
  spoke.lineTo(r0, -0.016)
  const spokeGeo = new THREE.ExtrudeGeometry(spoke, {
    depth: 0.018,
    bevelEnabled: true,
    bevelThickness: 0.006,
    bevelSize: 0.005,
    bevelSegments: 1,
  })
  for (let i = 0; i < 5; i++)
    for (const off of [-0.13, 0.13]) {
      const m = new THREE.Mesh(spokeGeo, mats.alloy)
      m.rotation.z = (i * Math.PI * 2) / 5 + off
      m.position.z = -0.012
      face.add(m)
    }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.068, 0.03, 24), mats.alloy)
  hub.rotation.x = Math.PI / 2
  face.add(hub)
  if (side < 0) w.rotation.y = Math.PI
  return w
}

/**
 * The whole car for a body, with its soft shadow, built from the body's curves. The paint is set
 * on `mats.paint`, `mats.paintPlain` and `mats.glass`.
 */
export function buildCar(st: BodySpec, mats: CarMaterials): THREE.Group {
  const sh = shapeOf(st)
  const g = new THREE.Group()
  const half = sh.half
  const dense: [number, number, number][] = []
  for (const wx of st.wheels) {
    const e = Math.sqrt(Math.max(0, sh.archR ** 2 - (sh.ybF(wx) - st.rw) ** 2))
    dense.push([wx - e, 0.04, 0.006], [wx + e, 0.04, 0.006])
  }
  for (const sx of st.seams) dense.push([sx, 0.012, 0.006])
  dense.push([half - 0.04, 0.04, 0.01], [-half + 0.04, 0.04, 0.01])
  const xs = stationsFor(-half, half, dense)

  const shadeBody = (x: number, y: number, z: number, region: Region): Shade => {
    const w = sh.planW(x)
    const az = Math.abs(z)
    const base = sh.ybF(x)
    const topY = sh.top(x)
    if (st.bed && x > st.bed.x0 && x < st.bed.x1 && y > topY - 0.02 && az < w - 0.07) return 0.05
    if (x < st.gh.xA - 0.02 && x > st.gh.xC + 0.04 && y > topY - 0.015 && az < w * 0.9 - 0.06)
      return 0.05
    if (x > half - 0.1 && y > st.grille.low && y < st.grille.high && az < st.grille.z) return 0.04
    if (st.clad && y < base + st.clad && region !== 'top' && region !== 'topCorner') return 0.07
    if (st.flares && az > 0.6 * w)
      for (const wx of st.wheels) {
        const d = Math.hypot(x - wx, y - st.rw)
        if (d < sh.archR + 0.075 && y > base - 0.02) return 0.07
      }
    for (const s of st.seams)
      if (Math.abs(x - s) < 0.005 && region === 'side' && y > base + 0.08 && y < topY - 0.05)
        return 0.3
    return 1
  }
  g.add(new THREE.Mesh(loft(xs, sh.lower, shadeBody), mats.paint))

  // The glass house: windows, a painted roof and pillars.
  const gh = st.gh
  const gxs = stationsFor(
    gh.xC,
    gh.xA,
    gh.pillars.map((p) => [p, 0.05, 0.006]),
  )
  const ghRing = (x: number) =>
    halfRing(
      sh.top(x) - 0.05,
      sh.roof(x),
      Math.min(gh.w, sh.planW(x) * sh.fac(sh.top(x) - 0.05) - 0.025),
      0.02,
      0.15,
      gh.tb,
    )
  const shadeGlass = (x: number, y: number, _z: number, region: Region): Shade => {
    const slope = Math.abs((sh.roof(x + 0.01) - sh.roof(x - 0.01)) / 0.02)
    const roofY = sh.roof(x)
    const upper = (region === 'top' || region === 'topCorner') && y > roofY - 0.07
    if (upper && slope < 0.45) return 1
    if (!upper && gh.pillars.some((p) => Math.abs(x - p) < 0.045)) return 0.06
    if (!upper && x < gh.xC + gh.paintRear && y < roofY - 0.05) return 1
    return [0.015, 0.84]
  }
  const glass = new THREE.Mesh(loft(gxs, ghRing, shadeGlass), mats.glass)
  glass.renderOrder = 2
  g.add(glass)

  // Inside: a dashboard and a pair of seats per row, seen through the glass.
  const interior = mats.interior
  const seatZ = (0.38 * st.W) / 0.925
  const dashX = gh.xA - 0.3
  const dash = new THREE.Mesh(
    new RoundedBoxGeometry(0.42, 0.14, 2 * (sh.planW(dashX) * 0.86 - 0.08), 2, 0.05),
    interior,
  )
  dash.position.set(dashX, sh.top(dashX) + 0.03, 0)
  g.add(dash)
  const rows = [
    at(gh.pillars, 0) + 0.35,
    ...gh.pillars.slice(1).map((p) => p + 0.35),
    at(gh.pillars, gh.pillars.length - 1) - 0.55,
  ]
  for (const rx of rows) {
    if (rx < gh.xC + 0.25) continue
    const by = sh.top(rx)
    const hb = Math.max(0.12, Math.min(0.3, sh.roof(rx) - by - 0.28))
    for (const sz of [-seatZ, seatZ]) {
      const back = new THREE.Mesh(new RoundedBoxGeometry(0.12, 0.3 + hb, 0.5, 2, 0.05), interior)
      back.position.set(rx, by - 0.15 + (0.3 + hb) / 2, sz)
      back.rotation.z = 0.22
      g.add(back)
    }
  }

  // Wheel wells hide the gap above each tire.
  for (const wx of st.wheels) {
    const wl = new THREE.Mesh(
      new THREE.CylinderGeometry(
        sh.archR - 0.01,
        sh.archR - 0.01,
        2 * (st.W - 0.08),
        32,
        1,
        true,
        Math.PI / 2,
        Math.PI,
      ),
      mats.well,
    )
    wl.rotation.x = Math.PI / 2
    wl.position.set(wx, st.rw, 0)
    g.add(wl)
  }
  const zw = st.W - 0.02 - st.tireW / 2
  for (const wx of st.wheels)
    for (const side of [-1, 1]) {
      const wheel = makeWheel(st, side, mats)
      wheel.position.set(wx, st.rw, side * zw)
      g.add(wheel)
    }

  // Lights wrap around the corners, following the body.
  const strip = (pts: THREE.Vector3[], mat: THREE.Material, r: number) => {
    if (pts.length < 2) return
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, r, 6), mat))
  }
  for (const side of [-1, 1]) {
    const pts: THREE.Vector3[] = []
    for (let k = 0; k <= 32; k++) {
      const x = half - 0.55 + (0.55 * k) / 32
      const z = sh.surfaceZ(x, st.hl)
      if (z === undefined || z < st.grille.z + 0.04) break
      pts.push(V(x + 0.004, st.hl, side * (z + 0.004)))
    }
    strip(pts, mats.head, 0.014)
  }
  const tr: THREE.Vector3[] = []
  for (let k = 0; k <= 40; k++) {
    const x = -half + 0.5 - (0.5 * k) / 40
    const z = sh.surfaceZ(x, st.tl)
    if (z === undefined) break
    tr.push(V(x - 0.004, st.tl, z + 0.004))
  }
  strip(
    [
      ...tr,
      ...tr
        .slice(0, -1)
        .reverse()
        .map((p) => V(p.x, p.y, -p.z)),
    ],
    mats.tail,
    0.016,
  )

  // Details: door handles, rear plate, roof rails and mirrors.
  for (const sx of st.seams.slice(1)) {
    const hx = sx + 0.17
    const hy = sh.top(hx) - 0.12
    const hz = sh.surfaceZ(hx, hy)
    if (hz === undefined) continue
    for (const side of [-1, 1]) {
      const h = new THREE.Mesh(new RoundedBoxGeometry(0.15, 0.03, 0.03, 2, 0.012), mats.paintPlain)
      h.position.set(hx, hy, side * (hz + 0.008))
      g.add(h)
    }
  }
  const plate = new THREE.Mesh(new RoundedBoxGeometry(0.014, 0.16, 0.31, 2, 0.006), mats.plate)
  plate.position.set(-half - 0.006, Math.max(sh.ybF(-half) + 0.1, st.tl - 0.24), 0)
  g.add(plate)
  if (st.rails) {
    const rz = gh.w * (1 - gh.tb) - 0.17
    for (const side of [-1, 1]) {
      const pts: THREE.Vector3[] = []
      for (let x = gh.xA - 1.0; x >= gh.xC + 0.4; x -= 0.05)
        pts.push(V(x, sh.roof(x) + 0.035, side * rz))
      strip(pts, mats.trim, 0.016)
    }
  }
  const mx = gh.xA - 0.2
  const my = sh.top(mx) + 0.07
  const mz = (sh.surfaceZ(mx, sh.top(mx) - 0.1) ?? st.W) + 0.07
  for (const side of [-1, 1]) {
    const m = new THREE.Mesh(new RoundedBoxGeometry(0.2, 0.12, 0.17, 2, 0.045), mats.paintPlain)
    m.position.set(mx, my, side * mz)
    m.rotation.y = side * 0.12
    g.add(m)
  }

  // A soft contact shadow under the body and each tire.
  const tex = shadowTexture()
  const blob = (sx: number, sz: number, x: number, z: number, opacity: number) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity }),
    )
    m.rotation.x = -Math.PI / 2
    m.scale.set(sx, sz, 1)
    m.position.set(x, 0.002, z)
    g.add(m)
  }
  blob(st.L * 1.35, st.W * 3.2, 0, 0, 1)
  blob(st.L * 0.98, st.W * 2.05, 0, 0, 0.95)
  for (const wx of st.wheels)
    for (const side of [-1, 1]) blob(st.rw * 1.6, st.tireW * 2.2, wx, side * zw, 1)
  return g
}

/** Frees the GPU buffers of everything in a group. */
export function disposeGroup(g: THREE.Object3D): void {
  g.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.geometry.dispose()
      const mat = o.material
      if (mat instanceof THREE.MeshBasicMaterial) {
        mat.map?.dispose()
        mat.dispose()
      }
    }
  })
}
