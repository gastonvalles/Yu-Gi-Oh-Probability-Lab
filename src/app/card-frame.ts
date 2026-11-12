/**
 * El color de cada tipo de carta: el de su marco oficial (Gastón, 2026-11-12). Una sola tabla: `FRAME_HEX` es la fuente, `src/index.css` la repite como
 * `--color-frame-*` (un test las mantiene iguales) y de ahí salen las clases `bg-frame-effect`, `border-frame-xyz`, `text-frame-trap`… El rojo, el azul
 * purpúreo y el amarillo cromo de la tabla oficial no existen acá. No reemplaza la paleta de marca ni los tonos de estado (`ui/tone.ts`).
 *
 * Uso:
 *   const frame = frameKindOf(card.frameType, card.cardType)   // { kind: 'xyz', pendulum: true, text: 'light', outlined: true }
 *   <div className={cx('relative grid', frameClass(frame))}>…</div>
 * `frameClass` da el relleno, el texto que llega a AA (4,5:1) y, si el color no llega a 3:1 contra el carbón (Xyz, Enlace, Sincronía Oscura), el aro
 * claro hacia adentro. El Péndulo va partido con corte duro (arriba su color de monstruo, abajo el verde de la Mágica, sin degradado): el tono del texto
 * se mide contra la mitad de arriba, así que el texto va arriba. Para un punto o una marca sin texto alcanza con `FRAME_FILL[kind]` (más el aro si `outlined`).
 */

/** `neutral`: Skill y lo que no se sabe (una carta sin datos). */
export type FrameKind = 'effect' | 'normal' | 'ritual' | 'fusion' | 'synchro' | 'dark-synchro' | 'xyz' | 'link' | 'token' | 'spell' | 'trap' | 'neutral'

export interface CardFrame {
  kind: FrameKind
  pendulum: boolean
  /** El texto encima: `light` (blanco, `text-foreground`) o `dark` (carbón, `text-background`), el que llega a AA. */
  text: 'light' | 'dark'
  /** Lleva el aro claro: el color solo no llega a 3:1 contra el carbón. */
  outlined: boolean
}

/** Los hex del marco. La Trampa, apenas más oscura que la de la tabla (#bc5a84) para que el blanco llegue a 4,5:1. */
export const FRAME_HEX: Record<Exclude<FrameKind, 'neutral'>, string> = {
  effect: '#ff8b53',
  normal: '#fde68a',
  ritual: '#9db5cc',
  fusion: '#a086b7',
  synchro: '#cccccc',
  'dark-synchro': '#555555',
  xyz: '#000000',
  link: '#00008b',
  token: '#c0c0c0',
  spell: '#1d9e74',
  trap: '#b65480',
}

/** Clases literales (Tailwind sólo ve clases escritas enteras). */
export const FRAME_FILL: Record<FrameKind, string> = {
  effect: 'bg-frame-effect',
  normal: 'bg-frame-normal',
  ritual: 'bg-frame-ritual',
  fusion: 'bg-frame-fusion',
  synchro: 'bg-frame-synchro',
  'dark-synchro': 'bg-frame-dark-synchro',
  xyz: 'bg-frame-xyz',
  link: 'bg-frame-link',
  token: 'bg-frame-token',
  spell: 'bg-frame-spell',
  trap: 'bg-frame-trap',
  neutral: 'bg-input',
}

export const FRAME_OUTLINE = 'inset-ring-1 inset-ring-foreground/60'
/** La mitad de abajo del Péndulo: un `after` detrás del contenido (`isolate` + `-z-1`), sin degradado. */
const PENDULUM_SPLIT = 'isolate after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:-z-1 after:h-1/2 after:bg-frame-spell'

const CARBON = '#18181c'
const WHITE = '#fdffff'

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((start) => {
    const value = parseInt(hex.slice(start, start + 2), 16) / 255
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** El contraste WCAG entre dos hex `#rrggbb`. */
export function contrastRatio(a: string, b: string): number {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (high + 0.05) / (low + 0.05)
}

const BASES: [RegExp, FrameKind][] = [
  [/link/, 'link'],
  [/xyz/, 'xyz'],
  [/dark[ _-]?synchro/, 'dark-synchro'],
  [/synchro/, 'synchro'],
  [/fusion/, 'fusion'],
  [/ritual/, 'ritual'],
  [/token/, 'token'],
  [/spell/, 'spell'],
  [/trap/, 'trap'],
  [/skill/, 'neutral'],
  [/normal/, 'normal'],
  [/effect|monster/, 'effect'],
]

/** El tipo de marco por el `frameType` de YGOPRODeck (`effect`, `xyz_pendulum`, `spell`…) o, si viene vacío, por el `cardType` (`XYZ Pendulum Effect Monster`). */
export function frameKindOf(frameType: string | null | undefined, cardType?: string | null): CardFrame {
  const source = (frameType || cardType || '').toLowerCase()
  const kind = BASES.find(([pattern]) => pattern.test(source))?.[1] ?? 'neutral'
  const hex = kind === 'neutral' ? null : FRAME_HEX[kind]

  return {
    kind,
    pendulum: kind !== 'neutral' && source.includes('pendulum'),
    text: !hex || contrastRatio(hex, WHITE) >= contrastRatio(hex, CARBON) ? 'light' : 'dark',
    outlined: hex !== null && contrastRatio(hex, CARBON) < 3,
  }
}

/** Relleno + texto + aro (+ el corte del Péndulo, que pide `relative` o `absolute` en el mismo elemento) en un solo string de clases. */
export function frameClass(frame: CardFrame): string {
  return [
    FRAME_FILL[frame.kind],
    frame.text === 'light' ? 'text-foreground' : 'text-background',
    frame.outlined ? FRAME_OUTLINE : '',
    frame.pendulum ? PENDULUM_SPLIT : '',
  ].filter(Boolean).join(' ')
}
