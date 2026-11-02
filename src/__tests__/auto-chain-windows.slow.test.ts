import { OcgDuelMode } from 'ocgcore-wasm'
import { createAdapter } from '../app/auto/adapter'
import { openAsk } from '../app/auto/ask-ui'
import { createAutoHost } from '../app/auto/core-host'
import { teamOrder } from '../app/auto/deck-map'
import { randomLegalPolicy } from '../app/auto/policies'
import type { AutoCommand, AutoEvent, CoreAnswer, CoreAsk } from '../app/auto/protocol'
import { ANGELECHY as A, ANGELECHY_DECK } from '../app/bot-deck-lists'
import { hasCoreData, loadCards, scriptStore, wasmBinary } from './support/core-data'

/**
 * Las ventanas de cadena de «Siempre» contra el núcleo real (lento: `npm run test:auto`). Colocás Opening to e4 y Mystical Space Typhoon en tu turno 1 (con Ash Blossom en la mano)
 * y el rival Invoca, activa Upstart Goblin y ataca. El núcleo te ofrece la Trampa en cada ventana de su turno (Draw, Standby, Main, su fin, la Battle y la End Phase) y del tuyo, y la
 * app pregunta en todas, aunque nada responda de verdad (`spe_count` 0), salvo el post-robo (la de la Draw Phase viene enseguida) y una cadena vacía en tu Main Phase.
 */
const MST = 5318639
const ALEXANDRITE = 43096270
const UPSTART = 70368879

