import { getLocale, t, type MessageKey } from '../i18n'

/**
 * El color de cada tipo de carta: el de su marco oficial (Gastón, 2026-11-12), en dos tonos. El **oficial** (`FRAME_HEX`, `bg-frame-effect`…) es el de lo que no lleva texto (puntos,
 * bordes, marcas, la imagen exportada); el **profundo** (`FRAME_DEEP_HEX`, `bg-frame-effect-deep`…: el mismo matiz oscurecido hasta que el blanco dé 4,5:1) es el de toda superficie con
 * texto encima, que es **siempre blanco**. `src/index.css` repite las dos tablas como `--color-frame-*` (un test las mantiene iguales). El rojo, el azul purpúreo y el amarillo cromo de
 * la tabla oficial no existen acá. No reemplaza la paleta de marca ni los tonos de estado (`ui/tone.ts`).
 *
 * Uso:
 *   const frame = frameKindOf(card.frameType, card.cardType)   // { kind: 'xyz', pendulum: true, text: 'light', outlined: true }
 *   <span className={cx('relative', frameTextClass(frame))}>Mágica de Campo</span>   // con texto: tono profundo, blanco, aro y corte del Péndulo
 *   <div className={frameClass(frame)} />                                           // sin texto: tono oficial
 * Sincronía lleva siempre el aro claro: su gris no se confunde con la Ficha ni con Xyz. El Péndulo va partido con corte duro (arriba su color de monstruo, abajo el verde de la Mágica, sin
 * degradado): el texto va arriba. Para un punto o una marca sin texto alcanza con `FRAME_FILL[kind]` (más el aro si `outlined`).
 */

/** `neutral`: Skill y lo que no se sabe (una carta sin datos). */
export type FrameKind = 'effect' | 'normal' | 'ritual' | 'fusion' | 'synchro' | 'dark-synchro' | 'xyz' | 'link' | 'token' | 'spell' | 'trap' | 'neutral'

export interface CardFrame {
  kind: FrameKind
  pendulum: boolean
  /** El texto encima: siempre blanco (`text-foreground`), sobre el tono profundo (`frameTextClass`). */
  text: 'light'
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

/** El tono profundo de cada tipo (lo que lleva texto blanco encima): el mismo matiz, oscurecido hasta 4,5:1 contra el blanco. Los que ya lo daban (Trampa, Xyz, Enlace, Sincronía Oscura) quedan iguales. */
export const FRAME_DEEP_HEX: Record<Exclude<FrameKind, 'neutral'>, string> = {
  effect: '#d04400',
  normal: '#8d7102',
  ritual: '#52789d',
  fusion: '#8766a4',
  synchro: '#737373',
  'dark-synchro': '#555555',
  xyz: '#000000',
  link: '#00008b',
  token: '#666666',
  spell: '#188461',
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

/** Lo mismo con el tono profundo: el relleno de lo que lleva texto. */
export const FRAME_DEEP_FILL: Record<FrameKind, string> = {
  effect: 'bg-frame-effect-deep',
  normal: 'bg-frame-normal-deep',
  ritual: 'bg-frame-ritual-deep',
  fusion: 'bg-frame-fusion-deep',
  synchro: 'bg-frame-synchro-deep',
  'dark-synchro': 'bg-frame-dark-synchro-deep',
  xyz: 'bg-frame-xyz-deep',
  link: 'bg-frame-link-deep',
  token: 'bg-frame-token-deep',
  spell: 'bg-frame-spell-deep',
  trap: 'bg-frame-trap-deep',
  neutral: 'bg-input',
}

export const FRAME_OUTLINE = 'inset-ring-1 inset-ring-foreground/60'
/** La mitad de abajo del Péndulo: un `after` detrás del contenido (`isolate` + `-z-1`), sin degradado. */
const PENDULUM_SPLIT = 'isolate after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:-z-1 after:h-1/2'

const CARBON = '#18181c'

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
    text: 'light',
    outlined: hex !== null && contrastRatio(hex, CARBON) < 3,
  }
}

