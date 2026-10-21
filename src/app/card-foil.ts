/**
 * El efecto de brillo que simula la rareza real de una carta impresa (Gastón, 2026-10-19, con una referencia de ygopocket.com: «la carta tiene efectos visuales que simulan rareza real de las cartas»; 2026-10-20: «las rarezas
 * de las cartas tienen bordes mal, varias son muy similares entre sí»). Sólo se decide qué efecto lleva cada rareza y dónde cae la ventana del arte en cada marco; cómo se ve lo dibuja `RarityFoil` con CSS (`foil.css`).
 *
 * Las rarezas son los nombres de TCGplayer (`ArtPrinting.rarity`: 33 distintos en los datos). Una rareza que no se conoce no lleva efecto: nunca se inventa uno.
 */

/**
 * Dieciocho efectos, cada uno con algo que lo distingue a simple vista de los demás:
 * - `rare`: sólo el nombre plateado (y un destello suave): el arte queda como está, como en una Rare de verdad.
 * - `super`: el arte con una hoja holográfica de arcoíris.
 * - `ultra`: el nombre dorado, el arte holográfico más intenso y rayitas finas horizontales.
 * - `secret`: rayas finas en diagonal sobre un arcoíris pálido, polvo plateado y el nombre de arcoíris.
 * - `ultimate`: relieve: un brillo duro que cruza el arte, con el nombre y el borde dorados y blancos.
 * - `platinum`: todo en plata cromada (Platinum Rare y Platinum Secret Rare).
 * - `gold`: la carta bañada en oro, con el nombre y el borde dorados (Gold, Gold Secret, Premium Gold, Ghost/Gold).
 * - `ghost`: el arte se va a un blanco nacarado, con menos color y un resplandor.
 * - `starfoil`: estrellitas de colores que se mueven con la luz.
 * - `shatterfoil`: vidrio roto en toda la carta, con facetas y bordes que destellan.
 * - `mosaic`: baldosas de colores en el arte, que cambian de tono con la luz.
 * - `collector`: una trama fina cruzada (grabada) en toda la carta, con un arcoíris suave.
 * - `prismatic`: cuadraditos de arcoíris, polvo brillante y el borde de arcoíris.
 * - `quarter`: toda la carta con diagonales de arcoíris, polvo, y el nombre y el borde de arcoíris.
 * - `parallel`: franjas anchas en diagonal que cruzan toda la carta (Parallel Rare y las Duel Terminal).
 * - `pharaoh`: jeroglíficos dorados sobre el arte y todo en oro.
 * - `grand`: el marco dorado grueso y un holo intenso (Grand Master Rare).
 * - `starlight`: lo más fuerte: holo en toda la carta, estrellas y polvo que centellean, y el borde de arcoíris.
 */
export type FoilKind =
  | 'rare'
  | 'super'
  | 'ultra'
  | 'secret'
  | 'ultimate'
  | 'platinum'
  | 'gold'
  | 'ghost'
  | 'starfoil'
  | 'shatterfoil'
  | 'mosaic'
  | 'collector'
  | 'prismatic'
  | 'quarter'
  | 'parallel'
  | 'pharaoh'
  | 'grand'
  | 'starlight'

/** Todos los efectos, en el orden de la lista de arriba (el catálogo de `/playground` los muestra sin que nadie tenga que anotarlos). */
export const FOIL_KINDS: readonly FoilKind[] = ['rare', 'super', 'ultra', 'secret', 'ultimate', 'platinum', 'gold', 'ghost', 'starfoil', 'shatterfoil', 'mosaic', 'collector', 'prismatic', 'quarter', 'parallel', 'pharaoh', 'grand', 'starlight']

/**
 * Las rarezas, de la más específica a la más general: gana la primera que calza (el orden importa: «Platinum Secret» es platinum y no secret, «Gold Secret» es gold, «Duel Terminal Ultra Parallel» es parallel y no ultra).
 * Las que no calzan con ninguna (Common, Promo…) no llevan efecto. El apóstrofo de «Pharaoh’s» es el tipográfico de TCGplayer.
 */
const FOIL_RULES: ReadonlyArray<[pattern: RegExp, kind: FoilKind]> = [
  [/starlight/, 'starlight'],
  [/grand master/, 'grand'],
  [/pharaoh/, 'pharaoh'],
  [/quarter century/, 'quarter'],
  [/prismatic/, 'prismatic'],
  [/platinum/, 'platinum'],
  [/gold/, 'gold'],
  [/ghost/, 'ghost'],
  [/starfoil/, 'starfoil'],
  [/shatterfoil/, 'shatterfoil'],
  [/mosaic/, 'mosaic'],
  [/collector/, 'collector'],
  [/parallel/, 'parallel'],
  [/technology/, 'ultra'],
  [/ultimate/, 'ultimate'],
  [/secret/, 'secret'],
  [/ultra/, 'ultra'],
  [/super/, 'super'],
  [/^rare$/, 'rare'],
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

/** El brillo de una carta con esa rareza, ese marco (`frameType`) y esa variante de arte, o null si la rareza no lleva efecto o no se conoce. */
export function foilOf(rarity: string | null | undefined, frameType: string | null | undefined, variant?: string | null): CardFoil | null {
  const kind = foilKindOf(rarity)

  return kind ? { kind, frame: foilFrameOf(frameType, variant) } : null
}

/** Cómo se parece el marco al de una carta de monstruo, para saber dónde está la ventana del arte; `full` es el arte que se extiende sobre toda la carta (no hay ventana). */
export type FoilFrame = 'monster' | 'pendulum' | 'spelltrap' | 'link' | 'skill' | 'full'

/** Las variantes de arte que cubren toda la carta (`ArtPrinting.variant`): el brillo no puede quedarse en la ventana de siempre. */
const FULL_ART = /extended|overframe|full[ -]?art|oversize/i

/** El marco de una carta por su `frameType` de YGOPRODeck (`effect`, `pendulum_effect`, `spell`, `link`…) y la variante de arte de la impresión. */
export function foilFrameOf(frameType: string | null | undefined, variant?: string | null): FoilFrame {
  if (FULL_ART.test(variant ?? '')) return 'full'

  const frame = (frameType ?? '').toLowerCase()

  if (frame.includes('pendulum')) return 'pendulum'
  if (frame === 'spell' || frame === 'trap') return 'spelltrap'
  if (frame === 'link') return 'link'
  if (frame === 'skill') return 'skill'

  return 'monster'
}
