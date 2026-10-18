import type { IconProps } from '@expo/ui'

type SFSymbol = Extract<IconProps['name'], string>

/** The app's icons: an SF Symbol on iOS and a matching stroke drawing for the web preview. */
export const SYMBOLS = {
  garage: { ios: 'house', paths: ['M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z'] },
  log: { ios: 'doc.text', paths: ['M6 3h9l4 4v14H6z', 'M9 11h7M9 15h7M9 7h4'] },
  car: {
    ios: 'car',
    paths: [
      'M3 16v-3l2-5h14l2 5v3',
      'M3 16h18v2H3z',
      'M7 16a1.5 1.5 0 1 0 0.01 0M17 16a1.5 1.5 0 1 0 0.01 0',
    ],
  },
  ask: {
    ios: 'bubble.left.and.text.bubble.right',
    paths: ['M4 5h16v11H9l-5 4z', 'M9 10h.01M12 10h.01M15 10h.01'],
  },
  bell: { ios: 'bell', paths: ['M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z', 'M10 20.5a2 2 0 0 0 4 0'] },
  person: {
    ios: 'person.crop.circle',
    paths: [
      'M12 3a9 9 0 1 0 0.01 0',
      'M12 7a3 3 0 1 0 0.01 0',
      'M6 18.5c1.5-2.5 3.5-3.5 6-3.5s4.5 1 6 3.5',
    ],
  },
  signOut: {
    ios: 'rectangle.portrait.and.arrow.right',
    paths: ['M14 4H6v16h8', 'M10 12h11M17 8l4 4-4 4'],
  },
  trash: {
    ios: 'trash',
    paths: ['M4 7h16', 'M9 7V4h6v3', 'M6 7l1 13h10l1-13', 'M10 11v6M14 11v6'],
  },
  plus: { ios: 'plus', paths: ['M12 5v14M5 12h14'] },
  chevron: { ios: 'chevron.right', paths: ['M9 6l6 6-6 6'] },
  moveUp: { ios: 'chevron.up', paths: ['M6 15l6-6 6 6'] },
  moveDown: { ios: 'chevron.down', paths: ['M6 9l6 6 6-6'] },
  dropdown: { ios: 'chevron.up.chevron.down', paths: ['M8 10l4 4 4-4'] },
  back: { ios: 'chevron.left', paths: ['M15 6l-6 6 6 6'] },
  calendar: {
    ios: 'calendar',
    paths: ['M4 6h16v14H4z', 'M4 10h16', 'M8 3v4M16 3v4', 'M8 14h3M8 17h3'],
  },
  clock: { ios: 'clock', paths: ['M12 4a8 8 0 1 0 0.01 0', 'M12 8v4l3 2'] },
  warning: { ios: 'exclamationmark.triangle', paths: ['M12 3l10 18H2z', 'M12 10v5M12 18v.01'] },
  send: { ios: 'arrow.up', paths: ['M12 19V5M6 11l6-6 6 6'] },
  stop: { ios: 'stop.fill', paths: ['M7 7h10v10H7z'] },
  compose: { ios: 'square.and.pencil', paths: ['M4 20h4L19 9l-4-4L4 16z', 'M13 7l4 4'] },
  shield: {
    ios: 'checkmark.shield',
    paths: ['M12 3l8 3v6c0 4.5-3.4 8.2-8 9-4.6-.8-8-4.5-8-9V6z', 'M8.5 12l2.5 2.5 4.5-5'],
  },
  fuel: {
    ios: 'fuelpump',
    paths: [
      'M5 20V5a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v15',
      'M4 20h11M7 8h5',
      'M14 10h2l2 2v5a1.5 1.5 0 0 0 3 0V9l-3-3',
    ],
  },
  share: {
    ios: 'square.and.arrow.up',
    paths: ['M12 15V3M8 7l4-4 4 4', 'M6 11H5v10h14V11h-1'],
  },
  source: { ios: 'doc.text.magnifyingglass', paths: ['M5 4h10l4 4v12H5z'] },
  camera: {
    ios: 'camera',
    paths: ['M3 8h4l2-3h6l2 3h4v11H3z', 'M12 10a3.5 3.5 0 1 0 0.01 0'],
  },
  photo: { ios: 'photo', paths: ['M3 5h18v14H3z', 'M3 16l5-5 4 4 3-3 6 6', 'M15 9h.01'] },
  engine: {
    ios: 'engine.combustion',
    paths: ['M6 9h9l2 2h2v6h-2l-2 2H8l-2-2H4v-6h2z', 'M9 9V6h4v3', 'M2 12v4M22 12v4'],
  },
  quote: { ios: 'list.bullet.clipboard', paths: ['M7 4h10v17H7z', 'M10 9h5M10 13h5M10 17h3'] },
  bulletin: {
    ios: 'wrench.and.screwdriver',
    paths: ['M14 6a4 4 0 0 0 5 5l-9 9-3-3 9-9a4 4 0 0 0-2-2z', 'M4 4l6 6'],
  },
  gauge: {
    ios: 'gauge.with.dots.needle.67percent',
    paths: ['M4 17a8 8 0 1 1 16 0', 'M12 17l4-5', 'M12 17h.01'],
  },
  receipt: { ios: 'receipt', paths: ['M6 3h12v18l-3-2-3 2-3-2-3 2z', 'M9 8h6M9 12h6'] },
  document: { ios: 'doc', paths: ['M6 3h8l4 4v14H6z', 'M14 3v4h4'] },
  folder: { ios: 'folder', paths: ['M3 6h6l2 2h10v11H3z'] },
  paperclip: {
    ios: 'paperclip',
    paths: ['M16 7l-7.5 7.5a2 2 0 0 0 3 3L19 10a4 4 0 0 0-6-6l-7.5 7.5a6 6 0 0 0 8.5 8.5L20 14'],
  },
  download: {
    ios: 'square.and.arrow.down',
    paths: ['M12 3v12M8 11l4 4 4-4', 'M6 11H5v10h14V11h-1'],
  },
  archive: { ios: 'archivebox', paths: ['M3 4h18v4H3z', 'M5 8v12h14V8', 'M10 12h4'] },
  checkmark: { ios: 'checkmark.circle', paths: ['M12 3a9 9 0 1 0 0.01 0', 'M8 12l3 3 5-6'] },
  price: {
    ios: 'dollarsign.circle',
    paths: [
      'M12 3a9 9 0 1 0 0.01 0',
      'M15 9.5c-.5-1-1.6-1.5-3-1.5-1.7 0-3 .8-3 2s1.3 1.7 3 2 3 .8 3 2-1.3 2-3 2c-1.4 0-2.5-.5-3-1.5',
      'M12 6.5v11',
    ],
  },
  ellipsis: { ios: 'ellipsis', paths: ['M6 12h.01M12 12h.01M18 12h.01'] },
  tire: {
    ios: 'tirepressure',
    paths: ['M12 3a9 9 0 1 0 0.01 0', 'M12 8a4 4 0 1 0 0.01 0', 'M12 3v5M12 16v5M3 12h5M16 12h5'],
  },
  swap: { ios: 'arrow.triangle.2.circlepath', paths: ['M4 9h13l-3-3M20 15H7l3 3'] },
} satisfies Record<string, { ios: SFSymbol; paths: string[] }>

export type SymbolName = keyof typeof SYMBOLS

/**
 * Width of the slot a leading icon of `size` points sits in on iOS. The widest symbol we lead rows
 * with, `engine.combustion`, draws about 1.4 times its point size.
 */
export function leadingWidth(size: number): number {
  return Math.ceil(size * 1.5)
}
