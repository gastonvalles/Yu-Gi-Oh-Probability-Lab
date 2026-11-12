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

/** El medallón de la cadena de una carta: sus eslabones (1 = CL1; una carta con dos eslabones lleva dos), si la activaste vos y si alguno se activó desde la mano. */
export interface ChainBadgeData {
  numbers: number[]
  mine: boolean
  fromHand: boolean
  /** El eslabón suyo que se está resolviendo: su medallón late. */
  resolving?: number
  /** Un eslabón de la carta quedó negado o sin efecto (la insignia va tachada, con la marca roja): su estado y quién lo negó (`ChainRow.by`), si se sabe. */
  voided?: { state: 'negated' | 'disabled'; by?: number }
}

/**
 * Las cartas de la cadena que se ve (`chainFeed`), por id y del lado de la mesa donde están, con sus eslabones pendientes: armando, todos; resolviendo (del último al primero), el que
 * se resuelve (`resolving`, late) y los que esperan, también los negados (tachados); los ya resueltos se van y, terminada, no queda ninguno. Quien la dibuja la busca por id en la mesa
 * de ahora (su casilla o su pila); lo activado desde la mano va sobre esa carta de la mano o, si se fue (un costo), sobre la mano (`handLinksOf`).
 */
export function linksOf(feed: ChainFeed | null): { mine: Map<string, ChainBadgeData>; theirs: Map<string, ChainBadgeData> } {
  const links = { mine: new Map<string, ChainBadgeData>(), theirs: new Map<string, ChainBadgeData>() }

  if (!feed || feed.done) return links
  for (const row of feed.rows) {
    if (!row.card || (feed.current >= 0 && row.number - 1 > feed.current)) continue
    const resolving = row.number - 1 === feed.current ? { resolving: row.number } : {}
    const fromHand = row.from === FROM_HAND
    const seen = links[row.card.side].get(row.card.id)
    const voided = row.state === 'negated' || row.state === 'disabled' ? { voided: { state: row.state, ...(row.by ? { by: row.by } : {}) } } : {}

    if (seen) links[row.card.side].set(row.card.id, { ...seen, numbers: [...seen.numbers, row.number], fromHand: seen.fromHand || fromHand, ...voided, ...resolving })
    else links[row.card.side].set(row.card.id, { numbers: [row.number], mine: row.mine, fromHand, ...voided, ...resolving })
  }
  return links
}

/** El medallón de una pila: los eslabones de las cartas de adentro activados ahí (no los de la mano, que van sobre la mano), juntos y en orden (del color de la primera), o null. */
export const pileLinksOf = (ids: readonly string[], links: ReadonlyMap<string, ChainBadgeData> | undefined): ChainBadgeData | null =>
  merged(links?.size ? ids.flatMap((id) => links.get(id) ?? []).filter((link) => !link.fromHand) : [], false)

/** Lo activado desde la mano que ya no está en ella (`hand`: los ids de ahora; un costo la mandó a otro lado): sus medallones, juntos, van sobre la mano. */
export const handLinksOf = (links: ReadonlyMap<string, ChainBadgeData> | undefined, hand: readonly string[]): ChainBadgeData | null =>
  merged([...(links ?? [])].flatMap(([id, link]) => (link.fromHand && !hand.includes(id) ? [link] : [])), true)

/** Varios en un mismo lugar: los números juntos y en orden, del color del primero. */
function merged(found: readonly ChainBadgeData[], fromHand: boolean): ChainBadgeData | null {
  const resolving = found.find((link) => link.resolving)?.resolving
  const voided = found.find((link) => link.voided)?.voided

  return found[0] ? { numbers: found.flatMap((link) => link.numbers).sort((a, b) => a - b), mine: found[0].mine, fromHand, ...(voided ? { voided } : {}), ...(resolving ? { resolving } : {}) } : null
}

/** En una casilla del campo, sólo lo activado ahí: lo de la mano va sobre la mano. */
export const fieldLinkOf = (links: ReadonlyMap<string, ChainBadgeData> | undefined, id: string) => {
  const link = links?.get(id)

  return link && !link.fromHand ? link : null
}
