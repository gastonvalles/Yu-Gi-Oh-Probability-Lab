import { isRecord } from './utils'
import { shuffleWithSeed, type RivalHand } from './practice-mat'

/**
 * El simulador de handtraps de «Jugar solo» (pedido de Andrés Alvarez, 2026-10-22): elegís qué handtraps tiene el rival en su deck y cuántas copias de cada una, y cuántas cartas
 * tiene en la mano; la mano se reparte al azar de esas cartas y, en la mesa, tocás cada una para decir en qué momento la usa. Es puro: el catálogo, la configuración que se
 * recuerda y el reparto (determinista con la semilla, como el de la mesa).
 */

/** Una carta del catálogo: su passcode de YGOPRODeck (de ahí sale su imagen) y su nombre tal cual lo escribe la carta. */
export interface HandtrapCard {
  id: number
  name: string
}

/** Una handtrap del deck del rival y cuántas copias tiene de ella (de 1 a `MAX_COPIES`). */
export interface HandtrapPick extends HandtrapCard {
  copies: number
}

/** Cuántas copias de una misma carta puede tener el rival: las de un deck. */
export const MAX_COPIES = 3

/** Cuántas cartas tiene la mano del rival: de 1 a 5, y 3 si no se elige otra cosa. */
export const MIN_RIVAL_HAND = 1
export const MAX_RIVAL_HAND = 5
const DEFAULT_RIVAL_HAND = 3

/**
 * Las handtraps que se ofrecen (verificadas contra YGOPRODeck el 2026-10-22). Que sean handtraps lo decide la lista de `classification-engine.ts` (`KNOWN_CARDS_MAP`, rol
 * `handtrap`): un test exige que cada una esté ahí. El passcode y el nombre bien escrito son para dibujarlas.
 */
export const HANDTRAP_CATALOG: readonly HandtrapCard[] = [
  { id: 14558127, name: 'Ash Blossom & Joyous Spring' },
  { id: 23434538, name: 'Maxx "C"' },
  { id: 97268402, name: 'Effect Veiler' },
  { id: 10045474, name: 'Infinite Impermanence' },
  { id: 59438930, name: 'Ghost Ogre & Snow Rabbit' },
  { id: 73642297, name: 'Ghost Belle & Haunted Mansion' },
  { id: 52038442, name: 'Ghost Mourner & Moonlit Chill' },
  { id: 27204311, name: 'Nibiru, the Primal Being' },
  { id: 94145022, name: 'Droll & Lock Bird' },
  { id: 38814750, name: 'PSY-Framegear Gamma' },
  { id: 24508238, name: 'D.D. Crow' },
  // La «Impulse» de Andrés: de las cinco cartas con ese nombre es la única handtrap para cualquier deck (Rescue-ACE Impulse también sale de la mano, pero es de su arquetipo).
  { id: 40366667, name: 'Dominus Impulse' },
  { id: 42141493, name: 'Mulcharmy Fuwalos' },
  { id: 84192580, name: 'Mulcharmy Purulia' },
  { id: 87126721, name: 'Mulcharmy Meowls' },
]

/**
 * Cuándo usa cada handtrap el rival del duelo automático (`handtrapPolicy`, `auto/policies.ts`), según la ventana en que la ofrece su script (CardScripts); siempre contra
 * lo tuyo, nunca contra lo suyo. Las que no están acá las tiene en la mano y no las usa (la hoja lo avisa).
 * - `respond`: el script la ofrece sólo en respuesta a lo que niega (`EVENT_CHAINING`): se usa contra tu última activación.
 * - `monster`: libre (`EVENT_FREE_CHAIN`) y niega a un monstruo: contra el efecto de un monstruo tuyo en el campo, apuntándolo (sin esto, se gastaba en tu primera Invocación).
 * - `offered`: el núcleo la ofrece sólo cuando pasó lo que la dispara (Invocaste de modo Especial, sumaste del deck a la mano, 5 Invocaciones): se usa apenas aparece.
 * - `draw`: libre y roba mientras jugás: en tu turno, a tu primera activación o Invocación.
 * - `graveyard`: contra un efecto que activás desde tu cementerio, desterrando esa carta (un efecto que no la necesita ahí, como buscar al ser enviada, la gasta igual).
 */
export type AutoRule = 'respond' | 'monster' | 'offered' | 'draw' | 'graveyard'

