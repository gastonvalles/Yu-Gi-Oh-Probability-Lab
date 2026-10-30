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

  it('con `bag` el deck propio es bolsa desde el arranque: se roba por código (no por secuencia) y la mesa no depende del orden en que llegó la lista', () => {
    const bagged = createAdapter({ seat: 0, mine: { deck: [111, 222, 333, 444], extra: [] }, theirs: { deck: 3, extra: 0 }, typeOf: () => 1, bag: true })
    const other = createAdapter({ seat: 0, mine: { deck: [444, 333, 111, 222], extra: [] }, theirs: { deck: 3, extra: 0 }, typeOf: () => 1, bag: true })
    const draw = events(0, { type: 'draw', player: 0, drawn: [{ code: 333, position: 10 }] })
    const search = (code: number) => events(0, move(code, at(0, L.DECK, 0, P.FACEDOWN_DEFENSE), at(0, L.HAND, 1, P.FACEDOWN_DEFENSE)))

    expect(bagged.apply(draw).mine).toEqual([{ type: 'draw', count: 1, ids: ['card-333-1'] }])
    expect(other.apply(draw).mine).toEqual([{ type: 'draw', count: 1, ids: ['card-333-1'] }])
    // Buscar del deck trae una secuencia: en la bolsa cuenta el código; sin código, una cualquiera (no la de esa secuencia, que sería la de abajo).
    expect(bagged.apply(search(111)).mine).toEqual([{ type: 'move', id: 'card-111-1', to: 'hand' }])
    expect(other.apply(search(111)).mine).toEqual([{ type: 'move', id: 'card-111-1', to: 'hand' }])
    expect(bagged.apply(search(0)).mine).toEqual([{ type: 'move', id: 'card-222-1', to: 'hand' }])
    expect(bagged.mine.hand).toEqual(['card-333-1', 'card-111-1', 'card-222-1'])
    // Sin `bag`, una secuencia se sigue tal cual: la 0 es la de abajo.
    expect(make().apply(search(0)).mine).toEqual([{ type: 'move', id: 'card-555-1', to: 'hand' }])
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

  it('Xyz del Extra del rival ya barajado y conocido: los materiales salen con la carta que sale, no con la que los recibió', () => {
    const adapter = createAdapter({ seat: 0, mine: { deck: [111], extra: [] }, theirs: { deck: 2, extra: 2 }, lp: [8000, 8000], typeOf: (code) => types[code] ?? 1 })

    // Su Extra se mostró (c3 es el Xyz 900, c4 otra) y se barajó: es bolsa, y el núcleo junta los materiales debajo de una secuencia que no dice cuál.
    adapter.apply(events(0, { type: 'confirm_cards', player: 0, cards: [{ code: 900, controller: 1, location: L.EXTRA, sequence: 0 }, { code: 901, controller: 1, location: L.EXTRA, sequence: 1 }] }, { type: 'shuffle_extra', player: 1, cards: [0, 0] }))
    adapter.apply(events(0, move(555, at(1, L.DECK, 1, 10), at(1, L.MZONE, 0)), move(556, at(1, L.DECK, 0, 10), at(1, L.MZONE, 1))))
    adapter.apply(events(0, move(555, at(1, L.MZONE, 0), at(1, L.EXTRA, 0, P.FACEUP_ATTACK, 0)), move(556, at(1, L.MZONE, 1), at(1, L.EXTRA, 0, P.FACEUP_ATTACK, 1)), move(900, at(1, L.EXTRA, 0, 10), at(1, L.MZONE, 5)), played('spsummoning', 900, at(1, L.MZONE, 5))))

    expect(adapter.theirs.state.emz[0]).toMatchObject({ id: 'c3', materials: ['c1', 'c2'] })
    expect(adapter.theirs.state.mz.slice(0, 2)).toEqual([null, null])
    expect(adapter.apply(events(0, move(555, at(1, L.MZONE, 5, P.FACEUP_ATTACK, 0), at(1, L.GRAVE, 0)))).unmapped).toEqual([])
    expect(adapter.theirs.state.gy).toEqual(['c1'])
  })

  it('un Kaiju: de la mano de su dueño al campo del otro, en las dos mesas', () => {
    const adapter = make()

    adapter.apply(events(0, { type: 'draw', player: 0, drawn: [{ code: 111, position: 10 }] }, { type: 'draw', player: 1, drawn: [{ code: 0, position: 10 }] }))
    const mine = adapter.apply(events(0, move(111, at(0, L.HAND, 0, 10), at(1, L.MZONE, 2)), played('spsummoning', 111, at(1, L.MZONE, 2))))

    expect(mine.mine).toEqual([{ type: 'give', id: 'card-111-1' }])
    expect([adapter.mine.hand, adapter.theirs.state.mz[2]?.id]).toEqual([[], 'f.card-111-1'])
    // El del rival, a mi campo: sale de su mano en el espejo y entra a la mía como ajena.
    const theirs = adapter.apply(events(0, move(777, at(1, L.HAND, 0, 10), at(0, L.MZONE, 1)), played('spsummoning', 777, at(0, L.MZONE, 1))))

    expect(theirs.mine).toEqual([{ type: 'take', id: 'f.c1', zone: 'mz', index: 1, pos: 'atk' }])
    expect([adapter.theirs.state.hand, adapter.codeOf({ side: 'mine', id: 'f.c1' })]).toEqual([[], 777])
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
    // El paso de la cadena lleva el `desc` del efecto (la pila lo usa para resaltar su frase en el detalle).
    expect(chained.chain).toMatchObject([{ kind: 'chain', index: 0, link: { code: 14558127, mine: false, description: '232933232' } }])
    adapter.apply(events(0, { type: 'chain_solving', chain_size: 1 }, { type: 'chain_solved', chain_size: 1 }))
    expect(adapter.overlay.chain).toEqual([])
    expect(adapter.overlay.negated).toEqual([])
    // Lo negado queda dicho después de la cadena (que se resuelve de una), hasta que empieza otra.
    const ash = { type: 'chaining' as const, code: 14558127, controller: 1 as const, location: L.HAND, sequence: 0, position: 10, triggering_controller: 1 as const, triggering_location: L.HAND, triggering_sequence: 0, description: '0', chain_size: 1 }

    adapter.apply(events(0, ash))
    adapter.apply(events(0, { type: 'chain_solving', chain_size: 1 }, { type: 'chain_disabled', chain_size: 1 }, { type: 'chain_solved', chain_size: 1 }, { type: 'chain_end' }))
    expect(adapter.overlay.negated).toMatchObject([{ card: { side: 'theirs', id: 'c1' }, code: 14558127, description: '0', state: 'disabled' }])
    // Llegó sin efecto mientras se resolvía él mismo: no se sabe quién fue.
    expect(adapter.overlay.negated[0]).not.toHaveProperty('by')
    adapter.apply(events(0, ash))
    expect(adapter.overlay.negated).toEqual([])
    adapter.apply({ t: 'stats', seat: 0, cards: [] })
    adapter.apply({ t: 'end', winner: 0, reason: 1 })
    expect(adapter.overlay.end).toEqual({ winner: 0, reason: 1 })
  })

  it('quién negó (`by`): el eslabón que se estaba resolviendo cuando llegó la negación; ninguno o el mismo, no se sabe', () => {
    const adapter = make()
    const link = (code: number, chain_size: number): WireEvent => ({ type: 'chaining', code, controller: 1, location: L.HAND, sequence: 0, position: 10, triggering_controller: 1, triggering_location: L.HAND, triggering_sequence: 0, description: '0', chain_size })
    const negations = (out: { chain: { kind: string; index: number; by?: number }[] }) => out.chain.flatMap((step) => (step.kind === 'negated' || step.kind === 'disabled' ? [[step.kind, step.index + 1, step.by]] : []))

    // Dos eslabones: CL2 le quita el efecto a CL1 mientras se resuelve (Ash sobre Terraforming).
    expect(negations(adapter.apply(events(0, link(1, 1), link(2, 2), { type: 'chain_solving', chain_size: 2 }, { type: 'chain_disabled', chain_size: 1 }, { type: 'chain_solved', chain_size: 2 }, { type: 'chain_solving', chain_size: 1 }, { type: 'chain_solved', chain_size: 1 }, { type: 'chain_end' })))).toEqual([['disabled', 1, 2]])
    expect(adapter.overlay.negated).toMatchObject([{ code: 1, state: 'disabled', by: 2 }])
    // Tres: CL3 niega la activación de CL2 (Gamma sobre Ash), y CL1 se resuelve.
    expect(negations(adapter.apply(events(0, link(1, 1), link(2, 2), link(3, 3), { type: 'chain_solving', chain_size: 3 }, { type: 'chain_negated', chain_size: 2 }, { type: 'chain_solved', chain_size: 3 }, { type: 'chain_solving', chain_size: 2 }, { type: 'chain_solved', chain_size: 2 }, { type: 'chain_solving', chain_size: 1 }, { type: 'chain_solved', chain_size: 1 }, { type: 'chain_end' })))).toEqual([['negated', 2, 3]])
    // Sin efecto al llegarle el turno (un efecto que quedó: Effect Veiler) y una negación sin nada resolviéndose: sin `by`.
    expect(negations(adapter.apply(events(0, link(1, 1), link(2, 2), { type: 'chain_solving', chain_size: 2 }, { type: 'chain_solved', chain_size: 2 }, { type: 'chain_solving', chain_size: 1 }, { type: 'chain_disabled', chain_size: 1 }, { type: 'chain_solved', chain_size: 1 }, { type: 'chain_end' })))).toEqual([['disabled', 1, undefined]])
    expect(negations(adapter.apply(events(0, link(1, 1), { type: 'chain_negated', chain_size: 1 })))).toEqual([['negated', 1, undefined]])
  })

  it('el barajado que sigue a buscar es la misma jugada («Buscás X y barajás»), y lo que no sabe hacer queda en unmapped', () => {
    const adapter = make()
    const out = adapter.apply(events(0, move(333, at(0, L.DECK, 2, 10), at(0, L.HAND, 0, 10)), { type: 'shuffle_deck', player: 0 }))

    expect(out.mine).toEqual([{ type: 'move', id: 'card-333-1', to: 'hand', shuffle: expect.any(Number) }])
    expect(adapter.mine.hand).toEqual(['card-333-1'])
    expect(adapter.apply(events(0, { type: 'reverse_deck' })).unmapped).toEqual(['unsupported: reverse_deck'])
  })

  it('los mismos `stats` dejan el overlay como estaba (el mismo objeto: la sesión no avisa); otros números lo cambian', () => {
    const adapter = make()
    const stats = (attack: number): AutoEvent => ({ t: 'stats', seat: 0, cards: [{ code: 111, controller: 0, location: L.HAND, sequence: 0, position: 10, attack, defense: 0, level: 4 }] })

    adapter.apply(events(0, { type: 'draw', player: 0, drawn: [{ code: 111, position: 10 }] }))
    adapter.apply(stats(1000))
    const before = adapter.overlay

    expect(before.stats.mine).toEqual({ 'card-111-1': { attack: 1000, defense: 0, level: 4 } })
    expect(adapter.apply(stats(1000)).overlay).toBe(before)
    expect(adapter.apply(stats(1500)).overlay.stats.mine['card-111-1']?.attack).toBe(1500)
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

  it('las restricciones del núcleo (player_hint 6 agrega, 7 quita) y la Invocación Normal o la Colocación del turno', () => {
    const adapter = make()
    const lock = String((27755794n << 20n) | 2n)
    const hint = (player: number, kind: number, description = lock): WireEvent => ({ type: 'player_hint', player, player_hint: kind, description })

    adapter.apply(events(0, { type: 'new_turn', player: 0 }, hint(0, 6), hint(1, 6), hint(0, 6)))
    expect(adapter.overlay.limits).toEqual([[lock, lock], [lock]])
    // Otras pistas del jugador no cuentan; quitar una que no está, tampoco.
    adapter.apply(events(0, hint(0, 7), hint(0, 1), hint(1, 7, '9')))
    expect(adapter.overlay.limits).toEqual([[lock], [lock]])
    // Una Mágica colocada no es la Colocación de un monstruo; la primera del turno es la que queda.
    adapter.apply(events(0, { type: 'set', code: 0, controller: 0, location: L.SZONE, sequence: 1, position: P.FACEDOWN_DEFENSE }))
    expect(adapter.overlay.normal).toEqual([null, null])
    adapter.apply(events(0, { type: 'set', code: 111, controller: 0, location: L.MZONE, sequence: 0, position: P.FACEDOWN_DEFENSE }, played('summoning', 222, at(0, L.MZONE, 1)), played('summoning', 777, at(1, L.MZONE, 0))))
    expect(adapter.overlay.normal).toEqual(['set', 'summon'])
    adapter.apply(events(0, { type: 'new_turn', player: 1 }))
    expect(adapter.overlay.normal).toEqual([null, null])
  })

  it('lo que pudo disparar un efecto (`cause`): las que se invocan juntas, la fase que empieza; una activación, un ataque o el turno nuevo lo borran', () => {
    const adapter = make()
    const cause = (...list: WireEvent[]) => (adapter.apply(events(0, ...list)), adapter.overlay.cause)

    expect(cause({ type: 'new_turn', player: 0 })).toBeNull()
    expect(cause({ type: 'new_phase', phase: 0x200 })).toEqual({ kind: 'phase', phase: 'end' })
    // Dos a la vez son una Invocación; la que sigue a su `spsummoned`, otra. Lo que viene después y no abre otro momento (un movimiento, el fin de la cadena) no la borra.
    expect(cause(played('spsummoning', 222, at(0, L.MZONE, 1)), played('spsummoning', 333, at(0, L.MZONE, 2)), { type: 'spsummoned' }, { type: 'chain_end' })).toEqual({ kind: 'special', codes: [222, 333] })
    expect(cause(played('summoning', 111, at(0, L.MZONE, 0)), { type: 'summoned' })).toEqual({ kind: 'normal', codes: [111] })
    expect(cause({ type: 'flipsummoning', code: 111, controller: 0, location: L.MZONE, sequence: 0, position: P.FACEUP_ATTACK })).toEqual({ kind: 'flip', codes: [111] })
    expect(cause({ type: 'chaining', code: 111, controller: 0, location: L.MZONE, sequence: 0, position: P.FACEUP_ATTACK, triggering_controller: 0, triggering_location: L.MZONE, triggering_sequence: 0, description: '0', chain_size: 1 })).toBeNull()
    expect(cause(played('spsummoning', 222, at(0, L.MZONE, 1)), { type: 'attack', card: at(0, L.MZONE, 1), target: null })).toBeNull()
  })

  const hidden = (count: number) => Array.from({ length: count }, () => ({ code: 0, position: 10 }))

  it('`swap`: dos cartas del campo cambian de casilla, cada una con su posición (del mismo lado, por una libre; de lados distintos, se entregan las dos)', () => {
    const adapter = make()

    adapter.apply(events(0, { type: 'draw', player: 1, drawn: hidden(2) }))
    adapter.apply(events(0, move(777, at(1, L.HAND, 0, 10), at(1, L.MZONE, 1)), move(778, at(1, L.HAND, 0, 10), at(1, L.MZONE, 3, P.FACEUP_DEFENSE))))
    const [one, two] = [adapter.idAt(at(1, L.MZONE, 1))!, adapter.idAt(at(1, L.MZONE, 3))!]
    const out = adapter.apply(events(0, { type: 'swap', card1: { code: 777, ...at(1, L.MZONE, 1) }, card2: { code: 778, ...at(1, L.MZONE, 3, P.FACEUP_DEFENSE) } }))

    expect(out.unmapped).toEqual([])
    expect(out.theirs).toHaveLength(1)
    expect(adapter.theirs.state.mz[1]).toMatchObject({ id: two, pos: 'def' })
    expect(adapter.theirs.state.mz[3]).toMatchObject({ id: one, pos: 'atk' })
    expect(adapter.idAt(at(1, L.MZONE, 1))).toBe(two)
    // De lados distintos (Creature Swap): mi carta pasa a su campo y la suya al mío.
    adapter.apply(events(0, { type: 'draw', player: 0, drawn: [{ code: 111, position: 10 }] }, move(111, at(0, L.HAND, 0, 10), at(0, L.MZONE, 0))))
    const crossed = adapter.apply(events(0, { type: 'swap', card1: { code: 111, ...at(0, L.MZONE, 0) }, card2: { code: 778, ...at(1, L.MZONE, 1, P.FACEUP_DEFENSE) } }))

    expect(crossed.unmapped).toEqual([])
    expect(adapter.mine.mz[0]).toMatchObject({ id: `f.${two}`, pos: 'def' })
    expect(adapter.theirs.state.mz[1]).toMatchObject({ id: 'f.card-111-1', pos: 'atk' })
    expect(adapter.idAt(at(0, L.MZONE, 0))).toBe(`f.${two}`)
  })

  it('una bolsa sigue el orden del núcleo: la carta que el núcleo nombró en un lugar es la que sale de ahí después, aunque salga oculta', () => {
    const adapter = make()

    adapter.apply(events(0, { type: 'draw', player: 1, drawn: hidden(3) }, { type: 'shuffle_hand', player: 1, cards: [0, 0, 0] }))
    adapter.apply(events(0, { type: 'confirm_cards', player: 0, cards: [{ code: 777, controller: 1, location: L.HAND, sequence: 0 }] }))
    const shown = adapter.idAt(at(1, L.HAND, 0))!

    expect(adapter.codeOf({ side: 'theirs', id: shown })).toBe(777)
    // Se destierra boca abajo la de ese lugar (la que mostró, como el costo de su efecto): es esa y se sigue sabiendo qué es.
    adapter.apply(events(0, move(0, at(1, L.HAND, 0, 10), at(1, L.REMOVED, 0, P.FACEDOWN_ATTACK))))
    expect(adapter.theirs.state.banished).toEqual([shown])
    expect(adapter.codeOf({ side: 'theirs', id: shown })).toBe(777)
  })

  it('consultar una bolsa (`idAt`) no la cambia: dos adaptadores con los mismos mensajes roban las mismas copias, se consulte o no', () => {
    const bagged = () => createAdapter({ seat: 0, mine: { deck: [111, 111, 111, 222], extra: [] }, theirs: { deck: 3, extra: 0 }, typeOf: () => 1, bag: true })
    const [asked, quiet] = [bagged(), bagged()]
    const draws = events(0, { type: 'draw', player: 0, drawn: [{ code: 222, position: 10 }, { code: 111, position: 10 }] })

    for (let sequence = 0; sequence < 4; sequence += 1) asked.idAt(at(0, L.DECK, sequence))
    expect(asked.apply(draws).mine).toEqual(quiet.apply(draws).mine)
  })

  it('una carta que cambia de código en su lugar: `codeOf` sigue al núcleo (el id y el `known` del espejo no cambian)', () => {
    const adapter = make()

    adapter.apply(events(0, { type: 'draw', player: 1, drawn: hidden(1) }, move(777, at(1, L.HAND, 0, 10), at(1, L.MZONE, 2))))
    const id = adapter.idAt(at(1, L.MZONE, 2))!
    const out = adapter.apply(events(0, { type: 'pos_change', code: 778, controller: 1, location: L.MZONE, sequence: 2, prev_position: P.FACEUP_ATTACK, position: P.FACEUP_DEFENSE }))

    expect(out.unmapped).toEqual(['unsupported: code changed in place (777 to 778)'])
    expect(adapter.codeOf({ side: 'theirs', id })).toBe(778)
  })
})
