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
  plus: { ios: 'plus', paths: ['M12 5v14M5 12h14'] },
  chevron: { ios: 'chevron.right', paths: ['M9 6l6 6-6 6'] },
  back: { ios: 'chevron.left', paths: ['M15 6l-6 6 6 6'] },
  clock: { ios: 'clock', paths: ['M12 4a8 8 0 1 0 0.01 0', 'M12 8v4l3 2'] },
  warning: { ios: 'exclamationmark.triangle', paths: ['M12 3l10 18H2z', 'M12 10v5M12 18v.01'] },
  send: { ios: 'arrow.up', paths: ['M12 19V5M6 11l6-6 6 6'] },
  stop: { ios: 'stop.fill', paths: ['M7 7h10v10H7z'] },
  compose: { ios: 'square.and.pencil', paths: ['M4 20h4L19 9l-4-4L4 16z', 'M13 7l4 4'] },
  source: { ios: 'doc.text.magnifyingglass', paths: ['M5 4h10l4 4v12H5z'] },
  receipt: { ios: 'receipt', paths: ['M6 3h12v18l-3-2-3 2-3-2-3 2z', 'M9 8h6M9 12h6'] },
  document: { ios: 'doc', paths: ['M6 3h8l4 4v14H6z', 'M14 3v4h4'] },
  photo: { ios: 'photo', paths: ['M4 5h16v14H4z', 'M4 16l5-5 4 4 2-2 5 5', 'M15 9h.01'] },
  camera: {
    ios: 'camera',
    paths: ['M4 8h3l2-3h6l2 3h3v11H4z', 'M12 10.5a3 3 0 1 0 0.01 0'],
  },
  folder: { ios: 'folder', paths: ['M3 6h6l2 2h10v11H3z'] },
  paperclip: {
    ios: 'paperclip',
    paths: ['M16 7l-7.5 7.5a2 2 0 0 0 3 3L19 10a4 4 0 0 0-6-6l-7.5 7.5a6 6 0 0 0 8.5 8.5L20 14'],
  },
  ellipsis: { ios: 'ellipsis', paths: ['M6 12h.01M12 12h.01M18 12h.01'] },
  trash: { ios: 'trash', paths: ['M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13'] },
} satisfies Record<string, { ios: SFSymbol; paths: string[] }>

export type SymbolName = keyof typeof SYMBOLS
