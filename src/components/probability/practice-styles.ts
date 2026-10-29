import type { GlowKind } from '../../types'

/**
 * Colores de los efectos de la mesa, como `r g b` para `rgb(var(--fx-rgb) / alfa)`: dorado para activar y para la Invocación Normal,
 * celeste para lo que se muestra y la Invocación Especial, rojo para el objetivo, violeta para declarar, la Fusión y el cementerio.
 */
export const FX_RGB = {
  gold: '250 204 21',
  cyan: '56 189 248',
  red: '255 74 94',
  violet: '192 132 252',
  green: '0 255 163',
  white: '241 245 249',
  indigo: '129 140 248',
  teal: '45 212 191',
  amber: '251 191 36',
  /** Lo que podés hacer ahora con una carta: el celeste casi blanco de `--playable-rgb` (`GlowKind` `can`). */
  playable: '168 236 255',
} as const

export type FxTone = keyof typeof FX_RGB

/**
 * El marco de adentro de una carta que brilla: una salida en verde, un problema en rojo y, en un duelo, lo que podés hacer en celeste casi blanco, quieto, y lo que se activa o se resuelve en dorado,
 * con la luz que gira. Todos con el mismo peso que el aro de afuera (`DUEL_GLOW`).
 */
export const GLOW_TONE = { opening: 'green', problem: 'red', can: 'playable', act: 'gold' } as const satisfies Record<GlowKind, FxTone>

/** El marco de adentro de una carta que brilla (`GLOW_TONE`), o nada. */
export const glowFrame = (kind: GlowKind | null): { tone: FxTone; orbit: boolean } | null => (kind === null ? null : { tone: GLOW_TONE[kind], orbit: kind === 'act' })

/** Color de una salida (verde) o de un problema (rojo): lo heredan los botones y la explicación. */
export const RULE_COLOR = {
  opening: '[--rule-color:rgb(var(--success-rgb))]',
  problem: '[--rule-color:rgb(var(--danger-rgb))]',
} as const

/** Cuántas capas de dorso se apilan debajo de una pila: una por cada seis cartas, hasta 8 (un deck de 48 o más). Sin cartas, ninguna. */
export const pileDepth = (count: number): number => (count <= 0 ? 0 : Math.min(8, Math.max(1, Math.ceil(count / 6))))

/** Cuánto asoma cada capa de la pila (% del alto de la carta: crece con la casilla, en el celular y en escritorio) y cuánto más oscura es que la de arriba. */
export const PILE_LAYER_PCT = 2
export const PILE_LAYER_DIM = 0.07

/**
 * El dorso por defecto de una carta de Yu-Gi-Oh!: el real, una imagen propia (`public/card-back-sm.webp`), que no pasa por el proxy
 * de imágenes de cartas.
 */
export const CARD_BACK_URL = '/card-back-sm.webp'
/** El dorso en alta (927 × 1353, WebP, ~220 KB): para la carta grande dada vuelta. `CARD_BACK_URL` es el mismo en 428 × 625 (~50 KB) para todo lo demás. Los dos son una copia del dorso de Yugipedia, en `public/`, con los logos de una carta real: KONAMI arriba a la izquierda y Yu-Gi-Oh! abajo a la derecha (el de YGOPRODeck no los tiene y en grande se ve a bloques). */
export const CARD_BACK_HD_URL = '/card-back.webp'

/**
 * Dorso de carta: la imagen de `CARD_BACK_URL` (un violeta oscuro debajo mientras carga). Lo comparten el mazo, el Extra, las cartas
 * boca abajo, los fantasmas de los vuelos y las cartas que se dan vuelta. Tiene que decir lo mismo que `CARD_BACK_URL`: Tailwind sólo
 * ve las clases escritas completas.
 */
export const CARD_BACK = 'absolute inset-0 z-1 overflow-hidden bg-[#1d1033] bg-cover bg-center bg-[url(/card-back-sm.webp)]'

/**
 * Las capas de dorso bajo la carta de arriba del mazo (el propio y el del rival), que se barajan a la vista (`shuffleDeck`): quietas, las dos de arriba asoman corridas como
 * el canto del mazo y las demás quedan debajo; al barajar, cada una es una carta de la pila. Con la de arriba son 8: bastan para leerse como una pila y son pocas capas en la GPU.
 */
export const DECK_LAYERS = [...Array<string>(6).fill('[transform:translate(-3px,3px)]'), '[transform:translate(-1.5px,1.5px)]']