describe.skipIf(!hasCoreData)('las ventanas de cadena con una Trampa colocada (npm run test:auto)', () => {
  it('«Siempre» pregunta en cada ventana del rival y de tu Battle Phase; tus fases, como la mesa manual', { timeout: 300_000 }, async () => {
    const { cards } = loadCards()
    const store = scriptStore()
    const events: AutoEvent[] = []
    const host = createAutoHost({ core: { wasmBinary: wasmBinary() }, cardReader: (code) => cards.get(code) ?? null, scriptReader: store.read, emit: (event) => events.push(event) })
    const hand = [A.e4, MST, A.ash, A.e4, A.purge]
    const rivalHand = [ALEXANDRITE, UPSTART, ALEXANDRITE, ALEXANDRITE, ALEXANDRITE]
    const create: Extract<AutoCommand, { t: 'create' }> = {
      t: 'create',
      seed: 7,
      flags: String(OcgDuelMode.MODE_MR5),
      players: [{ lp: 8000, hand: 5, draw: 1 }, { lp: 8000, hand: 5, draw: 1 }],
      decks: [
        { main: [...hand, A.endgame, A.endgame, ...Array<number>(33).fill(A.purge)], extra: ANGELECHY_DECK.extra.flatMap(([code, n]) => Array<number>(n).fill(code)), hand },
        { main: [...rivalHand, ...Array<number>(35).fill(ALEXANDRITE)], extra: [], hand: rivalHand },
      ],
    }
    const adapter = createAdapter({ seat: 0, mine: { deck: teamOrder(create, 0), extra: create.decks[0]!.extra }, theirs: { deck: 40, extra: 0 }, typeOf: (code) => cards.get(code)?.type ?? 0 })
    const fallback = randomLegalPolicy(3)
    /** Cada ventana con Opening to e4: el turno, los `hint_timing` (el tuyo y el del otro) y qué hace la app con «Siempre». */
    const windows: { turn: number; timing: number; other: number; spe: number; app: string }[] = []
    let sets = 0
    const mine = (ask: CoreAsk): CoreAnswer => {
      const turn = adapter.overlay.turn

      if (ask.type === 'select_idlecmd') {
        const set = ask.spell_sets.findIndex((card) => card.code === A.e4 || card.code === MST)

        if (turn === 1 && sets < 2 && set >= 0) {
          sets += 1
          return { type: ask.type, action: 4, index: set }
        }
        return ask.to_bp && turn >= 3 ? { type: ask.type, action: 6, index: null } : { type: ask.type, action: 7, index: null }
      }
      if (ask.type === 'select_battlecmd') return { type: ask.type, action: ask.to_m2 ? 2 : 3, index: null }
      if (ask.type === 'select_chain') {
        if (ask.selects.some((card) => card.code === A.e4) || turn === 1) {
          const { base } = openAsk({ askId: 1, ask }, { queries: adapter, prefs: { chainMode: 'ask', placeMode: 'auto' }, phase: adapter.mine.phase })
          const app = base.auto ? 'calla' : base.phaseWindow ? `fase:${base.phaseWindow}` : 'pregunta'

          if (ask.selects.length > 0) windows.push({ turn, timing: ask.hint_timing, other: ask.hint_timing_other, spe: ask.spe_count, app })
        }
        return { type: ask.type, index: null }
      }
      return fallback(ask)
    }
    let summoned = false
    let drew = false
    let attacks = 0
    const theirs = (ask: CoreAsk): CoreAnswer => {
      if (ask.type === 'select_idlecmd') {
        const summon = ask.summons.findIndex((card) => card.code === ALEXANDRITE)
        const upstart = ask.activates.findIndex((card) => card.code === UPSTART)

        if (!summoned && summon >= 0) {
          summoned = true
          return { type: ask.type, action: 0, index: summon }
        }
        if (!drew && upstart >= 0) {
          drew = true
          return { type: ask.type, action: 5, index: upstart }
        }
        return ask.to_bp ? { type: ask.type, action: 6, index: null } : { type: ask.type, action: 7, index: null }
      }
      if (ask.type === 'select_battlecmd') {
        if (ask.attacks.length > 0 && attacks === 0) {
          attacks += 1
          return { type: ask.type, action: 1, index: 0 }
        }
        return { type: ask.type, action: ask.to_m2 ? 2 : 3, index: null }
      }
      if (ask.type === 'select_chain') return { type: ask.type, index: ask.forced && ask.selects.length > 0 ? 0 : null }
      return fallback(ask)
    }

    await host.handle(create)
    let from = 0

    for (let q = 0; q < 400; q += 1) {
      const fresh = events.slice(from)

      from = events.length
      for (const event of fresh) adapter.apply(event)
      const asked = fresh.findLast((event) => event.t === 'ask')

      if (!asked || adapter.overlay.turn >= 4) break
      await host.handle({ t: 'answer', askId: asked.askId, answer: asked.seat === 0 ? mine(asked.ask) : theirs(asked.ask) })
    }

    const rival = windows.filter((window) => window.turn === 2)
    const at = (turn: number, bit: number) => windows.filter((window) => window.turn === turn && ((window.timing | window.other) & bit) !== 0).map((window) => window.app)

    // Tu turno 1: colocar MST abre una cadena vacía en tu Main Phase, que no pregunta (el menú de la mesa ofrece lo mismo).
    expect(windows.filter((window) => window.turn === 1).map((window) => window.app)).toEqual(['calla'])
    // El turno del rival: todas las ventanas preguntan, también sin nada que responda de verdad (la Draw Phase, la Battle), salvo el post-robo.
    expect(rival.filter((window) => window.app !== 'pregunta').map((window) => [window.other.toString(16), window.app])).toEqual([['210000', 'calla']])
    expect(rival.some((window) => window.spe === 0 && window.app === 'pregunta')).toBe(true)
    for (const bit of [0x1, 0x2, 0x40, 0x4, 0x8, 0x10, 0x20]) expect(at(2, bit), `0x${bit.toString(16)}`).toContain('pregunta')
    // Tu turno 3: tus fases como la mesa manual (brilla lo que se activa y el botón de fases pasa) y tu Battle Phase pregunta.
    expect(at(3, 0x10000)).toEqual(['calla'])
    expect(at(3, 0x1)).toEqual(['fase:draw'])
    expect(at(3, 0x2)).toEqual(['fase:standby'])
    expect(at(3, 0x8)).toEqual(['pregunta'])
    expect(at(3, 0x20)).toEqual(['fase:end'])
  })
})
