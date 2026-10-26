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
