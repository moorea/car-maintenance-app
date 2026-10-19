import type { BodyStyle, CarSpot } from '@car/core'

/**
 * The four generic bodies (ADR 0022), proportioned from a real car of each kind. Units are meters;
 * x points forward, y up and z toward the passenger side, with the car centred on the origin.
 * Profiles are [x, y] keys joined by smooth curves.
 */
export interface BodySpec {
  /** Length, and half the width. */
  L: number
  W: number
  /** How square the body is from above: higher is boxier. */
  plan: number
  /** Front and rear axle x. */
  wheels: [number, number]
  /** Wheel radius, tire width and rim radius. */
  rw: number
  tireW: number
  rimR: number
  /** Corner radii of the body's section at the bottom and top. */
  rb: number
  rt: number
  /** Height of the shoulder, where the body is widest. */
  bulgeAt: number
  /** Underside and beltline profiles. */
  yb: [number, number][]
  top: [number, number][]
  /** The glass house: windshield base, rear end, half width, tumblehome, roof and pillars. */
  gh: {
    xA: number
    xC: number
    w: number
    tb: number
    roof: [number, number][]
    pillars: number[]
    paintRear: number
  }
  /** Height of the dark cladding along the bottom, and whether the arches are clad too. */
  clad: number
  flares: boolean
  grille: { low: number; high: number; z: number }
  /** Door seams, front to back. */
  seams: number[]
  /** A pickup's open bed. */
  bed: { x0: number; x1: number } | null
  /** Heights of the head and tail lights. */
  hl: number
  tl: number
  rails: boolean
}