export const AUTO_RULES: Readonly<Record<number, AutoRule>> = {
  14558127: 'respond', // Ash Blossom & Joyous Spring
  23434538: 'draw', // Maxx "C"
  97268402: 'monster', // Effect Veiler
  10045474: 'monster', // Infinite Impermanence
  59438930: 'respond', // Ghost Ogre & Snow Rabbit
  73642297: 'respond', // Ghost Belle & Haunted Mansion
  52038442: 'offered', // Ghost Mourner & Moonlit Chill
  27204311: 'offered', // Nibiru, the Primal Being
  94145022: 'offered', // Droll & Lock Bird
  38814750: 'respond', // PSY-Framegear Gamma
  24508238: 'graveyard', // D.D. Crow
  40366667: 'respond', // Dominus Impulse
  42141493: 'draw', // Mulcharmy Fuwalos
  84192580: 'draw', // Mulcharmy Purulia
  87126721: 'draw', // Mulcharmy Meowls
}

/** PSY-Framegear Gamma Invoca a PSY-Frame Driver (de la mano, el deck o el cementerio): sin Driver en el deck, el núcleo nunca la ofrece. */
const PSY_FRAMEGEAR_GAMMA = 38814750
const PSY_FRAME_DRIVER = 49036338

/** El rival del duelo automático: las cartas de su deck además del relleno (`[passcode, copias]`, en el orden en que las prefiere) y su mano de arranque para una semilla. */
export interface AutoRival {
  main: [number, number][]
  hand: (seed: number) => number[]
}

/**
 * El rival con handtraps del duelo automático, del simulador: su deck son las copias elegidas (en el orden de la hoja, que es el de preferencia; con Gamma, también
 * PSY-Frame Driver) y su mano, la misma que repartiría el simulador manual con esa semilla (`dealRival`). `null` con el simulador apagado: el rival pasivo.
 */
export function autoRival(config: HandtrapConfig): AutoRival | null {
  if (!dealRival(config, 0)) return null
  const picks = normalizePicks(config.picks)

  return {
    main: [...picks.map((pick): [number, number] => [pick.id, pick.copies]), ...(picks.some((pick) => pick.id === PSY_FRAMEGEAR_GAMMA) ? [[PSY_FRAME_DRIVER, 1] as [number, number]] : [])],
    hand: (seed) => dealRival(config, seed)!.rival.hand.map((id) => Number(rivalCardOf(id).split('-')[1])),
  }
}

/** Lo que se recuerda del simulador: si está encendido, las handtraps del deck del rival (cada una con sus copias) y cuántas tiene en la mano. */
export interface HandtrapConfig {
  enabled: boolean
  picks: HandtrapPick[]
  hand: number
}

/** Las tres de siempre, una copia de cada una: Ash Blossom, Effect Veiler e Infinite Impermanence. */
const DEFAULT_PICKS: readonly HandtrapPick[] = [14558127, 97268402, 10045474].map((id) => ({ ...HANDTRAP_CATALOG.find((card) => card.id === id)!, copies: 1 }))

/** Apagado, con Ash Blossom, Effect Veiler e Infinite Impermanence (una copia de cada una) y 3 cartas en la mano. */
export const DEFAULT_HANDTRAP_CONFIG: HandtrapConfig = { enabled: false, picks: DEFAULT_PICKS.map((pick) => ({ ...pick })), hand: DEFAULT_RIVAL_HAND }

/** La v1 (un pool con tipos y una cantidad general) duró unas horas y no se lee; lo de la v2 sin `hand` (#532) sigue valiendo, con 3 en la mano. */
export const HANDTRAP_CONFIG_KEY = 'ygo-lab:rival-handtraps:v2'

const MAX_NAME_LENGTH = 100

/** Cuántas cartas tiene el deck del rival: la suma de las copias. */
export const poolCount = (picks: readonly HandtrapPick[]) => picks.reduce((total, pick) => total + pick.copies, 0)

/** Una mano de 1 a 5 (lo de afuera se acota; lo que no es un número, 3). */
const clampHand = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? Math.min(MAX_RIVAL_HAND, Math.max(MIN_RIVAL_HAND, Math.round(value))) : DEFAULT_RIVAL_HAND)

/** Cada passcode una vez (la primera manda) y cada uno con 1 a `MAX_COPIES` copias (lo de afuera se acota). El deck del rival no tiene tope: el de la mano es `hand`. */
function normalizePicks(picks: readonly HandtrapPick[]): HandtrapPick[] {
  return picks.flatMap((pick, index) => (picks.findIndex((other) => other.id === pick.id) === index ? [{ ...pick, copies: Math.min(MAX_COPIES, Math.max(1, Math.round(pick.copies))) }] : []))
}

