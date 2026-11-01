import type { BotCard, BotSide, BotView } from '../app/auto/bot/bot'
import { attackPlan, executorBot, type Attacker, type Scene } from '../app/auto/bot/executors/executor'
import type { CardFacts } from '../app/auto/bot/turn'
import { LOCATION as L, type CoreAsk } from '../app/auto/protocol'

/** Cómo ataca el ejecutor de un mazo (`attackPlan` y las posiciones de la Main Phase), con mesas armadas a mano. Con el núcleo real: `auto-bot-sky.slow.test.ts`. */

const NORMAL = 0x11
const LINK = 0x4000021
const FACTS: Record<number, CardFacts> = {
  1: { type: NORMAL, attack: 2000, defense: 1000, level: 4 },
  2: { type: NORMAL, attack: 1500, defense: 1200, level: 4 },
  3: { type: NORMAL, attack: 1000, defense: 2500, level: 4 },
  4: { type: LINK, attack: 2000, defense: 0, level: 2 },
  5: { type: NORMAL, attack: 800, defense: 2000, level: 3 },
}
const facts = (code: number) => FACTS[code]
const empty = (): BotSide => ({ hand: [], monsters: [null, null, null, null, null, null, null], spells: [null, null, null, null, null, null], grave: [], banished: [], extraFaceUp: [], extraFaceDown: 0, deckCount: 30 })
const card = (side: 'mine' | 'theirs', code: number, pos: 'atk' | 'def' | 'set' = 'atk'): BotCard => ({
  ref: { side, id: `${side}-${code}-${pos}` },
  code: side === 'theirs' && pos === 'set' ? 0 : code,
  place: null,
  pos,
  ...(side === 'theirs' && pos === 'set' ? {} : { stats: { attack: FACTS[code]!.attack, defense: FACTS[code]!.defense, level: FACTS[code]!.level } }),
})
/** El bot en el asiento 1, en su Main Phase 1 del turno 3. */
function scene(yours: (BotCard | null)[], own: (BotCard | null)[] = [], lp = 8000): Scene {
  const them = empty()
  const me = empty()

  yours.forEach((item, i) => (them.monsters[i] = item))
  own.forEach((item, i) => (me.monsters[i] = item))
  const view: BotView = { seat: 1, me, them, lp: { me: 8000, them: lp }, turn: 3, turnPlayer: 'me', phase: 4, chain: [], limits: { me: [], them: [] }, history: [] }

  return { view, facts, done: new Set(), current: null }
}
const atk = (code: number, direct = false): Attacker => ({ code, atk: FACTS[code]!.attack, direct })

describe('cómo ataca el ejecutor (attackPlan)', () => {
  it('sin monstruos tuyos, directo con el más fuerte', () => {
    expect(attackPlan(scene([]), [atk(2), atk(1)])).toEqual({ i: 1, target: null, kind: 'direct' })
  })

  it('contra uno boca arriba que destruye, con el más débil que alcanza (el fuerte queda para atacar directo)', () => {
    expect(attackPlan(scene([card('theirs', 3)]), [atk(1), atk(2)])).toEqual({ i: 1, target: 0, kind: 'safe' })
    // En defensa cuenta su DEF: 2500 no lo pasa nadie.
    expect(attackPlan(scene([card('theirs', 3, 'def')]), [atk(1), atk(2)])).toBeNull()
  })

  it('contra uno boca abajo, a ciegas con el más fuerte (desde 1000 de ATK); con menos, no', () => {
    expect(attackPlan(scene([card('theirs', 3, 'set')]), [atk(2), atk(1)])).toEqual({ i: 1, target: 0, kind: 'blind' })
    expect(attackPlan(scene([card('theirs', 3, 'set')]), [atk(5)])).toBeNull()
    // Lo que destruye seguro va antes que lo boca abajo.
    expect(attackPlan(scene([card('theirs', 3, 'set'), card('theirs', 5)]), [atk(1)])).toEqual({ i: 0, target: 1, kind: 'safe' })
  })

  it('el empate de ATK sólo si tu monstruo vale más (del Extra Deck) o si abre el letal', () => {
    // 2000 contra 2000 Normal, sin letal: no.
    expect(attackPlan(scene([card('theirs', 1)]), [atk(1), atk(2)])).toBeNull()
    // Tu Enlace de 2000 contra su Normal de 2000: sí.
    expect(attackPlan(scene([card('theirs', 4)]), [atk(1)])).toEqual({ i: 0, target: 0, kind: 'trade' })
    // Su Enlace no se cambia por tu Normal.
    expect(attackPlan(scene([card('theirs', 1)]), [atk(4)])).toBeNull()
    // Letal: tu único monstruo y con los 1500 que quedan te gana (te quedan 1500).
    expect(attackPlan(scene([card('theirs', 1)], [], 1500), [atk(1), atk(2)])).toEqual({ i: 0, target: 0, kind: 'trade' })
    expect(attackPlan(scene([card('theirs', 1)], [], 1600), [atk(1), atk(2)])).toBeNull()
  })

  it('el que puede atacar directo lo hace aunque tengas monstruos', () => {
    expect(attackPlan(scene([card('theirs', 3, 'set')]), [atk(1), atk(5, true)])).toEqual({ i: 1, target: null, kind: 'direct' })
  })
})

