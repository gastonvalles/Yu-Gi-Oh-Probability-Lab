import type { ChainFeed } from './auto/chain-feed'
import type { GlowKind } from '../types'

/**
 * El brillo de una carta en un duelo, igual en todas las mesas (Gastón, 2026-10-25: «el color indicativo es un celeste/blanco tenue al rededor de la carta, el amarillo es para cuando se activan o
 * resuelven efectos»): `can`, con esta carta podés hacer algo ahora (activarla, invocarla de forma especial, elegirla); `act`, su efecto se está activando o resolviendo. Si es las dos cosas, gana `act`.
 */
export type DuelGlow = Extract<GlowKind, 'can' | 'act'>

export interface GlowSets {
  can?: ReadonlySet<string> | undefined
  act?: ReadonlySet<string> | undefined
}

export const glowOf = (id: string, { can, act }: GlowSets): DuelGlow | null => (act?.has(id) ? 'act' : can?.has(id) ? 'can' : null)

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

/** La insignia de la cadena de una carta: sus eslabones (CL1 = 1; una carta con dos eslabones, «CL1·3»), si la activaste vos y si alguno se activó desde la mano. */
export interface ChainBadgeData {
  numbers: number[]
  mine: boolean
  fromHand: boolean
  /** Un eslabón de la carta quedó negado o sin efecto (la insignia va tachada, con la marca roja): su estado y quién lo negó (`ChainRow.by`), si se sabe. */
  voided?: { state: 'negated' | 'disabled'; by?: number }
}

/**
 * Las cartas de la cadena que se ve (`chainFeed`), por id y del lado de la mesa donde están, con sus eslabones: todos, también los ya resueltos o negados, mientras la cadena esté a la
 * vista. Quien la dibuja la busca por id en la mesa de ahora, así la insignia sigue a la carta si cambia de lugar (una carta descartada como costo pasa a la pila del Cementerio).
 */
export function linksOf(feed: ChainFeed | null): { mine: Map<string, ChainBadgeData>; theirs: Map<string, ChainBadgeData> } {
  const links = { mine: new Map<string, ChainBadgeData>(), theirs: new Map<string, ChainBadgeData>() }

  for (const row of feed?.rows ?? []) {
    if (!row.card) continue
    const fromHand = row.from === FROM_HAND
    const seen = links[row.card.side].get(row.card.id)
    const voided = row.state === 'negated' || row.state === 'disabled' ? { voided: { state: row.state, ...(row.by ? { by: row.by } : {}) } } : {}

    if (seen) links[row.card.side].set(row.card.id, { ...seen, numbers: [...seen.numbers, row.number], fromHand: seen.fromHand || fromHand, ...voided })
    else links[row.card.side].set(row.card.id, { numbers: [row.number], mine: row.mine, fromHand, ...voided })
  }
  return links
}

/** La insignia de una pila: los eslabones de las cartas de adentro, juntos y en orden (del color de la primera), o null si no hay ninguna en la cadena. */
export function pileLinksOf(ids: readonly string[], links: ReadonlyMap<string, ChainBadgeData> | undefined): ChainBadgeData | null {
  const found = links?.size ? ids.flatMap((id) => links.get(id) ?? []) : []

  const voided = found.find((link) => link.voided)?.voided

  return found[0] ? { numbers: found.flatMap((link) => link.numbers).sort((a, b) => a - b), mine: found[0].mine, fromHand: found.some((link) => link.fromHand), ...(voided ? { voided } : {}) } : null
}
