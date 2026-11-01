import { LINK_RULES, ruleOf } from '../policies'
import type { BotView } from './bot'
import type { CardFacts } from './turn'

/**
 * Cuándo gasta el bot una interrupción contra tu eslabón, en tu turno (las handtraps de `handtrapDecide` y las respuestas de cada ejecutor). Sólo con lo público: tu eslabón, lo
 * impreso de la carta (`facts`) y el historial; de lo suyo, su mano y su campo.
 * - Con dos o más interrupciones distintas (las que contestan a un eslabón: las handtraps de la mano con regla de eslabón y las `responders` del mazo en su campo; una ya usada
 *   este turno no cuenta, y dos copias cuentan una: casi todas son una vez por turno), la usa: le queda otra.
 * - Con la última, puntúa tu eslabón: 3 un monstruo del Extra Deck (el remate, ya te costó materiales), 1 una carta que ya activaste este turno (alarga el combo), 2 lo demás. La
 *   usa si llega a lo que pide el momento del turno: 3 en tu primer eslabón, 2 desde el segundo, cualquiera desde el `LATE_LINKS`.º o fuera de tu Main Phase 1 (el tope: nunca
 *   se la guarda hasta que el turno termina sin usarla).
 * En su turno (lo tuyo es tu interrupción) o sin un eslabón tuyo arriba, siempre.
 * ponytail: sin la categoría del `.cdb` no sabe si tu carta busca o Invoca del Deck; si se suma a `CardFacts`, eso vale 3.
 */

/** Desde tu eslabón número `LATE_LINKS` del turno, la última se usa contra cualquiera. */
export const LATE_LINKS = 4
const EXTRA_TYPES = 0x40 | 0x2000 | 0x800000 | 0x4000000
/** Battle Phase, Main Phase 2 y End Phase (`PHASE_*`). */
const LATE_PHASES = 0x08 | 0x10 | 0x20 | 0x40 | 0x80 | 0x100 | 0x200

export function mayInterrupt(view: BotView, facts: (code: number) => CardFacts | undefined, responders: ReadonlySet<number> = new Set(), aliasOf?: (code: number) => number): boolean {
  const top = view.chain.at(-1)

  if (view.turnPlayer !== 'them' || top?.card?.ref.side !== 'theirs') return true
  const turn = view.history.slice(view.history.findLastIndex((event) => event.kind === 'phase' && event.phase === 'draw') + 1)
  const activated = (side: 'me' | 'them') => turn.flatMap((event) => (event.kind === 'activate' && event.side === side ? [event.code] : []))
  const used = new Set(activated('me'))
  const field = [...view.me.monsters, ...view.me.spells].flatMap((card) => (card && responders.has(card.code) ? [card.code] : []))
  const hand = view.me.hand.flatMap((card) => (LINK_RULES.has(ruleOf(card.code, aliasOf)) ? [card.code] : []))
  const stock = new Set([...field, ...hand].filter((code) => !used.has(code)))

  if (stock.size >= 2 || (view.phase & LATE_PHASES) !== 0) return true
  // Tus eslabones del turno, con éste (el historial ya lo tiene).
  const yours = activated('them')
  const worth = ((facts(top.code)?.type ?? 0) & EXTRA_TYPES) !== 0 ? 3 : yours.slice(0, -1).includes(top.code) ? 1 : 2
  const need = yours.length >= LATE_LINKS ? 1 : yours.length >= 2 ? 2 : 3

  return worth >= need
}