describe('las posiciones en la Main Phase del ejecutor', () => {
  const bot = () => executorBot({ plays: [], chain: () => null, choose: () => null }, facts, () => ({ answer: { type: 'select_chain', index: null } }))
  const mine = (sequence: number, code: number) => ({ code, controller: 1 as const, location: L.MZONE, sequence })
  const idle = (pos_changes: ReturnType<typeof mine>[], to_bp: boolean): CoreAsk => ({ type: 'select_idlecmd', player: 1, summons: [], special_summons: [], pos_changes, monster_sets: [], spell_sets: [], activates: [], to_bp, to_ep: true, shuffle: false })
  const context = { random: () => 0.5, level: 'normal' as const }

  it('al terminar, a defensa lo que quedó en ataque y es más débil que un monstruo tuyo', () => {
    const s = scene([card('theirs', 1)], [card('mine', 2), card('mine', 5)])
    const main2 = { ...s.view, phase: 0x100 }

    expect(bot()(idle([mine(0, 2), mine(1, 5)], false), main2, context)).toMatchObject({ answer: { action: 2, index: 0 }, rule: 'executor.position.defense' })
    // Lo que no es más débil que nada tuyo se queda.
    expect(bot()(idle([mine(0, 1)], false), scene([card('theirs', 2)], [card('mine', 1)]).view, context)).toMatchObject({ answer: { action: 7 } })
  })

  it('antes de la Battle Phase, a ataque lo que está en defensa y ahora tiene un ataque que conviene; a ciegas, no', () => {
    expect(bot()(idle([mine(0, 1)], true), scene([card('theirs', 5)], [card('mine', 1, 'def')]).view, context)).toMatchObject({ answer: { action: 2, index: 0 }, rule: 'executor.position.attack' })
    expect(bot()(idle([mine(0, 1)], true), scene([card('theirs', 3, 'set')], [card('mine', 1, 'def')]).view, context)).toMatchObject({ answer: { action: 7 } })
  })

  it('en la Battle Phase ataca a ciegas lo boca abajo y elige esa casilla, con su propio motivo (no el de «destruyo sin perder»)', () => {
    const b = bot()
    const view = scene([null, card('theirs', 3, 'set')], [card('mine', 1)]).view
    const battle: CoreAsk = { type: 'select_battlecmd', player: 1, chains: [], attacks: [{ ...mine(0, 1), can_direct: false }], to_m2: true, to_ep: true }

    expect(b(battle, view, context)).toMatchObject({ answer: { action: 1, index: 0 }, rule: 'executor.attack' })
    const target: CoreAsk = { type: 'select_card', player: 1, can_cancel: false, min: 1, max: 1, selects: [{ code: 0, controller: 0, location: L.MZONE, sequence: 1, position: 8 }] }
    const decision = b(target, view, context)

    expect(decision).toMatchObject({ answer: { indices: [0] }, rule: 'executor.attack.blind', reason: { key: 'auto.bot.reason.battle.blind', cards: [1] } })
  })
})
