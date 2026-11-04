import { askView, openAsk, step, type AskContext, type AskItem, type AskQueries } from '../app/auto/ask-ui'
import { allowTo, leaves } from '../app/auto/phase-stops'
import { LOCATION as L, type CoreAsk } from '../app/auto/protocol'
import { createMatState } from '../app/practice-mat'

// Las fases de la mesa automática: tu DP y tu SP pasan solas; lo que pediste dejar (`phase-stops.ts`) y las ventanas de tus fases (`ask-ui.ts`).

describe('phase-stops: lo que pediste dejar', () => {
  it('dejar una fase cubre sus ventanas en ese turno y los anteriores; sólo sube', () => {
    expect(leaves(null, 1, 'draw')).toBe(false)
    expect(leaves({ turn: 1, phase: 'standby' }, 1, 'draw')).toBe(true)
    expect(leaves({ turn: 1, phase: 'standby' }, 1, 'standby')).toBe(false)
    expect(leaves({ turn: 2, phase: 'draw' }, 1, 'end')).toBe(true)
    expect(leaves({ turn: 1, phase: 'end' }, 2, 'draw')).toBe(false)
    expect(allowTo(null, 1, 'standby')).toEqual({ turn: 1, phase: 'standby' })
    expect(allowTo({ turn: 1, phase: 'main1' }, 1, 'standby')).toEqual({ turn: 1, phase: 'main1' })
    expect(allowTo({ turn: 1, phase: 'end' }, 2, 'standby')).toEqual({ turn: 2, phase: 'standby' })
  })
})

// Tu mano: 900, una Mágica de Juego Rápido.
const QUERIES: AskQueries = {
  mine: { ...createMatState([], [], 0), hand: ['card-900-1'] },
  theirs: { state: createMatState([], [], 0) },
  idAt: (place) => (place.controller === 0 && place.location === L.HAND && place.sequence === 0 ? 'card-900-1' : null),
  codeOf: (ref) => (ref.side === 'mine' && ref.id === 'card-900-1' ? 900 : 0),
}
const ctx = (chainMode: 'ask' | 'never' = 'ask'): AskContext => ({ queries: QUERIES, prefs: { chainMode, placeMode: 'ask' }, typeOf: () => 0x2 })
/** Una ventana sin nada que «responda de verdad» (`spe_count` 0), como abre el núcleo en tu DP con una Rápida en la mano. */
const windowAt = (hint_timing: number, extra: Partial<CoreAsk> = {}): CoreAsk => ({ type: 'select_chain', player: 0, spe_count: 0, forced: false, hint_timing, hint_timing_other: 0, selects: [{ code: 900, controller: 0, location: L.HAND, sequence: 0, position: 10, description: '0', client_mode: 0 }], ...extra }) as CoreAsk
const PASS = { type: 'select_chain', index: null }
const phases = (items: readonly AskItem[]) => items.map((item) => [item.label, item.current ? 'current' : item.disabled ? 'off' : `answer→${item.to}`])

describe('ask-ui: las ventanas de tus fases', () => {
  it('la DP con una Rápida en la mano se muestra: brilla, se activa con su menú y pasar a la SP o a la M1 contesta pasar', () => {
    const state = openAsk({ askId: 1, ask: windowAt(0x1) }, ctx())
    const view = askView(state)

    expect(view.auto).toBeNull()
    expect(view.phaseWindow).toBe('draw')
    expect(view.respond).toEqual([{ side: 'mine', id: 'card-900-1' }])
    expect(view.items.get('card-900-1')?.[0]?.answer).toEqual({ type: 'select_chain', index: 0 })
    expect(phases(view.phaseItems)).toEqual([
      ['Draw Phase', 'current'],
      ['Standby Phase', 'answer→standby'],
      ['Main Phase 1', 'answer→main1'],
      ['Battle Phase', 'off'],
      ['Main Phase 2', 'off'],
      ['End Phase', 'off'],
    ])
    expect(view.endTurn).toBeNull()
    expect(step(state, { kind: 'item', answer: view.phaseItems[1]!.answer! }).answer).toEqual(PASS)
    expect(step(state, { kind: 'item', answer: { type: 'select_chain', index: 0 } }).answer).toEqual({ type: 'select_chain', index: 0 })
  })

  it('la SP pasa a la M1; la End Phase pasa el turno (`endTurn` y la Draw Phase)', () => {
    expect(phases(askView(openAsk({ askId: 1, ask: windowAt(0x2) }, ctx())).phaseItems).filter(([, how]) => how !== 'off')).toEqual([
      ['Standby Phase', 'current'],
      ['Main Phase 1', 'answer→main1'],
    ])
    const end = askView(openAsk({ askId: 1, ask: windowAt(0x20) }, ctx()))

    expect(end.phaseWindow).toBe('end')
    expect(end.endTurn).toEqual(PASS)
    expect(phases(end.phaseItems).filter(([, how]) => how !== 'off')).toEqual([
      ['Draw Phase', 'answer→draw'],
      ['End Phase', 'current'],
    ])
  })

  it('se contesta sola con «Nunca», sin candidatas y en el post-robo; la ventana del rival y la de la batalla preguntan (no son de fase); forzada, se pregunta como siempre', () => {
    const auto = (ask: CoreAsk, chainMode: 'ask' | 'never' = 'ask') => askView(openAsk({ askId: 1, ask }, ctx(chainMode))).auto

    expect(auto(windowAt(0x1), 'never')).toEqual({ answer: PASS, why: 'setting' })
    expect(auto(windowAt(0x1, { selects: [] }))).toEqual({ answer: PASS, why: 'forced' })
    expect(auto(windowAt(0x210000))).toEqual({ answer: PASS, why: 'setting' })
    for (const ask of [windowAt(0, { hint_timing_other: 0x1 }), windowAt(0x8)]) {
      const view = askView(openAsk({ askId: 1, ask }, ctx()))

      expect(view.auto).toBeNull()
      expect(view.phaseWindow).toBeNull()
    }
    const forced = askView(openAsk({ askId: 1, ask: windowAt(0x1, { forced: true }) }, ctx()))

    expect(forced.auto).toBeNull()
    expect(forced.phaseWindow).toBeNull()
    expect(forced.cancelable).toBe(false)
  })

  it('desde la Main Phase 1, el botón ofrece sólo las fases que el núcleo deja: una Battle o una Main Phase 2 saltada queda apagada', () => {
    const idle = (to_bp: boolean, to_ep: boolean): CoreAsk => ({ type: 'select_idlecmd', player: 0, summons: [], special_summons: [], pos_changes: [], monster_sets: [], spell_sets: [], activates: [], to_bp, to_ep, shuffle: false })
    const at = (ask: CoreAsk, phase: 'main1' | 'battle') => phases(askView(openAsk({ askId: 1, ask }, { ...ctx(), phase })).phaseItems).filter(([, how]) => how !== 'off')

    expect(at(idle(true, true), 'main1')).toEqual([
      ['Main Phase 1', 'current'],
      ['Battle Phase', 'answer→battle'],
      ['End Phase', 'answer→end'],
    ])
    expect(at(idle(false, true), 'main1')).toEqual([
      ['Main Phase 1', 'current'],
      ['End Phase', 'answer→end'],
    ])
    const battle: CoreAsk = { type: 'select_battlecmd', player: 0, chains: [], attacks: [], to_m2: false, to_ep: true }

    expect(at(battle, 'battle')).toEqual([
      ['Battle Phase', 'current'],
      ['End Phase', 'answer→end'],
    ])
  })
})