export const BODIES: Record<BodyStyle, BodySpec> = {
  // Proportioned from a Honda CR-V.
  suv: {
    L: 4.59,
    W: 0.925,
    plan: 7,
    wheels: [1.365, -1.295],
    rw: 0.37,
    tireW: 0.235,
    rimR: 0.235,
    rb: 0.08,
    rt: 0.05,
    bulgeAt: 0.72,
    yb: [
      [-2.295, 0.55],
      [-2.2, 0.4],
      [-1.9, 0.33],
      [1.9, 0.33],
      [2.2, 0.38],
      [2.295, 0.52],
    ],
    top: [
      [-2.295, 0.98],
      [-2.25, 1.08],
      [-1.9, 1.1],
      [0.95, 1.04],
      [1.6, 0.99],
      [2.1, 0.9],
      [2.295, 0.8],
    ],
    gh: {
      xA: 0.95,
      xC: -2.12,
      w: 0.9,
      tb: 0.24,
      roof: [
        [0.95, 1.04],
        [0.05, 1.62],
        [-0.5, 1.69],
        [-1.45, 1.66],
        [-1.9, 1.56],
        [-2.12, 1.09],
      ],
      pillars: [-0.45],
      paintRear: 0,
    },
    clad: 0.1,
    flares: true,
    grille: { low: 0.52, high: 0.74, z: 0.48 },
    seams: [0.9, -0.45, -1.45],
    bed: null,
    hl: 0.82,
    tl: 0.96,
    rails: true,
  },
  // Proportioned from a Toyota Camry.
  sedan: {
    L: 4.88,
    W: 0.92,
    plan: 6,
    wheels: [1.47, -1.355],
    rw: 0.335,
    tireW: 0.235,
    rimR: 0.235,
    rb: 0.07,
    rt: 0.05,
    bulgeAt: 0.62,
    yb: [
      [-2.44, 0.45],
      [-2.3, 0.3],
      [-1.95, 0.24],
      [1.95, 0.24],
      [2.3, 0.28],
      [2.44, 0.42],
    ],
    top: [
      [-2.44, 0.8],
      [-2.38, 0.94],
      [-1.9, 0.99],
      [-1.62, 0.99],
      [0.92, 0.9],
      [1.6, 0.82],
      [2.2, 0.72],
      [2.44, 0.6],
    ],
    gh: {
      xA: 0.92,
      xC: -1.62,
      w: 0.88,
      tb: 0.26,
      roof: [
        [0.92, 0.9],
        [0.0, 1.38],
        [-0.45, 1.445],
        [-1.1, 1.39],
        [-1.62, 0.99],
      ],
      pillars: [-0.3],
      paintRear: 0.42,
    },
    clad: 0,
    flares: false,
    grille: { low: 0.28, high: 0.46, z: 0.6 },
    seams: [0.88, -0.3, -1.15],
    bed: null,
    hl: 0.66,
    tl: 0.78,
    rails: false,
  },
  // Proportioned from a Ford F-150.
  pickup: {
    L: 5.89,
    W: 1.015,
    plan: 10,
    wheels: [1.995, -1.685],
    rw: 0.41,
    tireW: 0.275,
    rimR: 0.235,
    rb: 0.07,
    rt: 0.04,
    bulgeAt: 0.95,
    yb: [
      [-2.945, 0.7],
      [-2.85, 0.55],
      [-2.5, 0.52],
      [2.55, 0.52],
      [2.85, 0.58],
      [2.945, 0.7],
    ],
    top: [
      [-2.945, 1.25],
      [-2.9, 1.36],
      [-1.0, 1.36],
      [1.05, 1.32],
      [2.5, 1.28],
      [2.9, 1.24],
      [2.945, 1.1],
    ],
    gh: {
      xA: 1.05,
      xC: -0.95,
      w: 0.97,
      tb: 0.16,
      roof: [
        [1.05, 1.32],
        [0.45, 1.9],
        [0.1, 1.96],
        [-0.8, 1.96],
        [-0.95, 1.36],
      ],
      pillars: [-0.05],
      paintRear: 0.1,
    },
    clad: 0.1,
    flares: true,
    grille: { low: 0.7, high: 1.18, z: 0.64 },
    seams: [1.0, -0.05, -0.98],
    bed: { x0: -2.88, x1: -1.02 },
    hl: 1.14,
    tl: 1.12,
    rails: false,
  },
  // Proportioned from a Honda Odyssey.
  minivan: {
    L: 5.21,
    W: 0.995,
    plan: 7,
    wheels: [1.625, -1.375],
    rw: 0.37,
    tireW: 0.235,
    rimR: 0.235,
    rb: 0.08,
    rt: 0.05,
    bulgeAt: 0.68,
    yb: [
      [-2.605, 0.48],
      [-2.5, 0.34],
      [-2.1, 0.27],
      [2.1, 0.27],
      [2.45, 0.33],
      [2.605, 0.46],
    ],
    top: [
      [-2.605, 0.92],
      [-2.55, 1.05],
      [-2.05, 1.08],
      [1.28, 1.03],
      [1.9, 0.96],
      [2.4, 0.85],
      [2.605, 0.72],
    ],
    gh: {
      xA: 1.28,
      xC: -2.5,
      w: 0.96,
      tb: 0.2,
      roof: [
        [1.28, 1.03],
        [0.35, 1.68],
        [-0.3, 1.74],
        [-2.05, 1.73],
        [-2.5, 1.065],
      ],
      pillars: [0.2, -1.05],
      paintRear: 0,
    },
    clad: 0,
    flares: false,
    grille: { low: 0.42, high: 0.64, z: 0.5 },
    seams: [1.2, 0.2, -1.0],
    bed: null,
    hl: 0.8,
    tl: 0.9,
    rails: false,
  },
}

/** The item at an index the caller knows is there. */
export function at<T>(a: readonly T[], i: number): T {
  const v = a[i]
  if (v === undefined) throw new RangeError(`No item at ${i}`)
  return v
}

