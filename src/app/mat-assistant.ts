import { EFFECT_FACT } from './card-effect-facts'
import type { MatAction } from './practice-mat'

/**
 * El asistente de la mesa, capa 2 del motor de cartas (`docs/motor-de-cartas.md`): **avisa, no decide**. Nunca frena una jugada ni la deshace: sólo dice algo que es verdad y que quien juega puede haber olvidado.
 *
 * Primer aviso: activar otra vez una carta que ya se activó, cuando tiene un efecto de una vez por turno (o por duelo) confirmado por su script y su texto (capa 1). Los hechos de la capa 1 son de la carta
 * entera, no de cada efecto, así que el aviso no dice «no podés»: dice lo que pasó y que fije que no sea el mismo efecto (una carta con dos efectos de una vez por turno puede usar uno y después el otro).
 * Lo que cuenta es lo que **se vio hacer** en esta pantalla (nunca inventa un uso que no vio); si se deshace la jugada, el uso deja de contar.
 */

/** Una activación hecha en esta mesa: la jugada (para saber si sigue en el registro), en qué turno del duelo y con qué clave se cuenta el límite. */
export interface Activation {
  action: MatAction
  turn: number
  key: string
}

export type UsageReminder = 'turn' | 'turnByName' | 'duel'

/** Los hechos de la capa 1 que tienen un límite de uso. */
export const LIMIT_FACTS = EFFECT_FACT.once | EFFECT_FACT.hardOnce | EFFECT_FACT.perDuel

/**
 * Con qué clave se cuenta el uso de una carta: por **nombre** (su número de YGOPRODeck, así una segunda copia comparte el límite) si el límite es por nombre o por duelo; si no, por **carta** (cada copia tiene el suyo).
 */
export function limitKey(facts: number, passcode: number, cardId: string): string {
  return (facts & (EFFECT_FACT.hardOnce | EFFECT_FACT.perDuel)) !== 0 ? `n:${passcode}` : `i:${cardId}`
}

/**
 * Qué decir al activar una carta con esa clave y esos hechos, dados los usos que ya se vieron (`past`, sólo los que siguen en el registro): que ya se usó en este duelo (un efecto de una vez por duelo), o
 * en este turno (de una vez por turno; «por nombre» si otra copia comparte el límite). Null si no hay nada que decir.
 */
export function usageReminder(facts: number, past: readonly Activation[], key: string, turn: number): UsageReminder | null {
  const same = past.filter((activation) => activation.key === key)

  if ((facts & EFFECT_FACT.perDuel) !== 0 && same.length > 0) return 'duel'

  if ((facts & (EFFECT_FACT.once | EFFECT_FACT.hardOnce)) !== 0 && same.some((activation) => activation.turn === turn)) {
    return (facts & EFFECT_FACT.hardOnce) !== 0 ? 'turnByName' : 'turn'
  }

  return null
}
