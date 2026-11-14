import type { ArrivalTone } from './field-impact'
import type { LandingTone } from './mat-effects'
import { TOKEN_KIND, type MatCardKind } from './practice-mat'

/**
 * La invocación como en Master Duel: de qué tipo es una llegada al campo (el color de su anillo, `arriveAt`) y, si sale del Extra Deck o es un Ritual, la entrada larga con los tiempos
 * de Master Duel por tipo. Puro: lo usan la mesa, el replay y el video. Lo vigila `summon-entrance.test.ts`.
 */

/** Lo que se sabe de la carta que llega: su clase y si es un monstruo Ritual. */
export interface SummonCard {
  kind: MatCardKind
  ritual: boolean
}

/** Una carta de la que no se sabe el marco (el video, el replay sin la carta): sale con el tipo que dice la jugada. */
export const UNKNOWN_SUMMON: SummonCard = { kind: TOKEN_KIND, ritual: false }

/** Una carta de Nivel 5 o más que sale de la mano con una Invocación Normal pidió Sacrificios (el núcleo no manda la jugada de Sacrificio aparte: la deduce la mesa). */
const TRIBUTE_LEVEL = 5

/**
 * El tipo de la llegada de una jugada de la mesa (`matEffects`): Fusión, Sincronía, Xyz y Enlace son el suyo; un Ritual que sale de la mano con una Invocación Especial, Ritual; por
 * Sacrificio (la jugada, o una Normal de Nivel 5 o más desde la mano), rojo; lo demás, Normal o Especial.
 */
export function landingToneOf(landing: { tone: LandingTone; tribute?: true; hand?: true }, card: SummonCard): ArrivalTone {
  const { tone, tribute, hand } = landing
  if (tone !== 'normal' && tone !== 'special') return tone
  if (tone === 'special' && hand && card.ritual) return 'ritual'
  if (tribute || (tone === 'normal' && hand && (card.kind.level ?? 0) >= TRIBUTE_LEVEL)) return 'tribute'
  return 'special'
}

/** El tipo de lo que llegó al campo del rival (la mesa sólo ve su campo cambiar, `arrivals`): del Extra Deck, el de su marco; un Ritual que sale de su mano, Ritual; lo demás, Especial. */
export function arrivalToneOf(arrived: { from: 'extra' | 'other'; hand?: true }, card: SummonCard): ArrivalTone {
  const { kind } = card
  if (arrived.from === 'extra') return kind.link ? 'link' : kind.xyz ? 'xyz' : kind.synchro ? 'synchro' : kind.fusion ? 'fusion' : 'special'
  return arrived.hand && card.ritual ? 'ritual' : 'special'
}
