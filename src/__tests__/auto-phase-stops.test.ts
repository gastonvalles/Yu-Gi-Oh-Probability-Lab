import { askView, openAsk, step, stopPhaseItems, type AskContext, type AskItem, type AskQueries } from '../app/auto/ask-ui'
import { allowTo, leaves, stopAt, trailingStops } from '../app/auto/phase-stops'
import { LOCATION as L, type CoreAsk } from '../app/auto/protocol'
import { createMatState, type MatAction, type MatPhase } from '../app/practice-mat'

// Las fases de la mesa automática, como en la manual: las paradas de tu Draw y tu Standby Phase (`phase-stops.ts`) y las ventanas de tus fases (`ask-ui.ts`).

const START = { phase: 'draw', turn: 1 } as const
const to = (phase: MatPhase, skipDraw?: true): MatAction => ({ type: 'phase', phase, ...(skipDraw ? { skipDraw } : {}) })
const HAND: MatAction = { type: 'draw', count: 5 }
const PLAY: MatAction = { type: 'place', id: 'card-100-1', zone: 'mz', index: 0, pos: 'atk', how: 'normal' }
/** Tu turno 1 hasta la Main Phase 1 (el turno 1 no roba), y del turno 1 al 2: la End Phase, el turno del rival (`skipDraw`), el robo y la DP, SP y M1. */
const TURN_1 = [HAND, to('standby'), to('main1')]
const TURN_2 = [...TURN_1, PLAY, to('end'), to('draw', true), { type: 'draw', count: 1 } as MatAction, to('standby'), to('main1')]

describe('phase-stops: la mesa frena en tu DP y tu SP', () => {
  it('las paradas son las jugadas de la DP a la SP y de la SP a la M1; frena en la primera que no pediste dejar', () => {
    expect(stopAt(START, TURN_1, 0, null)).toBe(1)
    expect(stopAt(START, TURN_1, 1, { turn: 1, phase: 'standby' })).toBe(2)
    expect(stopAt(START, TURN_1, 1, { turn: 1, phase: 'main1' })).toBe(TURN_1.length)
    // La Main Phase 1 del turno 1 no deja la SP del turno 2: el turno nuevo vuelve a frenar.
    expect(stopAt(START, TURN_2, 3, { turn: 1, phase: 'end' })).toBe(7)
    expect(stopAt(START, TURN_2, 3, { turn: 2, phase: 'main1' })).toBe(TURN_2.length)
    // Una SP que un efecto salta (de la DP a la M1) no frena.
    expect(stopAt(START, [HAND, to('main1')], 0, null)).toBe(2)
  })

  it('al rearmarse frena sólo si las jugadas terminan en paradas (el duelo nuevo, el turno recién llegado); a mitad de un turno, no', () => {
    expect(trailingStops(START, TURN_1)).toBe(1)
    expect(trailingStops(START, TURN_2)).toBe(7)
    // La SP con su ventana esperando: la cola es sólo la parada de la SP.
    expect(trailingStops(START, [HAND, to('standby')])).toBe(1)
    expect(trailingStops(START, [...TURN_1, PLAY])).toBe(4)
    expect(trailingStops(START, [])).toBe(0)
  })

  it('lo pedido: dejar una fase cubre sus paradas y sus ventanas en ese turno y los anteriores; sólo sube', () => {
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
const phases = (items: readonly AskItem[]) => items.map((item) => [item.label, item.current ? 'current' : item.disabled ? 'off' : item.answer ? `answer→${item.to}` : `to→${item.to}`])

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

  it('se contesta sola como antes: con «Nunca», sin candidatas, el post-robo, la ventana del rival y la de la batalla; forzada, se pregunta como siempre', () => {
    const auto = (ask: CoreAsk, chainMode: 'ask' | 'never' = 'ask') => askView(openAsk({ askId: 1, ask }, ctx(chainMode))).auto

    expect(auto(windowAt(0x1), 'never')).toEqual({ answer: PASS, why: 'setting' })
    expect(auto(windowAt(0x1, { selects: [] }))).toEqual({ answer: PASS, why: 'forced' })
    expect(auto(windowAt(0x210000))).toEqual({ answer: PASS, why: 'setting' })
    expect(auto(windowAt(0, { hint_timing_other: 0x1 }))).toEqual({ answer: PASS, why: 'setting' })
    expect(auto(windowAt(0x8))).toEqual({ answer: PASS, why: 'setting' })
    const forced = askView(openAsk({ askId: 1, ask: windowAt(0x1, { forced: true }) }, ctx()))

    expect(forced.auto).toBeNull()
    expect(forced.phaseWindow).toBeNull()
    expect(forced.cancelable).toBe(false)
  })

  it('en una parada (sin pregunta) el botón de fases ofrece las que siguen sin contestar nada', () => {
    expect(phases(stopPhaseItems('draw')).filter(([, how]) => how !== 'off')).toEqual([
      ['Draw Phase', 'current'],
      ['Standby Phase', 'to→standby'],
      ['Main Phase 1', 'to→main1'],
    ])
    expect(phases(stopPhaseItems('standby')).filter(([, how]) => how !== 'off')).toEqual([
      ['Standby Phase', 'current'],
      ['Main Phase 1', 'to→main1'],
    ])
  })
})
