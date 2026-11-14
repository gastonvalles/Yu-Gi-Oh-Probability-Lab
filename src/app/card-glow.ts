import type { ChainFeed } from './auto/chain-feed'
import type { GlowKind } from '../types'

/**
 * El brillo de una carta en un duelo, igual en todas las mesas (Gastón, 2026-10-25: «el color indicativo es un celeste/blanco tenue al rededor de la carta, el amarillo es para cuando se activan o
 * resuelven efectos»): `can`, con esta carta podés hacer algo ahora (activarla, invocarla de forma especial, atacar, elegirla); `act`, su efecto se está activando o resolviendo. Si es las dos cosas, gana `act`.
 * Un color por pregunta y una forma por verbo: lo que puede atacar es `can` y suma la espada (`AttackMark`); `act`, la luz que gira y la insignia CL. Sin brillo: la mesa manual, los replays y lo oculto del rival.
 * `aim`: tu monstruo que ataca mientras elegís a quién, con el aro quieto en el rojo del ataque (el del rayo y la mira; el celeste ya es «podés»).
 */
export type DuelGlow = Extract<GlowKind, 'can' | 'act' | 'aim'>

export interface GlowSets {
  can?: ReadonlySet<string> | undefined
  act?: ReadonlySet<string> | undefined
  /** El id de tu monstruo que ataca, mientras elegís a quién. */
  aim?: string | undefined
}

export const glowOf = (id: string, { can, act, aim }: GlowSets): DuelGlow | null => (act?.has(id) ? 'act' : aim === id ? 'aim' : can?.has(id) ? 'can' : null)

/** Una pila (el Cementerio, el Destierro, el Extra, el Deck) brilla como la carta de adentro que más dice: ámbar si una se activa; si no, celeste si una puede actuar. */
export const pileGlowOf = (ids: readonly string[], sets: GlowSets): DuelGlow | null =>
  ids.reduce<DuelGlow | null>((best, id) => (best === 'act' ? best : (glowOf(id, sets) ?? best)), null)

/** Las cartas de la cadena que se están activando o resolviendo (`chained` o `solving`), de cada lado, tal como la cuenta el aviso paso a paso (`chainFeed`), no como quedó. */
export function actingOf(feed: ChainFeed | null): { mine: Set<string>; theirs: Set<string> } {
  const acting = { mine: new Set<string>(), theirs: new Set<string>() }

  for (const row of feed?.rows ?? []) if (row.card && (row.state === 'chained' || row.state === 'solving')) acting[row.card.side].add(row.card.id)
  return acting
}

/** `LOCATION.HAND` del núcleo (`auto/protocol.ts`; el test los compara): copiado para que la mesa de práctica, que importa este módulo, no cargue el protocolo. */
export const FROM_HAND = 2

/** Los eslabones de una carta de la cadena, para su nombre (`chainLinkLabel`) y su arte gris si quedó negada: sus números, si la activaste vos y si alguno se activó desde la mano. */
export interface ChainBadgeData {
  numbers: number[]
  mine: boolean
  fromHand: boolean
  /** Un eslabón de la carta quedó negado o sin efecto (su carta se ve gris): su estado y quién lo negó (`ChainRow.by`), si se sabe. */
  voided?: { state: 'negated' | 'disabled'; by?: number }
}

/**
 * Las cartas de la cadena que se ve (`chainFeed`), por id y del lado de la mesa donde están, con sus eslabones pendientes (para su nombre y el gris de la negada): armando, todos;
 * resolviendo (del último al primero), el que se resuelve y los que esperan; los ya resueltos se van y, terminada, no queda ninguno. Los medallones, en cambio, van por lugar (`medalsOf`).
 */
export function linksOf(feed: ChainFeed | null): { mine: Map<string, ChainBadgeData>; theirs: Map<string, ChainBadgeData> } {
  const links = { mine: new Map<string, ChainBadgeData>(), theirs: new Map<string, ChainBadgeData>() }

  if (!feed || feed.done) return links
  for (const row of feed.rows) {
    if (!row.card || (feed.current >= 0 && row.number - 1 > feed.current)) continue
    const fromHand = row.from === FROM_HAND
    const seen = links[row.card.side].get(row.card.id)
    const voided = row.state === 'negated' || row.state === 'disabled' ? { voided: { state: row.state, ...(row.by ? { by: row.by } : {}) } } : {}

    if (seen) links[row.card.side].set(row.card.id, { ...seen, numbers: [...seen.numbers, row.number], fromHand: seen.fromHand || fromHand, ...voided })
    else links[row.card.side].set(row.card.id, { numbers: [row.number], mine: row.mine, fromHand, ...voided })
  }
  return links
}

