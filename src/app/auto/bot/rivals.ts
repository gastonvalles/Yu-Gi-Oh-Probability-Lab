import type { AutoRule } from '../../handtraps'
import { handtrapDecide, passiveAnswer, type HandtrapWhy, type RivalView } from '../policies'
import type { Seat } from '../protocol'
import type { Bot, BotReason, BotView } from './bot'

/**
 * Los rivales de «Jugar solo automático» como `Bot`: el pasivo y el de handtraps contestan lo mismo que `passivePolicy` y `handtrapPolicy` (`policies.ts`, que siguen para el
 * fuzz y las pruebas), con el azar del bot en vez de la semilla del duelo, y el de handtraps dice por qué. El pasivo no decide nada: no da motivos.
 */

export const passiveBot = (): Bot => (ask, _view, { random }) => ({ answer: passiveAnswer(ask, random) })

/** El motivo de guardar una handtrap según su regla: `respond` y `offered` siempre se usan contra tu eslabón (si se guardan, es que no estaban en su lista). */
const HOLD: Record<AutoRule, string> = { respond: 'other', monster: 'monster', graveyard: 'graveyard', bystial: 'graveyard', offered: 'other', draw: 'draw', floodgate: 'draw', attack: 'attack', extra: 'other' }

function reasonOf(why: HandtrapWhy): { reason: BotReason; rule: string } {
  switch (why.kind) {
    case 'use': {
      // `draw` dice cuándo: en tu Draw Phase (como se juega) o a tu primera jugada.
      const key = why.rule === 'draw' ? (why.drawPhase ? 'draw' : 'drawLate') : why.rule

      return { reason: { key: `auto.bot.reason.handtrap.${key}`, cards: why.to === null ? [why.code] : [why.code, why.to] }, rule: `handtrap.use.${why.rule}` }
    }
    case 'aim':
      return { reason: { key: 'auto.bot.reason.target.link', cards: [why.code, why.target] }, rule: 'handtrap.aim' }
    case 'extra':
      return { reason: { key: 'auto.bot.reason.cost.extra', cards: why.picked }, rule: 'handtrap.extra' }
    case 'hold': {
      const key = why.rule ? HOLD[why.rule] : 'noRule'

      return { reason: { key: `auto.bot.reason.hold.${key}`, cards: [why.code, why.to] }, rule: `handtrap.hold.${key}` }
    }
  }
}

/** Lo que la decisión de `handtrapPolicy` lee de la vista: la cadena y de quién es el turno, con el lugar de cada carta de la cadena. */
function rivalViewOf(view: BotView): RivalView {
  const turnPlayer = view.turnPlayer === null ? null : view.turnPlayer === 'me' ? view.seat : ((1 - view.seat) as Seat)

  return {
    overlay: { chain: view.chain.map((link) => ({ card: link.card?.ref ?? null, code: link.code, description: link.description, state: link.state })), turnPlayer, phase: view.phase },
    locationOf: (ref) => view.chain.find((link) => link.card?.ref.side === ref.side && link.card.ref.id === ref.id)?.card?.place ?? null,
  }
}

/** El rival de handtraps (`handtrapPolicy`: `priority` y `extra` en el orden de la hoja; `aliasOf`, el original de un arte alternativo; `attributeOf`, el Atributo de una carta) con sus motivos. */
export function handtrapBot(priority: readonly number[], extra: readonly number[] = [], aliasOf?: (code: number) => number, attributeOf?: (code: number) => number): Bot {
  const decide = handtrapDecide(priority, extra, aliasOf, attributeOf)

  return (ask, view, { random }) => {
    const { answer, why } = decide(ask, rivalViewOf(view), (next) => passiveAnswer(next, random))

    if (why) return { answer, ...reasonOf(why) }
    // Su turno: no juega cartas al campo, así que lo termina.
    if ((answer.type === 'select_idlecmd' && answer.action === 7) || (answer.type === 'select_battlecmd' && answer.action === 3)) return { answer, reason: { key: 'auto.bot.reason.end.noPlays' }, rule: 'end' }

    return { answer }
  }
}
