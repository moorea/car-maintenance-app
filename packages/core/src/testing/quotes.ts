import type { PriceEstimate, PriceEstimateRequest, QuoteLine, QuotePhoto } from '../domain/types'
import type {
  CancelSignal,
  OdometerReader,
  PhotoPicker,
  PriceEstimator,
  QuoteReader,
} from '../ports'

declare const setTimeout: (callback: () => void, ms: number) => unknown

/** One call to a `controlledQuoteReader`, which the test settles by hand. */
export interface QuoteReaderCall {
  photo: QuotePhoto
  signal: CancelSignal | undefined
  resolve: (lines: QuoteLine[]) => void
  reject: (error: unknown) => void
}

/** A quote reader whose calls the test answers through `calls`. */
export const controlledQuoteReader = (): QuoteReader & { calls: QuoteReaderCall[] } => {
  const calls: QuoteReaderCall[] = []
  return {
    calls,
    read: (photo, signal) =>
      new Promise((resolve, reject) => calls.push({ photo, signal, resolve, reject })),
  }
}

/** A tiny valid JPEG's worth of base64, standing in for a photo. */
export const SAMPLE_PHOTO: QuotePhoto = { mediaType: 'image/jpeg', base64: '/9j/4AAQSkZJRg==' }

/**
 * A camera and photo library that return `photo` (SAMPLE_PHOTO by default), or nothing as if the
 * owner cancelled when it is undefined. `next` changes what the following pick returns.
 */
export const memoryPhotoPicker = (photo: QuotePhoto | undefined = SAMPLE_PHOTO) => {
  let next: QuotePhoto | undefined = photo
  const picker: PhotoPicker & { next: (p: QuotePhoto | undefined) => void; picks: string[] } = {
    picks: [],
    take: () => {
      picker.picks.push('camera')
      return Promise.resolve(next)
    },
    choose: () => {
      picker.picks.push('library')
      return Promise.resolve(next)
    },
    next: (p) => {
      next = p
    },
  }
  return picker
}

/**
 * A dealer's recommendation list for the demo car, made up but typical: some due, some already
 * done, some not on any schedule.
 */
export const DEMO_QUOTE: QuoteLine[] = [
  { text: 'Synthetic oil & filter change', priceCents: 8_995 },
  { text: 'Rotate tires', priceCents: 2_995 },
  { text: 'Cabin air filter', priceCents: 7_995 },
  { text: 'Engine air filter', priceCents: 6_495 },
  { text: 'Transmission fluid exchange', priceCents: 22_900 },
  { text: 'Fuel induction service', priceCents: 18_900 },
  { text: 'Front brake pads, 4 mm remaining', priceCents: 32_000 },
]

/**
 * Reads every photo as DEMO_QUOTE after `delayMs`, so the demo and web preview show the whole flow
 * without a server.
 */
export const demoQuoteReader = (options: { delayMs?: number } = {}): QuoteReader => ({
  read: (_photo, signal) =>
    new Promise((resolve) => {
      // An aborted read never settles, as a cancelled request would not.
      setTimeout(() => {
        if (!signal?.aborted) resolve(DEMO_QUOTE)
      }, options.delayMs ?? 0)
    }),
})

/** One call to a `controlledOdometerReader`, which the test settles by hand. */
export interface OdometerReaderCall {
  photo: QuotePhoto
  signal: CancelSignal | undefined
  resolve: (miles: number | undefined) => void
  reject: (error: unknown) => void
}

/** An odometer reader whose calls the test answers through `calls`. */
export const controlledOdometerReader = (): OdometerReader & { calls: OdometerReaderCall[] } => {
  const calls: OdometerReaderCall[] = []
  return {
    calls,
    read: (photo, signal) =>
      new Promise((resolve, reject) => calls.push({ photo, signal, resolve, reject })),
  }
}

/**
 * Reads every photo as `miles` after `delayMs`, so the demo and web preview show the whole flow
 * without a server.
 */
export const demoOdometerReader = (options: {
  miles: number
  delayMs?: number
}): OdometerReader => ({
  read: (_photo, signal) =>
    new Promise((resolve) => {
      // An aborted read never settles, as a cancelled request would not.
      setTimeout(() => {
        if (!signal?.aborted) resolve(options.miles)
      }, options.delayMs ?? 0)
    }),
})

/** One call to a `controlledPriceEstimator`, which the test settles by hand. */
export interface PriceEstimatorCall {
  request: PriceEstimateRequest
  signal: CancelSignal | undefined
  resolve: (estimate: PriceEstimate) => void
  reject: (error: unknown) => void
}

/** A price estimator whose calls the test answers through `calls`. */
export const controlledPriceEstimator = (): PriceEstimator & { calls: PriceEstimatorCall[] } => {
  const calls: PriceEstimatorCall[] = []
  return {
    calls,
    estimate: (request, signal) =>
      new Promise((resolve, reject) => calls.push({ request, signal, resolve, reject })),
  }
}

/** Made-up but typical labor-guide hours and parts costs, by a word in the line. */
const DEMO_JOBS: [
  RegExp,
  PriceEstimate['lines'][number]['laborHours'],
  PriceEstimate['lines'][number]['partsCents'],
][] = [
  [/oil/i, { low: 0.4, high: 0.5 }, { low: 3_500, high: 6_500 }],
  [/rotat/i, { low: 0.3, high: 0.5 }, { low: 0, high: 0 }],
  [/cabin/i, { low: 0.2, high: 0.3 }, { low: 1_500, high: 4_000 }],
  [/air filter/i, { low: 0.2, high: 0.3 }, { low: 1_500, high: 4_000 }],
  [/transmission/i, { low: 0.8, high: 1.2 }, { low: 5_000, high: 10_000 }],
  [/fuel|induction/i, { low: 0.5, high: 1 }, { low: 2_000, high: 4_000 }],
  [/brake/i, { low: 1.2, high: 1.8 }, { low: 5_000, high: 15_000 }],
]

/**
 * Estimates the lines it recognizes from DEMO_JOBS at a typical city labor rate after `delayMs`,
 * so the demo and web preview show the whole flow without a server.
 */
export const demoPriceEstimator = (options: { delayMs?: number } = {}): PriceEstimator => ({
  estimate: (request, signal) =>
    new Promise((resolve) => {
      // An aborted estimate never settles, as a cancelled request would not.
      setTimeout(() => {
        if (signal?.aborted) return
        resolve({
          laborRateCents: { low: 13_500, high: 19_500 },
          lines: request.lines.flatMap(({ index, text }) => {
            const job = DEMO_JOBS.find(([pattern]) => pattern.test(text))
            return job ? [{ index, laborHours: job[1], partsCents: job[2] }] : []
          }),
        })
      }, options.delayMs ?? 0)
    }),
})
