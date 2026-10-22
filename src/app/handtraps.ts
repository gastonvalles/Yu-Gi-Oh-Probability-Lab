import { isRecord } from './utils'
import { shuffleWithSeed, type RivalHand } from './practice-mat'

/**
 * El simulador de handtraps de «Jugar solo» (pedido de Andrés Alvarez, 2026-10-22): el rival roba unas handtraps de un pool que elegís vos y, en la mesa, tocás cada una
 * para decir en qué momento la usa. Es puro: el catálogo, la configuración que se recuerda y el reparto (determinista con la semilla, como el de la mesa).
 */

/**
 * Cuántas copias de una handtrap hay en el deck del rival: `repeatable` (3: sin «sólo una vez por turno» con su nombre se pueden robar y usar varias, como Effect Veiler),
 * `single` (1: con esa cláusula una segunda copia no sirve en el mismo turno, como Ash Blossom) y `charmy` (1 por nombre, y entre todas las Mulcharmy la mano del rival
 * no tiene más de `MAX_CHARMIES`: su texto deja activar «1 other "Mulcharmy" monster effect» en el turno).
 */
export type HandtrapKind = 'repeatable' | 'single' | 'charmy'

export const HANDTRAP_KINDS: readonly HandtrapKind[] = ['repeatable', 'single', 'charmy']

const COPIES: Record<HandtrapKind, number> = { repeatable: 3, single: 1, charmy: 1 }

/** Entre todas las Charmies, cuántas puede tener juntas la mano del rival. */
const MAX_CHARMIES = 2

/** Cuántas handtraps puede tener el rival en la mano: de 1 a 6, y 3 si no se elige otra cosa. */
export const RIVAL_COUNT_RANGE = { min: 1, max: 6 } as const
const DEFAULT_COUNT = 3

/** Una handtrap del pool: su passcode de YGOPRODeck (de ahí sale su imagen), su nombre tal cual lo escribe la carta y cuántas copias tiene el rival. */
export interface HandtrapPick {
  id: number
  name: string
  kind: HandtrapKind
}

/**
 * Las handtraps que se ofrecen, con el tipo que dice su texto (verificado contra YGOPRODeck el 2026-10-22). Que sean handtraps lo decide la lista de `classification-engine.ts`
 * (`KNOWN_CARDS_MAP`, rol `handtrap`): un test exige que cada una esté ahí. Andrés las pidió por su rol; el passcode y el nombre bien escrito son para dibujarlas.
 */
export const HANDTRAP_CATALOG: readonly HandtrapPick[] = [
  { id: 14558127, name: 'Ash Blossom & Joyous Spring', kind: 'single' },
  { id: 23434538, name: 'Maxx "C"', kind: 'single' },
  { id: 97268402, name: 'Effect Veiler', kind: 'repeatable' },
  { id: 10045474, name: 'Infinite Impermanence', kind: 'repeatable' },
  { id: 59438930, name: 'Ghost Ogre & Snow Rabbit', kind: 'single' },
  { id: 73642297, name: 'Ghost Belle & Haunted Mansion', kind: 'single' },
  { id: 52038442, name: 'Ghost Mourner & Moonlit Chill', kind: 'single' },
  { id: 27204311, name: 'Nibiru, the Primal Being', kind: 'single' },
  // Ni Droll ni Gamma dicen «sólo una vez por turno» con su nombre: repetibles, como manda la regla del texto.
  { id: 94145022, name: 'Droll & Lock Bird', kind: 'repeatable' },
  { id: 38814750, name: 'PSY-Framegear Gamma', kind: 'repeatable' },
  { id: 24508238, name: 'D.D. Crow', kind: 'repeatable' },
  // La «Impulse» de Andrés: de las cinco cartas con ese nombre es la única handtrap para cualquier deck (Rescue-ACE Impulse también sale de la mano, pero es de su arquetipo).
  { id: 40366667, name: 'Dominus Impulse', kind: 'single' },
  { id: 42141493, name: 'Mulcharmy Fuwalos', kind: 'charmy' },
  { id: 84192580, name: 'Mulcharmy Purulia', kind: 'charmy' },
  { id: 87126721, name: 'Mulcharmy Meowls', kind: 'charmy' },
]

/** Lo que se recuerda del simulador: si está encendido, el pool y cuántas tiene el rival en la mano. */
export interface HandtrapConfig {
  enabled: boolean
  picks: HandtrapPick[]
  count: number
}

/** Apagado, con todo el catálogo en el pool y 3 en la mano. */
export const DEFAULT_HANDTRAP_CONFIG: HandtrapConfig = { enabled: false, picks: HANDTRAP_CATALOG.map((pick) => ({ ...pick })), count: DEFAULT_COUNT }

export const HANDTRAP_CONFIG_KEY = 'ygo-lab:rival-handtraps:v1'

/** El pool más largo que se acepta de lo guardado (el catálogo y unas cuantas agregadas a mano). */
const MAX_PICKS = 60
const MAX_NAME_LENGTH = 100

