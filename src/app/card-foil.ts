/**
 * El efecto de brillo que simula la rareza real de una carta impresa (Gastón, 2026-10-19, con una referencia de ygopocket.com: «la carta tiene efectos visuales que simulan rareza real de las cartas»).
 * Sólo se decide qué efecto lleva cada rareza y dónde cae la ventana del arte en cada marco; cómo se ve lo dibuja `RarityFoil` con CSS (`index.css`, «Foil de rareza»).
 *
 * Las rarezas son los nombres de TCGplayer (`ArtPrinting.rarity`: 33 distintos en los datos). Una rareza que no se conoce no lleva efecto: nunca se inventa uno.
 */

/**
 * - `rare`: un destello suave que cruza la carta (el nombre plateado).
 * - `holo`: el arte con un arcoíris que se mueve (Super, Ultra, Ultimate y las Parallel).
 * - `secret`: el arte con rayas finas en diagonal, arcoíris y destellos.
 * - `gold`: la carta bañada en oro con un reflejo que cruza.
 * - `ghost`: un blanco nacarado sobre el arte.
 * - `platinum`: como la Secret pero en plata.
 * - `prism`: arcoíris, rayas y polvo brillante en toda la carta (Prismatic, Quarter Century, Collector's, Starfoil, Shatterfoil, Mosaic y Grand Master).
 * - `starlight`: lo más fuerte: toda la carta con destellos, líneas finas y centelleo.
 */
export type FoilKind = 'rare' | 'holo' | 'secret' | 'gold' | 'ghost' | 'platinum' | 'prism' | 'starlight'

/** Las rarezas, de la más específica a la más general: gana la primera que calza. Las que no calzan con ninguna (Common, Promo…) no llevan efecto. */
const FOIL_RULES: ReadonlyArray<[pattern: RegExp, kind: FoilKind]> = [
  [/starlight/, 'starlight'],
  [/prismatic|quarter century|collector|starfoil|shatterfoil|mosaic|grand master/, 'prism'],
  [/platinum secret/, 'platinum'],
  [/ghost/, 'ghost'],
  [/gold/, 'gold'],
  [/secret/, 'secret'],
  [/ultimate|ultra|super|parallel|technology/, 'holo'],
  [/^(?:platinum )?rare$/, 'rare'],
]

/** El efecto de una rareza (`Ultra Rare`, `Starlight Rare`…), o null si no lleva ninguno. */
export function foilKindOf(rarity: string | null | undefined): FoilKind | null {
  const name = (rarity ?? '').toLowerCase().trim()

  return FOIL_RULES.find(([pattern]) => pattern.test(name))?.[1] ?? null
}

/** Lo que necesita `CardFlip` para dibujar el brillo: el efecto de la rareza y el marco de la carta. */
export interface CardFoil {
  kind: FoilKind
  frame: FoilFrame
}

/** El brillo de una carta con esa rareza y ese marco (`frameType`), o null si la rareza no lleva efecto o no se conoce. */
export function foilOf(rarity: string | null | undefined, frameType: string | null | undefined): CardFoil | null {
  const kind = foilKindOf(rarity)

  return kind ? { kind, frame: foilFrameOf(frameType) } : null
}

/** Cómo se parece el marco al de una carta de monstruo, para saber dónde está la ventana del arte. */
export type FoilFrame = 'monster' | 'pendulum' | 'spelltrap' | 'link' | 'skill'

/** El marco de una carta por su `frameType` de YGOPRODeck (`effect`, `pendulum_effect`, `spell`, `link`…). */
export function foilFrameOf(frameType: string | null | undefined): FoilFrame {
  const frame = (frameType ?? '').toLowerCase()

  if (frame.includes('pendulum')) return 'pendulum'
  if (frame === 'spell' || frame === 'trap') return 'spelltrap'
  if (frame === 'link') return 'link'
  if (frame === 'skill') return 'skill'

  return 'monster'
}
