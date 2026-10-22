import { isRecord } from './utils'
import type { RivalHand } from './practice-mat'

/**
 * El simulador de handtraps de «Jugar solo» (pedido de Andrés Alvarez, 2026-10-22): elegís qué handtraps tiene el rival en la mano y cuántas copias de cada una y, en la mesa,
 * tocás cada una para decir en qué momento la usa. Es puro: el catálogo, la configuración que se recuerda y la mano que se reparte (sin sorteo: la que se eligió).
 */

/** Una carta del catálogo: su passcode de YGOPRODeck (de ahí sale su imagen) y su nombre tal cual lo escribe la carta. */
export interface HandtrapCard {
  id: number
  name: string
}

/** Una handtrap de la mano del rival y cuántas copias tiene de ella (de 1 a `MAX_COPIES`). */
export interface HandtrapPick extends HandtrapCard {
  copies: number
}

/** Cuántas copias de una misma carta puede tener la mano del rival: las de un deck. */
export const MAX_COPIES = 3

/** Cuántas handtraps puede tener la mano del rival en total: las que entran en la franja de la mesa. */
export const MAX_RIVAL_HAND = 6

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

/** Lo que se recuerda del simulador: si está encendido y la mano del rival (sólo las cartas con al menos una copia). */
export interface HandtrapConfig {
  enabled: boolean
  picks: HandtrapPick[]
}

/** Las tres de siempre, una copia de cada una: Ash Blossom, Effect Veiler e Infinite Impermanence. */
const DEFAULT_PICKS: readonly HandtrapPick[] = [14558127, 97268402, 10045474].map((id) => ({ ...HANDTRAP_CATALOG.find((card) => card.id === id)!, copies: 1 }))

/** Apagado, con Ash Blossom, Effect Veiler e Infinite Impermanence, una copia de cada una. */
export const DEFAULT_HANDTRAP_CONFIG: HandtrapConfig = { enabled: false, picks: DEFAULT_PICKS.map((pick) => ({ ...pick })) }

/** La v1 (un pool con tipos y una cantidad general) duró unas horas: no se lee. */
export const HANDTRAP_CONFIG_KEY = 'ygo-lab:rival-handtraps:v2'

const MAX_NAME_LENGTH = 100

/** Cuántas cartas tiene la mano: la suma de las copias. */
export const handCount = (picks: readonly HandtrapPick[]) => picks.reduce((total, pick) => total + pick.copies, 0)

/**
 * La mano tal como se puede tener: cada passcode una vez (la primera manda), cada una con 1 a `MAX_COPIES` copias (lo de afuera se acota) y, en total, no más de `MAX_RIVAL_HAND`
 * (lo que sobra se recorta: las últimas pierden copias o se quedan afuera).
 */
function capPicks(picks: readonly HandtrapPick[]): HandtrapPick[] {
  const capped: HandtrapPick[] = []
  let total = 0

  for (const pick of picks) {
    if (capped.some((other) => other.id === pick.id)) continue

    const copies = Math.min(MAX_COPIES, Math.max(1, Math.round(pick.copies)), MAX_RIVAL_HAND - total)

    if (copies < 1) break

    capped.push({ ...pick, copies })
    total += copies
  }

  return capped
}

/** Las handtraps guardadas que se entienden (con su passcode, su nombre y un número de copias); las que no, afuera. */
function parsePicks(value: readonly unknown[]): HandtrapPick[] {
  return capPicks(
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

/**
 * Lo guardado, o lo de siempre si no hay o no se entiende (se revisa campo por campo). Una mano guardada vacía es una mano vacía (el rival no tiene ninguna); una con cartas que no
 * se entienden, o sin la lista, vuelve a la de siempre.
 */
export function readHandtrapConfig(storage: () => Storage = () => localStorage): HandtrapConfig {
  let stored: unknown = null

  try {
    stored = JSON.parse(storage().getItem(HANDTRAP_CONFIG_KEY) ?? 'null')
  } catch {
    // Sin almacenamiento o lo guardado no se entiende: vale lo de siempre.
  }

  if (!isRecord(stored) || Array.isArray(stored)) return defaultConfig()

  const list = Array.isArray(stored.picks) ? stored.picks : null
  const picks = list ? parsePicks(list) : []

  return { enabled: stored.enabled === true, picks: list && (list.length === 0 || picks.length > 0) ? picks : defaultConfig().picks }
}

export function writeHandtrapConfig(config: HandtrapConfig, storage: () => Storage = () => localStorage): void {
  try {
    storage().setItem(HANDTRAP_CONFIG_KEY, JSON.stringify({ enabled: config.enabled, picks: config.picks.map(({ id, name, copies }) => ({ id, name, copies })) }))
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

/** El lugar de cada carta del catálogo: la mano sale en ese orden y, después, las que se agregaron con el buscador. */
const CATALOG_ORDER = new Map(HANDTRAP_CATALOG.map((card, index) => [card.id, index]))

/**
 * La mano del rival para una mesa nueva, sin sorteo: cada handtrap con sus copias (`rival.card-<passcode>-<copia>`), en el orden del catálogo y después las agregadas, y el nombre de
 * cada carta (la mesa y los combos lo muestran sin esperar a YGOPRODeck). `null` con el simulador apagado o sin ninguna elegida (la mesa queda como siempre).
 */
export function dealRival(config: HandtrapConfig): { rival: RivalHand; names: Record<string, string> } | null {
  if (!config.enabled) return null

  const rank = (pick: HandtrapPick) => CATALOG_ORDER.get(pick.id) ?? HANDTRAP_CATALOG.length
  const ordered = capPicks(config.picks).sort((a, b) => rank(a) - rank(b))
  const hand = ordered.flatMap((pick) => Array.from({ length: pick.copies }, (_, copy) => rivalId(pick.id, copy + 1)))
  const names = Object.fromEntries(ordered.flatMap((pick) => Array.from({ length: pick.copies }, (_, copy) => [rivalId(pick.id, copy + 1), pick.name] as const)))

  return hand.length === 0 ? null : { rival: { hand, used: [] }, names }
}
