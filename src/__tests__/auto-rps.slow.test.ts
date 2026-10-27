import { OcgDuelMode } from 'ocgcore-wasm'
import { createAdapter } from '../app/auto/adapter'
import { askView, openAsk, step } from '../app/auto/ask-ui'
import { createAutoHost } from '../app/auto/core-host'
import { teamOrder } from '../app/auto/deck-map'
import { passivePolicy } from '../app/auto/policies'
import { LOCATION as L, type AutoCommand, type AutoEvent, type CoreAnswer } from '../app/auto/protocol'
import { t } from '../i18n'
import { hasCoreData, loadCards, scriptStore, wasmBinary } from './support/core-data'

/**
 * Piedra, papel o tijera con una carta real (lento: `npm run test:auto`): Transmission Gear (`Duel.RockPaperScissors`) en la Batalla. El núcleo pregunta a los dos asientos;
 * el tuyo contesta con la pantalla de `ask-ui` («Piedra») y el rival pasivo saca 1 («Tijera»): ganás vos y se destierra boca abajo el monstruo del rival.
 */
const GEAR = 58297729
const WARWOLF = 69247929
const BEWD = 89631139

const at = (list: readonly { code: number }[], code: number) => list.findIndex((card) => card.code === code)

describe.skipIf(!hasCoreData)('piedra, papel o tijera con el núcleo real (npm run test:auto)', () => {
  it('Transmission Gear: «Piedra» de la pantalla le gana a la tijera del rival y se destierra su monstruo', async () => {
    const { cards } = loadCards()
    const store = scriptStore()
    const events: AutoEvent[] = []
    const host = createAutoHost({ core: { wasmBinary: wasmBinary() }, cardReader: (code) => cards.get(code) ?? null, scriptReader: store.read, emit: (event) => events.push(event) })
    const hand = [GEAR, WARWOLF, BEWD, BEWD, BEWD]
    const create: Extract<AutoCommand, { t: 'create' }> = {
      t: 'create',
      seed: 7,
      flags: String(OcgDuelMode.MODE_MR5),
      players: [{ lp: 8000, hand: 5, draw: 1 }, { lp: 8000, hand: 5, draw: 1 }],
      decks: [{ main: [...hand, ...Array(35).fill(BEWD)], extra: [], hand }, { main: Array(40).fill(WARWOLF), extra: [], hand: [] }],
    }
    const mine = createAdapter({ seat: 0, mine: { deck: teamOrder(create, 0), extra: [] }, theirs: { deck: 40, extra: 0 }, lp: [8000, 8000], typeOf: (code) => cards.get(code)?.type ?? 0 })
    const passive = passivePolicy()
    const banished: number[] = []
    let rps = 0
    let attacked = false
    let from = 0

    await host.handle(create)
    for (let q = 0; q < 300 && banished.length === 0; q += 1) {
      const fresh = events.slice(from)

      from = events.length
      for (const event of fresh) {
        mine.apply(event)
        if (event.t === 'events' && event.seat === 0) for (const item of event.events) if (item.type === 'move' && item.to.location === L.REMOVED) banished.push(item.from.controller)
      }
      const asked = fresh.findLast((event) => event.t === 'ask')

      if (!asked) break
      const { ask, seat } = asked
      let answer: CoreAnswer = passive(ask)

      if (seat === 0 && ask.type === 'rock_paper_scissors') {
        const state = openAsk(asked, { queries: mine, prefs: { chainMode: 'ask', placeMode: 'ask' } })
        const rock = askView(state).options!.options.find((option) => option.label === t('duel.games.rps.rock'))!

        rps += 1
        answer = step(state, { kind: 'option', value: rock.value }).answer!
      } else if (seat === 0 && ask.type === 'select_idlecmd') {
        answer = at(ask.summons, WARWOLF) >= 0 ? { type: ask.type, action: 0, index: at(ask.summons, WARWOLF) } : at(ask.spell_sets, GEAR) >= 0 ? { type: ask.type, action: 4, index: at(ask.spell_sets, GEAR) } : { type: ask.type, action: 7, index: null }
      } else if (seat === 0 && ask.type === 'select_chain' && at(ask.selects, GEAR) >= 0) {
        answer = { type: ask.type, index: at(ask.selects, GEAR) }
      } else if (seat === 1 && ask.type === 'select_idlecmd') {
        answer = at(ask.summons, WARWOLF) >= 0 ? { type: ask.type, action: 0, index: at(ask.summons, WARWOLF) } : { type: ask.type, action: ask.to_bp && !attacked ? 6 : 7, index: null }
      } else if (seat === 1 && ask.type === 'select_battlecmd') {
        answer = attacked || ask.attacks.length === 0 ? { type: ask.type, action: 3, index: null } : { type: ask.type, action: 1, index: 0 }
        attacked = true
      }
      await host.handle({ t: 'answer', askId: asked.askId, answer })
    }
    await host.handle({ t: 'destroy' })

    expect({ rps, banished, faults: events.filter((event) => event.t === 'fault').length }).toEqual({ rps: 1, banished: [1], faults: 0 })
  }, 60_000)
})
