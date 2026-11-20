import { describe, expect, it } from 'vitest'
import type { BotCard, BotSide, BotView, PublicEvent } from '../app/auto/bot/bot'
import { executorBot, type DeckExecutor } from '../app/auto/bot/executors/executor'
import type { CardFacts } from '../app/auto/bot/turn'
import { LOCATION as L, type CoreAsk } from '../app/auto/protocol'

/** La regla general del Extra Deck del ejecutor (`extraSummon`), con mesas armadas a mano. Con el núcleo real: `auto-bot-medicion.slow.test.ts` (Sky Striker). */

const LINK = 0x4000021
const NORMAL = 0x11
const FACTS: Record<number, CardFacts> = {
  // Enlaces 1 de 1500: el 1 ya usó su efecto; el 2 llega Invocando (SUMMONS); el 3 es más débil.
  1: { type: LINK, attack: 1500, defense: 0, level: 1, category: 0x200 },
  2: { type: LINK, attack: 1500, defense: 0, level: 1, category: 0x100000 },
  3: { type: LINK, attack: 1000, defense: 0, level: 1, category: 0x100000 },
  // Un Normal de 1000 y un Enlace de 2000 que llega Invocando.
  4: { type: NORMAL, attack: 1000, defense: 1000, level: 4 },
  5: { type: LINK, attack: 2000, defense: 0, level: 1, category: 0x100000 },
  // Un Enlace de 1500 que no llega haciendo nada.
  6: { type: LINK, attack: 1500, defense: 0, level: 1, category: 0 },
}
const facts = (code: number) => FACTS[code]
const empty = (): BotSide => ({ hand: [], monsters: [null, null, null, null, null, null, null], spells: [null, null, null, null, null, null], grave: [], banished: [], extraFaceUp: [], extraFaceDown: 0, deckCount: 30 })
const mine = (code: number, pos: 'atk' | 'def' = 'atk'): BotCard => ({ ref: { side: 'mine', id: `m-${code}` }, code, place: null, pos, stats: { attack: FACTS[code]!.attack, defense: FACTS[code]!.defense, level: FACTS[code]!.level } })
const context = { random: () => 0.5, level: 'normal' as const }

/** El bot (asiento 1) en su turno 3, con `own` en esas casillas y tus vidas. */
function view(own: Record<number, BotCard>, phase: number, lp = 8000, history: PublicEvent[] = []): BotView {
  const me = empty()

  for (const [sequence, card] of Object.entries(own)) me.monsters[Number(sequence)] = card
  return { seat: 1, me, them: empty(), lp: { me: 8000, them: lp }, turn: 3, turnPlayer: 'me', phase, chain: [], limits: { me: [], them: [] }, history: [{ kind: 'phase', side: 'me', phase: 'draw' }, ...history] }
}
const idle = (codes: number[], to_bp: boolean): CoreAsk => ({
  type: 'select_idlecmd',
  player: 1,
  summons: [],
  special_summons: codes.map((code) => ({ code, controller: 1, location: L.EXTRA, sequence: 0 })),
  pos_changes: [],
  monster_sets: [],
  spell_sets: [],
  activates: [],
  to_bp,
  to_ep: true,
  shuffle: false,
})
const bot = (plays: DeckExecutor['plays'] = []) => executorBot({ plays, chain: () => null, choose: () => null }, facts, () => ({ answer: { type: 'select_chain', index: null } }))
const MAIN2 = 0x100

describe('el Extra Deck que le ofrecen, al terminar su turno', () => {
  it('sube la nota: el Enlace de su Zona Extra, que ya usó su efecto, pasa a uno que llega haciendo algo; elige ese material y lo dice', () => {
    const b = bot()
    const used: PublicEvent[] = [{ kind: 'activate', side: 'me', code: 1, link: 1 }]

    expect(b(idle([2], false), view({ 5: mine(1) }, MAIN2, 8000, used), context)).toMatchObject({ answer: { action: 1, index: 0 }, rule: 'executor.extra', reason: { key: 'auto.bot.reason.play.fromExtra', cards: [2] } })
    const materials: CoreAsk = { type: 'select_unselect_card', player: 1, can_finish: false, can_cancel: true, min: 1, max: 1, select_cards: [{ code: 1, controller: 1, location: L.MZONE, sequence: 5, position: 1 }], unselect_cards: [] }

    expect(b(materials, view({ 5: mine(1) }, MAIN2, 8000, used), context)).toMatchObject({ answer: { index: 0 }, rule: 'executor.extra.material' })
  })

  it('no baja el ATK del campo ni la nota: el de 1000 no sale, y el que no usó su efecto tampoco se cambia por uno igual', () => {
    expect(bot()(idle([3], false), view({ 5: mine(1) }, MAIN2, 8000, [{ kind: 'activate', side: 'me', code: 1, link: 1 }]), context)).toMatchObject({ answer: { action: 7 } })
    expect(bot()(idle([6], false), view({ 5: mine(2) }, MAIN2), context)).toMatchObject({ answer: { action: 7 } })
  })

  it('no gasta las piezas de su línea (un monstruo con una jugada del mazo)', () => {
    const piece = [{ id: 'piece', kind: 'activate' as const, code: 4, from: L.MZONE }]

    expect(bot()(idle([5], false), view({ 0: mine(4) }, MAIN2), context)).toMatchObject({ answer: { action: 1 }, rule: 'executor.extra' })
    expect(bot(piece)(idle([5], false), view({ 0: mine(4) }, MAIN2), context)).toMatchObject({ answer: { action: 7 } })
  })

  it('antes de la batalla, sólo si le da el letal: con el Enlace de 2000 llega a tus 2000 vidas', () => {
    expect(bot()(idle([5], true), view({ 0: mine(4, 'def') }, 0x4, 2000), context)).toMatchObject({ answer: { action: 1 }, reason: { key: 'auto.bot.reason.play.fromExtraLethal' } })
    // Sin letal, cuando el turno terminaría (no tiene con qué atacar): por la nota, con su motivo.
    expect(bot()(idle([5], true), view({ 0: mine(4, 'def') }, 0x4, 8000), context)).toMatchObject({ rule: 'executor.extra', reason: { key: 'auto.bot.reason.play.fromExtra' } })
  })
})
