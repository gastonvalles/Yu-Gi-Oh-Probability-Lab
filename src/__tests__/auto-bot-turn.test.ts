import type { BotCard, BotContext, BotSide, BotView } from '../app/auto/bot/bot'
import { MAX_IDLE, turnBot, type CardFacts } from '../app/auto/bot/turn'
import { LOCATION as L, type AskOf, type CoreAsk } from '../app/auto/protocol'
import { autoRival, DEFAULT_HANDTRAP_CONFIG } from '../app/handtraps'

/** «El rival juega su turno» (`turnBot`) con mesas armadas a mano: qué Tributa, a qué ataca, el tope de jugadas. Con el núcleo real: `auto-bot-turn.slow.test.ts`. */

const GOLEM = 102380
const SPHERE = 10000080
const BANDIT = 24203749
const ASH = 14558127
const CELTIC = 91152256
const AVIAN = 21844576
const KURIBOH = 40640057
const INPACHI = 5464695
const GOBLIN = 78658564

const FACTS: Record<number, CardFacts> = {
  [CELTIC]: { type: 0x11, attack: 1400, defense: 1200, level: 4 },
  [AVIAN]: { type: 0x11, attack: 1000, defense: 1000, level: 3 },
  [KURIBOH]: { type: 0x21, attack: 300, defense: 200, level: 1 },
  [INPACHI]: { type: 0x11, attack: 1850, defense: 0, level: 4 },
  [GOBLIN]: { type: 0x21, attack: 2300, defense: 0, level: 4 },
  [ASH]: { type: 0x21, attack: 0, defense: 1800, level: 3 },
}
const context = (): BotContext => ({ random: () => 0.5, level: 'normal' })
const bot = () => turnBot([ASH], [], undefined, undefined, (code) => FACTS[code])
const empty = (): BotSide => ({ hand: [], monsters: [null, null, null, null, null, null, null], spells: [null, null, null, null, null, null], grave: [], banished: [], extraFaceUp: [], extraFaceDown: 0, deckCount: 30 })
/** Un monstruo en el campo: boca arriba en ataque con su ATK/DEF impreso, o boca abajo (`set`: código 0 del otro lado). */
const monster = (side: 'mine' | 'theirs', code: number, pos: 'atk' | 'def' | 'set' = 'atk'): BotCard => ({
  ref: { side, id: `${side}-${code}` },
  code: side === 'theirs' && pos === 'set' ? 0 : code,
  place: null,
  pos,
  ...(pos === 'set' ? {} : { stats: { attack: FACTS[code]!.attack, defense: FACTS[code]!.defense, level: FACTS[code]!.level } }),
})
/** La mesa del bot (asiento 1) en su Main Phase 1 del turno 2: tus monstruos (`yours`, por zona) y su mano. */
function view(yours: (BotCard | null)[], hand: number[] = [], own: (BotCard | null)[] = [], turn = 2): BotView {
  const them = empty()
  const me = empty()

  yours.forEach((card, i) => (them.monsters[i] = card))
  own.forEach((card, i) => (me.monsters[i] = card))
  me.hand = hand.map((code, i) => ({ ref: { side: 'mine', id: `h${i}` }, code, place: { controller: 1, location: L.HAND, sequence: i } }))
  return { seat: 1, me, them, lp: { me: 8000, them: 8000 }, turn, turnPlayer: 'me', phase: 4, chain: [], limits: { me: [], them: [] }, history: [] }
}
const idle = (lists: Partial<Pick<AskOf<'select_idlecmd'>, 'summons' | 'special_summons' | 'monster_sets' | 'spell_sets' | 'activates'>> = {}, to_bp = true): CoreAsk => ({
  type: 'select_idlecmd',
  player: 1,
  summons: [],
  special_summons: [],
  pos_changes: [],
  monster_sets: [],
  spell_sets: [],
  activates: [],
  to_bp,
  to_ep: true,
  shuffle: false,
  ...lists,
})
const inHand = (code: number, sequence = 0) => ({ code, controller: 1 as const, location: L.HAND, sequence })
const yourZone = (sequence: number, code = 0) => ({ code, controller: 0 as const, location: L.MZONE, sequence, position: 1 })

