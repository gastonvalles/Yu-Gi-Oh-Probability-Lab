import { createAdapter } from '../app/auto/adapter'
import { LOCATION as L, POSITION as P, type AutoEvent, type WireEvent } from '../app/auto/protocol'
import { whoseTurn } from '../app/duel-turn'
import { mapActionIds } from '../app/mat-public'
import { describeMatAction, matReducer } from '../app/practice-mat'

// El adaptador con eventos armados a mano (las pruebas contra el núcleo real están en auto-adapter.slow.test.ts).
const XYZ = 0x800000 | 1
const PENDULUM = 0x1000000 | 1
const types: Record<number, number> = { 900: XYZ, 444: PENDULUM }
const make = () => createAdapter({ seat: 0, mine: { deck: [111, 222, 333, 444, 555], extra: [900] }, theirs: { deck: 3, extra: 1 }, lp: [8000, 8000], typeOf: (code) => types[code] ?? 1 })
const events = (seat: 0 | 1, ...list: WireEvent[]): AutoEvent => ({ t: 'events', seat, n: 0, events: list })
const at = (controller: 0 | 1, location: number, sequence: number, position: number = P.FACEUP_ATTACK, overlay_sequence?: number) => ({ controller, location, sequence, position, ...(overlay_sequence === undefined ? {} : { overlay_sequence }) })
const move = (card: number, from: ReturnType<typeof at>, to: ReturnType<typeof at>): WireEvent => ({ type: 'move', card, from, to })
const played = (type: 'summoning' | 'spsummoning', code: number, to: ReturnType<typeof at>): WireEvent => ({ type, code, controller: to.controller, location: to.location, sequence: to.sequence, position: to.position })