const isKind = (value: unknown): value is HandtrapKind => (HANDTRAP_KINDS as readonly unknown[]).includes(value)
const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= RIVAL_COUNT_RANGE.min && value <= RIVAL_COUNT_RANGE.max

/** Las handtraps guardadas que se entienden, cada passcode una vez (la primera manda). */
function parsePicks(value: unknown): HandtrapPick[] {
  if (!Array.isArray(value)) return []

  const picks = new Map<number, HandtrapPick>()

  for (const entry of value.slice(0, MAX_PICKS)) {
    if (!isRecord(entry) || !Number.isInteger(entry.id) || (entry.id as number) <= 0 || (entry.id as number) > 9_999_999_999 || !isKind(entry.kind) || typeof entry.name !== 'string') continue

    const name = entry.name.trim().slice(0, MAX_NAME_LENGTH)
    const id = entry.id as number

    if (name && !picks.has(id)) picks.set(id, { id, name, kind: entry.kind })
  }

  return [...picks.values()]
}

/** Lo guardado, o lo de siempre si no hay o no se entiende (se revisa campo por campo: un pool vacío o roto vuelve al catálogo). */
export function readHandtrapConfig(storage: () => Storage = () => localStorage): HandtrapConfig {
  let stored: unknown = null

  try {
    stored = JSON.parse(storage().getItem(HANDTRAP_CONFIG_KEY) ?? 'null')
  } catch {
    // Sin almacenamiento o lo guardado no se entiende: vale lo de siempre.
  }

  if (!isRecord(stored) || Array.isArray(stored)) return { ...DEFAULT_HANDTRAP_CONFIG, picks: DEFAULT_HANDTRAP_CONFIG.picks.map((pick) => ({ ...pick })) }

  const picks = parsePicks(stored.picks)

  return {
    enabled: stored.enabled === true,
    picks: picks.length > 0 ? picks : DEFAULT_HANDTRAP_CONFIG.picks.map((pick) => ({ ...pick })),
    count: isCount(stored.count) ? stored.count : DEFAULT_COUNT,
  }
}

export function writeHandtrapConfig(config: HandtrapConfig, storage: () => Storage = () => localStorage): void {
  try {
    storage().setItem(HANDTRAP_CONFIG_KEY, JSON.stringify({ enabled: config.enabled, picks: config.picks.map(({ id, name, kind }) => ({ id, name, kind })), count: config.count }))
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

/** Cuántas handtraps puede tener como mucho la mano del rival con ese pool: todas las copias, con las Charmies topeadas. */
export function maxRivalHand(picks: readonly HandtrapPick[]): number {
  const charmies = picks.filter((pick) => pick.kind === 'charmy').length

  return picks.reduce((total, pick) => total + (pick.kind === 'charmy' ? 0 : COPIES[pick.kind]), 0) + Math.min(charmies, MAX_CHARMIES)
}

export interface RivalDeal {
  /** Las handtraps que robó el rival (`rival.card-…`), en el orden en que salieron. */
  hand: string[]
  /** El nombre de cada una (la mesa y los combos lo muestran sin esperar a YGOPRODeck). */
  names: Record<string, string>
  /** Cuántas se pidieron y cuántas permite el pool: si no alcanza, la mano sale más corta. */
  requested: number
  possible: number
}

/**
 * El reparto: el deck del rival (3 copias de cada repetible, 1 de cada única y 1 de cada Charmy) barajado con la semilla, y las primeras `count` sin reposición,
 * salteando una Charmy si ya hay `MAX_CHARMIES` en la mano. La misma semilla da siempre la misma mano.
 */
export function dealRivalHand(picks: readonly HandtrapPick[], count: number, seed: number): RivalDeal {
  // Cada passcode una vez (la primera manda, como al leer lo guardado): dos cartas con el mismo id romperían la mesa.
  const pool = picks.filter((pick, index) => picks.findIndex((other) => other.id === pick.id) === index)
  const deck = pool.flatMap((pick) => Array.from({ length: COPIES[pick.kind] }, (_, copy) => ({ id: rivalId(pick.id, copy + 1), pick })))
  const hand: string[] = []
  const names: Record<string, string> = {}
  let charmies = 0

  for (const { id, pick } of shuffleWithSeed(deck, seed)) {
    if (hand.length >= count) break
    if (pick.kind === 'charmy' && charmies >= MAX_CHARMIES) continue

    if (pick.kind === 'charmy') charmies += 1
    hand.push(id)
    names[id] = pick.name
  }

  return { hand, names, requested: count, possible: maxRivalHand(pool) }
}

/** La mano del rival para una mesa nueva, y el nombre de cada carta: `null` con el simulador apagado o sin nada que repartir (la mesa queda como siempre). */
export function dealRival(config: HandtrapConfig, seed: number): { rival: RivalHand; names: Record<string, string> } | null {
  if (!config.enabled) return null

  const { hand, names } = dealRivalHand(config.picks, config.count, seed)

  return hand.length === 0 ? null : { rival: { hand, used: [] }, names }
}