/** Los nombres que el proyecto ya tradujo para los filtros del buscador (`search.frame.*` y `search.kind.*`): el marco y, en Mágicas y Trampas, su clase. */
type SearchName = Extract<MessageKey, `search.frame.${string}` | `search.kind.${string}`>
const FRAME_NAME: Partial<Record<FrameKind, SearchName>> = {
  normal: 'search.frame.normal',
  effect: 'search.frame.effect',
  fusion: 'search.frame.fusion',
  ritual: 'search.frame.ritual',
  synchro: 'search.frame.synchro',
  xyz: 'search.frame.xyz',
  link: 'search.frame.link',
  spell: 'search.frame.spell',
  trap: 'search.frame.trap',
}
const KIND_NAME: Record<string, SearchName> = {
  'spell:Normal': 'search.kind.spellNormal',
  'spell:Field': 'search.kind.spellField',
  'spell:Equip': 'search.kind.spellEquip',
  'spell:Continuous': 'search.kind.spellContinuous',
  'spell:Quick-Play': 'search.kind.spellQuickPlay',
  'spell:Ritual': 'search.kind.spellRitual',
  'trap:Normal': 'search.kind.trapNormal',
  'trap:Continuous': 'search.kind.trapContinuous',
  'trap:Counter': 'search.kind.trapCounter',
}

/**
 * El tipo de una carta para el chip de la ficha: en español, el nombre que ya tienen los filtros del buscador («Efecto», «Mágica de Juego Rápido»; un Péndulo suma «Péndulo»); lo que no tiene
 * traducción hecha (Token, Skill, Sincronía Oscura) y todo el inglés dejan el nombre del juego tal cual («Normal Monster»).
 */
export function cardTypeLabel({ frameType, cardType, race }: { frameType?: string | null; cardType: string; race?: string | null }): string {
  if (getLocale() === 'en') return cardType
  const frame = frameKindOf(frameType, cardType)
  const key = (frame.kind === 'spell' || frame.kind === 'trap' ? KIND_NAME[`${frame.kind}:${race ?? ''}`] : undefined) ?? FRAME_NAME[frame.kind]

  return key ? [t(key), frame.pendulum ? t('search.frame.pendulum') : ''].filter(Boolean).join(' · ') : cardType
}

/** Los bits de tipo del `.cdb` (lo que el núcleo sabe de una carta del rival) que deciden el marco, con el nombre que lee `frameKindOf`. */
const TYPE_BITS: [number, string][] = [
  [0x4000000, 'link'],
  [0x800000, 'xyz'],
  [0x2000, 'synchro'],
  [0x40, 'fusion'],
  [0x80, 'ritual'],
  [0x4000, 'token'],
  [0x20, 'effect'],
  [0x10, 'normal'],
  [0x1000000, 'pendulum'],
]

/**
 * El marco por la máscara de tipo del `.cdb` (`type`): la carta que no es tuya, de la que sólo se sabe el código. 0 (no se sabe): neutro. Una Mágica o una Trampa es eso aunque lleve
 * otro bit (la Magia de Ritual es verde).
 */
export const frameOfType = (type: number): CardFrame =>
  frameKindOf(null, type & 0x2 ? 'spell' : type & 0x4 ? 'trap' : TYPE_BITS.filter(([bit]) => (type & bit) !== 0).map(([, name]) => name).join(' '))

/** El color **oficial** de lo que no lleva texto (el borde de la carta en la cadena, un punto): relleno + aro (+ el corte del Péndulo, que pide `relative` o `absolute` en el mismo elemento). */
export function frameClass(frame: CardFrame): string {
  return [FRAME_FILL[frame.kind], 'text-foreground', frame.outlined ? FRAME_OUTLINE : '', frame.pendulum ? `${PENDULUM_SPLIT} after:bg-frame-spell` : ''].filter(Boolean).join(' ')
}

/** Toda superficie con texto encima (el chip de tipo, la carta sin imagen): el tono **profundo**, el texto blanco (4,5:1), el aro (Xyz, Enlace, Sincronía y Sincronía Oscura) y el corte del Péndulo. */
export function frameTextClass(frame: CardFrame): string {
  return [FRAME_DEEP_FILL[frame.kind], 'text-foreground', frame.outlined || frame.kind === 'synchro' ? FRAME_OUTLINE : '', frame.pendulum ? `${PENDULUM_SPLIT} after:bg-frame-spell-deep` : ''].filter(Boolean).join(' ')
}
