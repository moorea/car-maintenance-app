import type { BodyStyle, CarHotspot, CarSpot } from '@car/core'
import { GLView, type ExpoWebGLRenderingContext } from 'expo-gl'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Animated,
  PixelRatio,
  Pressable,
  StyleSheet,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
} from 'react-native'
import * as THREE from 'three'
import { carPartColors, useColors, type ColorRole } from '../theme'
import { buildCar, carMaterials, disposeGroup, type CarMaterials } from './buildCar'
import { anchorsOf, BODIES, type BodySpec } from './shape'

export interface CarStageProps {
  bodyStyle: BodyStyle
  /** The paint's colour. */
  paint: string
  /** `3d` turns with a drag and flies to a pin; `still` is a fixed side view drawn once. */
  mode: '3d' | 'still'
  hotspots: CarHotspot[]
  focused?: CarSpot | undefined
  onSelect: (spot: CarSpot) => void
  /** Describes the car to screen readers, such as "Drawing of an SUV standing in for your RAV4". */
  label: string
  height: number
}

const PIN: Record<CarHotspot['attention'], ColorRole> = {
  recall: 'danger',
  overdue: 'warning',
  'due-soon': 'accent',
  fine: 'textSecondary',
}

const FOV = 30
const PIN_SIZE = 30

interface Orbit {
  theta: number
  phi: number
  dist: number
  target: THREE.Vector3
}

/** Where the camera starts: a three-quarter view from the front on the driver's side. */
const homeOf = (st: BodySpec): Orbit => {
  const roofTop = Math.max(...st.gh.roof.map((k) => k[1]))
  const f = Math.max(st.L / 4.6, roofTop / 1.68)
  const pos = new THREE.Vector3(6.2, 2.6, -6.6).multiplyScalar(f)
  const target = new THREE.Vector3(0, 0.42 * 1.68 * f, 0)
  const off = pos.clone().sub(target)
  return {
    theta: Math.atan2(off.z, off.x),
    phi: Math.acos(off.y / off.length()),
    dist: off.length(),
    target,
  }
}

/** A side view framing the whole car, for the still drawing. */
const sideOf = (st: BodySpec, aspect: number): Orbit => {
  const roofTop = Math.max(...st.gh.roof.map((k) => k[1]))
  const tan = Math.tan(THREE.MathUtils.degToRad(FOV / 2))
  const dist = Math.max((st.L * 0.62) / (tan * aspect), (roofTop * 0.7) / tan)
  return {
    theta: -Math.PI / 2,
    phi: Math.PI / 2,
    dist,
    target: new THREE.Vector3(0, roofTop * 0.45, 0),
  }
}

/** Looking straight at a pin, a little closer than home. */
const focusOf = (st: BodySpec, spot: CarSpot, home: Orbit): Orbit => {
  const { pos, normal } = anchorsOf(st)[spot]
  const n = new THREE.Vector3(...normal).normalize()
  const flat = Math.hypot(n.x, n.z) > 0.2 ? n : new THREE.Vector3(0.6, 0, -0.8)
  return {
    theta: Math.atan2(flat.z, flat.x),
    phi: THREE.MathUtils.clamp(Math.acos(n.y) * 0.6 + 0.5, 0.75, 1.35),
    dist: home.dist * 0.62,
    target: new THREE.Vector3(pos[0] * 0.6, Math.max(0.5, pos[1]), pos[2] * 0.3),
  }
}

const place = (camera: THREE.PerspectiveCamera, o: Orbit) => {
  camera.position.set(
    o.target.x + o.dist * Math.sin(o.phi) * Math.cos(o.theta),
    o.target.y + o.dist * Math.cos(o.phi),
    o.target.z + o.dist * Math.sin(o.phi) * Math.sin(o.theta),
  )
  camera.lookAt(o.target)
}

/**
 * The owner's car drawn from its generic body (ADR 0022), with a pin on each spot that has
 * something on it. Drawn with three.js into a GL view; everything it shows is also in the
 * Service list, so it is never the only way to reach anything.
 */