/** Los eslabones de una pila, para su nombre y el gris: los de las cartas de adentro, juntos y en orden (del color de la primera), o null si no hay ninguna en la cadena. */
export function pileLinksOf(ids: readonly string[], links: ReadonlyMap<string, ChainBadgeData> | undefined): ChainBadgeData | null {
  const found = links?.size ? ids.flatMap((id) => links.get(id) ?? []) : []
  const voided = found.find((link) => link.voided)?.voided

  return found[0] ? { numbers: found.flatMap((link) => link.numbers).sort((a, b) => a - b), mine: found[0].mine, fromHand: found.some((link) => link.fromHand), ...(voided ? { voided } : {}) } : null
}

/** Un medallón de la cadena: su eslabón, de quién es, si quedó negado o sin efecto (se tacha) y si es el que se resuelve (late). */
export interface ChainMedal {
  number: number
  mine: boolean
  voided: boolean
  resolving: boolean
}

/**
 * Los tres gestos de la cadena, medidos en Master Duel (ms; las animaciones `chain-*` de `index.css` los usan y un test los compara, el video los importa): la marca que espera late
 * (`wait`, el `pulse` de 1 a 0,5); la que resuelve crece 0,75 → 0,87 → 1 (`resolve`) con un brillo que sube en `glint`; la negada parpadea cuatro veces (`void`) tras un destello (`flash`).
 */
export const CHAIN_BEAT_MS = { wait: 1333, resolve: 517, glint: 100, void: 450, flash: 50 } as const

/** `LOCATION` del núcleo (`auto/protocol.ts`; el test los compara), copiados como `FROM_HAND`: la pila o la mano de cada lugar. */
export const MEDAL_PILES: Readonly<Record<number, string>> = { 1: 'deck', 2: 'hand', 16: 'gy', 32: 'banished', 64: 'extra' }
const MZONE = 4
const SZONE = 8
const OVERLAY = 128

/**
 * El lugar de la mesa donde va el medallón de un eslabón, con las claves de las casillas (`mz:0`, `emz:1`, `st:2`, `field`) y de las pilas (`gy`, `banished`, `deck`, `extra`, `hand`):
 * Monstruos 0–4 y Extra 5–6; Mágicas y Trampas 0–4, Campo 5 y las escalas de Péndulo (6 y 7) en las puntas; un material, sobre su monstruo.
 */
export function medalPlaceOf(location: number, sequence: number): string | null {
  const base = location & ~OVERLAY

  if (base === MZONE) return sequence < 5 ? `mz:${sequence}` : sequence < 7 ? `emz:${sequence - 5}` : null
  if (base === SZONE) return sequence < 5 ? `st:${sequence}` : sequence === 5 ? 'field' : sequence === 6 ? 'st:0' : sequence === 7 ? 'st:4' : null
  return MEDAL_PILES[base] ?? null
}

/**
 * Los medallones de la cadena al resolverse (Gastón: «se pone el número de eslabón de cadena en el lugar donde está activando el efecto de la carta»), de cada lado y por lugar
 * (`medalPlaceOf`): se quedan donde se activó cada eslabón aunque la carta se mueva (la casilla, aunque quede vacía; la pila; la mano). Sólo al resolver: mientras se arma lo dice la
 * escena. Del último al primero: el que se resuelve late y los resueltos se van; terminada, ninguno. Varios en un mismo lugar, en orden.
 */
export function medalsOf(feed: ChainFeed | null): { mine: Map<string, ChainMedal[]>; theirs: Map<string, ChainMedal[]> } {
  const medals = { mine: new Map<string, ChainMedal[]>(), theirs: new Map<string, ChainMedal[]>() }

  if (!feed || feed.done || !feed.resolving) return medals
  for (const row of feed.rows) {
    if (feed.current >= 0 && row.number - 1 > feed.current) continue
    const at = row.place ? medalPlaceOf(row.place.location, row.place.sequence) : null

    if (!row.place || !at) continue
    const side = medals[row.place.side]

    side.set(at, [...(side.get(at) ?? []), { number: row.number, mine: row.mine, voided: row.state === 'negated' || row.state === 'disabled', resolving: row.number - 1 === feed.current }])
  }
  return medals
}