describe('el rival juega su turno (turnBot)', () => {
  it('Sphere Mode Tributa tus 3 monstruos de más ATK aunque la pregunta los traiga con código 0: los mira en su vista (lo público de tu campo); lo boca abajo, al final', () => {
    const b = bot()
    const table = view([monster('theirs', KURIBOH), monster('theirs', CELTIC, 'set'), monster('theirs', CELTIC), monster('theirs', AVIAN)])

    expect(b(idle({ summons: [inHand(SPHERE)] }), table, context())).toMatchObject({ answer: { action: 0, index: 0 }, reason: { key: 'auto.bot.reason.play.sphere' } })
    const tribute: CoreAsk = { type: 'select_tribute', player: 1, can_cancel: true, min: 3, max: 3, selects: [0, 1, 2, 3].map((sequence) => ({ ...yourZone(sequence), release_param: 1 })) }

    expect(b(tribute, table, context())).toEqual({ answer: { type: 'select_tribute', indices: [2, 3, 0] }, reason: { key: 'auto.bot.reason.target.threat', cards: [CELTIC] }, rule: 'turn.tribute' })
  })

  it('con 3 monstruos tuyos y Lava Golem, Sphere Mode primero; con 2, Gallant Bandit antes que Lava Golem, y Lava Golem antes que su Invocación Normal; con 1, Gallant Bandit con el tuyo y su relleno', () => {
    const offer = idle({ summons: [inHand(INPACHI, 0), inHand(SPHERE, 1), inHand(BANDIT, 2)], special_summons: [inHand(GOLEM, 3)] })

    expect(bot()(offer, view([monster('theirs', KURIBOH), monster('theirs', AVIAN), monster('theirs', CELTIC)]), context()).rule).toBe('turn.sphere')
    expect(bot()(offer, view([monster('theirs', KURIBOH), monster('theirs', AVIAN)]), context()).rule).toBe('turn.bandit')
    expect(bot()(idle({ summons: [inHand(INPACHI)], special_summons: [inHand(GOLEM, 1)] }), view([monster('theirs', KURIBOH), monster('theirs', AVIAN)]), context()).rule).toBe('turn.golem')
    expect(bot()(idle({ summons: [inHand(INPACHI), inHand(BANDIT, 1)] }), view([monster('theirs', KURIBOH)], [INPACHI, BANDIT]), context()).rule).toBe('turn.bandit')
    // Sin monstruos tuyos no se juega para gastar su relleno: Invoca el suyo.
    expect(bot()(idle({ summons: [inHand(INPACHI), inHand(BANDIT, 1)] }), view([], [INPACHI, BANDIT, INPACHI]), context()).rule).toBe('turn.summon')
  })

  it('los Tributos de Lava Golem y Gallant Bandit: tus monstruos de más ATK; después su relleno, y una handtrap con regla al final', () => {
    const b = bot()
    const table = view([monster('theirs', KURIBOH), monster('theirs', AVIAN)], [BANDIT, ASH, INPACHI])

    b(idle({ summons: [inHand(BANDIT)] }), table, context())
    const pick = (cards: { code: number; controller: 0 | 1; location: number; sequence: number }[]): CoreAsk => ({
      type: 'select_unselect_card',
      player: 1,
      can_finish: false,
      can_cancel: false,
      min: 2,
      max: 2,
      select_cards: cards.map((card) => ({ ...card, position: card.location === L.HAND ? 10 : 1 })),
      unselect_cards: [],
    })

    expect(b(pick([inHand(ASH, 1), inHand(INPACHI, 2), yourZone(0, KURIBOH), yourZone(1, AVIAN)]), table, context())).toMatchObject({ answer: { index: 3 }, reason: { cards: [AVIAN] } })
    expect(b(pick([inHand(ASH, 1), inHand(INPACHI, 2), yourZone(0, KURIBOH)]), table, context())).toMatchObject({ answer: { index: 2 }, reason: { cards: [KURIBOH] } })
    expect(b(pick([inHand(ASH, 1), inHand(INPACHI, 2)]), table, context())).toMatchObject({ answer: { index: 1 } })
  })

  it('ataca seguro: directo sin monstruos tuyos; si no, al tuyo boca arriba de más ATK que destruye sin perder el suyo; ni a uno más fuerte ni a lo boca abajo', () => {
    const own = [monster('mine', INPACHI)]
    const battle = (yours: (BotCard | null)[], can_direct = false) => {
      const b = bot()
      const table = view(yours, [], own)
      const cmd: CoreAsk = { type: 'select_battlecmd', player: 1, chains: [], attacks: [{ code: INPACHI, controller: 1, location: L.MZONE, sequence: 0, can_direct }], to_m2: true, to_ep: true }
      const first = b(cmd, table, context())
      const target: CoreAsk = { type: 'select_card', player: 1, can_cancel: false, min: 1, max: 1, selects: yours.flatMap((card, sequence) => (card ? [yourZone(sequence, card.code)] : [])) }

      return { first, then: first.answer.type === 'select_battlecmd' && first.answer.action === 1 && !can_direct ? b(target, table, context()) : null }
    }

    expect(battle([], true).first).toMatchObject({ answer: { action: 1, index: 0 }, reason: { key: 'auto.bot.reason.battle.direct', cards: [INPACHI] } })
    expect(battle([monster('theirs', KURIBOH), monster('theirs', CELTIC), monster('theirs', GOBLIN)]).then).toMatchObject({ answer: { indices: [1] }, reason: { key: 'auto.bot.reason.battle.safe', cards: [INPACHI, CELTIC] } })
    expect(battle([monster('theirs', GOBLIN)]).first).toMatchObject({ answer: { action: 3 }, reason: { key: 'auto.bot.reason.end.noSafeAttack', cards: [INPACHI, GOBLIN] } })
    expect(battle([monster('theirs', CELTIC, 'set')]).first).toMatchObject({ answer: { action: 3 }, reason: { key: 'auto.bot.reason.end.faceDown', cards: [INPACHI] } })
    // En defensa, contra su DEF: Celtic (DEF 1200) cae ante Inpachi (1850).
    expect(battle([monster('theirs', CELTIC, 'def')]).then).toMatchObject({ answer: { indices: [0] } })
  })

  it('Invoca su monstruo de más ATK; lo coloca si tenés uno boca arriba más fuerte; nunca Invoca una handtrap con regla', () => {
    const offer = idle({ summons: [inHand(ASH), inHand(KURIBOH, 1), inHand(INPACHI, 2)], monster_sets: [inHand(ASH), inHand(KURIBOH, 1), inHand(INPACHI, 2)] })

    expect(bot()(offer, view([]), context())).toMatchObject({ answer: { action: 0, index: 2 }, reason: { key: 'auto.bot.reason.play.summon', cards: [INPACHI] } })
    expect(bot()(offer, view([monster('theirs', GOBLIN)]), context())).toMatchObject({ answer: { action: 3, index: 2 }, reason: { key: 'auto.bot.reason.play.set', cards: [INPACHI, GOBLIN] } })
    expect(bot()(idle({ summons: [inHand(ASH)] }), view([]), context()).answer).toMatchObject({ action: 7 })
  })

  it(`un turno no pasa de ${MAX_IDLE} jugadas: después termina, aunque le ofrezcan más`, () => {
    const b = bot()
    const table = view([monster('theirs', KURIBOH)])
    const offer = idle({ activates: [{ ...inHand(12580477), description: '0', client_mode: 0 }] })
    const answers = Array.from({ length: MAX_IDLE + 1 }, () => b(offer, table, context()).answer)

    expect(answers.slice(0, MAX_IDLE).every((answer) => answer.type === 'select_idlecmd' && answer.action === 5)).toBe(true)
    expect(answers.at(-1)).toMatchObject({ action: 7 })
    // Otro turno, la cuenta de nuevo.
    expect(b(offer, view([monster('theirs', KURIBOH)], [], [], 4), context()).answer).toMatchObject({ action: 5 })
  })

  it('apagado (lo de siempre): el rival del simulador no juega su turno; encendido, lo dice autoRival', () => {
    expect(autoRival({ ...DEFAULT_HANDTRAP_CONFIG, enabled: true })).not.toHaveProperty('ownTurn')
    expect(autoRival({ ...DEFAULT_HANDTRAP_CONFIG, enabled: true, ownTurn: true })).toHaveProperty('ownTurn', true)
  })
})