export function CarStage(props: CarStageProps) {
  const colors = useColors()
  const st = BODIES[props.bodyStyle]
  // Keyed by which spots have pins, not the hotspots array, so a re-render with the same spots
  // keeps the pins where they are.
  const spotKey = props.hotspots.map((h) => h.spot).join(',')
  const pins = useMemo(
    () =>
      new Map(
        (spotKey ? (spotKey.split(',') as CarSpot[]) : []).map((s) => [
          s,
          { xy: new Animated.ValueXY(), shown: new Animated.Value(0) },
        ]),
      ),
    [spotKey],
  )
  // Pins facing away can't be tapped or reached by a screen reader. Starts with none until the
  // first frame has placed them.
  const [visible, setVisible] = useState('')
  const shownKey = useRef('')
  // The stage's size in points, which pins are placed in; the GL buffer is in pixels.
  const box = useRef<{ w: number; h: number } | null>(null)
  // The drawing lives outside React: GL state and the camera change every frame.
  const g = useRef<{
    renderer: THREE.WebGLRenderer
    scene: THREE.Scene
    camera: THREE.PerspectiveCamera
    gl: ExpoWebGLRenderingContext
    car?: THREE.Group
    mats: CarMaterials
    orbit: Orbit
    to?: { from: Orbit; goal: Orbit; t: number } | undefined
    frame?: number | undefined
  } | null>(null)
  const latest = useRef({ props, pins })
  useEffect(() => {
    latest.current = { props, pins }
  })

  const draw = () => {
    const s = g.current
    if (!s) return
    place(s.camera, s.orbit)
    s.renderer.render(s.scene, s.camera)
    s.gl.endFrameEXP()
    const w = box.current?.w ?? s.gl.drawingBufferWidth / PixelRatio.get()
    const h = box.current?.h ?? s.gl.drawingBufferHeight / PixelRatio.get()
    const { props: now, pins: current } = latest.current
    const anchors = anchorsOf(BODIES[now.bodyStyle])
    const toCam = new THREE.Vector3()
    const shown: CarSpot[] = []
    for (const [spot, pin] of current) {
      const a = anchors[spot]
      const p = new THREE.Vector3(...a.pos)
      toCam.copy(s.camera.position).sub(p).normalize()
      const facing = new THREE.Vector3(...a.normal).normalize().dot(toCam) > 0.1
      const v = p.project(s.camera)
      pin.xy.setValue({
        x: ((v.x + 1) / 2) * w - PIN_SIZE / 2,
        y: ((1 - v.y) / 2) * h - PIN_SIZE / 2,
      })
      const on = facing || spot === now.focused
      pin.shown.setValue(on ? 1 : 0)
      if (on) shown.push(spot)
    }
    const key = shown.join(',')
    if (key !== shownKey.current) {
      shownKey.current = key
      setVisible(key)
    }
  }

  // Animates toward a goal, one frame at a time, and stops when it gets there.
  const tick = () => {
    const s = g.current
    if (!s) return
    s.frame = undefined
    if (s.to) {
      s.to.t = Math.min(1, s.to.t + 1 / 36)
      const e = 1 - Math.pow(1 - s.to.t, 3)
      const { from, goal } = s.to
      s.orbit = {
        theta: from.theta + shortAngle(goal.theta - from.theta) * e,
        phi: from.phi + (goal.phi - from.phi) * e,
        dist: from.dist + (goal.dist - from.dist) * e,
        target: from.target.clone().lerp(goal.target, e),
      }
      if (s.to.t >= 1) s.to = undefined
    }
    draw()
    if (s.to) s.frame = requestAnimationFrame(tick)
  }
  const redraw = () => {
    const s = g.current
    if (s && s.frame === undefined) s.frame = requestAnimationFrame(tick)
  }

  const onContextCreate = (gl: ExpoWebGLRenderingContext) => {
    const width = gl.drawingBufferWidth
    const height = gl.drawingBufferHeight
    // three.js only needs a few canvas fields; the GL context does the rest.
    const canvas = {
      width,
      height,
      style: {},
      clientHeight: height,
      addEventListener: () => {},
      removeEventListener: () => {},
      getContext: () => gl,
    } as unknown as HTMLCanvasElement
    const renderer = new THREE.WebGLRenderer({ canvas, context: gl, antialias: true, alpha: true })
    renderer.setPixelRatio(1)
    renderer.setSize(width, height, false)
    renderer.setClearColor(carPartColors.shadow, 0)
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.1
    renderer.outputColorSpace = THREE.SRGBColorSpace

    const scene = new THREE.Scene()
    scene.add(new THREE.HemisphereLight(carPartColors.skyLight, carPartColors.ground, 1.6))
    const key = new THREE.DirectionalLight(carPartColors.light, 2.6)
    key.position.set(4, 8, -3)
    scene.add(key)
    const fill = new THREE.DirectionalLight(carPartColors.light, 0.9)
    fill.position.set(-5, 3, -6)
    scene.add(fill)
    const rim = new THREE.DirectionalLight(carPartColors.skyLight, 0.8)
    rim.position.set(-6, 3, 5)
    scene.add(rim)

    const camera = new THREE.PerspectiveCamera(FOV, width / height, 0.1, 100)
    const mats = carMaterials(carPartColors)
    const { props: p } = latest.current
    const body = BODIES[p.bodyStyle]
    const orbit = p.mode === 'still' ? sideOf(body, width / height) : homeOf(body)
    g.current = { renderer, scene, camera, gl, mats, orbit }
    setCar(p.bodyStyle, p.paint)
    draw()
  }

  const setCar = (style: BodyStyle, paint: string) => {
    const s = g.current
    if (!s) return
    if (s.car) {
      s.scene.remove(s.car)
      disposeGroup(s.car)
    }
    s.car = buildCar(BODIES[style], s.mats)
    s.scene.add(s.car)
    for (const m of [s.mats.paint, s.mats.paintPlain, s.mats.glass]) m.color.set(paint)
  }

  // A new body or mode resets the view; a new paint only recolours.
  useEffect(() => {
    const s = g.current
    if (!s) return
    setCar(props.bodyStyle, props.paint)
    const aspect = s.gl.drawingBufferWidth / s.gl.drawingBufferHeight
    s.orbit = props.mode === 'still' ? sideOf(st, aspect) : homeOf(st)
    s.to = undefined
    redraw()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.bodyStyle, props.mode])
  useEffect(() => {
    const s = g.current
    if (!s) return
    for (const m of [s.mats.paint, s.mats.paintPlain, s.mats.glass]) m.color.set(props.paint)
    redraw()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.paint])
  // Flies to a pin when one is picked, and home again when it is let go.
  useEffect(() => {
    const s = g.current
    if (!s || props.mode === 'still') {
      redraw()
      return
    }
    const home = homeOf(st)
    const goal = props.focused ? focusOf(st, props.focused, home) : home
    s.to = { from: s.orbit, goal, t: 0 }
    redraw()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.focused])
  useEffect(() => {
    // The last frame placed the old pins; place these.
    shownKey.current = ''
    redraw()
  }, [pins]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(
    () => () => {
      const s = g.current
      if (!s) return
      if (s.frame !== undefined) cancelAnimationFrame(s.frame)
      if (s.car) disposeGroup(s.car)
      s.mats.dispose()
      s.renderer.dispose()
      g.current = null
    },
    [],
  )

  // A sideways drag turns the car; an up-and-down one is left to the page to scroll.
  const drag = useRef<{ x: number; y: number; from: Orbit } | null>(null)
  const pan = {
    onStartShouldSetResponder: () => false,
    onMoveShouldSetResponder: (e: GestureResponderEvent) => {
      if (props.mode !== '3d') return false
      const t = e.nativeEvent
      const d = drag.current
      if (!d) {
        const s = g.current
        if (s) drag.current = { x: t.pageX, y: t.pageY, from: s.orbit }
        return false
      }
      const dx = t.pageX - d.x
      const dy = t.pageY - d.y
      return Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.5
    },
    // Starts turning from where the car is now and where the finger is, so nothing jumps.
    onResponderGrant: (e: GestureResponderEvent) => {
      const s = g.current
      if (!s) return
      s.to = undefined
      drag.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY, from: s.orbit }
    },
    onResponderMove: (e: GestureResponderEvent) => {
      const s = g.current
      const d = drag.current
      if (!s || !d) return
      s.orbit = {
        ...d.from,
        theta: d.from.theta + (e.nativeEvent.pageX - d.x) * 0.008,
        phi: THREE.MathUtils.clamp(d.from.phi - (e.nativeEvent.pageY - d.y) * 0.004, 0.55, 1.5),
      }
      redraw()
    },
    onResponderTerminationRequest: () => false,
    onResponderRelease: () => {
      drag.current = null
    },
    onResponderTerminate: () => {
      drag.current = null
    },
    // A touch the page scrolled with never reaches release, so each touch starts afresh.
    onTouchStart: () => {
      drag.current = null
    },
    onTouchEnd: () => {
      drag.current = null
    },
    onTouchCancel: () => {
      drag.current = null
    },
  }
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout
    box.current = { w: width, h: height }
    redraw()
  }

  return (
    <View style={{ height: props.height }} accessible={false} onLayout={onLayout}>
      <View
        style={StyleSheet.absoluteFill}
        accessible
        accessibilityRole="image"
        accessibilityLabel={props.label}
        {...pan}
      >
        <GLView style={StyleSheet.absoluteFill} onContextCreate={onContextCreate} />
      </View>
      {props.hotspots.map((h) => {
        const pin = pins.get(h.spot)
        if (!pin) return null
        const fill = colors[PIN[h.attention]]
        const focused = props.focused === h.spot
        const hidden = !visible.split(',').includes(h.spot)
        return (
          <Animated.View
            key={h.spot}
            pointerEvents={hidden ? 'none' : 'auto'}
            accessibilityElementsHidden={hidden}
            importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}
            style={[styles.pin, { opacity: pin.shown, transform: pin.xy.getTranslateTransform() }]}
          >
            <Pressable
              onPress={() => props.onSelect(h.spot)}
              accessibilityRole="button"
              accessibilityLabel={`${h.label}: ${h.summary}`}
              accessibilityState={{ selected: focused }}
              testID={`spot-${h.spot}`}
              hitSlop={8}
              style={[
                styles.dot,
                {
                  backgroundColor: focused ? fill : colors.surface,
                  borderColor: fill,
                  shadowColor: colors.glassShadow,
                },
              ]}
            >
              <View style={[styles.core, { backgroundColor: focused ? colors.surface : fill }]} />
            </Pressable>
          </Animated.View>
        )
      })}
    </View>
  )
}

const shortAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))

const styles = StyleSheet.create({
  pin: { position: 'absolute', left: 0, top: 0, width: PIN_SIZE, height: PIN_SIZE },
  dot: {
    width: PIN_SIZE,
    height: PIN_SIZE,
    borderRadius: PIN_SIZE / 2,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  core: { width: 10, height: 10, borderRadius: 5 },
})
