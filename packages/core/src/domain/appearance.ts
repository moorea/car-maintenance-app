import type { BodyStyle, Paint } from './types'

/** Body styles in the order the owner picks from, with their names. */
export const BODY_STYLES: readonly { id: BodyStyle; label: string }[] = [
  { id: 'sedan', label: 'Sedan' },
  { id: 'suv', label: 'SUV' },
  { id: 'pickup', label: 'Pickup' },
  { id: 'minivan', label: 'Minivan' },
]

/** Paint colors in the order the owner picks from, with their names. */
export const PAINTS: readonly { id: Paint; label: string }[] = [
  { id: 'white', label: 'White' },
  { id: 'silver', label: 'Silver' },
  { id: 'gray', label: 'Gray' },
  { id: 'black', label: 'Black' },
  { id: 'red', label: 'Red' },
  { id: 'blue', label: 'Blue' },
  { id: 'green', label: 'Green' },
  { id: 'brown', label: 'Brown' },
]

const bodyStyleIds = new Set<string>(BODY_STYLES.map((b) => b.id))
const paintIds = new Set<string>(PAINTS.map((p) => p.id))

export const isBodyStyle = (v: unknown): v is BodyStyle =>
  typeof v === 'string' && bodyStyleIds.has(v)
export const isPaint = (v: unknown): v is Paint => typeof v === 'string' && paintIds.has(v)

/**
 * The body style for one of vPIC's body classes, such as "Sport Utility Vehicle (SUV)/Multi-Purpose
 * Vehicle (MPV)" or "Hatchback/Liftback/Notchback", or undefined for ones the app can't draw, such
 * as motorcycles, buses and trailers.
 */
export const bodyStyleOfClass = (bodyClass: string | undefined): BodyStyle | undefined => {
  const c = bodyClass?.toLowerCase() ?? ''
  if (!c) return undefined
  if (c.includes('pickup')) return 'pickup'
  if (c.includes('minivan') || /\bvan\b/.test(c)) return 'minivan'
  if (c.includes('sport utility') || c.includes('crossover') || c.includes('suv')) return 'suv'
  if (
    /sedan|saloon|hatchback|liftback|notchback|coupe|convertible|cabriolet|wagon|roadster/.test(c)
  )
    return 'sedan'
  return undefined
}

/** The body to draw when the car doesn't say: the commonest kind of car on US roads. */
export const DEFAULT_BODY_STYLE: BodyStyle = 'suv'

/** The paint to draw before the owner picks one: the commonest car color that reads as no color. */
export const DEFAULT_PAINT: Paint = 'silver'