/** Las handtraps guardadas que se entienden (con su passcode, su nombre y un número de copias); las que no, afuera. */
function parsePicks(value: readonly unknown[]): HandtrapPick[] {
  return normalizePicks(
    value.flatMap((entry): HandtrapPick[] => {
      if (!isRecord(entry) || !Number.isInteger(entry.id) || (entry.id as number) <= 0 || (entry.id as number) > 9_999_999_999 || typeof entry.name !== 'string' || typeof entry.copies !== 'number' || !Number.isFinite(entry.copies)) {
        return []
      }

      const name = entry.name.trim().slice(0, MAX_NAME_LENGTH)

      return name ? [{ id: entry.id as number, name, copies: entry.copies }] : []
    }),
  )
}

const defaultConfig = (): HandtrapConfig => ({ ...DEFAULT_HANDTRAP_CONFIG, picks: DEFAULT_HANDTRAP_CONFIG.picks.map((pick) => ({ ...pick })) })

/** Lo guardado, o lo de siempre si no hay o no se entiende (se revisa campo por campo: sin cartas que se entiendan, vuelven las de siempre, porque la mano lleva al menos una). */
export function readHandtrapConfig(storage: () => Storage = () => localStorage): HandtrapConfig {
  let stored: unknown = null

  try {
    stored = JSON.parse(storage().getItem(HANDTRAP_CONFIG_KEY) ?? 'null')
  } catch {
    // Sin almacenamiento o lo guardado no se entiende: vale lo de siempre.
  }

  if (!isRecord(stored) || Array.isArray(stored)) return defaultConfig()

  const picks = Array.isArray(stored.picks) ? parsePicks(stored.picks) : []

  return { enabled: stored.enabled === true, picks: picks.length > 0 ? picks : defaultConfig().picks, hand: clampHand(stored.hand) }
}

export function writeHandtrapConfig(config: HandtrapConfig, storage: () => Storage = () => localStorage): void {
  try {
    storage().setItem(HANDTRAP_CONFIG_KEY, JSON.stringify({ enabled: config.enabled, picks: config.picks.map(({ id, name, copies }) => ({ id, name, copies })), hand: config.hand }))
  } catch {
    // Sin almacenamiento (ventana privada, cuota): vale hasta recargar.
  }
}

/** Las cartas del rival llevan su propio prefijo: una Ash del rival no es la Ash de tu deck (`card-14558127-1`), aunque sea la misma carta. */
const RIVAL_PREFIX = 'rival.'

export const isRivalId = (id: string) => id.startsWith(RIVAL_PREFIX)

/** El id de la carta detrás de una del rival (`rival.card-14558127-2` → `card-14558127-2`): con él la mesa encuentra su nombre y su imagen como los de cualquier carta. */
export const rivalCardOf = (id: string) => (isRivalId(id) ? id.slice(RIVAL_PREFIX.length) : id)

const rivalId = (passcode: number, copy: number) => `${RIVAL_PREFIX}card-${passcode}-${copy}`

/** El lugar de cada carta del catálogo: el deck del rival se arma en ese orden (y después las agregadas con el buscador) antes de barajarlo, así la semilla decide sola. */
const CATALOG_ORDER = new Map(HANDTRAP_CATALOG.map((card, index) => [card.id, index]))

/**
 * La mano del rival para una mesa nueva: su deck (cada copia, una carta con su id `rival.card-<passcode>-<copia>`) barajado con la semilla, y las primeras `hand` (o todas, si
 * tiene menos); con el nombre de cada carta (la mesa y los combos lo muestran sin esperar a YGOPRODeck). La misma semilla da siempre la misma mano. `null` con el simulador apagado
 * o sin ninguna carta (la mesa queda como siempre).
 */
export function dealRival(config: HandtrapConfig, seed: number): { rival: RivalHand; names: Record<string, string> } | null {
  if (!config.enabled) return null

  const rank = (pick: HandtrapPick) => CATALOG_ORDER.get(pick.id) ?? HANDTRAP_CATALOG.length
  const deck = normalizePicks(config.picks)
    .sort((a, b) => rank(a) - rank(b))
    .flatMap((pick) => Array.from({ length: pick.copies }, (_, copy) => ({ id: rivalId(pick.id, copy + 1), name: pick.name })))
  const drawn = shuffleWithSeed(deck, seed).slice(0, clampHand(config.hand))

  return drawn.length === 0 ? null : { rival: { hand: drawn.map((card) => card.id), used: [] }, names: Object.fromEntries(drawn.map((card) => [card.id, card.name])) }
}