/** A monotone cubic (Fritsch–Carlson) through [x, y] keys, clamped beyond the ends. */
export function curve(keys: readonly [number, number][]): (x: number) => number {
  const sorted = [...keys].sort((a, b) => a[0] - b[0])
  const xs = sorted.map((k) => k[0])
  const ys = sorted.map((k) => k[1])
  const n = xs.length
  const d: number[] = []
  const m: number[] = []
  for (let i = 0; i < n - 1; i++) d.push((at(ys, i + 1) - at(ys, i)) / (at(xs, i + 1) - at(xs, i)))
  m[0] = at(d, 0)
  m[n - 1] = at(d, n - 2)
  for (let i = 1; i < n - 1; i++)
    m[i] = at(d, i - 1) * at(d, i) <= 0 ? 0 : (at(d, i - 1) + at(d, i)) / 2
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = m[i + 1] = 0
      continue
    }
    const a = at(m, i) / at(d, i)
    const b = at(m, i + 1) / at(d, i)
    const s = a * a + b * b
    if (s > 9) {
      const t = 3 / Math.sqrt(s)
      m[i] = t * a * at(d, i)
      m[i + 1] = t * b * at(d, i)
    }
  }
  return (x) => {
    if (x <= at(xs, 0)) return at(ys, 0)
    if (x >= at(xs, n - 1)) return at(ys, n - 1)
    let i = 0
    while (x > at(xs, i + 1)) i++
    const h = at(xs, i + 1) - at(xs, i)
    const t = (x - at(xs, i)) / h
    const t2 = t * t
    const t3 = t2 * t
    return (
      (2 * t3 - 3 * t2 + 1) * at(ys, i) +
      (t3 - 2 * t2 + t) * h * at(m, i) +
      (-2 * t3 + 3 * t2) * at(ys, i + 1) +
      (t3 - t2) * h * at(m, i + 1)
    )
  }
}

/** Points in half a section ring, bottom centre to top centre. */
export const HALF = 42
export const RING = 2 * HALF - 2
export type Region = 'bottom' | 'bottomCorner' | 'side' | 'topCorner' | 'top'
export const regionOf = (i: number): Region =>
  i < 4 ? 'bottom' : i < 11 ? 'bottomCorner' : i < 27 ? 'side' : i < 37 ? 'topCorner' : 'top'

/**
 * Half of a rounded-rectangle section from bottom centre to top centre, as [z, y] pairs. `fac`,
 * when given, scales the width by height: the body is widest at its shoulder and tucks in toward
 * the sills, the same at every station so arches don't dent the sides.
 */
export function halfRing(
  yb: number,
  yt: number,
  w: number,
  rbIn: number,
  rtIn: number,
  inset: number,
  fac?: (y: number) => number,
  crease?: number,
): [number, number][] {
  const h = Math.max(0, yt - yb)
  const rb = Math.max(0, Math.min(rbIn, h * 0.45, w * 0.9))
  const rt = Math.max(0, Math.min(rtIn, h * 0.55, w * 0.9))
  const y0 = yb + rb
  const y1 = yt - rt
  const sideZ = fac
    ? (y: number) => w * fac(y)
    : (y: number) => w * (1 - inset * (h - rt - rb > 0 ? (y - y0) / (y1 - y0 || 1) : 0))
  const wb = sideZ(y0)
  const wt = sideZ(y1)
  const pts: [number, number][] = []
  for (let k = 0; k < 4; k++) pts.push([(Math.max(0, wb - rb) * k) / 3, yb])
  for (let k = 1; k <= 7; k++) {
    const a = -Math.PI / 2 + ((Math.PI / 2) * k) / 7
    pts.push([Math.max(0, wb - rb) + rb * Math.cos(a), y0 + rb * Math.sin(a)])
  }
  const ys: number[] = []
  for (let k = 1; k <= 16; k++) ys.push(y0 + ((y1 - y0) * k) / 17)
  if (crease !== undefined && crease > y0 && crease < y1) {
    let n = 0
    ys.forEach((y, k) => {
      if (Math.abs(y - crease) < Math.abs(at(ys, n) - crease)) n = k
    })
    ys[n] = crease
  }
  for (const y of ys) pts.push([sideZ(y), y])
  for (let k = 0; k <= 9; k++) {
    const a = ((Math.PI / 2) * k) / 9
    pts.push([Math.max(0, wt - rt) + rt * Math.cos(a), y1 + rt * Math.sin(a)])
  }
  for (let k = 1; k <= 5; k++) pts.push([Math.max(0, wt - rt) * (1 - k / 5), yt])
  return pts
}

