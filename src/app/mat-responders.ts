import type { CardEffectOfText } from './card-effect-data'
import { EFFECT_FACT } from './card-effect-facts'
import { EFFECT_PLACE } from './card-effect-map'
import type { EffectWindow } from './card-text'
import type { MatCardKind, MatPhase, MatState } from './practice-mat'

/**
 * «Podés responder con…» (capa 2 del motor de cartas, `docs/motor-de-cartas.md`): cuando el rival pregunta «¿Hacés algo antes?» antes de pasar de fase, qué cartas **tuyas** podrían responder. **Avisa, no decide**: no
 * sabe si se cumple lo que pide cada carta (tener un objetivo, cierta cantidad de cartas…); sólo dice lo que se puede **confirmar**:
 * - una **Trampa** o una **Mágica de Juego Rápido boca abajo** (por su tipo; en el turno del rival ya pasó la fase en que se puso);
 * - una **carta con un efecto rápido** que las dos fuentes confirman (`quick`, capa 1b), que se activa desde **donde está** la carta (la mano, el campo boca arriba, la zona de Mágicas y Trampas o la Zona de Péndulo boca
 *   arriba, o el Cementerio, `EFFECT_PLACE`) y que **no espera ningún suceso**: su encabezado es sólo «During your opponent's Main Phase (Quick Effect)», «(Quick Effect)» solo… (`EffectWindow`) y la fase en que va el rival está dentro. Un efecto rápido que dice
 *   «When a card or effect is activated» no se ofrece: ahora no hay nada a lo que responder.
 */

/** De dónde sale la respuesta: una carta boca abajo, la mano, una carta boca arriba en el campo (un monstruo, una Mágica o Trampa Continua, una escala de Péndulo) o el Cementerio. */
export type ResponderKind = 'set' | 'hand' | 'field' | 'grave'

export interface Responder {
  id: string
  kind: ResponderKind
}

/** Lo que la mesa sabe de una carta suya: de qué clase es y sus efectos del texto con lo confirmado de cada uno (`getCardEffectMap`). */
export interface ResponderCard {
  kind: Pick<MatCardKind, 'monster' | 'spell' | 'trap' | 'pendulum'>
  /** Es una Mágica de Juego Rápido. */
  quickPlay: boolean
  effects: readonly CardEffectOfText[] | undefined
}

const PHASE_NAME = { draw: 'draw', standby: 'standby', main1: 'main', battle: 'battle', main2: 'main', end: 'end' } as const satisfies Record<MatPhase, string>

/** Si la ventana del efecto está abierta ahora: en el turno de quién va (`myTurn`: el mío o el del rival) y en qué fase. Sin ventana (lleva una condición) no. */
export function windowOpen(window: EffectWindow | null, phase: MatPhase, myTurn: boolean): boolean {
  if (window === null) return false

  // `self` sólo en mi turno, `opponent` sólo en el del rival, `any` en cualquiera.
  const turnOk = window.turn === 'any' || (window.turn === 'self') === myTurn

  return turnOk && (window.phases === null || window.phases.includes(PHASE_NAME[phase]))
}

/** Si la carta, estando en ese lugar, tiene un efecto rápido confirmado cuya ventana está abierta. */
function respondsFrom(card: ResponderCard, place: number, phase: MatPhase, myTurn: boolean): boolean {
  return (card.effects ?? []).some((effect) => (effect.facts & EFFECT_FACT.quick) !== 0 && (effect.places & place) !== 0 && windowOpen(effect.sentence.window, phase, myTurn))
}

/**
 * Las cartas de esta mesa que pueden responder ahora, en el orden mano, campo, boca abajo y Cementerio. `phase` y `myTurn` son los del turno en curso (cuando el rival pregunta, el turno es suyo);
 * `cardOf` dice qué es cada carta propia (null si no se sabe: no responde).
 */
export function respondersOf(state: MatState, phase: MatPhase, myTurn: boolean, cardOf: (id: string) => ResponderCard | null): Responder[] {
  const out: Responder[] = []
  const fromPlace = (ids: readonly string[], place: number, kind: ResponderKind) => {
    for (const id of ids) {
      const card = cardOf(id)

      if (card && respondsFrom(card, place, phase, myTurn)) out.push({ id, kind })
    }
  }

  fromPlace(state.hand, EFFECT_PLACE.hand, 'hand')
  // Boca arriba: un monstruo boca abajo (Colocado) no activa efectos.
  fromPlace([...state.mz, ...state.emz].flatMap((placed) => (placed && placed.pos !== 'set' ? [placed.id] : [])), EFFECT_PLACE.field, 'field')

  state.st.forEach((placed, index) => {
    const card = placed ? cardOf(placed.id) : null

    if (!placed || !card) return

    if (placed.pos === 'set') {
      if (card.kind.trap || (card.kind.spell && card.quickPlay)) out.push({ id: placed.id, kind: 'set' })
      return
    }

    // Boca arriba: una escala de Péndulo (las zonas 0 y 4: su efecto de escala) o una Mágica o Trampa Continua con un efecto rápido.
    const scale = card.kind.pendulum && card.kind.monster && (index === 0 || index === 4)

    if (respondsFrom(card, scale ? EFFECT_PLACE.pendulum : EFFECT_PLACE.spellTrap, phase, myTurn)) out.push({ id: placed.id, kind: 'field' })
  })

  // La Mágica de Campo boca arriba.
  const fieldCard = state.field && state.field.pos !== 'set' ? cardOf(state.field.id) : null

  if (state.field && fieldCard && respondsFrom(fieldCard, EFFECT_PLACE.spellTrap, phase, myTurn)) out.push({ id: state.field.id, kind: 'field' })

  fromPlace(state.gy, EFFECT_PLACE.grave, 'grave')

  return out
}
