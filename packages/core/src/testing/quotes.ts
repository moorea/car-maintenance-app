import type { QuoteLine, QuotePhoto } from '../domain/types'
import type { CancelSignal, PhotoPicker, QuoteReader } from '../ports'

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