export interface Shape {
  half: number
  ybF: (x: number) => number
  top: (x: number) => number
  roof: (x: number) => number
  archR: number
  planW: (x: number) => number
  yb: (x: number) => number
  fac: (y: number) => number
  lower: (x: number) => [number, number][]
  /** Where the body's side is at a height, or undefined above or below it. */
  surfaceZ: (x: number, y: number) => number | undefined
}

/** The curves a body is built from, shared by the mesh and by the pins placed on it. */
export function shapeOf(st: BodySpec): Shape {
  const half = st.L / 2
  const ybF = curve(st.yb)
  const top = curve(st.top)
  const roof = curve(st.gh.roof)
  const archR = st.rw + 0.04
  const planW = (x: number) =>
    st.W *
    Math.pow(Math.max(0, 1 - Math.pow(Math.min(1, Math.abs(x) / half), st.plan)), 1 / st.plan)
  const yb = (x: number) => {
    let y = ybF(x)
    for (const wx of st.wheels) {
      const dx = x - wx
      if (Math.abs(dx) < archR) y = Math.max(y, st.rw + Math.sqrt(archR * archR - dx * dx))
    }
    return y
  }
  const sill = ybF(0)
  const belt = top(st.gh.xA)
  const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
  const fac = (y: number) =>
    y < st.bulgeAt
      ? 1 - 0.06 * ((u) => 0.45 * u + 0.55 * u * u)(clamp01((st.bulgeAt - y) / (st.bulgeAt - sill)))
      : 1 -
        0.035 * ((u) => 0.55 * u + 0.45 * u * u)(clamp01((y - st.bulgeAt) / (belt - st.bulgeAt)))
  const lower = (x: number) => halfRing(yb(x), top(x), planW(x), st.rb, st.rt, 0, fac, st.bulgeAt)
  const surfaceZ = (x: number, y: number) => {
    const h = lower(x)
    for (let i = 4; i < 37; i++) {
      const [z0, y0] = at(h, i)
      const [z1, y1] = at(h, i + 1)
      if ((y0 - y) * (y1 - y) <= 0 && y1 !== y0) return z0 + ((z1 - z0) * (y - y0)) / (y1 - y0)
    }
    return undefined
  }
  return { half, ybF, top, roof, archR, planW, yb, fac, lower, surfaceZ }
}

/** Where a pin sits on the car, the way it faces, and where the camera goes to look at it. */
export interface SpotAnchor {
  pos: [number, number, number]
  normal: [number, number, number]
}

/**
 * The anchor of each spot on a body, on the driver's side (negative z) that the camera starts on.
 */
export function anchorsOf(st: BodySpec): Record<CarSpot, SpotAnchor> {
  const sh = shapeOf(st)
  const [xf, xr] = st.wheels
  const side = (x: number, y: number) => -((sh.surfaceZ(x, y) ?? sh.planW(x)) + 0.02)
  const xo = (st.gh.xA + sh.half * 0.84) / 2
  const xw = (st.gh.xA + at(st.gh.pillars, 0)) / 2
  const yw = sh.top(xw) + (sh.roof(xw) - sh.top(xw)) * 0.45
  const xs = st.gh.xA - 0.22
  const xl = sh.half - 0.25
  const xd = (at(st.seams, 1) + at(st.seams, 2)) / 2
  const yd = (sh.ybF(xd) + sh.top(xd)) / 2
  const xu = (xf + xr) / 2
  const yu = sh.ybF(xu) + 0.06
  return {
    hood: { pos: [xo, sh.top(xo) + 0.02, 0], normal: [0.3, 1, 0] },
    wheels: { pos: [xf, st.rw, -(st.W - 0.01)], normal: [0, 0, -1] },
    underbody: { pos: [xu, yu, side(xu, yu)], normal: [0, -0.4, -1] },
    cabin: { pos: [xw, yw, -(st.gh.w * (1 - st.gh.tb * 0.45) + 0.02)], normal: [0, 0.2, -1] },
    glass: { pos: [xs, (sh.top(xs) + sh.roof(xs)) / 2, 0], normal: [1, 1, 0] },
    lights: { pos: [xl, st.hl, side(xl, st.hl)], normal: [0.6, 0, -1] },
    body: { pos: [xd, yd, side(xd, yd)], normal: [0, 0, -1] },
  }
}