describe('el adaptador: del núcleo a la mesa', () => {
  it('roba por id (después de barajar nadie sabe el orden) y manda al cementerio y al destierro boca abajo', () => {
    const adapter = make()

    expect(adapter.apply(events(0, { type: 'draw', player: 0, drawn: [{ code: 111, position: 10 }, { code: 222, position: 10 }] })).mine).toEqual([{ type: 'draw', count: 2, ids: ['card-111-1', 'card-222-1'] }])
    // Barajado y robo de una que la mesa no tiene arriba.
    const out = adapter.apply(events(0, { type: 'shuffle_deck', player: 0 }, { type: 'draw', player: 0, drawn: [{ code: 555, position: 10 }] }))

    expect(out.mine.at(-1)).toEqual({ type: 'draw', count: 1, ids: ['card-555-1'] })
    expect(adapter.mine.hand).toEqual(['card-111-1', 'card-222-1', 'card-555-1'])
    adapter.apply(events(0, move(111, at(0, L.HAND, 0, 10), at(0, L.GRAVE, 0)), move(222, at(0, L.HAND, 0, 10), at(0, L.REMOVED, 0, P.FACEDOWN_ATTACK))))
    expect(adapter.mine.gy).toEqual(['card-111-1'])
    expect(adapter.mine.facedown).toEqual(['card-222-1'])
    expect(adapter.mine.hand).toEqual(['card-555-1'])
  })

  it('el espejo del rival: ids opacos, y el código sólo cuando el núcleo lo muestra', () => {
    const adapter = make()
    const drawn = adapter.apply(events(0, { type: 'draw', player: 1, drawn: [{ code: 0, position: 10 }, { code: 0, position: 10 }] }))

    expect(drawn.theirs).toEqual([{ action: { type: 'draw', count: 2, ids: ['c1', 'c2'] }, reveal: {} }])
    // Coloca una boca abajo: nada se revela. Invoca la otra: se revela con su código.
    const set = adapter.apply(events(0, move(0, at(1, L.HAND, 0, 10), at(1, L.SZONE, 1, P.FACEDOWN_DEFENSE))))
    const summon = adapter.apply(events(0, move(777, at(1, L.HAND, 0, 10), at(1, L.MZONE, 2)), played('summoning', 777, at(1, L.MZONE, 2))))

    expect(set.theirs).toEqual([{ action: { type: 'place', id: 'c1', zone: 'st', index: 1, pos: 'set' }, reveal: {} }])
    expect(summon.theirs).toEqual([{ action: { type: 'place', id: 'c2', zone: 'mz', index: 2, pos: 'atk', how: 'normal' }, reveal: { c2: 'card-777-1' } }])
    expect(adapter.theirs.known).toEqual({ c2: 'card-777-1' })
    expect(adapter.idAt({ controller: 1, location: L.MZONE, sequence: 2 })).toBe('c2')
    expect(adapter.codeOf({ side: 'theirs', id: 'c1' })).toBe(0)
    expect(adapter.locationOf({ side: 'theirs', id: 'c2' })).toEqual({ controller: 1, location: L.MZONE, sequence: 2 })
  })

  it('Xyz: los materiales que el núcleo junta debajo de la carta del Extra salen con la invocación', () => {
    const adapter = make()

    adapter.apply(events(0, { type: 'draw', player: 0, drawn: [111, 222].map((code) => ({ code, position: 10 })) }))
    adapter.apply(events(0, move(111, at(0, L.HAND, 0, 10), at(0, L.MZONE, 0)), played('summoning', 111, at(0, L.MZONE, 0))))
    adapter.apply(events(0, move(222, at(0, L.HAND, 0, 10), at(0, L.MZONE, 1)), played('spsummoning', 222, at(0, L.MZONE, 1))))
    const out = adapter.apply(
      events(0, move(111, at(0, L.MZONE, 0), at(0, L.EXTRA, 0, P.FACEUP_ATTACK, 0)), move(222, at(0, L.MZONE, 1), at(0, L.EXTRA, 0, P.FACEUP_ATTACK, 1)), move(900, at(0, L.EXTRA, 0, 10), at(0, L.MZONE, 5)), played('spsummoning', 900, at(0, L.MZONE, 5))),
    )

    expect(out.mine).toEqual([{ type: 'summon', id: 'card-900-1', how: 'xyz', materials: ['card-111-1', 'card-222-1'], zone: 'emz', index: 0, pos: 'atk' }])
    expect(adapter.mine.emz[0]).toMatchObject({ id: 'card-900-1', materials: ['card-111-1', 'card-222-1'] })
    // Desacoplar un material: del debajo del Xyz al cementerio.
    adapter.apply(events(0, move(111, at(0, L.MZONE, 5, P.FACEUP_ATTACK, 0), at(0, L.GRAVE, 0))))
    expect(adapter.mine.emz[0]?.materials).toEqual(['card-222-1'])
    expect(adapter.mine.gy).toEqual(['card-111-1'])
  })

  it('fichas que aparecen y se van, y un Péndulo que vuelve al Extra boca arriba', () => {
    const adapter = make()

    expect(adapter.apply(events(0, move(31533705, at(0, 0, 0, 0), at(0, L.MZONE, 3, P.FACEUP_DEFENSE)))).mine).toEqual([{ type: 'token', zone: 'mz', index: 3, pos: 'def' }])
    expect(adapter.mine.mz[3]?.id).toBe('token-1')
    adapter.apply(events(0, move(31533705, at(0, L.MZONE, 3, P.FACEUP_DEFENSE), at(0, L.GRAVE, 0))))
    expect(adapter.mine.mz[3]).toBeNull()
    expect(adapter.mine.gy).toEqual([])

    adapter.apply(events(0, { type: 'draw', player: 0, drawn: [111, 222, 333, 444].map((code) => ({ code, position: 10 })) }))
    adapter.apply(events(0, move(444, at(0, L.HAND, 3, 10), at(0, L.MZONE, 0)), played('spsummoning', 444, at(0, L.MZONE, 0))))
    adapter.apply(events(0, move(444, at(0, L.MZONE, 0), at(0, L.EXTRA, 1, P.FACEUP_ATTACK))))
    expect(adapter.mine.extraUp).toEqual(['card-444-1'])
    expect(adapter.apply(events(0, move(444, at(0, L.EXTRA, 1), at(0, L.MZONE, 2)), played('spsummoning', 444, at(0, L.MZONE, 2)))).mine).toEqual([{ type: 'place', id: 'card-444-1', zone: 'mz', index: 2, pos: 'atk', how: 'pendulum' }])
  })

  it('turno y fase en las dos mesas (`skipDraw`: el robo llega como `draw`), vidas y cadena en el overlay', () => {
    const adapter = make()

    adapter.apply(events(0, { type: 'new_turn', player: 0 }, { type: 'new_phase', phase: 1 }, { type: 'new_phase', phase: 4 }, { type: 'new_phase', phase: 0x200 }))
    const pass = adapter.apply(events(0, { type: 'new_turn', player: 1 }, { type: 'new_phase', phase: 1 }, { type: 'new_phase', phase: 2 }))

    expect(pass.mine).toEqual([{ type: 'phase', phase: 'draw', skipDraw: true }])
    expect(pass.theirs.map((wire) => wire.action)).toEqual([{ type: 'phase', phase: 'standby' }])
    expect([adapter.mine.turn, adapter.theirs.state.phase, whoseTurn(0, adapter.mine, adapter.theirs.state, 0)]).toEqual([2, 'standby', 'theirs'])

    adapter.apply(events(0, { type: 'damage', player: 0, amount: 1200 }, { type: 'pay_lpcost', player: 1, amount: 1000 }, { type: 'recover', player: 0, amount: 200 }))
    expect(adapter.overlay.lp).toEqual([7000, 7000])
    adapter.apply(events(0, { type: 'draw', player: 1, drawn: [{ code: 0, position: 10 }] }))
    const chained = adapter.apply(events(0, { type: 'chaining', code: 14558127, controller: 1, location: L.HAND, sequence: 0, position: 10, triggering_controller: 0, triggering_location: L.HAND, triggering_sequence: 0, description: '232933232', chain_size: 1 }))

    expect(chained.theirs.map((wire) => wire.action)).toEqual([{ type: 'activate', id: 'c1' }])
    expect(adapter.overlay.chain).toEqual([{ card: { side: 'theirs', id: 'c1' }, code: 14558127, description: '232933232', state: 'chained' }])
    adapter.apply(events(0, { type: 'chain_solving', chain_size: 1 }, { type: 'chain_solved', chain_size: 1 }))
    expect(adapter.overlay.chain).toEqual([])
    expect(adapter.overlay.negated).toEqual([])
    // Lo negado queda dicho después de la cadena (que se resuelve de una), hasta que empieza otra.
    const ash = { type: 'chaining' as const, code: 14558127, controller: 1 as const, location: L.HAND, sequence: 0, position: 10, triggering_controller: 1 as const, triggering_location: L.HAND, triggering_sequence: 0, description: '0', chain_size: 1 }

    adapter.apply(events(0, ash))
    adapter.apply(events(0, { type: 'chain_solving', chain_size: 1 }, { type: 'chain_disabled', chain_size: 1 }, { type: 'chain_solved', chain_size: 1 }, { type: 'chain_end' }))
    expect(adapter.overlay.negated).toEqual([{ card: { side: 'theirs', id: 'c1' }, code: 14558127, description: '0', state: 'disabled' }])
    adapter.apply(events(0, ash))
    expect(adapter.overlay.negated).toEqual([])
    adapter.apply({ t: 'stats', seat: 0, cards: [] })
    adapter.apply({ t: 'end', winner: 0, reason: 1 })
    expect(adapter.overlay.end).toEqual({ winner: 0, reason: 1 })
  })

  it('el barajado que sigue a buscar es la misma jugada («Buscás X y barajás»), y lo que no sabe hacer queda en unmapped', () => {
    const adapter = make()
    const out = adapter.apply(events(0, move(333, at(0, L.DECK, 2, 10), at(0, L.HAND, 0, 10)), { type: 'shuffle_deck', player: 0 }))

    expect(out.mine).toEqual([{ type: 'move', id: 'card-333-1', to: 'hand', shuffle: expect.any(Number) }])
    expect(adapter.mine.hand).toEqual(['card-333-1'])
    expect(adapter.apply(events(0, { type: 'reverse_deck' })).unmapped).toEqual(['unsupported: reverse_deck'])
  })
})

describe('robar por id (la jugada nueva de los duelos automáticos)', () => {
  const state = { ...make().initial.mine, deck: ['a', 'b', 'c'] }

  it('saca esas cartas del deck, estén donde estén, y se dice como un robo', () => {
    expect(matReducer(state, { type: 'draw', count: 1, ids: ['b'] })).toMatchObject({ deck: ['a', 'c'], hand: ['b'] })
    expect(matReducer(state, { type: 'draw', count: 1, ids: ['zz'] })).toBe(state)
    expect(describeMatAction(state, { type: 'draw', count: 1, ids: ['b'] }, (id) => id.toUpperCase())).toContain('B')
    expect(mapActionIds({ type: 'draw', count: 1, ids: ['b'] }, (id) => `x${id}`)).toEqual({ type: 'draw', count: 1, ids: ['xb'] })
  })
})
